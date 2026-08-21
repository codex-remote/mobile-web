export type SessionStatus = "queued" | "accepted" | "running" | "completed" | "failed" | "canceled" | "waiting";

export type Project = {
  id: string;
  name: string;
  path: string;
  accent: string;
  updatedLabel: string;
};

export type Session = {
  id: string;
  projectId: string;
  title: string;
  preview: string;
  status: SessionStatus;
  updatedLabel: string;
  messages: ChatMessage[];
};

export type ToolStep = {
  id: string;
  title: string;
  detail: string;
  status: "running" | "completed" | "failed";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  streaming?: boolean;
  toolSteps?: ToolStep[];
};

export type RuntimeEvent = {
  id: string;
  type: string;
  runId: string;
  delta?: string;
  text?: string;
  message?: string;
  item?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ApiProject = {
  project_id: string;
  display_name: string;
};

export type ApiSession = {
  session_id: string;
  project_id: string;
  codex_thread_id?: string;
  title: string;
  last_session_sequence: number;
  created_at: string;
  updated_at: string;
};

export type ApiRunEvent = {
  agent_sequence: number;
  type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type ApiRun = {
  run_id: string;
  session_id: string;
  status: string;
  prompt?: string;
  persisted_through_sequence: number;
  final_sequence?: number;
  error_message?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  events?: ApiRunEvent[];
};

export type SessionSnapshot = {
  session: ApiSession;
  runs: ApiRun[];
  snapshot_session_sequence: number;
  agent_presence: "online" | "offline";
  agent_last_seen_at?: string;
};

export type StartRunInput = {
  sessionId: string;
  prompt: string;
  idempotencyKey: string;
};

export type StartRunResult = {
  runId: string;
  sessionId: string;
};

export type ConnectionSettings = {
  baseUrl: string;
  accessToken: string;
};

export type InspectorEvent = {
  id: string;
  direction: "up" | "down" | "system";
  type: string;
  summary: string;
  time: string;
};
