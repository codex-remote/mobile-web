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
import { HttpRuntimeClient } from "./httpRuntimeClient";
import { authSession } from "../auth/AuthSession";

export type RuntimeTransportMode = "sse" | "poll";

export interface RuntimeClient {
  readonly transportMode: RuntimeTransportMode;
  checkHealth(signal?: AbortSignal): Promise<void>;
  listProjects(signal?: AbortSignal): Promise<{ items: ApiProject[]; agentPresence: "online" | "offline" }>;
  listSessions(projectId?: string, signal?: AbortSignal): Promise<ApiSession[]>;
  createSession(projectId: string, title: string, idempotencyKey: string, signal?: AbortSignal): Promise<ApiSession>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot>;
  getRun(runId: string, signal?: AbortSignal): Promise<ApiRun>;
  startRun(input: StartRunInput, signal?: AbortSignal): Promise<StartRunResult>;
  streamRun(runId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
  streamSession(sessionId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
  watchRun(runId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
  watchSession(sessionId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
  cancelRun(runId: string, signal?: AbortSignal): Promise<void>;
  startBootstrap(idempotencyKey: string, signal?: AbortSignal): Promise<string>;
  getBootstrap(syncId: string, signal?: AbortSignal): Promise<BootstrapSyncJob>;
  getProjectSource(projectId: string, path: string, line?: number, contextLines?: number, signal?: AbortSignal): Promise<SourceSnapshot>;
}

export function createRuntimeClient(baseUrl: string, mode = resolveRuntimeTransportMode()): RuntimeClient {
  return new HttpRuntimeClient(baseUrl, authSession, mode);
}

export function resolveRuntimeTransportMode(): RuntimeTransportMode {
  const configured = import.meta.env.VITE_RUNTIME_EVENT_TRANSPORT;
  return configured === "poll" ? "poll" : "sse";
}
