package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

func (s *Server) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *Server) writeError(w http.ResponseWriter, status int, message string) {
	s.writeJSON(w, status, map[string]interface{}{
		"error":   true,
		"message": message,
		"status":  status,
	})
}

func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dockerReachable := true
	if err := s.docker.Ping(ctx); err != nil {
		dockerReachable = false
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":           "ok",
		"app":              "docklite",
		"version":          s.version,
		"docker_reachable": dockerReachable,
		"time":             time.Now().Format(time.RFC3339),
	})
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dVer, err := s.docker.GetVersion(ctx)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, fmt.Sprintf("Failed to get Docker version: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"docklite": map[string]string{
			"version": s.version,
			"author":  "Jeremy Benz (@benzjeremy)",
		},
		"docker": dVer,
	})
}

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	info, err := s.docker.GetSystemInfo(ctx)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, fmt.Sprintf("Failed to get system info: %v", err))
		return
	}
	s.writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	all := r.URL.Query().Get("all") != "false" // default to all containers
	withStats := r.URL.Query().Get("stats") == "true"

	containers, err := s.docker.ListContainers(ctx, all)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, fmt.Sprintf("Failed to list containers: %v", err))
		return
	}

	if withStats {
		var wg sync.WaitGroup
		for i := range containers {
			if containers[i].State == "running" {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					stats, sErr := s.docker.GetContainerStats(ctx, containers[idx].ID)
					if sErr == nil {
						containers[idx].Stats = stats
					}
				}(i)
			}
		}
		wg.Wait()
	}

	s.writeJSON(w, http.StatusOK, containers)
}

func (s *Server) handleContainerInspect(w http.ResponseWriter, r *http.Request) {
	id := extractID(r.URL.Path, "/api/v1/containers/")
	if id == "" {
		s.writeError(w, http.StatusBadRequest, "Missing container ID")
		return
	}

	ctx := r.Context()
	data, err := s.docker.InspectContainer(ctx, id)
	if err != nil {
		s.writeError(w, http.StatusNotFound, fmt.Sprintf("Container not found: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleContainerStats(w http.ResponseWriter, r *http.Request) {
	// Path: /api/v1/containers/{id}/stats
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/containers/")
	id := strings.TrimSuffix(path, "/stats")
	if id == "" {
		s.writeError(w, http.StatusBadRequest, "Missing container ID")
		return
	}

	ctx := r.Context()
	stats, err := s.docker.GetContainerStats(ctx, id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to fetch container stats: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleContainerLogs(w http.ResponseWriter, r *http.Request) {
	// Path: /api/v1/containers/{id}/logs
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/containers/")
	id := strings.TrimSuffix(path, "/logs")
	if id == "" {
		s.writeError(w, http.StatusBadRequest, "Missing container ID")
		return
	}

	tail := 150
	if tailQuery := r.URL.Query().Get("tail"); tailQuery != "" {
		if t, err := strconv.Atoi(tailQuery); err == nil && t > 0 {
			tail = t
		}
	}
	timestamps := r.URL.Query().Get("timestamps") == "true"

	ctx := r.Context()
	logs, err := s.docker.GetContainerLogs(ctx, id, tail, timestamps)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to fetch logs: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":   id,
		"tail": tail,
		"logs": logs,
	})
}

func (s *Server) handleContainerAction(w http.ResponseWriter, r *http.Request) {
	// Path: /api/v1/containers/{id}/{action}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		s.writeError(w, http.StatusBadRequest, "Invalid action path format")
		return
	}
	id := parts[3]
	action := parts[4]

	ctx := r.Context()
	if err := s.docker.ContainerAction(ctx, id, action); err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Sprintf("Action failed: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"id":      id,
		"action":  action,
		"message": fmt.Sprintf("Container %s %sed successfully", id, action),
	})
}

func (s *Server) handleImages(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	images, err := s.docker.ListImages(ctx)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, fmt.Sprintf("Failed to list images: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, images)
}

func (s *Server) handleContainerDelete(w http.ResponseWriter, r *http.Request) {
	id := extractID(r.URL.Path, "/api/v1/containers/")
	if id == "" {
		s.writeError(w, http.StatusBadRequest, "Missing container ID")
		return
	}

	force := r.URL.Query().Get("force") == "true"
	ctx := r.Context()
	if err := s.docker.RemoveContainer(ctx, id, force); err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to remove container: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"id":      id,
		"message": fmt.Sprintf("Container %s deleted successfully", id),
	})
}

func (s *Server) handleImageDelete(w http.ResponseWriter, r *http.Request) {
	id := extractID(r.URL.Path, "/api/v1/images/")
	if id == "" {
		s.writeError(w, http.StatusBadRequest, "Missing image ID")
		return
	}

	force := r.URL.Query().Get("force") == "true"
	ctx := r.Context()
	if err := s.docker.RemoveImage(ctx, id, force); err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to remove image: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"id":      id,
		"message": fmt.Sprintf("Image %s deleted successfully", id),
	})
}

func (s *Server) handleSystemPrune(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	res, err := s.docker.PruneSystem(ctx)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Sprintf("System prune failed: %v", err))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"result":  res,
		"message": "System prune executed successfully",
	})
}

// handleLiveSSE streams real-time container lists and stats every 2 seconds via Server-Sent Events.
func (s *Server) handleLiveSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// Initial push immediately
	s.sendSSEPayload(w, flusher, r)

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			if !s.sendSSEPayload(w, flusher, r) {
				return
			}
		}
	}
}

func (s *Server) sendSSEPayload(w http.ResponseWriter, flusher http.Flusher, r *http.Request) bool {
	ctx := r.Context()
	containers, err := s.docker.ListContainers(ctx, true)
	if err != nil {
		return true
	}

	var wg sync.WaitGroup
	for i := range containers {
		if containers[i].State == "running" {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				stats, sErr := s.docker.GetContainerStats(ctx, containers[idx].ID)
				if sErr == nil {
					containers[idx].Stats = stats
				}
			}(i)
		}
	}
	wg.Wait()

	info, _ := s.docker.GetSystemInfo(ctx)

	payload := map[string]interface{}{
		"time":       time.Now().Unix(),
		"system":     info,
		"containers": containers,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return true
	}

	_, writeErr := fmt.Fprintf(w, "data: %s\n\n", string(data))
	if writeErr != nil {
		return false
	}
	flusher.Flush()
	return true
}

func extractID(path, prefix string) string {
	trimmed := strings.TrimPrefix(path, prefix)
	parts := strings.Split(trimmed, "/")
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}
