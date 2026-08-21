import { CircleAlert, LoaderCircle, Menu, PanelRight, Plus, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { ConversationView } from "./components/ConversationView";
import { IconButton } from "./components/IconButton";
import { NavigationDrawer } from "./components/NavigationDrawer";
import { RuntimeInspector } from "./components/RuntimeInspector";
import { createRuntimeClient, type RuntimeClient } from "./runtime/RuntimeClient";
import type {
  ApiProject,
  ApiRun,
  ApiSession,
  ChatMessage,
  ConnectionSettings,
  InspectorEvent,
  Project,
  RuntimeEvent,
  Session,
  SessionStatus,
  ToolStep,
} from "./types";

const defaultSettings: ConnectionSettings = {
  baseUrl: import.meta.env.VITE_RUNTIME_URL || "http://127.0.0.1:18775",
  accessToken: "",
};

const emptySession: Session = {
  id: "",
  projectId: "",
  title: "选择一个会话",
  preview: "从项目导航中打开会话，或新建一个会话。",
  status: "waiting",
  updatedLabel: "",
  messages: [],
};

const emptyProject: Project = {
  id: "",
  name: "未选择项目",
  path: "",
  accent: "#3f6f63",
  updatedLabel: "",
};

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settings, setSettings] = useState<ConnectionSettings>(() => loadSettings());
  const [inspectorEvents, setInspectorEvents] = useState<InspectorEvent[]>([]);
  const [healthState, setHealthState] = useState<"idle" | "checking" | "healthy" | "failed">("idle");
  const [agentPresence, setAgentPresence] = useState<"online" | "offline">("offline");
  const [historySyncState, setHistorySyncState] = useState<"idle" | "syncing" | "failed">("idle");
  const [sessionRevision, setSessionRevision] = useState(0);
  const [sessionCreateState, setSessionCreateState] = useState<{
    status: "idle" | "creating" | "failed";
    projectId: string;
    message: string;
  }>({ status: "idle", projectId: "", message: "" });
  const activeRunId = useRef<string | null>(null);
  const runStreams = useRef(new Map<string, AbortController>());
  const sessionCreateLocked = useRef(false);

  const runtimeClient = useMemo(() => createRuntimeClient(settings), [settings]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? emptySession;
  const selectedProject = projects.find((project) => project.id === selectedSession.projectId) ?? projects[0] ?? emptyProject;
  const running = isActiveStatus(selectedSession.status);

  useEffect(() => {
    localStorage.setItem("codex-remote.runtime-url", settings.baseUrl);
    setHealthState("idle");
  }, [settings.baseUrl]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 900px)");
    const syncDrawer = () => setDrawerOpen(desktop.matches);
    desktop.addEventListener("change", syncDrawer);
    return () => desktop.removeEventListener("change", syncDrawer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    let catalogRefreshInFlight = false;

    async function refreshCatalog() {
      if (catalogRefreshInFlight) return null;
      catalogRefreshInFlight = true;
      try {
        const projectResponse = await runtimeClient.listProjects(controller.signal);
        setAgentPresence(projectResponse.agentPresence);
        setProjects(projectResponse.items.map(toProject));
        const apiSessions = await runtimeClient.listSessions(undefined, controller.signal);
        setSessions((current) => mergeSessionCatalog(current, apiSessions));
        setSelectedSessionId((current) => current || apiSessions[0]?.session_id || "");
        setHealthState("healthy");
        return projectResponse;
      } catch (error) {
        if (!isAbortError(error)) {
          setHealthState("failed");
          recordEvent("system", "catalog.failed", errorMessage(error));
        }
        return null;
      } finally {
        catalogRefreshInFlight = false;
      }
    }

    async function loadCatalogAndSyncHistory() {
      const projectResponse = await refreshCatalog();
      if (controller.signal.aborted) return;
      if (!projectResponse || projectResponse.agentPresence !== "online") {
        setHistorySyncState("idle");
        return;
      }
      setHistorySyncState("syncing");
      try {
        await syncHistoryFromAgent(runtimeClient, controller.signal, recordEvent);
        if (controller.signal.aborted) return;
        await refreshCatalog();
        setHistorySyncState("idle");
      } catch (error) {
        if (!isAbortError(error)) {
          setHistorySyncState("failed");
          recordEvent("system", "history.sync.failed", errorMessage(error));
        }
      }
    }

    void loadCatalogAndSyncHistory();
    timer = window.setInterval(() => void refreshCatalog(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [runtimeClient]);

  useEffect(() => {
    for (const controller of runStreams.current.values()) controller.abort();
    runStreams.current.clear();
    if (!selectedSessionId) return;

    const sessionController = new AbortController();
    let sessionCursor = 0;

    async function refreshSelected() {
      const snapshot = await runtimeClient.getSession(selectedSessionId, sessionController.signal);
      sessionCursor = Math.max(sessionCursor, snapshot.snapshot_session_sequence);
      setAgentPresence(snapshot.agent_presence);
      const runs = await Promise.all((snapshot.runs ?? []).map((run) => runtimeClient.getRun(run.run_id, sessionController.signal)));
      const hydrated = toSession(snapshot.session, runs);
      setSessions((current) => upsertSession(current, hydrated));
      const active = [...runs].reverse().find((run) => isActiveStatus(run.status));
      activeRunId.current = active?.run_id ?? null;
      for (const run of runs) {
        if (isActiveStatus(run.status)) ensureRunStream(runtimeClient, selectedSessionId, run, runStreams.current, applyRuntimeEvent, recordEvent);
      }
    }

    async function watchSession() {
      while (!sessionController.signal.aborted) {
        try {
          await refreshSelected();
          for await (const event of runtimeClient.streamSession(selectedSessionId, sessionCursor, sessionController.signal)) {
            sessionCursor = Math.max(sessionCursor, Number(event.id) || 0);
            recordEvent("down", event.type, event.runId || selectedSessionId);
            await refreshSelected();
          }
        } catch (error) {
          if (isAbortError(error)) return;
          recordEvent("system", "session.stream.reconnecting", errorMessage(error));
        }
        try {
          await delay(750, sessionController.signal);
        } catch {
          return;
        }
      }
    }

    void watchSession();
    return () => {
      sessionController.abort();
      for (const controller of runStreams.current.values()) controller.abort();
      runStreams.current.clear();
    };
  }, [runtimeClient, selectedSessionId, sessionRevision]);

  function selectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setDrawerOpen(false);
  }

  async function createSession(projectId: string) {
    if (!projectId) {
      setSessionCreateState({ status: "failed", projectId: "", message: "项目列表尚未加载，请稍后再试。" });
      return;
    }
    if (sessionCreateLocked.current) return;
    sessionCreateLocked.current = true;
    setSessionCreateState({ status: "creating", projectId, message: "正在新建会话…" });
    try {
      recordEvent("up", "session.create", projectId);
      const created = await runtimeClient.createSession(projectId, "新会话", crypto.randomUUID());
      setSessions((current) => upsertSession(current, toSession(created, [])));
      setSelectedSessionId(created.session_id);
      setDrawerOpen(false);
      setSessionCreateState({ status: "idle", projectId: "", message: "" });
      recordEvent("down", "session.created", created.session_id);
    } catch (error) {
      const message = errorMessage(error);
      setSessionCreateState({ status: "failed", projectId, message: `新建会话失败：${message}` });
      recordEvent("system", "session.create.failed", message);
    } finally {
      sessionCreateLocked.current = false;
    }
  }

  async function sendPrompt(prompt: string) {
    if (running || !selectedSessionId) return;
    const runKey = crypto.randomUUID();
    const optimisticUser: ChatMessage = { id: `pending_user_${runKey}`, role: "user", content: prompt, createdAt: currentTime() };
    const optimisticAssistant: ChatMessage = { id: `pending_assistant_${runKey}`, role: "assistant", content: "", createdAt: currentTime(), streaming: true, toolSteps: [] };
    updateSession(selectedSessionId, (session) => ({ ...session, status: "queued", preview: prompt, messages: [...session.messages, optimisticUser, optimisticAssistant] }));
    recordEvent("up", "run.create", summarize(prompt));
    try {
      const result = await runtimeClient.startRun({ sessionId: selectedSessionId, prompt, idempotencyKey: runKey });
      activeRunId.current = result.runId;
      recordEvent("down", "run.created", result.runId);
      setSessionRevision((value) => value + 1);
    } catch (error) {
      updateSession(selectedSessionId, (session) => ({ ...session, status: "failed" }));
      recordEvent("system", "run.create.failed", errorMessage(error));
    }
  }

  async function stopRun() {
    const runId = activeRunId.current;
    if (!runId) return;
    recordEvent("up", "run.cancel", runId);
    try {
      await runtimeClient.cancelRun(runId);
      recordEvent("down", "run.cancel.requested", runId);
    } catch (error) {
      recordEvent("system", "run.cancel.failed", errorMessage(error));
    }
  }

  async function checkHealth() {
    setHealthState("checking");
    recordEvent("up", "health.check", settings.baseUrl);
    try {
      await runtimeClient.checkHealth();
      setHealthState("healthy");
      recordEvent("down", "health.ready", "HTTP 200");
    } catch (error) {
      setHealthState("failed");
      recordEvent("system", "health.failed", errorMessage(error));
    }
  }

  function applyRuntimeEvent(sessionId: string, event: RuntimeEvent) {
    const assistantId = `assistant_${event.runId}`;
    if (event.type === "assistant.delta") {
      updateAssistant(sessionId, assistantId, (message) => ({ ...message, content: message.content + String(event.delta ?? event.text ?? "") }));
      return;
    }
    if (event.type === "item.started" || event.type === "item.completed") {
      const tool = toolFromItem(event.item, event.type === "item.completed" ? "completed" : "running");
      if (tool) updateAssistant(sessionId, assistantId, (message) => ({ ...message, toolSteps: upsertToolStep(message.toolSteps ?? [], tool) }));
      if (event.type === "item.completed" && event.item?.role === "assistant") {
        updateAssistant(sessionId, assistantId, (message) => ({ ...message, content: message.content || String(event.item?.text ?? "") }));
      }
      return;
    }
    if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted") {
      updateAssistant(sessionId, assistantId, (message) => ({ ...message, streaming: false, content: message.content || String(event.message ?? "") }));
      updateSession(sessionId, (session) => ({ ...session, status: statusFromTerminal(event.type), updatedLabel: "刚刚" }));
      activeRunId.current = null;
    }
  }

  function updateSession(sessionId: string, transform: (session: Session) => Session) {
    setSessions((current) => current.map((session) => session.id === sessionId ? transform(session) : session));
  }

  function updateAssistant(sessionId: string, messageId: string, transform: (message: ChatMessage) => ChatMessage) {
    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) => message.id === messageId ? transform(message) : message),
    }));
  }

  function recordEvent(direction: InspectorEvent["direction"], type: string, summary: string) {
    setInspectorEvents((current) => [{ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, direction, type, summary, time: currentTime(true) }, ...current].slice(0, 80));
  }

  return (
    <div className={`app-shell ${drawerOpen ? "drawer-is-open" : ""} ${inspectorOpen ? "inspector-is-open" : ""}`}>
      <NavigationDrawer
        open={drawerOpen}
        projects={projects}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={selectSession}
        onNewSession={createSession}
        creatingProjectId={sessionCreateState.status === "creating" ? sessionCreateState.projectId : ""}
        historySyncState={historySyncState}
        onClose={() => setDrawerOpen(false)}
        onOpenInspector={() => setInspectorOpen(true)}
        transportLabel={`Run Server · ${agentPresence === "online" ? "Agent 在线" : "Agent 离线"}`}
        agentOnline={agentPresence === "online"}
      />

      <main className="workspace-frame">
        <header className="workspace-toolbar">
          <IconButton label="打开项目导航" onClick={() => setDrawerOpen(true)} data-testid="open-drawer"><Menu size={19} /></IconButton>
          <div className="toolbar-title">
            <strong>{selectedSession.title}</strong>
            <small>{agentPresence === "online" ? <Wifi size={11} /> : <WifiOff size={11} />}SSE · {agentPresence === "online" ? "在线" : "离线"}</small>
          </div>
          <div className="toolbar-actions">
            <IconButton
              label={sessionCreateState.status === "creating" ? "正在新建会话" : "新建会话"}
              onClick={() => void createSession(selectedProject.id)}
              disabled={sessionCreateState.status === "creating"}
              aria-busy={sessionCreateState.status === "creating"}
            >
              {sessionCreateState.status === "creating" ? <LoaderCircle className="spinning-icon" size={18} /> : <Plus size={19} />}
            </IconButton>
            <IconButton label="打开连接检查器" onClick={() => setInspectorOpen(true)} data-testid="open-inspector"><PanelRight size={18} /></IconButton>
          </div>
        </header>

        <ConversationView session={selectedSession} />
        <Composer running={running} projectName={selectedProject.name} onSubmit={sendPrompt} onStop={stopRun} />
        {drawerOpen && <button className="workspace-scrim" type="button" aria-label="关闭项目导航" onClick={() => setDrawerOpen(false)} />}
      </main>

      <RuntimeInspector
        open={inspectorOpen}
        settings={settings}
        events={inspectorEvents}
        healthState={healthState}
        onChangeSettings={setSettings}
        onCheckHealth={checkHealth}
        onClearEvents={() => setInspectorEvents([])}
        onClose={() => setInspectorOpen(false)}
      />

      {sessionCreateState.status !== "idle" && (
        <div
          className={`session-create-notice session-create-notice-${sessionCreateState.status}`}
          role={sessionCreateState.status === "failed" ? "alert" : "status"}
          aria-live={sessionCreateState.status === "failed" ? "assertive" : "polite"}
        >
          {sessionCreateState.status === "creating"
            ? <LoaderCircle className="spinning-icon" size={17} aria-hidden="true" />
            : <CircleAlert size={17} aria-hidden="true" />}
          <span>{sessionCreateState.message}</span>
          {sessionCreateState.status === "failed" && (
            <IconButton
              label="关闭提示"
              className="session-create-notice-close"
              onClick={() => setSessionCreateState({ status: "idle", projectId: "", message: "" })}
            >
              <X size={15} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

function ensureRunStream(
  client: RuntimeClient,
  sessionId: string,
  run: ApiRun,
  streams: Map<string, AbortController>,
  applyEvent: (sessionId: string, event: RuntimeEvent) => void,
  recordEvent: (direction: InspectorEvent["direction"], type: string, summary: string) => void,
) {
  if (streams.has(run.run_id)) return;
  const controller = new AbortController();
  streams.set(run.run_id, controller);
  let cursor = run.events?.at(-1)?.agent_sequence ?? 0;
  void (async () => {
    try {
      while (!controller.signal.aborted) {
        try {
          for await (const event of client.streamRun(run.run_id, cursor, controller.signal)) {
            cursor = Math.max(cursor, Number(event.id) || 0);
            recordEvent("down", event.type, summarizeRuntimeEvent(event));
            applyEvent(sessionId, event);
            if (isTerminalEvent(event.type)) return;
          }
        } catch (error) {
          if (isAbortError(error)) return;
          recordEvent("system", "run.stream.reconnecting", errorMessage(error));
        }
        const snapshot = await client.getRun(run.run_id, controller.signal);
        if (!isActiveStatus(snapshot.status)) return;
        await delay(750, controller.signal);
      }
    } catch (error) {
      if (!isAbortError(error)) recordEvent("system", "run.stream.failed", errorMessage(error));
    } finally {
      streams.delete(run.run_id);
    }
  })();
}

async function syncHistoryFromAgent(
  client: RuntimeClient,
  signal: AbortSignal,
  recordEvent: (direction: InspectorEvent["direction"], type: string, summary: string) => void,
) {
  const keyName = "codex-remote.history-sync-idempotency-key";
  localStorage.removeItem("codex-remote.bootstrap-idempotency-key");
  const key = localStorage.getItem(keyName) || crypto.randomUUID();
  localStorage.setItem(keyName, key);
  recordEvent("up", "history.sync.start", "Mac Agent");
  const syncId = await client.startBootstrap(key, signal);
  for (let attempt = 0; attempt < 600; attempt++) {
    await delay(500, signal);
    const job = await client.getBootstrap(syncId, signal);
    if (job.status === "completed") {
      localStorage.removeItem(keyName);
      recordEvent("down", "history.sync.completed", syncId);
      return;
    }
    if (job.status === "failed") {
      localStorage.removeItem(keyName);
      throw new Error("历史会话同步失败");
    }
  }
  throw new Error("历史会话同步超时");
}

function toProject(project: ApiProject, index: number): Project {
  const accents = ["#3f6f63", "#47679a", "#9a6942", "#8a4d68"];
  return { id: project.project_id, name: project.display_name, path: "Mac Agent 工作区", accent: accents[index % accents.length]!, updatedLabel: "" };
}

function mergeSessionCatalog(current: Session[], incoming: ApiSession[]): Session[] {
  const currentById = new Map(current.map((session) => [session.id, session]));
  return incoming.map((item) => {
    const existing = currentById.get(item.session_id);
    return existing ? { ...existing, title: item.title || existing.title, projectId: item.project_id, updatedLabel: relativeTime(item.updated_at) } : toSession(item, []);
  });
}

function upsertSession(current: Session[], next: Session): Session[] {
  const found = current.some((session) => session.id === next.id);
  return found ? current.map((session) => session.id === next.id ? next : session) : [next, ...current];
}

function toSession(session: ApiSession, runs: ApiRun[]): Session {
  const lastRun = runs.at(-1);
  return {
    id: session.session_id,
    projectId: session.project_id,
    title: session.title || lastRun?.prompt?.slice(0, 28) || "新会话",
    preview: lastRun?.prompt || "等待第一条指令",
    status: normalizeStatus(lastRun?.status),
    updatedLabel: relativeTime(session.updated_at),
    messages: runs.flatMap(messagesFromRun),
  };
}

function messagesFromRun(run: ApiRun): ChatMessage[] {
  const user: ChatMessage = { id: `user_${run.run_id}`, role: "user", content: run.prompt || "", createdAt: displayTime(run.created_at) };
  let content = "";
  let terminal = false;
  let failedMessage = run.error_message || "";
  let tools: ToolStep[] = [];
  for (const event of run.events ?? []) {
    const payload = event.payload ?? {};
    if (event.type === "assistant.delta") content += String(payload.text ?? payload.delta ?? "");
    if (event.type === "item.started" || event.type === "item.completed") {
      const item = payload.item as Record<string, unknown> | undefined;
      const tool = toolFromItem(item, event.type === "item.completed" ? "completed" : "running");
      if (tool) tools = upsertToolStep(tools, tool);
      if (event.type === "item.completed" && item?.role === "assistant" && !content) content = String(item.text ?? "");
    }
    if (event.type === "turn.failed") failedMessage ||= String(payload.message ?? payload.error ?? "执行失败");
    if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted") terminal = true;
  }
  const assistant: ChatMessage = {
    id: `assistant_${run.run_id}`,
    role: "assistant",
    content: content || (run.status === "failed" ? failedMessage : ""),
    createdAt: displayTime(run.started_at || run.created_at),
    streaming: !terminal && isActiveStatus(run.status),
    toolSteps: tools,
  };
  return [user, assistant];
}

function toolFromItem(item: Record<string, unknown> | undefined, status: ToolStep["status"]): ToolStep | null {
  if (!item) return null;
  const type = String(item.type ?? "");
  if (item.role === "user" || item.role === "assistant" || type === "userMessage" || type === "agentMessage") return null;
  return {
    id: String(item.id ?? `${type}_${String(item.name ?? item.command ?? "tool")}`),
    title: String((item.name ?? item.command ?? item.path ?? type) || "执行工具"),
    detail: String(item.output ?? item.query ?? item.cwd ?? ""),
    status,
  };
}

function normalizeStatus(status?: string): SessionStatus {
  if (status === "queued" || status === "accepted" || status === "running" || status === "completed" || status === "failed" || status === "canceled") return status;
  return "waiting";
}

function statusFromTerminal(type: string): SessionStatus {
  if (type === "turn.failed") return "failed";
  if (type === "turn.interrupted") return "canceled";
  return "completed";
}

function isTerminalEvent(type: string): boolean {
  return type === "turn.completed" || type === "turn.failed" || type === "turn.interrupted";
}

function isActiveStatus(status?: string): boolean {
  return status === "queued" || status === "accepted" || status === "running" || status === "dispatching" || status === "waiting_agent" || status === "recovering" || status === "finalizing";
}

function loadSettings(): ConnectionSettings {
  if (typeof window === "undefined") return defaultSettings;
  return {
    baseUrl: import.meta.env.VITE_RUNTIME_URL || localStorage.getItem("codex-remote.runtime-url") || defaultSettings.baseUrl,
    accessToken: "",
  };
}

function currentTime(withSeconds = false): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), hour12: false }).format(new Date());
}

function displayTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function relativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).valueOf());
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `${Math.floor(elapsed / 86_400_000)} 天前`;
}

function upsertToolStep(steps: ToolStep[], next: ToolStep): ToolStep[] {
  const found = steps.some((step) => step.id === next.id);
  return found ? steps.map((step) => step.id === next.id ? next : step) : [...steps, next];
}

function summarizeRuntimeEvent(event: RuntimeEvent): string {
  if (event.type === "assistant.delta") return `${String(event.delta ?? event.text ?? "").length} 字符`;
  return event.runId;
}

function summarize(value: string): string {
  return value.length > 32 ? `${value.slice(0, 32)}…` : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError && error.message === "Failed to fetch") return "无法连接 Run Server";
  return error instanceof Error ? error.message : "未知错误";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("The operation was aborted", "AbortError"));
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { window.clearTimeout(timeout); reject(new DOMException("The operation was aborted", "AbortError")); }, { once: true });
  });
}
