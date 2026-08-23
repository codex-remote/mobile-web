import { ArrowDown, ArrowUp, CircleCheck, CircleX, Eraser, LoaderCircle, LogOut, Radio, X } from "lucide-react";
import { authSession } from "../auth/AuthSession";
import type { InspectorEvent } from "../types";
import { IconButton } from "./IconButton";

type HealthState = "idle" | "checking" | "healthy" | "failed";

type RuntimeInspectorProps = {
  open: boolean;
  events: InspectorEvent[];
  healthState: HealthState;
  onCheckHealth: () => void;
  onClearEvents: () => void;
  onClose: () => void;
};

export function RuntimeInspector({
  open,
  events,
  healthState,
  onCheckHealth,
  onClearEvents,
  onClose,
}: RuntimeInspectorProps) {
  return (
    <aside className={`runtime-inspector ${open ? "runtime-inspector-open" : ""}`} aria-hidden={!open} inert={!open}>
      <header className="inspector-header">
        <div>
          <span className="inspector-eyebrow">Runtime</span>
          <h2>连接与事件</h2>
        </div>
        <IconButton label="关闭检查器" onClick={onClose}><X size={18} /></IconButton>
      </header>

      <div className="inspector-content">
        <form
          className="inspector-section"
          onSubmit={(event) => {
            event.preventDefault();
            onCheckHealth();
          }}
        >
          <button className="health-check-button" type="submit" disabled={healthState === "checking"}>
            {healthState === "healthy"
              ? <CircleCheck size={15} />
              : healthState === "failed"
                ? <CircleX size={15} />
                : healthState === "checking"
                  ? <LoaderCircle className="status-loading-icon" size={15} />
                  : <Radio size={15} />}
            {healthLabel(healthState)}
          </button>
          <button className="auth-signout-button" type="button" onClick={() => void authSession.logout()}>
            <LogOut size={15} />
            退出此设备
          </button>
        </form>

        <section className="inspector-section event-section">
          <div className="event-heading">
            <div>
              <span>事件</span>
              <small>{events.length}</small>
            </div>
            <IconButton label="清空事件" onClick={onClearEvents} disabled={events.length === 0}>
              <Eraser size={16} />
            </IconButton>
          </div>
          <div className="event-log" aria-live="polite">
            {events.length === 0 ? (
              <p className="empty-events">尚无通信事件</p>
            ) : events.map((event) => (
              <div className={`event-row event-${event.direction}`} key={event.id}>
                <span className="event-direction">
                  {event.direction === "up" ? <ArrowUp size={13} /> : event.direction === "down" ? <ArrowDown size={13} /> : <Radio size={13} />}
                </span>
                <span className="event-copy">
                  <strong>{event.type}</strong>
                  <small>{event.summary}</small>
                </span>
                <time>{event.time}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function healthLabel(state: HealthState): string {
  if (state === "checking") return "正在检查…";
  if (state === "healthy") return "Run Server 可用";
  if (state === "failed") return "连接失败，重新检查";
  return "检查连接";
}
