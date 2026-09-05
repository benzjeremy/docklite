package docker

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Client provides direct communication with the Docker daemon via docker.sock or pipe.
type Client struct {
	host       string
	httpClient *http.Client
	mu         sync.RWMutex
}

// NewClient initializes a new Docker socket client.
func NewClient(host string) (*Client, error) {
	if host == "" {
		host = os.Getenv("DOCKER_HOST")
	}
	if host == "" {
		host = defaultHost()
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, proto, addr string) (net.Conn, error) {
			return dialContext(ctx, host)
		},
		DisableKeepAlives:     false,
		MaxIdleConns:          10,
		IdleConnTimeout:       30 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
	}

	return &Client{
		host: host,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   20 * time.Second,
		},
	}, nil
}

// Host returns the configured Docker socket host.
func (c *Client) Host() string {
	return c.host
}

func (c *Client) doRequest(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, "http://docker"+path, body)
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.httpClient.Do(req)
}

// Ping checks if the Docker daemon is reachable.
func (c *Client) Ping(ctx context.Context) error {
	resp, err := c.doRequest(ctx, http.MethodGet, "/_ping", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("docker daemon responded with status: %d", resp.StatusCode)
	}
	return nil
}

// GetVersion returns Docker version details.
func (c *Client) GetVersion(ctx context.Context) (*DockerVersion, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/version", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var ver DockerVersion
	if err := json.NewDecoder(resp.Body).Decode(&ver); err != nil {
		return nil, err
	}
	return &ver, nil
}

// GetSystemInfo returns host and engine system stats.
func (c *Client) GetSystemInfo(ctx context.Context) (*SystemInfo, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/info", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var info SystemInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	return &info, nil
}

// ListContainers returns list of containers.
func (c *Client) ListContainers(ctx context.Context, all bool) ([]CleanContainer, error) {
	path := "/containers/json?all=0"
	if all {
		path = "/containers/json?all=1"
	}

	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var summaries []ContainerSummary
	if err := json.NewDecoder(resp.Body).Decode(&summaries); err != nil {
		return nil, err
	}

	results := make([]CleanContainer, 0, len(summaries))
	for _, s := range summaries {
		name := ""
		if len(s.Names) > 0 {
			name = strings.TrimPrefix(s.Names[0], "/")
		}
		shortID := s.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}

		clean := CleanContainer{
			ID:      s.ID,
			ShortID: shortID,
			Name:    name,
			Image:   s.Image,
			Command: s.Command,
			Created: s.Created,
			State:   s.State,
			Status:  s.Status,
			Ports:   s.Ports,
			Labels:  s.Labels,
		}
		results = append(results, clean)
	}

	return results, nil
}

// InspectContainer returns raw container inspect data.
func (c *Client) InspectContainer(ctx context.Context, id string) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/containers/%s/json", id), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("container not found")
	}

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

// GetContainerStats fetches real-time resource metrics.
func (c *Client) GetContainerStats(ctx context.Context, id string) (*CalculatedStats, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, fmt.Sprintf("/containers/%s/stats?stream=false", id), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stats request failed with status: %d", resp.StatusCode)
	}

	var raw RawStats
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	return CalculateStats(&raw), nil
}

// GetContainerLogs returns recent stdout and stderr logs for a container.
func (c *Client) GetContainerLogs(ctx context.Context, id string, tail int, timestamps bool) (string, error) {
	tsParam := "0"
	if timestamps {
		tsParam = "1"
	}
	path := fmt.Sprintf("/containers/%s/logs?stdout=1&stderr=1&tail=%d&timestamps=%s", id, tail, tsParam)
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	rawBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return demuxLogs(rawBytes), nil
}

// demuxLogs decodes Docker's 8-byte multiplexed header or returns plain text if raw.
func demuxLogs(data []byte) string {
	var buf bytes.Buffer
	for len(data) >= 8 {
		// Header byte 0: 0=stdin, 1=stdout, 2=stderr
		streamType := data[0]
		if streamType > 2 {
			// Not a multiplexed header, treat as raw log stream
			buf.Write(data)
			return buf.String()
		}
		frameSize := binary.BigEndian.Uint32(data[4:8])
		data = data[8:]
		if uint32(len(data)) < frameSize {
			buf.Write(data)
			break
		}
		buf.Write(data[:frameSize])
		data = data[frameSize:]
	}
	if len(data) > 0 {
		buf.Write(data)
	}
	return buf.String()
}

// ContainerAction performs container lifecycle management (start, stop, restart, pause, unpause).
func (c *Client) ContainerAction(ctx context.Context, id string, action string) error {
	var path string
	switch action {
	case "start":
		path = fmt.Sprintf("/containers/%s/start", id)
	case "stop":
		path = fmt.Sprintf("/containers/%s/stop?t=10", id)
	case "restart":
		path = fmt.Sprintf("/containers/%s/restart?t=10", id)
	case "pause":
		path = fmt.Sprintf("/containers/%s/pause", id)
	case "unpause":
		path = fmt.Sprintf("/containers/%s/unpause", id)
	default:
		return fmt.Errorf("unsupported action: %s", action)
	}

	resp, err := c.doRequest(ctx, http.MethodPost, path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("action %s failed (%d): %s", action, resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// ListImages returns Docker images on the host.
func (c *Client) ListImages(ctx context.Context) ([]ImageSummary, error) {
	resp, err := c.doRequest(ctx, http.MethodGet, "/images/json", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var images []ImageSummary
	if err := json.NewDecoder(resp.Body).Decode(&images); err != nil {
		return nil, err
	}
	return images, nil
}

// RemoveContainer deletes a container from Docker.
func (c *Client) RemoveContainer(ctx context.Context, id string, force bool) error {
	path := fmt.Sprintf("/containers/%s?v=1", id)
	if force {
		path += "&force=1"
	}
	resp, err := c.doRequest(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("remove container failed (%d): %s", resp.StatusCode, string(bodyBytes))
	}
	return nil
}

// RemoveImage deletes a Docker image.
func (c *Client) RemoveImage(ctx context.Context, id string, force bool) error {
	path := fmt.Sprintf("/images/%s", id)
	if force {
		path += "?force=1"
	}
	resp, err := c.doRequest(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("remove image failed (%d): %s", resp.StatusCode, string(bodyBytes))
	}
	return nil
}

// PruneSystem cleans up stopped containers and unused images.
func (c *Client) PruneSystem(ctx context.Context) (map[string]interface{}, error) {
	cResp, err := c.doRequest(ctx, http.MethodPost, "/containers/prune", nil)
	if err != nil {
		return nil, fmt.Errorf("containers prune failed: %w", err)
	}
	defer cResp.Body.Close()

	var cPrune map[string]interface{}
	_ = json.NewDecoder(cResp.Body).Decode(&cPrune)

	iResp, err := c.doRequest(ctx, http.MethodPost, "/images/prune", nil)
	if err != nil {
		return nil, fmt.Errorf("images prune failed: %w", err)
	}
	defer iResp.Body.Close()

	var iPrune map[string]interface{}
	_ = json.NewDecoder(iResp.Body).Decode(&iPrune)

	return map[string]interface{}{
		"containers_pruned": cPrune,
		"images_pruned":     iPrune,
	}, nil
}
