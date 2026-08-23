import { RefreshCw, SlidersHorizontal, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { RuntimeFailure } from "../runtime/runtimeFailure";

type ConnectionOverlayProps = {
  state: "checking" | "failed";
  failure: RuntimeFailure | null;
  nextRetryAt: number | null;
  onRetry: () => void;
  onOpenSettings: () => void;
};

export function ConnectionOverlay({
  state,
  failure,
  nextRetryAt,
  onRetry,
  onOpenSettings,
}: ConnectionOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!nextRetryAt) return;
    setNow(Date.now());
    const timer = globalThis.setInterval(() => setNow(Date.now()), 250);
    return () => globalThis.clearInterval(timer);
  }, [nextRetryAt]);

  const retrySeconds = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1_000)) : 0;
  const connecting = state === "checking";
  const title = connecting
    ? failure ? "正在重新连接" : "正在连接 Run Server"
    : "Run Server 已断开";
  const status = connecting
    ? "请稍候"
    : retrySeconds > 0 ? `${retrySeconds} 秒后重试` : "即将重试";

  return (
    <section
      className={`connection-overlay connection-overlay-${state}`}
      role={connecting ? "status" : "alertdialog"}
      aria-live={connecting ? "polite" : "assertive"}
      aria-modal={!connecting ? "true" : undefined}
      aria-labelledby="connection-overlay-title"
      data-testid="connection-overlay"
    >
      <div className="connection-overlay-content">
        <div className="connection-state-mark" aria-hidden="true">
          {connecting ? <Wifi size={18} /> : <WifiOff size={18} />}
        </div>

        <div className="connection-overlay-heading">
          <h2 id="connection-overlay-title">{title}</h2>
          <p>{status}</p>
        </div>

        <div className="connection-overlay-actions">
          <button
            type="button"
            className="connection-primary-action"
            onClick={onRetry}
            disabled={connecting}
            aria-label={connecting ? "正在连接" : "立即重试"}
            title={connecting ? "正在连接" : "立即重试"}
          >
            <RefreshCw size={16} className={connecting ? "spinning-icon" : undefined} />
          </button>
          <button
            type="button"
            className="connection-secondary-action"
            onClick={onOpenSettings}
            aria-label="打开连接检查器"
            title="打开连接检查器"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
