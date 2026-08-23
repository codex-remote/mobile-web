package main

import (
	"net/http"
	"strings"
)

// gatewayContractVersion identifies the reviewed Run Server surface exposed by
// this Gateway. New upstream routes remain closed until this policy is updated.
const gatewayContractVersion = "run-server-v1"

func allowedProxyRoute(method, requestPath string) bool {
	if method == http.MethodPost {
		switch requestPath {
		case "/v1/auth/pairing-grants:exchange", "/v1/auth/tokens:refresh", "/v1/auth/sessions/current:revoke",
			"/v1/runtime/sessions", "/v1/runtime/bootstrap-syncs":
			return true
		}
	}
	if method == http.MethodGet {
		switch requestPath {
		case "/v1/auth/me", "/v1/runtime/healthz", "/v1/runtime/projects", "/v1/runtime/sessions":
			return true
		}
	}
	segments := splitPath(requestPath)
	if len(segments) < 4 || segments[0] != "v1" || segments[1] != "runtime" {
		return false
	}
	for _, segment := range segments {
		if segment == "" || len(segment) > 256 {
			return false
		}
	}
	if method == http.MethodGet {
		if len(segments) == 4 && segments[2] == "sessions" {
			return true
		}
		if len(segments) == 5 && segments[2] == "sessions" && (segments[4] == "runs" || segments[4] == "events") {
			return true
		}
		if len(segments) == 4 && segments[2] == "runs" {
			return true
		}
		if len(segments) == 5 && segments[2] == "runs" && segments[4] == "events" {
			return true
		}
		if len(segments) == 4 && segments[2] == "bootstrap-syncs" {
			return true
		}
	}
	if method == http.MethodPost {
		if len(segments) == 5 && segments[2] == "sessions" && segments[4] == "runs" {
			return true
		}
		if len(segments) == 5 && segments[2] == "runs" && segments[4] == "cancel" {
			return true
		}
		if len(segments) == 5 && segments[2] == "projects" && segments[4] == "source:read" {
			return true
		}
	}
	return false
}

func splitPath(value string) []string {
	trimmed := strings.Trim(value, "/")
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "/")
}
