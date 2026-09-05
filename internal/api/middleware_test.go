package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityMiddleware_Headers(t *testing.T) {
	s := &Server{
		config: SecurityConfig{},
	}

	handler := s.securityMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/ping", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	if rr.Header().Get("X-Frame-Options") != "DENY" {
		t.Errorf("expected X-Frame-Options DENY, got %s", rr.Header().Get("X-Frame-Options"))
	}
	if rr.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("expected X-Content-Type-Options nosniff, got %s", rr.Header().Get("X-Content-Type-Options"))
	}
}

func TestSecurityMiddleware_DNSRebinding(t *testing.T) {
	s := &Server{
		config: SecurityConfig{
			AllowedHosts: []string{"docklite.local"},
		},
	}

	handler := s.securityMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Forbidden host
	req := httptest.NewRequest(http.MethodGet, "http://evil.com/api/v1/ping", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected status 403 for evil.com, got %d", rr.Code)
	}

	// Allowed custom host
	reqAllowed := httptest.NewRequest(http.MethodGet, "http://docklite.local:8080/api/v1/ping", nil)
	rrAllowed := httptest.NewRecorder()
	handler.ServeHTTP(rrAllowed, reqAllowed)

	if rrAllowed.Code != http.StatusOK {
		t.Errorf("expected status 200 for docklite.local, got %d", rrAllowed.Code)
	}
}

func TestSecurityMiddleware_TokenAuth(t *testing.T) {
	s := &Server{
		config: SecurityConfig{
			Token: "secret123",
		},
	}

	handler := s.securityMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Without token -> 401
	req := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/ping", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rr.Code)
	}

	// With Header token -> 200
	reqWithHeader := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/ping", nil)
	reqWithHeader.Header.Set("X-Docklite-Token", "secret123")
	rrWithHeader := httptest.NewRecorder()
	handler.ServeHTTP(rrWithHeader, reqWithHeader)

	if rrWithHeader.Code != http.StatusOK {
		t.Errorf("expected status 200 with header token, got %d", rrWithHeader.Code)
	}

	// With Query token -> 200
	reqWithQuery := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/v1/ping?token=secret123", nil)
	rrWithQuery := httptest.NewRecorder()
	handler.ServeHTTP(rrWithQuery, reqWithQuery)

	if rrWithQuery.Code != http.StatusOK {
		t.Errorf("expected status 200 with query token, got %d", rrWithQuery.Code)
	}
}
