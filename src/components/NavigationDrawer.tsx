import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  CircleAlert,
  CircleDotDashed,
  Laptop,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import type { Project, Session } from "../types";
import { IconButton } from "./IconButton";
import { ProjectMark } from "./ProjectMark";

type NavigationDrawerProps = {
  open: boolean;
  projects: Project[];
  sessions: Session[];
  selectedSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (projectId: string) => void;
  creatingProjectId: string;
  historySyncState: "idle" | "syncing" | "failed";
  onClose: () => void;
  onOpenInspector: () => void;
  transportLabel: string;
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
  onClose,
  onOpenInspector,
  transportLabel,
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
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>Codex Remote</span>
        </div>
        <IconButton label="关闭导航" className="drawer-close-button" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <button className="agent-row" type="button" onClick={onOpenInspector}>
        <span className="agent-device-icon"><Laptop size={16} /></span>
        <span className="agent-copy">
          <strong>Lee 的 MacBook Pro</strong>
          <small>{transportLabel}</small>
        </span>
        <span className={`presence-dot ${agentOnline ? "" : "presence-dot-offline"}`} aria-label={agentOnline ? "在线" : "离线"} />
      </button>

      <label className="drawer-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索项目或会话"
          aria-label="搜索项目或会话"
        />
      </label>

      <div className="drawer-section-heading">
        <span>项目</span>
        <span className={`drawer-section-meta drawer-section-meta-${historySyncState}`} aria-live="polite">
          {historySyncState === "syncing" && <><LoaderCircle className="spinning-icon" size={11} aria-hidden="true" /><span>历史同步中</span></>}
          {historySyncState === "failed" && <><CircleAlert size={11} aria-hidden="true" /><span>同步失败</span></>}
          <span>{projects.length}</span>
        </span>
      </div>

      <div className="project-tree" role="tree">
        {filteredProjects.map((project) => {
          const isExpanded = expandedProjects.has(project.id) || Boolean(normalizedSearch);
          const projectSessions = sessions.filter(
            (session) => session.projectId === project.id && (!normalizedSearch || session.title.toLocaleLowerCase().includes(normalizedSearch)),
          );
          const hasRunningSession = projectSessions.some((session) => session.status === "running");
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
                      {session.status === "running" ? <CircleDotDashed size={14} /> : <MessageCircle size={14} />}
                      <span>{session.title}</span>
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
