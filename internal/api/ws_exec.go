package api

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// computeAcceptKey calculates the Sec-WebSocket-Accept value from client key.
func computeAcceptKey(key string) string {
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

type resizeMsg struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

// handleContainerExec handles bidirectional terminal streaming via WebSocket.
func (s *Server) handleContainerExec(w http.ResponseWriter, r *http.Request, containerID string) {
	// 1. Origin & CSWSH Check
	origin := r.Header.Get("Origin")
	if origin != "" && origin != "null" {
		if !strings.HasPrefix(origin, "http://127.0.0.1:") &&
			!strings.HasPrefix(origin, "http://localhost:") &&
			!strings.HasPrefix(origin, "https://127.0.0.1:") &&
			!strings.HasPrefix(origin, "https://localhost:") {
			http.Error(w, "Forbidden: Invalid Origin", http.StatusForbidden)
			return
		}
	}

	// 2. Token verification if configured
	if s.config.Token != "" {
		token := r.URL.Query().Get("token")
		if token == "" {
			token = r.Header.Get("X-Docklite-Token")
		}
		if token != s.config.Token {
			http.Error(w, "Unauthorized: Invalid token", http.StatusUnauthorized)
			return
		}
	}

	// 3. WebSocket Upgrade Header Validation
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") ||
		!strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") {
		http.Error(w, "Expected WebSocket Upgrade", http.StatusBadRequest)
		return
	}

	wsKey := r.Header.Get("Sec-WebSocket-Key")
	if wsKey == "" {
		http.Error(w, "Missing Sec-WebSocket-Key", http.StatusBadRequest)
		return
	}

	cmdStr := r.URL.Query().Get("cmd")
	var cmd []string
	if cmdStr != "" {
		cmd = strings.Fields(cmdStr)
	}
	if len(cmd) == 0 {
		cmd = []string{"/bin/sh"}
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// 4. Create Exec on Docker Container
	execID, err := s.docker.CreateExec(ctx, containerID, cmd)
	if err != nil {
		// Fallback to /bin/sh if custom cmd failed
		execID, err = s.docker.CreateExec(ctx, containerID, []string{"/bin/sh"})
		if err != nil {
			log.Printf("[Exec] Failed to create exec on %s: %v", containerID, err)
			http.Error(w, fmt.Sprintf("Failed to create exec: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// 5. Hijack Docker Socket connection
	dockerConn, dockerReader, err := s.docker.StartExecHijack(ctx, execID)
	if err != nil {
		log.Printf("[Exec] Failed to hijack docker exec: %v", err)
		http.Error(w, fmt.Sprintf("Failed to start exec: %v", err), http.StatusInternalServerError)
		return
	}
	defer dockerConn.Close()

	// 6. Hijack HTTP Client connection
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "Server does not support hijacking", http.StatusInternalServerError)
		return
	}

	clientConn, clientBuf, err := hijacker.Hijack()
	if err != nil {
		log.Printf("[Exec] Failed to hijack HTTP connection: %v", err)
		return
	}
	defer clientConn.Close()

	// Complete WebSocket handshake
	acceptKey := computeAcceptKey(wsKey)
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n"

	if _, err := clientConn.Write([]byte(resp)); err != nil {
		return
	}

	// Initial size resize if provided in query
	_ = s.docker.ResizeExec(ctx, execID, 24, 80)

	errChan := make(chan error, 2)

	// Goroutine: Docker -> WebSocket Client
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := dockerReader.Read(buf)
			if n > 0 {
				if writeErr := writeWSFrame(clientConn, 2, buf[:n]); writeErr != nil {
					errChan <- writeErr
					return
				}
			}
			if err != nil {
				errChan <- err
				return
			}
		}
	}()

	// Goroutine: WebSocket Client -> Docker
	go func() {
		for {
			payload, opcode, err := readWSFrame(clientBuf.Reader)
			if err != nil {
				errChan <- err
				return
			}

			if opcode == 8 { // Close frame
				_ = writeWSFrame(clientConn, 8, nil)
				errChan <- io.EOF
				return
			}

			if opcode == 9 { // Ping
				_ = writeWSFrame(clientConn, 10, payload)
				continue
			}

			if len(payload) == 0 {
				continue
			}

			// Check for resize control packet: {"type":"resize","cols":80,"rows":24}
			if payload[0] == '{' {
				var msg resizeMsg
				if err := json.Unmarshal(payload, &msg); err == nil && msg.Type == "resize" {
					if msg.Cols > 0 && msg.Rows > 0 {
						_ = s.docker.ResizeExec(ctx, execID, msg.Rows, msg.Cols)
						continue
					}
				}
			}

			// Forward raw input bytes to Docker PTY
			if _, err := dockerConn.Write(payload); err != nil {
				errChan <- err
				return
			}
		}
	}()

	select {
	case <-ctx.Done():
	case <-errChan:
	}
}

// readWSFrame reads and unmasks an incoming client frame.
func readWSFrame(r *bufio.Reader) ([]byte, byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, 0, err
	}

	opcode := header[0] & 0x0F
	masked := (header[1] & 0x80) != 0
	payloadLen := uint64(header[1] & 0x7F)

	if payloadLen == 126 {
		lenBytes := make([]byte, 2)
		if _, err := io.ReadFull(r, lenBytes); err != nil {
			return nil, 0, err
		}
		payloadLen = uint64(binary.BigEndian.Uint16(lenBytes))
	} else if payloadLen == 127 {
		lenBytes := make([]byte, 8)
		if _, err := io.ReadFull(r, lenBytes); err != nil {
			return nil, 0, err
		}
		payloadLen = binary.BigEndian.Uint64(lenBytes)
	}

	if payloadLen > 10*1024*1024 { // 10MB sanity limit
		return nil, 0, fmt.Errorf("frame payload too large: %d bytes", payloadLen)
	}

	var maskKey []byte
	if masked {
		maskKey = make([]byte, 4)
		if _, err := io.ReadFull(r, maskKey); err != nil {
			return nil, 0, err
		}
	}

	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, 0, err
	}

	if masked {
		for i := uint64(0); i < payloadLen; i++ {
			payload[i] ^= maskKey[i%4]
		}
	}

	return payload, opcode, nil
}

// writeWSFrame writes an unmasked server-to-client WebSocket frame.
func writeWSFrame(w io.Writer, opcode byte, payload []byte) error {
	var header []byte
	length := len(payload)

	// FIN (0x80) + Opcode
	byte0 := 0x80 | (opcode & 0x0F)

	if length <= 125 {
		header = []byte{byte0, byte(length)}
	} else if length <= 65535 {
		header = []byte{byte0, 126, byte(length >> 8), byte(length & 0xFF)}
	} else {
		header = make([]byte, 10)
		header[0] = byte0
		header[1] = 127
		binary.BigEndian.PutUint64(header[2:], uint64(length))
	}

	if _, err := w.Write(header); err != nil {
		return err
	}
	if length > 0 {
		_, err := w.Write(payload)
		return err
	}
	return nil
}
