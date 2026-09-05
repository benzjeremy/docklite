package api

import (
	"net"
	"net/http"
	"strings"
)

// SecurityConfig defines security parameters per Coding Standards.
type SecurityConfig struct {
	Token        string
	AllowedHosts []string
}

// SecurityMiddleware adds security headers, anti-DNS-rebinding and optional token auth.
func (s *Server) securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Mandatory Security Headers
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';")

		// 2. Anti-DNS-Rebinding Protection
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if !s.isHostAllowed(host) {
			http.Error(w, "Forbidden: Invalid Host Header (Anti-DNS-Rebinding Protection)", http.StatusForbidden)
			return
		}

		// 3. Anti-CSRF for mutating requests
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodDelete {
			origin := r.Header.Get("Origin")
			if origin != "" {
				// Strip protocol
				originHost := origin
				if idx := strings.Index(originHost, "://"); idx != -1 {
					originHost = originHost[idx+3:]
				}
				if h, _, err := net.SplitHostPort(originHost); err == nil {
					originHost = h
				}
				if !s.isHostAllowed(originHost) {
					http.Error(w, "Forbidden: Invalid Origin Header (Anti-CSRF Protection)", http.StatusForbidden)
					return
				}
			}
		}

		// 4. Token Authentication (if configured)
		if s.config.Token != "" && strings.HasPrefix(r.URL.Path, "/api/") {
			token := r.Header.Get("X-Docklite-Token")
			if token == "" {
				token = r.URL.Query().Get("token")
			}
			if token != s.config.Token {
				http.Error(w, "Unauthorized: Invalid or missing API token", http.StatusUnauthorized)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) isHostAllowed(host string) bool {
	// Standard local hostnames
	if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
		return true
	}
	for _, allowed := range s.config.AllowedHosts {
		if allowed != "" && strings.EqualFold(host, allowed) {
			return true
		}
	}
	return false
}
