package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type config struct {
	listenAddr  string
	upstreamURL string
	staticDir   string
	devURL      string
}

func main() {
	conf := parseConfig()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	handler, err := newGateway(conf, logger)
	if err != nil {
		logger.Error("configure Gateway", "error", err)
		os.Exit(2)
	}
	server := &http.Server{
		Addr: conf.listenAddr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 90 * time.Second,
	}
	ctx, stop := signal.NotifyContext(contextBackground(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errorsChannel := make(chan error, 1)
	go func() {
		logger.Info("Mobile Web Gateway listening", "address", conf.listenAddr, "run_server", conf.upstreamURL, "dev_upstream", conf.devURL)
		errorsChannel <- server.ListenAndServe()
	}()
	select {
	case err := <-errorsChannel:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("Gateway stopped", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		shutdownContext, cancel := contextWithTimeout(10 * time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownContext); err != nil {
			logger.Error("Gateway shutdown failed", "error", err)
			os.Exit(1)
		}
	}
}

// Small wrappers keep the imports and shutdown path explicit in tests.
var contextBackground = func() context.Context { return context.Background() }
var contextWithTimeout = func(timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), timeout)
}

func parseConfig() config {
	conf := config{}
	flag.StringVar(&conf.listenAddr, "listen", envOrDefault("GATEWAY_LISTEN_ADDR", "0.0.0.0:18774"), "Gateway listen address")
	flag.StringVar(&conf.upstreamURL, "upstream", envOrDefault("GATEWAY_RUN_SERVER_URL", "http://127.0.0.1:18775"), "Run Server URL")
	flag.StringVar(&conf.staticDir, "static", envOrDefault("GATEWAY_STATIC_DIR", "dist"), "Mobile Web production build directory")
	flag.StringVar(&conf.devURL, "dev-upstream", os.Getenv("GATEWAY_DEV_UPSTREAM_URL"), "optional Vite URL for frontend assets")
	flag.Parse()
	return conf
}

func newGateway(conf config, logger *slog.Logger) (http.Handler, error) {
	upstream, err := url.Parse(conf.upstreamURL)
	if err != nil || (upstream.Scheme != "http" && upstream.Scheme != "https") || upstream.Host == "" {
		return nil, fmt.Errorf("invalid Run Server URL %q", conf.upstreamURL)
	}
	apiProxy := newProxy(upstream, logger)
	var frontend http.Handler
	if conf.devURL != "" {
		dev, err := url.Parse(conf.devURL)
		if err != nil || (dev.Scheme != "http" && dev.Scheme != "https") || dev.Host == "" {
			return nil, fmt.Errorf("invalid Vite URL %q", conf.devURL)
		}
		frontend = newProxy(dev, logger)
	} else {
		frontend, err = spaHandler(conf.staticDir)
		if err != nil {
			return nil, err
		}
	}

	return securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/gateway/healthz":
			writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "contract_version": gatewayContractVersion})
		case allowedProxyRoute(r.Method, r.URL.Path):
			apiProxy.ServeHTTP(w, r)
		case sensitivePath(r.URL.Path) || strings.HasPrefix(r.URL.Path, "/v1/"):
			writeJSON(w, http.StatusNotFound, map[string]any{"error": map[string]any{"code": "GATEWAY_ROUTE_NOT_EXPOSED", "retryable": false}})
		default:
			frontend.ServeHTTP(w, r)
		}
	}), conf.devURL != ""), nil
}

func newProxy(target *url.URL, logger *slog.Logger) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(request *http.Request) {
		stripUntrustedForwardingHeaders(request.Header)
		originalDirector(request)
		request.Host = target.Host
	}
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logger.Warn("Gateway upstream failed", "path", r.URL.Path, "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": map[string]any{"code": "GATEWAY_UPSTREAM_UNAVAILABLE", "retryable": true}})
	}
	return proxy
}

func stripUntrustedForwardingHeaders(headers http.Header) {
	for name := range headers {
		canonical := http.CanonicalHeaderKey(name)
		if canonical == "Forwarded" || canonical == "X-Forwarded-For" || canonical == "X-Forwarded-Host" || canonical == "X-Forwarded-Proto" || canonical == "X-Real-Ip" || canonical == "True-Client-Ip" || strings.HasPrefix(canonical, "Cf-") {
			headers.Del(name)
		}
	}
}

func sensitivePath(value string) bool {
	return value == "/status" || value == "/healthz" || strings.HasPrefix(value, "/ws/") || strings.HasPrefix(value, "/debug/") || strings.HasPrefix(value, "/v1/auth-control/")
}

func spaHandler(directory string) (http.Handler, error) {
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return nil, err
	}
	stat, err := os.Stat(filepath.Join(absolute, "index.html"))
	if err != nil || stat.IsDir() {
		return nil, fmt.Errorf("Mobile Web build not found at %s; run npm run build", absolute)
	}
	fileServer := http.FileServer(http.Dir(absolute))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		cleaned := path.Clean("/" + r.URL.Path)
		candidate := filepath.Join(absolute, filepath.FromSlash(strings.TrimPrefix(cleaned, "/")))
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		if path.Ext(cleaned) != "" {
			http.NotFound(w, r)
			return
		}
		clone := r.Clone(r.Context())
		clone.URL.Path = "/"
		fileServer.ServeHTTP(w, clone)
	}), nil
}

func securityHeaders(next http.Handler, development bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		scriptSource := "script-src 'self'"
		if development {
			scriptSource += " 'unsafe-inline'"
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "+scriptSource)
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
