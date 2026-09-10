package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleStacks_MethodNotAllowed(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stacks", nil)
	rr := httptest.NewRecorder()

	s.handleStacks(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 Method Not Allowed, got %d", rr.Code)
	}
}

func TestHandleStackAction_InvalidPath(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stacks/onlyone", nil)
	rr := httptest.NewRecorder()

	s.handleStackAction(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", rr.Code)
	}
}
