import type {
  ApiProject,
  ApiRun,
  ApiSession,
  BootstrapSyncJob,
  RuntimeEvent,
  SessionSnapshot,
  StartRunInput,
  StartRunResult,
  SourceSnapshot,
} from "../types";
import type { RuntimeClient } from "./RuntimeClient";
import type { AccessTokenProvider } from "../auth/AuthSession";
import { RuntimeRequestError, type RuntimeFailureKind } from "./runtimeFailure";
import { SseDecoder } from "./sseDecoder";

type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

const REQUEST_TIMEOUT_MS = 8_000;

export class HttpRuntimeClient implements RuntimeClient {
  private readonly baseUrl: string;

  private readonly tokenProvider: AccessTokenProvider;

  private readonly canRefresh: boolean;

  constructor(baseUrl: string, tokenProvider: AccessTokenProvider | string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (typeof tokenProvider === "string") {
      this.tokenProvider = { getAccessToken: () => tokenProvider, refresh: async () => tokenProvider };
      this.canRefresh = false;
    } else {
      this.tokenProvider = tokenProvider;
      this.canRefresh = true;
    }
  }

  async checkHealth(signal?: AbortSignal): Promise<void> {
    await this.get<{ status: string }>("/v1/runtime/healthz", signal);
  }

  async listProjects(signal?: AbortSignal): Promise<{ items: ApiProject[]; agentPresence: "online" | "offline" }> {
    const data = await this.get<{ items: ApiProject[]; agent_presence: "online" | "offline" }>("/v1/runtime/projects", signal);
    return { items: data.items ?? [], agentPresence: data.agent_presence };
  }

