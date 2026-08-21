import { Check, ChevronDown, CircleDotDashed, FileCode2, RotateCw, Square } from "lucide-react";
import type { ChatMessage, Session, ToolStep } from "../types";

type ConversationViewProps = {
  session: Session;
};

export function ConversationView({ session }: ConversationViewProps) {
  return (
    <div className="conversation-scroll" data-testid="conversation-scroll">
      <div className="conversation-column">
        <header className="conversation-intro">
          <span className={`session-state session-state-${session.status}`}>
            {statusIcon(session.status)}
            {statusLabel(session.status)}
          </span>
          <h1>{session.title}</h1>
          <p>{session.preview}</p>
        </header>

        <div className="message-list" aria-live="polite">
          {session.messages.length === 0 ? (
            <div className="empty-conversation">
              <span className="empty-code-mark"><FileCode2 size={22} /></span>
              <h2>从这里开始</h2>
              <p>描述要检查、修改或验证的内容。</p>
            </div>
          ) : session.messages.map((message) => <MessageView key={message.id} message={message} />)}
        </div>
      </div>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return <p className="system-message">{message.content}</p>;
  }

  if (message.role === "user") {
    return (
      <article className="message message-user">
        <p>{message.content}</p>
        <time>{message.createdAt}</time>
      </article>
    );
  }

  return (
    <article className="message message-assistant">
      <div className="assistant-rail" aria-hidden="true"><span /></div>
      <div className="assistant-content">
        {message.toolSteps && message.toolSteps.length > 0 && <ToolSteps steps={message.toolSteps} />}
        <p className={message.streaming && !message.content ? "streaming-placeholder" : ""}>
          {message.content || "正在准备…"}
          {message.streaming && <span className="stream-caret" aria-hidden="true" />}
        </p>
        <time>{message.createdAt}</time>
      </div>
    </article>
  );
}

function ToolSteps({ steps }: { steps: ToolStep[] }) {
  return (
    <details className="tool-process" open>
      <summary>
        <span className="tool-process-icon"><RotateCw size={14} /></span>
        <span>执行过程</span>
        <ChevronDown size={14} className="details-chevron" />
      </summary>
      <div className="tool-step-list">
        {steps.map((step) => (
          <div className={`tool-step tool-step-${step.status}`} key={step.id}>
            <span className="tool-step-indicator">
              {step.status === "running" ? <CircleDotDashed size={13} /> : <Check size={13} />}
            </span>
            <span>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function statusLabel(status: Session["status"]): string {
  if (status === "running") return "正在运行";
  if (status === "queued") return "等待调度";
  if (status === "accepted") return "Agent 已接收";
  if (status === "waiting") return "等待 Agent";
  if (status === "failed") return "执行失败";
  if (status === "canceled") return "已停止";
  return "已完成";
}

function statusIcon(status: Session["status"]) {
  if (status === "running") return <CircleDotDashed size={13} />;
  if (status === "canceled") return <Square size={11} />;
  return <Check size={13} />;
}
