package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAllowedProxyRoutesAreExact(t *testing.T) {
	if gatewayContractVersion != "run-server-v1" {
		t.Fatalf("gateway contract version = %q", gatewayContractVersion)
	}
	allowed := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/v1/auth/pairing-grants:exchange"},
		{http.MethodPost, "/v1/auth/tokens:refresh"},
		{http.MethodPost, "/v1/auth/sessions/current:revoke"},
		{http.MethodGet, "/v1/auth/me"},
		{http.MethodGet, "/v1/runtime/healthz"},
		{http.MethodGet, "/v1/runtime/projects"},
		{http.MethodGet, "/v1/runtime/sessions"},
		{http.MethodPost, "/v1/runtime/sessions"},
		{http.MethodGet, "/v1/runtime/sessions/s1"},
		{http.MethodGet, "/v1/runtime/sessions/s1/runs"},
		{http.MethodPost, "/v1/runtime/sessions/s1/runs"},
		{http.MethodGet, "/v1/runtime/sessions/s1/events"},
		{http.MethodGet, "/v1/runtime/runs/r1"},
		{http.MethodPost, "/v1/runtime/runs/r1/cancel"},
		{http.MethodGet, "/v1/runtime/runs/r1/events"},
		{http.MethodPost, "/v1/runtime/bootstrap-syncs"},
		{http.MethodGet, "/v1/runtime/bootstrap-syncs/b1"},
		{http.MethodPost, "/v1/runtime/projects/p1/source:read"},
	}
	for _, route := range allowed {
		if !allowedProxyRoute(route.method, route.path) {
			t.Errorf("reviewed route rejected: %s %s", route.method, route.path)
		}
	}

	denied := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/status"},
		{http.MethodGet, "/ws/agent"},
		{http.MethodPost, "/v1/auth-control/pairing-grants"},
		{http.MethodDelete, "/v1/runtime/sessions/s1"},
		{http.MethodGet, "/v1/runtime/future-endpoint"},
		{http.MethodPost, "/v1/runtime/runs/r1/events"},
	}
	for _, route := range denied {
		if allowedProxyRoute(route.method, route.path) {
			t.Errorf("unreviewed route exposed: %s %s", route.method, route.path)
		}
	}
}

func TestGatewayProxiesOnlyAllowlistedAPIAndStripsIdentityHeaders(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("CF-Access-Jwt-Assertion") != "" || r.Header.Get("True-Client-IP") != "" {
			t.Error("untrusted identity header reached upstream")
		}
		if r.Header.Get("Authorization") != "Bearer token" || r.Header.Get("Last-Event-ID") != "42" {
			t.Errorf("required headers were not preserved: %#v", r.Header)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "id: 43\ndata: {}\n\n")
	}))
	defer upstream.Close()

	handler := testGateway(t, upstream.URL)
	request := httptest.NewRequest(http.MethodGet, "/v1/runtime/runs/r1/events", nil)
	request.Header.Set("Authorization", "Bearer token")
	request.Header.Set("Last-Event-ID", "42")
	request.Header.Set("CF-Access-Jwt-Assertion", "spoofed")
	request.Header.Set("True-Client-IP", "203.0.113.1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "id: 43") {
		t.Fatalf("proxy response = %d %q", response.Code, response.Body.String())
	}

	forbidden := httptest.NewRecorder()
	handler.ServeHTTP(forbidden, httptest.NewRequest(http.MethodGet, "/ws/agent", nil))
	if forbidden.Code != http.StatusNotFound || !strings.Contains(forbidden.Body.String(), "GATEWAY_ROUTE_NOT_EXPOSED") {
		t.Fatalf("forbidden response = %d %q", forbidden.Code, forbidden.Body.String())
	}
}

func TestGatewayServesSPAAndLocalHealth(t *testing.T) {
	handler := testGateway(t, "http://127.0.0.1:1")
	for _, requestPath := range []string{"/", "/pair", "/sessions/abc"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, requestPath, nil))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "mobile-web") {
			t.Fatalf("%s response = %d %q", requestPath, response.Code, response.Body.String())
		}
	}
	health := httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/gateway/healthz", nil))
	if health.Code != http.StatusOK || !strings.Contains(health.Body.String(), `"status":"ok"`) || !strings.Contains(health.Body.String(), `"contract_version":"run-server-v1"`) {
		t.Fatalf("health response = %d %q", health.Code, health.Body.String())
	}
}

func testGateway(t *testing.T, upstream string) http.Handler {
	t.Helper()
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "index.html"), []byte("<html>mobile-web</html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler, err := newGateway(config{upstreamURL: upstream, staticDir: directory}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return handler
}
