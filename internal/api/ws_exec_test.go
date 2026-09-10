package api

import (
	"bufio"
	"bytes"
	"testing"
)

func TestComputeAcceptKeyRFC6455(t *testing.T) {
	// RFC 6455 section 1.3 example vector
	inputKey := "dGhlIHNhbXBsZSBub25jZQ=="
	expected := "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="

	got := computeAcceptKey(inputKey)
	if got != expected {
		t.Fatalf("computeAcceptKey(%q) = %q, want %q", inputKey, got, expected)
	}
}

func TestWriteAndReadWSFrame(t *testing.T) {
	payload := []byte("Hello, Docker PTY!")
	var buf bytes.Buffer

	// Write server frame (unmasked)
	if err := writeWSFrame(&buf, 2, payload); err != nil {
		t.Fatalf("writeWSFrame failed: %v", err)
	}

	// Client unmasked read should match
	r := bufio.NewReader(&buf)
	gotPayload, opcode, err := readWSFrame(r)
	if err != nil {
		t.Fatalf("readWSFrame failed: %v", err)
	}

	if opcode != 2 {
		t.Errorf("expected opcode 2, got %d", opcode)
	}
	if !bytes.Equal(gotPayload, payload) {
		t.Errorf("payload mismatch: got %q, want %q", gotPayload, payload)
	}
}

func TestWriteWSFrame_LengthEncodings(t *testing.T) {
	// Small payload (<= 125)
	pSmall := make([]byte, 50)
	var b1 bytes.Buffer
	if err := writeWSFrame(&b1, 1, pSmall); err != nil {
		t.Fatalf("small frame write failed: %v", err)
	}
	r1 := bufio.NewReader(&b1)
	if p, op, err := readWSFrame(r1); err != nil || op != 1 || len(p) != 50 {
		t.Errorf("small frame mismatch: len=%d, op=%d, err=%v", len(p), op, err)
	}

	// Medium payload (> 125 and <= 65535)
	pMed := make([]byte, 300)
	var b2 bytes.Buffer
	if err := writeWSFrame(&b2, 2, pMed); err != nil {
		t.Fatalf("med frame write failed: %v", err)
	}
	r2 := bufio.NewReader(&b2)
	if p, op, err := readWSFrame(r2); err != nil || op != 2 || len(p) != 300 {
		t.Errorf("med frame mismatch: len=%d, op=%d, err=%v", len(p), op, err)
	}
}
