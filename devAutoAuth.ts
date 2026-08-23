import type { Plugin } from "vite";

export const devAutoAuthEndpoint = "/__codexremote__/auth/auto-pair";

const authControlEndpoint = "http://127.0.0.1:18776/v1/auth-control/pairing-grants";

export function createDevAutoAuthPlugin(enabled: boolean): Plugin {
  return {
    name: "codexremote-dev-auto-auth",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use(async (request, response, next) => {
        const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (requestPath !== devAutoAuthEndpoint) {
          next();
          return;
        }
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          writeError(response, 405, "DEV_AUTO_AUTH_METHOD_NOT_ALLOWED");
          return;
        }
        if (request.headers["x-codexremote-debug"] !== "1") {
          writeError(response, 403, "DEV_AUTO_AUTH_HEADER_REQUIRED");
          return;
        }
        if (!isLoopbackAddress(request.socket.remoteAddress) || !isLoopbackHost(request.headers.host)) {
          writeError(response, 403, "DEV_AUTO_AUTH_LOOPBACK_REQUIRED");
          return;
        }
        const origin = request.headers.origin;
        if (origin && !isLoopbackOrigin(origin)) {
          writeError(response, 403, "DEV_AUTO_AUTH_LOOPBACK_ORIGIN_REQUIRED");
          return;
        }
        try {
          const controlResponse = await fetch(authControlEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Codex AI Debug" }),
            signal: AbortSignal.timeout(3_000),
          });
          response.statusCode = controlResponse.status;
          response.end(await controlResponse.text());
        } catch {
          writeError(response, 502, "DEV_AUTO_AUTH_CONTROL_UNAVAILABLE");
        }
      });
    },
  };
}

export function isLoopbackAddress(value: string | undefined): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

export function isLoopbackHost(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(`http://${value}`).hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function isLoopbackOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return (origin.protocol === "http:" || origin.protocol === "https:") && isLoopbackHost(origin.host);
  } catch {
    return false;
  }
}

function writeError(response: { statusCode: number; end(body: string): void }, status: number, code: string): void {
  response.statusCode = status;
  response.end(JSON.stringify({ success: false, error: { code, retryable: false } }));
}
