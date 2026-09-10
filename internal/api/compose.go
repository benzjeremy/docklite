package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// handleStacks handles listing all Docker Compose stacks.
func (s *Server) handleStacks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	stacks, err := s.docker.GetComposeStacks(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stacks)
}

// handleStackAction handles action execution (restart, stop) for a Docker Compose stack.
func (s *Server) handleStackAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/v1/stacks/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		s.writeError(w, http.StatusBadRequest, "Invalid stack endpoint: expected /api/v1/stacks/{name}/{action}")
		return
	}

	stackName := parts[0]
	action := parts[1]

	if action != "restart" && action != "stop" && action != "start" {
		s.writeError(w, http.StatusBadRequest, "Invalid stack action: must be restart, stop, or start")
		return
	}

	if err := s.docker.StackAction(r.Context(), stackName, action); err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"stack":   stackName,
		"action":  action,
	})
}

// handleVolumesPrune prunes unused Docker volumes.
func (s *Server) handleVolumesPrune(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	res, err := s.docker.PruneVolumes(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

// handleNetworksPrune prunes unused Docker networks.
func (s *Server) handleNetworksPrune(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	res, err := s.docker.PruneNetworks(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
