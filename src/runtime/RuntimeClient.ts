import type {
  ApiProject,
  ApiRun,
  ApiSession,
  ConnectionSettings,
  RuntimeEvent,
  SessionSnapshot,
  StartRunInput,
  StartRunResult,
} from "../types";
import { HttpRuntimeClient } from "./httpRuntimeClient";

export interface RuntimeClient {
  checkHealth(signal?: AbortSignal): Promise<void>;
  listProjects(signal?: AbortSignal): Promise<{ items: ApiProject[]; agentPresence: "online" | "offline" }>;
  listSessions(projectId?: string, signal?: AbortSignal): Promise<ApiSession[]>;
  createSession(projectId: string, title: string, idempotencyKey: string, signal?: AbortSignal): Promise<ApiSession>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot>;
  getRun(runId: string, signal?: AbortSignal): Promise<ApiRun>;
  startRun(input: StartRunInput, signal?: AbortSignal): Promise<StartRunResult>;
  streamRun(runId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
  streamSession(sessionId: string, after?: number, signal?: AbortSignal): AsyncGenerator<RuntimeEvent>;
  cancelRun(runId: string, signal?: AbortSignal): Promise<void>;
  startBootstrap(idempotencyKey: string, signal?: AbortSignal): Promise<string>;
  getBootstrap(syncId: string, signal?: AbortSignal): Promise<{ status: string }>;
}

export function createRuntimeClient(settings: ConnectionSettings): RuntimeClient {
  return new HttpRuntimeClient(settings.baseUrl, settings.accessToken);
}
