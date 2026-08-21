import type {
  ApiProject,
  ApiRun,
  ApiSession,
  RuntimeEvent,
  SessionSnapshot,
  StartRunInput,
  StartRunResult,
} from "../types";
import type { RuntimeClient } from "./RuntimeClient";
import { SseDecoder } from "./sseDecoder";

type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

export class HttpRuntimeClient implements RuntimeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly accessToken: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
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

  getBootstrap(syncId: string, signal?: AbortSignal): Promise<{ status: string }> {
    return this.get(`/v1/runtime/bootstrap-syncs/${encodeURIComponent(syncId)}`, signal);
  }

  private async *stream(path: string, runId: string, signal?: AbortSignal): AsyncGenerator<RuntimeEvent> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { ...this.headers(), Accept: "text/event-stream" },
      signal,
    });
    if (!response.ok) throw new Error(`订阅失败：HTTP ${response.status}`);
    if (!response.body) throw new Error("SSE 响应正文为空");
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
    const response = await fetch(`${this.baseUrl}${path}`, { headers: this.headers(), signal });
    return this.decode<T>(response);
  }

  private async post<T>(path: string, body?: unknown, idempotencyKey?: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    return this.decode<T>(response);
  }

  private async decode<T>(response: Response): Promise<T> {
    const payload = (await response.json()) as Envelope<T>;
    if (!response.ok || !payload.success) {
      const code = "error" in payload ? payload.error.code : `HTTP_${response.status}`;
      throw new Error(`${code}（HTTP ${response.status}）`);
    }
    return payload.data;
  }

  private headers(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }
}

function isTerminal(type: string): boolean {
  return type === "turn.completed" || type === "turn.failed" || type === "turn.interrupted";
}