  async listSessions(projectId?: string, signal?: AbortSignal): Promise<ApiSession[]> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return (await this.get<{ items: ApiSession[] }>(`/v1/runtime/sessions${query}`, signal)).items ?? [];
  }

  createSession(projectId: string, title: string, idempotencyKey: string, signal?: AbortSignal): Promise<ApiSession> {
    return this.post("/v1/runtime/sessions", { project_id: projectId, title }, idempotencyKey, signal);
  }

  getSession(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot> {
    return this.get(`/v1/runtime/sessions/${encodeURIComponent(sessionId)}`, signal);
  }

  getRun(runId: string, signal?: AbortSignal): Promise<ApiRun> {
    return this.get(`/v1/runtime/runs/${encodeURIComponent(runId)}`, signal);
  }

  async startRun(input: StartRunInput, signal?: AbortSignal): Promise<StartRunResult> {
    const data = await this.post<{ run_id: string; session_id: string }>(
      `/v1/runtime/sessions/${encodeURIComponent(input.sessionId)}/runs`,
      { prompt: input.prompt },
      input.idempotencyKey,
      signal,
    );
    return { runId: data.run_id, sessionId: data.session_id };
  }

  streamRun(runId: string, after = 0, signal?: AbortSignal): AsyncGenerator<RuntimeEvent> {
    return this.stream(`/v1/runtime/runs/${encodeURIComponent(runId)}/events?after=${after}`, runId, signal);
  }

  streamSession(sessionId: string, after = 0, signal?: AbortSignal): AsyncGenerator<RuntimeEvent> {
    return this.stream(`/v1/runtime/sessions/${encodeURIComponent(sessionId)}/events?after=${after}`, "", signal);
  }

  async cancelRun(runId: string, signal?: AbortSignal): Promise<void> {
    await this.post(`/v1/runtime/runs/${encodeURIComponent(runId)}/cancel`, undefined, undefined, signal);
  }

  async startBootstrap(idempotencyKey: string, signal?: AbortSignal): Promise<string> {
    const data = await this.post<{ sync_id: string }>("/v1/runtime/bootstrap-syncs", {}, idempotencyKey, signal);
    return data.sync_id;
  }

  getBootstrap(syncId: string, signal?: AbortSignal): Promise<BootstrapSyncJob> {
    return this.get(`/v1/runtime/bootstrap-syncs/${encodeURIComponent(syncId)}`, signal);
  }

  getProjectSource(projectId: string, path: string, line = 0, contextLines = 200, signal?: AbortSignal): Promise<SourceSnapshot> {
    return this.post(`/v1/runtime/projects/${encodeURIComponent(projectId)}/source:read`, { path, line, context_lines: contextLines }, undefined, signal);
  }

  private async *stream(path: string, runId: string, signal?: AbortSignal): AsyncGenerator<RuntimeEvent> {
    const response = await this.fetch(path, {
      headers: { ...this.headers(), Accept: "text/event-stream" },
    }, signal);
    if (!response.ok) throw await this.responseError(response);
    if (!response.body) throw new RuntimeRequestError("SSE 响应正文为空", "protocol", response.status);
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    const decoder = new SseDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        const packets = done ? decoder.finish() : decoder.push(textDecoder.decode(value, { stream: true }));
        for (const packet of packets) {
          const event = JSON.parse(packet.data) as RuntimeEvent;
          event.id ||= packet.id ?? "";
          event.type ||= packet.event ?? "message";
          event.runId ||= runId || String(event.run_id ?? "");
          yield event;
          if (runId && isTerminal(event.type)) return;
        }
        if (done) return;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetch(path, { headers: this.headers() }, signal);
    return this.decode<T>(response);
  }

  private async post<T>(path: string, body?: unknown, idempotencyKey?: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetch(path, {
      method: "POST",
      headers: {
        ...this.headers(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, signal);
    return this.decode<T>(response);
  }

  private async decode<T>(response: Response): Promise<T> {
    let payload: Envelope<T>;
    try {
      payload = (await response.json()) as Envelope<T>;
    } catch {
      if (!response.ok) {
        throw new RuntimeRequestError(
          `Run Server 返回 HTTP ${response.status}`,
          failureKindForStatus(response.status),
          response.status,
          `HTTP_${response.status}`,
        );
      }
      throw new RuntimeRequestError("Run Server 返回了无法解析的响应", "protocol", response.status);
    }
    if (!response.ok || !payload.success) {
      const code = "error" in payload ? payload.error.code : `HTTP_${response.status}`;
      const message = "error" in payload ? payload.error.message : `HTTP ${response.status}`;
      throw new RuntimeRequestError(message || code, failureKindForStatus(response.status), response.status, code);
    }
    return payload.data;
  }

  private async fetch(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const attemptedToken = this.tokenProvider.getAccessToken();
      let response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: this.withCurrentToken(init.headers), credentials: "include", signal: controller.signal });
      if (response.status === 401 && this.canRefresh) {
        await this.tokenProvider.refresh(attemptedToken);
        response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: this.withCurrentToken(init.headers), credentials: "include", signal: controller.signal });
      }
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timedOut) throw new RuntimeRequestError("Run Server 连接超时", "timeout");
      if (error instanceof TypeError) throw new RuntimeRequestError("无法连接 Run Server", "network");
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async responseError(response: Response): Promise<RuntimeRequestError> {
    let code = `HTTP_${response.status}`;
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as Envelope<unknown>;
      if ("error" in payload) {
        code = payload.error.code;
        message = payload.error.message || code;
      }
    } catch {
      // The HTTP status remains useful even when an upstream proxy returns HTML.
    }
    return new RuntimeRequestError(message, failureKindForStatus(response.status), response.status, code);
  }

  private headers(): Record<string, string> {
    const token = this.tokenProvider.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private withCurrentToken(headers: HeadersInit | undefined): Headers {
    const result = new Headers(headers);
    const token = this.tokenProvider.getAccessToken();
    if (token) result.set("Authorization", `Bearer ${token}`);
    else result.delete("Authorization");
    return result;
  }
}

function failureKindForStatus(status: number): RuntimeFailureKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status >= 500) return "server";
  return "request";
}

function isTerminal(type: string): boolean {
  return type === "turn.completed" || type === "turn.failed" || type === "turn.interrupted";
}
