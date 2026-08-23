export type SessionStatus = "queued" | "accepted" | "running" | "completed" | "failed" | "canceled" | "waiting";

export type SessionDetailStatus = "loading" | "ready" | "refreshing" | "failed" | "stale-error";

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
  hasLatestRun?: boolean;
  lastSessionSequence?: number;
  unread?: boolean;
};

export type ToolStep = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  status: "running" | "completed" | "failed" | "interrupted";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  startedAt?: string;
  durationMs?: number;
  streaming?: boolean;
  toolSteps?: ToolStep[];
  assistantStreamMode?: "legacy" | "commentary" | "final";
  responseItemId?: string;
};

export type RuntimeEvent = {
  id: string;
  type: string;
  runId: string;
  occurred_at?: string;
  started_at?: string;
  duration_ms?: number;
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
  latest_run_status?: string;
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

export type BootstrapSyncJob = {
  sync_id: string;
  status: "queued" | "running" | "completed" | "failed";
  snapshot_id?: string;
  last_committed_batch_no: number;
  item_count: number;
  total_sessions?: number;
  processed_sessions?: number;
  archived_sessions?: number;
  archived_projects?: number;
  reconciliation_applied?: boolean;
  error_code?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
};

export type SourceReference = {
  path: string;
  line: number;
};

export type SourceSnapshot = {
  project_id: string;
  path: string;
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  focus_line?: number;
  truncated: boolean;
  sha256: string;
  modified_at: string;
};

export type HistorySyncState = {
  status: "idle" | "syncing" | "completed" | "failed";
  processed: number;
  total: number;
  archived: number;
  archivedProjects: number;
  message: string;
};

export type InspectorEvent = {
  id: string;
  direction: "up" | "down" | "system";
  type: string;
  summary: string;
  time: string;
};
