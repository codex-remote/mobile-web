import { ArrowDown, ArrowUp, Check, CircleAlert, Eraser, Radio, X } from "lucide-react";
import type { ConnectionSettings, InspectorEvent } from "../types";
import { IconButton } from "./IconButton";

type HealthState = "idle" | "checking" | "healthy" | "failed";

type RuntimeInspectorProps = {
  open: boolean;
  settings: ConnectionSettings;
  events: InspectorEvent[];
  healthState: HealthState;
  onChangeSettings: (settings: ConnectionSettings) => void;
  onCheckHealth: () => void;
  onClearEvents: () => void;
  onClose: () => void;
};

export function RuntimeInspector({
  open,
  settings,
  events,
  healthState,
  onChangeSettings,
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
          <div className="connection-form">
            <label>
              <span>Run Server 地址</span>
              <input
                type="url"
                value={settings.baseUrl}
                onChange={(event) => onChangeSettings({ ...settings, baseUrl: event.target.value })}
                placeholder="https://runtime.example.com"
              />
            </label>
            <label>
              <span>Access Token</span>
              <input
                type="password"
                value={settings.accessToken}
                onChange={(event) => onChangeSettings({ ...settings, accessToken: event.target.value })}
                placeholder="只保存在当前页面"
                autoComplete="off"
              />
            </label>
          </div>

          <button className="health-check-button" type="submit" disabled={healthState === "checking"}>
            {healthState === "healthy" ? <Check size={15} /> : healthState === "failed" ? <CircleAlert size={15} /> : <Radio size={15} />}
            {healthLabel(healthState)}
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
