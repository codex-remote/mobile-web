import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  Laptop,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { HistorySyncState, Project, Session } from "../types";
import { IconButton } from "./IconButton";
import { ProjectMark } from "./ProjectMark";
import { SessionListStatusIcon, sessionListState } from "./SessionStatusIcon";

type NavigationDrawerProps = {
  open: boolean;
  projects: Project[];
  sessions: Session[];
  selectedSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (projectId: string) => void;
  creatingProjectId: string;
  historySyncState: HistorySyncState;
  onSyncHistory: () => void;
  onClose: () => void;
  onOpenInspector: () => void;
  agentOnline: boolean;
};

export function NavigationDrawer({
  open,
  projects,
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  creatingProjectId,
  historySyncState,
  onSyncHistory,
  onClose,
  onOpenInspector,
  agentOnline,
}: NavigationDrawerProps) {
  const selected = sessions.find((session) => session.id === selectedSessionId);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(selected?.projectId ? [selected.projectId] : []),
  );
  const [search, setSearch] = useState("");
  const selectedProjectId = selected?.projectId ?? projects[0]?.id ?? "";

  useEffect(() => {
    if (!selectedProjectId) return;
    setExpandedProjects((current) => {
      if (current.has(selectedProjectId)) return current;
      const next = new Set(current);
      next.add(selectedProjectId);
      return next;
    });
  }, [selectedProjectId]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredProjects = useMemo(() => {
    if (!normalizedSearch) return projects;
    return projects.filter((project) => {
      if (`${project.name} ${project.path}`.toLocaleLowerCase().includes(normalizedSearch)) return true;
      return sessions.some(
        (session) => session.projectId === project.id && session.title.toLocaleLowerCase().includes(normalizedSearch),
      );
    });
  }, [normalizedSearch, projects, sessions]);

  function toggleProject(projectId: string) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  return (
    <aside className="navigation-drawer" aria-label="项目与会话" aria-hidden={!open} inert={!open}>
      <div className="drawer-brand-row">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><img src="/brand-mark.png" alt="" /></span>
          <span>Codex Remote</span>
        </div>
        <IconButton label="关闭导航" className="drawer-close-button" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className={`agent-panel agent-panel-${historySyncState.status}`}>
        <div className="agent-row">
          <button className="agent-device-button" type="button" onClick={onOpenInspector}>
            <span className="agent-device-icon"><Laptop size={16} /></span>
            <span className="agent-copy">
              <strong>Lee 的 MacBook Pro</strong>
            </span>
          </button>
          <IconButton
            label={syncButtonLabel(historySyncState, agentOnline)}
            className="history-sync-button"
            onClick={onSyncHistory}
            disabled={!agentOnline || historySyncState.status === "syncing"}
            aria-busy={historySyncState.status === "syncing"}
          >
            <RefreshCw className={historySyncState.status === "syncing" ? "spinning-icon" : ""} size={14} />
          </IconButton>
          <span
            className={`presence-dot ${agentOnline ? "" : "presence-dot-offline"}`}
            aria-label={agentOnline ? "在线" : "离线"}
            title={agentOnline ? "在线" : "离线"}
          />
        </div>
        {historySyncState.status !== "idle" && (
          <div className="history-sync-status" role="status" aria-live="polite">
            <div className="history-sync-copy">
              <span>{historySyncLabel(historySyncState)}</span>
              {historySyncState.status === "syncing" && historySyncState.total > 0 && <strong>{historySyncPercent(historySyncState)}%</strong>}
            </div>
            {historySyncState.status === "syncing" && (
              <progress
                className="history-sync-progress"
                max={Math.max(historySyncState.total, 1)}
                aria-label="历史会话同步进度"
                aria-valuetext={historySyncState.total > 0 ? `${historySyncPercent(historySyncState)}%` : "正在读取会话数量"}
                {...(historySyncState.total > 0 ? { value: Math.min(historySyncState.processed, historySyncState.total) } : {})}
              />
            )}
          </div>
        )}
      </div>

      <label className="drawer-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索项目或会话"
          aria-label="搜索项目或会话"
        />
      </label>

      <div className="drawer-project-heading">
        <div className="drawer-section-heading">
          <span>项目</span>
          <span className="drawer-section-meta">
            <span>{projects.length}</span>
          </span>
        </div>
      </div>

      <div className="project-tree" role="tree">
        {filteredProjects.map((project) => {
          const isExpanded = expandedProjects.has(project.id) || Boolean(normalizedSearch);
          const projectSessions = sessions.filter(
            (session) => session.projectId === project.id && (!normalizedSearch || session.title.toLocaleLowerCase().includes(normalizedSearch)),
          );
          const hasRunningSession = projectSessions.some((session) => sessionListState(session) === "running");
          return (
            <div className="project-tree-group" key={project.id} role="treeitem" aria-expanded={isExpanded}>
              <div className="project-row">
                <button className="project-expand-button" type="button" onClick={() => toggleProject(project.id)}>
                  <ProjectMark name={project.name} accent={project.accent} />
                  <span className="project-row-copy">
                    <strong>{project.name}</strong>
                    <small>{project.path}</small>
                  </span>
                  {hasRunningSession && <span className="running-dot" aria-label="有运行中的会话" />}
                  <span className="project-session-count">{projectSessions.length}</span>
                  <ChevronRight className={isExpanded ? "chevron-expanded" : ""} size={14} />
                </button>
                <IconButton
                  label={creatingProjectId === project.id ? `正在为 ${project.name} 新建会话` : `在 ${project.name} 新建会话`}
                  className="project-add-button"
                  onClick={() => onNewSession(project.id)}
                  disabled={Boolean(creatingProjectId)}
                  aria-busy={creatingProjectId === project.id}
                >
                  {creatingProjectId === project.id ? <LoaderCircle className="spinning-icon" size={15} /> : <Plus size={15} />}
                </IconButton>
              </div>

              {isExpanded && (
                <div className="session-branch" role="group">
                  {projectSessions.length === 0 ? (
                    <p className="empty-branch">暂无会话</p>
                  ) : projectSessions.map((session) => (
                    <button
                      type="button"
                      className={`drawer-session-row ${session.id === selectedSessionId ? "selected" : ""}`}
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      data-testid={`drawer-session-${session.id}`}
                    >
                      <SessionListStatusIcon session={session} size={14} />
                      <span className="drawer-session-title">{session.title}</span>
                      {session.unread ? <span className="session-unread-dot" aria-label="未读" /> : <span className="session-unread-placeholder" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <nav className="drawer-destinations" aria-label="辅助导航">
        <button type="button">
          <Activity size={17} />
          <span>活动</span>
          <span className="destination-count">1</span>
        </button>
        <button type="button" onClick={onOpenInspector}>
          <Settings size={17} />
          <span>连接设置</span>
        </button>
      </nav>
    </aside>
  );
}

function historySyncPercent(state: HistorySyncState): number {
  if (state.total <= 0) return 0;
  return Math.min(100, Math.round((state.processed / state.total) * 100));
}

function historySyncLabel(state: HistorySyncState): string {
  if (state.status === "syncing" && state.total > 0) return `${state.processed}/${state.total} 个会话`;
  if (state.status === "failed") return state.message || "同步失败";
  return state.message;
}

function syncButtonLabel(state: HistorySyncState, agentOnline: boolean): string {
  if (!agentOnline) return "Mac Agent 离线，无法同步";
  if (state.status === "syncing") return "正在同步历史会话";
  if (state.status === "failed") return "重新同步历史会话";
  return "同步 Mac 历史会话";
}
