import { KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import { authSession, type AuthState } from "../auth/AuthSession";

export function AuthGate({ state }: { state: AuthState }) {
  const busy = state.status === "checking" || state.status === "pairing";
  return (
    <main className="auth-gate">
      <section className="auth-gate-panel" aria-live="polite">
        <div className="auth-gate-mark" aria-hidden="true">
          {busy ? <LoaderCircle className="spinning-icon" size={24} /> : <KeyRound size={24} />}
        </div>
        <div>
          <p className="auth-gate-kicker">Codex Remote</p>
          <h1>{state.status === "pairing" ? "正在配对此设备" : busy ? "正在验证访问权限" : "需要设备配对"}</h1>
          {!busy && <p>{state.message ?? "请在 Mac 上创建新的配对链接后打开。"}</p>}
        </div>
        {!busy && state.status === "unavailable" && (
          <button type="button" onClick={() => void authSession.retry()}>
            <RefreshCw size={16} />
            重试
          </button>
        )}
      </section>
    </main>
  );
}
