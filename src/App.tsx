import { CircleAlert, LoaderCircle, Menu, PanelRight, Plus, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { ConnectionOverlay } from "./components/ConnectionOverlay";
import { ConversationView } from "./components/ConversationView";
import { IconButton } from "./components/IconButton";
import { NavigationDrawer } from "./components/NavigationDrawer";
import { RuntimeInspector } from "./components/RuntimeInspector";
import { SourceViewer } from "./components/SourceViewer";
import { durationBetween, validDuration } from "./components/turnDuration";
import { settleRunningToolSteps, terminalToolStepStatus } from "./components/toolStepState";
import { createRuntimeClient, type RuntimeClient } from "./runtime/RuntimeClient";
import { createClientId } from "./runtime/clientId";
import { historySyncCompletionMessage, syncHistoryFromAgent } from "./runtime/historySync";
import { resolveRuntimeUrl } from "./runtime/runtimeUrl";
import { runtimeFailureFromError, type RuntimeFailure } from "./runtime/runtimeFailure";
import { mergeBackgroundSession } from "./runtime/sessionRefresh";
import {
  needsSessionDetailRefresh,
  SessionDetailCache,
  type CachedSessionDetail,
} from "./runtime/sessionDetailCache";
import {
  isActiveStatus,
  isAssistantItem,
  isFinalAssistantItem,
  messagesFromRun,
  normalizeStatus,
  toolFromItem,
  upsertToolStep,
} from "./runtime/runMessages";
import {
  baselineSessionReadState,
  isSessionUnread,
  loadSessionReadState,
  markSessionRead,
  saveSessionReadState,
  type SessionReadState,
} from "./runtime/sessionReadState";
import { loadSelectedSessionId, persistSelectedSessionId, retainSelectedSessionId, sessionLocationHref } from "./runtime/sessionSelection";
import { sourceReferenceFromLocation, sourceViewerHref } from "./runtime/sourceReference";
import type {
  ApiProject,
  ApiRun,
  ApiSession,
  ChatMessage,
  HistorySyncState,
  InspectorEvent,
  Project,
  RuntimeEvent,
  Session,
  SessionDetailStatus,
  SessionStatus,
  SourceReference,
} from "./types";

const runtimeBaseUrl = resolveRuntimeUrl(typeof window === "undefined" ? undefined : window.location);

const emptySession: Session = {
  id: "",
  projectId: "",
  title: "选择一个会话",
  preview: "从项目导航中打开会话，或新建一个会话。",
  status: "waiting",
  updatedLabel: "",
  messages: [],
  hasLatestRun: false,
  lastSessionSequence: 0,
  unread: false,
};

const unavailableSession: Session = {
  ...emptySession,
  title: "会话不可用",
  preview: "此会话已从当前目录移除。",
};

const emptyProject: Project = {
  id: "",
  name: "未选择项目",
  path: "",
  accent: "#3f6f63",
  updatedLabel: "",
};

const idleHistorySync: HistorySyncState = {
  status: "idle",
  processed: 0,
  total: 0,
  archived: 0,
  archivedProjects: 0,
  message: "",
};

type SessionDetailView = {
  status: SessionDetailStatus;
  session?: Session;
  error?: string;
};

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(() => loadSelectedSessionId(window.location, window.localStorage));
  const [drawerOpen, setDrawerOpen] = useState(() => window.matchMedia("(min-width: 900px)").matches);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorEvents, setInspectorEvents] = useState<InspectorEvent[]>([]);
  const [healthState, setHealthState] = useState<"idle" | "checking" | "healthy" | "failed">("idle");
  const [connectionFailure, setConnectionFailure] = useState<RuntimeFailure | null>(null);
  const [nextConnectionRetryAt, setNextConnectionRetryAt] = useState<number | null>(null);
  const [agentPresence, setAgentPresence] = useState<"online" | "offline">("offline");
  const [historySyncState, setHistorySyncState] = useState<HistorySyncState>(idleHistorySync);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [sessionDetails, setSessionDetails] = useState(() => new Map<string, SessionDetailView>());
  const [sourceView, setSourceView] = useState<(SourceReference & { projectId: string }) | null>(() => sourceReferenceFromLocation(window.location));
  const [sessionCreateState, setSessionCreateState] = useState<{
    status: "idle" | "creating" | "failed";
    projectId: string;
    message: string;
  }>({ status: "idle", projectId: "", message: "" });
  const activeRunId = useRef<string | null>(null);
  const runStreams = useRef(new Map<string, AbortController>());
  const sessionCreateLocked = useRef(false);
  const manualHistorySyncLocked = useRef(false);
  const manualHistorySyncController = useRef<AbortController | null>(null);
  const manualConnectionController = useRef<AbortController | null>(null);
  const catalogRequestSequence = useRef(0);
  const hasConnected = useRef(false);
  const selectedSessionIdRef = useRef("");
  const readStateRef = useRef(loadSessionReadState());
  const sessionDetailCache = useRef(new SessionDetailCache());
  const catalogSessionIds = useRef(new Set<string>());

  const runtimeClient = useMemo(() => createRuntimeClient(runtimeBaseUrl), []);
  const catalogSelectedSession = sessions.find((session) => session.id === selectedSessionId);
  const selectedDetail = sessionDetails.get(selectedSessionId);
  const selectedSessionAvailable = Boolean(catalogSelectedSession);
  const selectedUnavailable = healthState === "healthy" && Boolean(selectedSessionId) && !selectedSessionAvailable;
  const selectedSession = selectedUnavailable
    ? { ...unavailableSession, id: selectedSessionId }
    : selectedDetail?.session ?? catalogSelectedSession ?? emptySession;
  const selectedProject = projects.find((project) => project.id === selectedSession.projectId) ?? projects[0] ?? emptyProject;
  const sourceProject = projects.find((project) => project.id === sourceView?.projectId);
  const detailReady = selectedDetail?.status === "ready";
  const running = Boolean(selectedDetail?.session) && isActiveStatus(selectedSession.status);
  const composerPlaceholder = resolveComposerPlaceholder(selectedSessionId, selectedUnavailable, selectedDetail?.status);

  useEffect(() => {
    if (historySyncState.status !== "completed") return;
    const timer = window.setTimeout(() => {
      setHistorySyncState((current) => current.status === "completed" ? idleHistorySync : current);
    }, 2_900);
    return () => window.clearTimeout(timer);
  }, [historySyncState.status]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
    persistSelectedSessionId(selectedSessionId, window.location, window.history, window.localStorage);
  }, [selectedSessionId]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 900px)");
    const syncDrawer = () => setDrawerOpen(desktop.matches);
    desktop.addEventListener("change", syncDrawer);
    return () => desktop.removeEventListener("change", syncDrawer);
  }, []);

  useEffect(() => {
    const syncSourceLocation = () => setSourceView(sourceReferenceFromLocation(window.location));
    window.addEventListener("popstate", syncSourceLocation);
    return () => window.removeEventListener("popstate", syncSourceLocation);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    hasConnected.current = false;
    catalogSessionIds.current = new Set();
    setSessionDetails(new Map());
    setHealthState("checking");
    setConnectionFailure(null);
    setNextConnectionRetryAt(null);

    async function monitorCatalogAndSyncHistory() {
      const projectResponse = await refreshCatalog(controller.signal);
      if (controller.signal.aborted) return;
      if (!projectResponse || projectResponse.agentPresence !== "online") {
        setHistorySyncState(idleHistorySync);
      } else {
        void runHistorySync(controller.signal);
      }
      while (!controller.signal.aborted) {
        try {
          await delay(3_000, controller.signal);
        } catch {
          return;
        }
        await refreshCatalog(controller.signal);
      }
    }

    void monitorCatalogAndSyncHistory();
    return () => {
      controller.abort();
      manualConnectionController.current?.abort();
      manualHistorySyncController.current?.abort();
      catalogRequestSequence.current++;
    };
  }, [runtimeClient]);

  useEffect(() => {
    for (const controller of runStreams.current.values()) controller.abort();
    runStreams.current.clear();
    if (!selectedSessionId || !selectedSessionAvailable) return;

    const sessionController = new AbortController();
    let sessionCursor = 0;

    function publish(detail: CachedSessionDetail, status: SessionDetailView["status"], preserveLiveMessages = false) {
      if (sessionController.signal.aborted) return;
      sessionCursor = Math.max(sessionCursor, detail.snapshotSessionSequence);
      const readState = setSessionReadCursor(readStateRef, selectedSessionId, detail.snapshotSessionSequence);
      const hydrated = toSession(detail.session, detail.runs, readState);
      setSessionDetails((current) => {
        const session = preserveLiveMessages
          ? mergeBackgroundSession(current.get(selectedSessionId)?.session, hydrated)
          : hydrated;
        return mapSessionDetail(current, selectedSessionId, { status, session });
      });
      setSessions((current) => current.map((session) => session.id === selectedSessionId
        ? { ...session, title: hydrated.title, preview: hydrated.preview, status: hydrated.status, hasLatestRun: hydrated.hasLatestRun }
        : session));
      const active = [...detail.runs].reverse().find((run) => isActiveStatus(run.status));
      activeRunId.current = active?.run_id ?? null;
      for (const run of detail.runs) {
        if (isActiveStatus(run.status)) ensureRunStream(runtimeClient, selectedSessionId, run, runStreams.current, applyRuntimeEvent, recordEvent);
      }
    }

    function setLoadingState(status: "loading" | "refreshing") {
      setSessionDetails((current) => {
        const existing = current.get(selectedSessionId);
        return mapSessionDetail(current, selectedSessionId, { status, session: existing?.session });
      });
    }

    function setFailure(error: unknown) {
      const message = errorMessage(error);
      setSessionDetails((current) => {
        const existing = current.get(selectedSessionId);
        return mapSessionDetail(current, selectedSessionId, {
          status: existing?.session ? "stale-error" : "failed",
          session: existing?.session,
          error: message,
        });
      });
    }

    async function refreshSelected(background = false) {
      const cached = sessionDetailCache.current.peek(runtimeBaseUrl, selectedSessionId);
      if (!background) setLoadingState(cached ? "refreshing" : "loading");
      const detail = await sessionDetailCache.current.load(runtimeBaseUrl, selectedSessionId, runtimeClient);
      publish(detail, "ready", background);
    }

    async function initializeSelected() {
      const cached = sessionDetailCache.current.peek(runtimeBaseUrl, selectedSessionId)
        ?? await sessionDetailCache.current.restore(runtimeBaseUrl, selectedSessionId);
      if (sessionController.signal.aborted) return;
      if (!cached) {
        await refreshSelected();
        return;
      }
      const refresh = needsSessionDetailRefresh(cached, catalogSelectedSession?.lastSessionSequence ?? 0);
      publish(cached, refresh ? "refreshing" : "ready");
      if (refresh) await refreshSelected();
    }

    async function watchSession() {
      let initialized = false;
      while (!sessionController.signal.aborted) {
        try {
          if (initialized) await refreshSelected();
          else {
            initialized = true;
            await initializeSelected();
          }
          for await (const event of runtimeClient.watchSession(selectedSessionId, sessionCursor, sessionController.signal)) {
            sessionCursor = Math.max(sessionCursor, Number(event.id) || 0);
            recordEvent("down", event.type, event.runId || selectedSessionId);
            await refreshSelected(true);
          }
        } catch (error) {
          if (sessionController.signal.aborted || isAbortError(error)) return;
          setFailure(error);
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
  }, [runtimeClient, selectedSessionId, selectedSessionAvailable, sessionRevision]);

  async function refreshCatalog(signal: AbortSignal) {
    const requestSequence = ++catalogRequestSequence.current;
    if (!hasConnected.current) {
      setHealthState("checking");
      setNextConnectionRetryAt(null);
    }
    try {
      const projectResponse = await runtimeClient.listProjects(signal);
      const apiSessions = await runtimeClient.listSessions(undefined, signal);
      if (signal.aborted || requestSequence !== catalogRequestSequence.current) return null;
      let readState = baselineSessionReadState(readStateRef.current, apiSessions);
      const selectedId = selectedSessionIdRef.current;
      const selectedApiSession = apiSessions.find((session) => session.session_id === selectedId);
      const nextSessionIds = new Set(apiSessions.map((session) => session.session_id));
      for (const sessionId of catalogSessionIds.current) {
        if (!nextSessionIds.has(sessionId)) sessionDetailCache.current.remove(runtimeBaseUrl, sessionId);
      }
      if (selectedId && !selectedApiSession) sessionDetailCache.current.remove(runtimeBaseUrl, selectedId);
      catalogSessionIds.current = nextSessionIds;
      setSessionDetails((current) => {
        if ([...current.keys()].every((sessionId) => nextSessionIds.has(sessionId))) return current;
        return new Map([...current].filter(([sessionId]) => nextSessionIds.has(sessionId)));
      });
      if (selectedApiSession) readState = markSessionRead(readState, selectedId, selectedApiSession.last_session_sequence);
      if (readState !== readStateRef.current) {
        readStateRef.current = readState;
        saveSessionReadState(readState);
      }
      setAgentPresence(projectResponse.agentPresence);
      setProjects(projectResponse.items.map(toProject));
      setSessions((current) => mergeSessionCatalog(current, apiSessions, readState));
      setSelectedSessionId((current) => retainSelectedSessionId(current, apiSessions));
      hasConnected.current = true;
      setHealthState("healthy");
      setConnectionFailure(null);
      setNextConnectionRetryAt(null);
      return projectResponse;
    } catch (error) {
      if (!isAbortError(error) && requestSequence === catalogRequestSequence.current) {
        hasConnected.current = false;
        setHealthState("failed");
        setConnectionFailure(runtimeFailureFromError(error, runtimeBaseUrl));
        setNextConnectionRetryAt(Date.now() + 3_000);
        recordEvent("system", "catalog.failed", errorMessage(error));
      }
      return null;
    }
  }

  async function runHistorySync(signal: AbortSignal) {
    setHistorySyncState({ status: "syncing", processed: 0, total: 0, archived: 0, archivedProjects: 0, message: "正在读取 Mac 会话…" });
    try {
      const job = await syncHistoryFromAgent(runtimeClient, signal, recordEvent, (progress) => {
        const processed = finiteCount(progress.processed_sessions);
        const total = finiteCount(progress.total_sessions);
        setHistorySyncState({
          status: "syncing",
          processed,
          total,
          archived: finiteCount(progress.archived_sessions),
          archivedProjects: finiteCount(progress.archived_projects),
          message: total > 0 ? "正在同步会话" : "正在读取 Mac 会话…",
        });
      });
      if (signal.aborted) return;
      await refreshCatalog(signal);
      if (signal.aborted) return;
      const processed = finiteCount(job.processed_sessions);
      const total = finiteCount(job.total_sessions);
      const archived = finiteCount(job.archived_sessions);
      const archivedProjects = finiteCount(job.archived_projects);
      setHistorySyncState({
        status: "completed",
        processed,
        total,
        archived,
        archivedProjects,
        message: historySyncCompletionMessage(job.reconciliation_applied, archivedProjects, archived),
      });
    } catch (error) {
      if (!isAbortError(error)) {
        const message = errorMessage(error);
        setHistorySyncState({ status: "failed", processed: 0, total: 0, archived: 0, archivedProjects: 0, message });
        recordEvent("system", "history.sync.failed", message);
      }
    }
  }

  async function startManualHistorySync() {
    if (manualHistorySyncLocked.current || historySyncState.status === "syncing") return;
    if (agentPresence !== "online") {
      setHistorySyncState({ status: "failed", processed: 0, total: 0, archived: 0, archivedProjects: 0, message: "Mac Agent 离线，无法同步" });
      return;
    }
    manualHistorySyncLocked.current = true;
    const controller = new AbortController();
    manualHistorySyncController.current = controller;
    try {
      await runHistorySync(controller.signal);
    } finally {
      if (manualHistorySyncController.current === controller) manualHistorySyncController.current = null;
      manualHistorySyncLocked.current = false;
    }
  }

  function selectSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    const readState = setSessionReadCursor(readStateRef, sessionId, session?.lastSessionSequence ?? 0);
    setSessions((current) => current.map((item) => item.id === sessionId
      ? { ...item, unread: isSessionUnread(readState, item.id, item.lastSessionSequence ?? 0, item.status) }
      : item));
    selectedSessionIdRef.current = sessionId;
    setSelectedSessionId(sessionId);
    setDrawerOpen(false);
  }

  function openSource(reference: SourceReference) {
    if (!selectedSession.projectId) return;
    const next = { ...reference, projectId: selectedSession.projectId };
    window.history.pushState({ codexSourceViewer: true }, "", sourceViewerHref(next.projectId, next, window.location.search));
    setSourceView(next);
    setDrawerOpen(false);
    setInspectorOpen(false);
  }

  function closeSource() {
    // Restore the conversation immediately. Safari may dispatch popstate later,
    // which previously left the inert conversation blocking the next file tap.
    setSourceView(null);
    if (window.history.state?.codexSourceViewer) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", sessionLocationHref({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: "",
    }, selectedSessionId));
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
      const created = await runtimeClient.createSession(projectId, "新会话", createClientId());
      const readState = setSessionReadCursor(readStateRef, created.session_id, created.last_session_sequence);
      const detail: CachedSessionDetail = {
        session: created,
        runs: [],
        snapshotSessionSequence: created.last_session_sequence,
        cachedAt: Date.now(),
      };
      const hydrated = toSession(created, [], readState);
      sessionDetailCache.current.prime(runtimeBaseUrl, detail);
      setSessions((current) => upsertSession(current, { ...hydrated, messages: [] }));
      setSessionDetails((current) => mapSessionDetail(current, created.session_id, { status: "ready", session: hydrated }));
      selectedSessionIdRef.current = created.session_id;
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
    if (running || !detailReady || selectedUnavailable || !selectedSessionId) return;
    const runKey = createClientId();
    const startedAt = new Date().toISOString();
    const optimisticUser: ChatMessage = { id: `pending_user_${runKey}`, role: "user", content: prompt, createdAt: currentTime() };
    const optimisticAssistant: ChatMessage = {
      id: `pending_assistant_${runKey}`,
      role: "assistant",
      content: "",
      createdAt: currentTime(),
      startedAt,
      streaming: true,
      toolSteps: [],
      assistantStreamMode: "legacy",
    };
    updateSession(selectedSessionId, (session) => ({ ...session, status: "queued", preview: prompt, messages: [...session.messages, optimisticUser, optimisticAssistant], hasLatestRun: true }));
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

  async function retryConnection() {
    manualConnectionController.current?.abort();
    const controller = new AbortController();
    manualConnectionController.current = controller;
    recordEvent("up", "health.check", runtimeBaseUrl);
    try {
      const response = await refreshCatalog(controller.signal);
      if (response) recordEvent("down", "health.ready", "Runtime catalog ready");
    } finally {
      if (manualConnectionController.current === controller) manualConnectionController.current = null;
    }
  }

  function applyRuntimeEvent(sessionId: string, event: RuntimeEvent) {
    const assistantId = `assistant_${event.runId}`;
    if (event.type === "turn.started") {
      updateAssistant(sessionId, assistantId, (message) => ({
        ...message,
        startedAt: String(event.started_at || event.occurred_at || message.startedAt || "") || undefined,
      }));
      return;
    }
    if (event.type === "assistant.delta") {
      updateAssistant(sessionId, assistantId, (message) => message.assistantStreamMode === "legacy"
        ? { ...message, content: message.content + String(event.delta ?? event.text ?? "") }
        : message);
      return;
    }
    if (event.type === "item.delta") {
      updateAssistant(sessionId, assistantId, (message) => {
        const itemId = String(event.item_id ?? "");
        if (message.assistantStreamMode !== "final" || !itemId || itemId !== message.responseItemId || event.field !== "text") return message;
        return { ...message, content: message.content + String(event.delta ?? "") };
      });
      return;
    }
    if (event.type === "item.started" || event.type === "item.completed") {
      const tool = toolFromItem(event.item, event.type === "item.completed" ? "completed" : "running");
      if (tool) updateAssistant(sessionId, assistantId, (message) => ({ ...message, toolSteps: upsertToolStep(message.toolSteps ?? [], tool) }));
      if (isAssistantItem(event.item)) {
        const finalAnswer = isFinalAssistantItem(event.item);
        updateAssistant(sessionId, assistantId, (message) => ({
          ...message,
          assistantStreamMode: finalAnswer ? "final" : "commentary",
          responseItemId: finalAnswer ? String(event.item?.id ?? "") : undefined,
          content: finalAnswer
            ? event.type === "item.completed" && event.item?.text
              ? String(event.item.text)
              : message.assistantStreamMode === "final" ? message.content : ""
            : message.content,
        }));
      }
      return;
    }
    if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted") {
      updateAssistant(sessionId, assistantId, (message) => ({
        ...message,
        streaming: false,
        content: message.content || String(event.message ?? ""),
        durationMs: validDuration(event.duration_ms)
          ?? durationBetween(message.startedAt, event.occurred_at || new Date().toISOString()),
        toolSteps: settleRunningToolSteps(message.toolSteps, terminalToolStepStatus(event.type)),
      }));
      updateSession(sessionId, (session) => ({ ...session, status: statusFromTerminal(event.type), updatedLabel: "刚刚" }));
      activeRunId.current = null;
    }
  }

  function updateSession(sessionId: string, transform: (session: Session) => Session) {
    setSessionDetails((current) => {
      const detail = current.get(sessionId);
      if (!detail?.session) return current;
      const session = transform(detail.session);
      return mapSessionDetail(current, sessionId, { ...detail, session });
    });
    setSessions((current) => current.map((item) => {
      if (item.id !== sessionId) return item;
      const session = transform(item);
      return { ...item, title: session.title, preview: session.preview, status: session.status, hasLatestRun: session.hasLatestRun };
    }));
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
        onSyncHistory={() => void startManualHistorySync()}
        onClose={() => setDrawerOpen(false)}
        onOpenInspector={() => setInspectorOpen(true)}
        agentOnline={agentPresence === "online"}
      />

      <main className="workspace-frame">
        <header className="workspace-toolbar">
          <IconButton label="打开项目导航" onClick={() => setDrawerOpen(true)} data-testid="open-drawer"><Menu size={19} /></IconButton>
          <div className="toolbar-title">
            <strong>{selectedSession.title}</strong>
            {selectedDetail?.status === "refreshing" ? (
              <small className="toolbar-detail-state toolbar-detail-state-syncing"><LoaderCircle className="spinning-icon" size={11} />正在同步</small>
            ) : selectedDetail?.status === "stale-error" ? (
              <small className="toolbar-detail-state toolbar-detail-state-failed"><CircleAlert size={11} />同步失败</small>
            ) : (
              <small>{agentPresence === "online" ? <Wifi size={11} /> : <WifiOff size={11} />}{runtimeClient.transportMode === "poll" ? "HTTP 轮询" : "SSE"} · {agentPresence === "online" ? "在线" : "离线"}</small>
            )}
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

        <div className="runtime-workspace-content" inert={sourceView ? true : undefined} aria-hidden={sourceView ? true : undefined}>
          <ConversationView
            session={selectedSession}
            detailStatus={selectedUnavailable ? undefined : selectedDetail?.status ?? (selectedSessionId ? "loading" : "ready")}
            detailError={selectedDetail?.error}
            unavailable={selectedUnavailable}
            onRetry={() => setSessionRevision((value) => value + 1)}
            onOpenSource={openSource}
          />
          <Composer
            disabled={selectedUnavailable || !selectedSessionId || !detailReady}
            placeholder={composerPlaceholder}
            running={running}
            projectName={selectedProject.name}
            onSubmit={sendPrompt}
            onStop={stopRun}
          />
        </div>
        {sourceView && (
          <SourceViewer
            client={runtimeClient}
            projectId={sourceView.projectId}
            projectName={sourceProject?.name ?? ""}
            reference={sourceView}
            onClose={closeSource}
            onOpenConnection={() => setInspectorOpen(true)}
          />
        )}
        {drawerOpen && <button className="workspace-scrim" type="button" aria-label="关闭项目导航" onClick={() => setDrawerOpen(false)} />}
      </main>

      <RuntimeInspector
        open={inspectorOpen}
        events={inspectorEvents}
        healthState={healthState}
        onCheckHealth={() => void retryConnection()}
        onClearEvents={() => setInspectorEvents([])}
        onClose={() => setInspectorOpen(false)}
      />

      {healthState !== "healthy" && (
        <ConnectionOverlay
          state={healthState === "failed" ? "failed" : "checking"}
          failure={connectionFailure}
          nextRetryAt={nextConnectionRetryAt}
          onRetry={() => void retryConnection()}
          onOpenSettings={() => setInspectorOpen(true)}
        />
      )}

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
          for await (const event of client.watchRun(run.run_id, cursor, controller.signal)) {
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

function toProject(project: ApiProject, index: number): Project {
  const accents = ["#3f6f63", "#47679a", "#9a6942", "#8a4d68"];
  return { id: project.project_id, name: project.display_name, path: "Mac Agent 工作区", accent: accents[index % accents.length]!, updatedLabel: "" };
}

function mergeSessionCatalog(current: Session[], incoming: ApiSession[], readState: SessionReadState): Session[] {
  const currentById = new Map(current.map((session) => [session.id, session]));
  return incoming.map((item) => {
    const existing = currentById.get(item.session_id);
    const catalogRunState = item.latest_run_status
      ? { status: normalizeStatus(item.latest_run_status), hasLatestRun: true }
      : {};
    const status = catalogRunState.status ?? existing?.status ?? "waiting";
    const readFields = {
      lastSessionSequence: item.last_session_sequence,
      unread: isSessionUnread(readState, item.session_id, item.last_session_sequence, status),
    };
    return existing
      ? { ...existing, ...catalogRunState, ...readFields, title: item.title || existing.title, projectId: item.project_id, updatedLabel: relativeTime(item.updated_at), messages: [] }
      : toSession(item, [], readState);
  });
}

function upsertSession(current: Session[], next: Session): Session[] {
  const found = current.some((session) => session.id === next.id);
  return found ? current.map((session) => session.id === next.id ? next : session) : [next, ...current];
}

function mapSessionDetail(current: Map<string, SessionDetailView>, sessionId: string, detail: SessionDetailView): Map<string, SessionDetailView> {
  const next = new Map(current);
  next.set(sessionId, detail);
  return next;
}

function resolveComposerPlaceholder(sessionId: string, unavailable: boolean, status?: SessionDetailStatus): string {
  if (!sessionId) return "选择一个会话";
  if (unavailable) return "会话不可用";
  if (status === "failed") return "会话载入失败";
  if (status === "refreshing" || status === "stale-error") return "正在同步会话";
  return status === "ready" ? "给 Codex 发送指令" : "正在载入会话";
}

function toSession(session: ApiSession, runs: ApiRun[], readState: SessionReadState): Session {
  const lastRun = runs.at(-1);
  const latestRunStatus = lastRun?.status || session.latest_run_status;
  const status = normalizeStatus(latestRunStatus);
  return {
    id: session.session_id,
    projectId: session.project_id,
    title: session.title || lastRun?.prompt?.slice(0, 28) || "新会话",
    preview: lastRun?.prompt || "等待第一条指令",
    status,
    updatedLabel: relativeTime(session.updated_at),
    messages: runs.flatMap(messagesFromRun),
    hasLatestRun: Boolean(latestRunStatus),
    lastSessionSequence: session.last_session_sequence,
    unread: isSessionUnread(readState, session.session_id, session.last_session_sequence, status),
  };
}

function setSessionReadCursor(ref: { current: SessionReadState }, sessionId: string, sequence: number): SessionReadState {
  const next = markSessionRead(ref.current, sessionId, sequence);
  if (next !== ref.current) {
    ref.current = next;
    saveSessionReadState(next);
  }
  return next;
}

function statusFromTerminal(type: string): SessionStatus {
  if (type === "turn.failed") return "failed";
  if (type === "turn.interrupted") return "canceled";
  return "completed";
}

function isTerminalEvent(type: string): boolean {
  return type === "turn.completed" || type === "turn.failed" || type === "turn.interrupted";
}

function currentTime(withSeconds = false): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}), hour12: false }).format(new Date());
}

function relativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).valueOf());
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return `${Math.floor(elapsed / 86_400_000)} 天前`;
}

function summarizeRuntimeEvent(event: RuntimeEvent): string {
  if (event.type === "assistant.delta") return `${String(event.delta ?? event.text ?? "").length} 字符`;
  return event.runId;
}

function summarize(value: string): string {
  return value.length > 32 ? `${value.slice(0, 32)}…` : value;
}

function finiteCount(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : 0;
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
    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
