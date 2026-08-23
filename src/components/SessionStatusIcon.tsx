import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePause,
  CircleStop,
  CircleX,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import type { Session, SessionStatus } from "../types";

type SessionStatusIconProps = {
  status: SessionStatus;
  size?: number;
};

export function SessionStatusIcon({ status, size = 14 }: SessionStatusIconProps) {
  const className = `session-status-icon session-status-icon-${status}`;

  if (status === "queued") return <Clock3 className={className} size={size} aria-hidden="true" />;
  if (status === "accepted") return <CircleDot className={className} size={size} aria-hidden="true" />;
  if (status === "running") return <LoaderCircle className={`${className} status-loading-icon`} size={size} aria-hidden="true" />;
  if (status === "waiting") return <CirclePause className={className} size={size} aria-hidden="true" />;
  if (status === "failed") return <CircleX className={className} size={size} aria-hidden="true" />;
  if (status === "canceled") return <CircleStop className={className} size={size} aria-hidden="true" />;
  return <CircleCheck className={className} size={size} aria-hidden="true" />;
}

export type SessionListState = "running" | "interrupted" | "completed" | "empty";

type SessionListSource = Pick<Session, "status" | "messages" | "hasLatestRun">;

export function sessionListState(session: SessionListSource): SessionListState {
  if (!(session.hasLatestRun ?? session.messages.length > 0)) return "empty";
  if (session.status === "failed" || session.status === "canceled") return "interrupted";
  if (session.status === "completed") return "completed";
  return "running";
}

export function SessionListStatusIcon({ session, size = 14 }: { session: SessionListSource; size?: number }) {
  const state = sessionListState(session);
  if (state === "empty" || state === "completed") return <span className="session-list-status-placeholder" aria-hidden="true" />;

  return (
    <span className={`session-list-status session-list-status-${state}`} aria-label={sessionListStateLabel(state)}>
      {state === "running" && <LoaderCircle className="status-loading-icon" size={size} aria-hidden="true" />}
      {state === "interrupted" && <CircleAlert size={size} aria-hidden="true" />}
    </span>
  );
}

function sessionListStateLabel(state: Exclude<SessionListState, "empty">): string {
  if (state === "running") return "最新一轮正在运行";
  if (state === "interrupted") return "最新一轮已中断";
  return "最新一轮已完成";
}
