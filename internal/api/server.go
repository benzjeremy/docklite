package api

import (
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/benzjeremy/docklite/internal/docker"
)

// Server coordinates the HTTP REST API and static frontend.
type Server struct {
	docker   *docker.Client
	config   SecurityConfig
	version  string
	staticFS fs.FS
	mux      *http.ServeMux
}

// NewServer creates a new API server instance.
func NewServer(d *docker.Client, sec SecurityConfig, version string, staticFS fs.FS) *Server {
	s := &Server{
		docker:   d,
		config:   sec,
		version:  version,
		staticFS: staticFS,
		mux:      http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	// API Endpoints
	s.mux.HandleFunc("/api/v1/ping", s.handlePing)
	s.mux.HandleFunc("/api/v1/version", s.handleVersion)
	s.mux.HandleFunc("/api/v1/system", s.handleSystem)
	s.mux.HandleFunc("/api/v1/images", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			s.handleImages(w, r)
			return
		}
		s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	})

	s.mux.HandleFunc("/api/v1/images/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete || r.Method == http.MethodPost {
			s.handleImageDelete(w, r)
			return
		}
		s.writeError(w, http.StatusMethodNotAllowed, "DELETE or POST required")
	})

	s.mux.HandleFunc("/api/v1/system/prune", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			s.handleSystemPrune(w, r)
			return
		}
		s.writeError(w, http.StatusMethodNotAllowed, "POST required")
	})

	s.mux.HandleFunc("/api/v1/live", s.handleLiveSSE)

	// Container dispatch
	s.mux.HandleFunc("/api/v1/containers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		s.handleContainers(w, r)
	})

	s.mux.HandleFunc("/api/v1/containers/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/containers/")
		parts := strings.Split(path, "/")

		if len(parts) == 1 && parts[0] != "" {
			if r.Method == http.MethodGet {
				s.handleContainerInspect(w, r)
				return
			}
			if r.Method == http.MethodDelete {
				s.handleContainerDelete(w, r)
				return
			}
			s.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}

		if len(parts) == 2 {
			switch parts[1] {
			case "stats":
				if r.Method == http.MethodGet {
					s.handleContainerStats(w, r)
					return
				}
			case "logs":
				if r.Method == http.MethodGet {
					s.handleContainerLogs(w, r)
					return
				}
			case "remove", "delete":
				if r.Method == http.MethodPost || r.Method == http.MethodDelete {
					s.handleContainerDelete(w, r)
					return
				}
				s.writeError(w, http.StatusMethodNotAllowed, "POST or DELETE required")
				return
			case "start", "stop", "restart", "pause", "unpause":
				if r.Method == http.MethodPost {
					s.handleContainerAction(w, r)
					return
				}
				s.writeError(w, http.StatusMethodNotAllowed, "POST required for container actions")
				return
			}
		}

		s.writeError(w, http.StatusNotFound, "Endpoint not found")
	})

	// Static Web Assets & Frontend SPA Handler
	if s.staticFS != nil {
		fileServer := http.FileServer(http.FS(s.staticFS))
		s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				s.writeError(w, http.StatusNotFound, "API endpoint not found")
				return
			}

			// Try to open file directly
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}

			if _, err := fs.Stat(s.staticFS, path); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}

			// SPA fallback to index.html
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
		})
	}
}

// Handler returns the full HTTP handler wrapped with security middleware.
func (s *Server) Handler() http.Handler {
	return s.securityMiddleware(s.mux)
}

// Run starts the HTTP server.
func (s *Server) Run(addr string) error {
	srv := &http.Server{
		Addr:         addr,
		Handler:      s.Handler(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("🚀 Docklite server listening on http://%s", addr)
	return srv.ListenAndServe()
}
