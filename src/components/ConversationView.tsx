import {
  ArrowDown,
  Brain,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  Database,
  FileCode2,
  FileText,
  Image,
  LoaderCircle,
  RotateCw,
  Search,
  Share2,
  Terminal,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Session, SessionDetailStatus, SourceReference, ToolStep } from "../types";
import { parseSourceReference, sourceViewerHref } from "../runtime/sourceReference";
import { activityLabel, compactInline, processSummary, stepCategory } from "./conversationPresentation";
import { copyConversationResult, openWechatWithConversationResult } from "./conversationResultActions";
import { durationBetween, formatTurnDuration } from "./turnDuration";
import { IconButton } from "./IconButton";
import { SessionStatusIcon } from "./SessionStatusIcon";
import { useConversationScrollGuide } from "./useConversationScrollGuide";

type ConversationViewProps = {
  session: Session;
  detailStatus?: SessionDetailStatus;
  detailError?: string;
  unavailable?: boolean;
  onRetry?: () => void;
  onOpenSource?: (reference: SourceReference) => void;
};

export function ConversationView({
  session,
  detailStatus = "ready",
  detailError,
  unavailable = false,
  onRetry,
  onOpenSource,
}: ConversationViewProps) {
  const hasMessages = session.messages.length > 0;
  const scrollGuide = useConversationScrollGuide({
    sessionId: session.id,
    messages: session.messages,
    detailStatus,
  });

  return (
    <div className="conversation-stage">
      <div
        ref={scrollGuide.scrollRef}
        className="conversation-scroll"
        data-testid="conversation-scroll"
        onPointerDown={scrollGuide.onPointerDown}
        onWheel={scrollGuide.onWheel}
        onKeyDown={scrollGuide.onKeyDown}
        onScroll={scrollGuide.onScroll}
      >
        <div className="conversation-column">
          {!unavailable && detailStatus === "refreshing" && (
            <DetailNotice status="syncing" message="正在同步最新会话" />
          )}
          {!unavailable && detailStatus === "stale-error" && (
            <DetailNotice status="failed" message="暂时无法同步，正在显示上次内容" detail={detailError} onRetry={onRetry} />
          )}
          {!hasMessages && detailStatus !== "loading" && detailStatus !== "failed" && (
            <header className="conversation-intro">
              <span className={`session-state ${unavailable ? "session-state-failed" : `session-state-${session.status}`}`}>
                {unavailable ? <CircleAlert size={14} /> : <SessionStatusIcon status={session.status} size={14} />}
                {unavailable ? "不在当前目录" : statusLabel(session.status)}
              </span>
              <h1>{session.title}</h1>
              <p>{session.preview}</p>
            </header>
          )}

          <div className={`message-list ${hasMessages ? "message-list-active" : ""}`} aria-live="polite">
            {unavailable ? (
              <div className="empty-conversation empty-conversation-unavailable" role="status">
                <span className="empty-code-mark empty-code-mark-unavailable"><CircleAlert size={22} /></span>
                <h2>无法打开此会话</h2>
                <p>它可能已在 Mac 上删除或归档。请从项目导航中选择其他会话。</p>
              </div>
            ) : detailStatus === "loading" ? (
              <ConversationSkeleton />
            ) : detailStatus === "failed" ? (
              <div className="empty-conversation empty-conversation-load-failed" role="alert">
                <span className="empty-code-mark empty-code-mark-unavailable"><CircleAlert size={22} /></span>
                <h2>会话载入失败</h2>
                <p>{detailError || "暂时无法读取会话内容，请稍后重试。"}</p>
                {onRetry && <button className="session-detail-retry" type="button" onClick={onRetry}><RotateCw size={15} />重新载入</button>}
              </div>
            ) : !hasMessages ? (
              <div className="empty-conversation">
                <span className="empty-code-mark"><FileCode2 size={22} /></span>
                <h2>从这里开始</h2>
                <p>描述要检查、修改或验证的内容。</p>
              </div>
            ) : session.messages.map((message) => (
              <MessageView key={message.id} message={message} projectId={session.projectId} onOpenSource={onOpenSource} />
            ))}
          </div>
        </div>
      </div>
      {scrollGuide.showJumpToLatest && (
        <IconButton
          className="conversation-jump-button"
          label="跳到最新内容"
          onClick={scrollGuide.jumpToLatest}
          data-testid="jump-to-latest"
        >
          <ArrowDown size={18} />
        </IconButton>
      )}
    </div>
  );
}

function DetailNotice({
  status,
  message,
  detail,
  onRetry,
}: {
  status: "syncing" | "failed";
  message: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`session-detail-notice session-detail-notice-${status}`} role={status === "failed" ? "status" : undefined}>
      {status === "syncing" ? <LoaderCircle className="spinning-icon" size={14} /> : <CircleAlert size={14} />}
      <span title={detail}>{message}</span>
      {status === "failed" && onRetry && (
        <button type="button" onClick={onRetry} aria-label="重新同步会话"><RotateCw size={14} /></button>
      )}
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="conversation-skeleton" role="status" aria-label="正在载入会话" aria-busy="true">
      <div className="skeleton-user"><span className="skeleton-line skeleton-line-user" /></div>
      <div className="skeleton-assistant">
        <span className="skeleton-rail" />
        <div className="skeleton-copy">
          <span className="skeleton-line skeleton-line-wide" />
          <span className="skeleton-line skeleton-line-medium" />
          <span className="skeleton-line skeleton-line-short" />
          <span className="skeleton-tool"><Terminal size={14} /><span /></span>
        </div>
      </div>
    </div>
  );
}

function MessageView({ message, projectId, onOpenSource }: { message: ChatMessage; projectId: string; onOpenSource?: (reference: SourceReference) => void }) {
  if (message.role === "system") {
    return <p className="system-message">{message.content}</p>;
  }

  if (message.role === "user") {
    return (
      <article className="message message-user" data-message-id={message.id} data-message-role="user">
        <p>{message.content}</p>
        <time>{message.createdAt}</time>
      </article>
    );
  }

  if (!message.content && !message.streaming && !message.toolSteps?.length) return null;

  const steps = message.toolSteps ?? [];
  const activeStep = [...steps].reverse().find((step) => step.status === "running");

  return (
    <article
      className={`message message-assistant ${message.streaming ? "message-streaming" : ""}`}
      aria-busy={message.streaming}
      data-message-id={message.id}
      data-message-role="assistant"
    >
      <div className="assistant-rail" aria-hidden="true"><span /></div>
      <div className="assistant-content">
        {message.content ? <MarkdownResult content={message.content} projectId={projectId} onOpenSource={onOpenSource} /> : !message.streaming ? null : (
          <p className="streaming-placeholder">正在准备回复</p>
        )}
        {message.streaming && <LiveActivity step={activeStep} />}
        {steps.length > 0 && <ToolSteps steps={steps} />}
        <div className={`message-result-footer ${message.streaming ? "message-result-footer-live" : ""}`}>
          {!message.streaming && message.content ? <ResultActions content={message.content} /> : <span />}
          <div className="message-result-meta">
            <TurnDuration message={message} />
            {!message.streaming && <time>{message.createdAt}</time>}
          </div>
        </div>
      </div>
    </article>
  );
}

function TurnDuration({ message }: { message: ChatMessage }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!message.streaming || !message.startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [message.streaming, message.startedAt]);

  const liveDuration = message.streaming
    ? durationBetween(message.startedAt, new Date(now).toISOString())
    : undefined;
  const duration = message.durationMs ?? liveDuration;
  if (duration === undefined) return null;

  const label = `已处理 ${formatTurnDuration(duration)}`;
  return (
    <span
      className={`message-duration ${message.streaming ? "message-duration-processing" : "message-duration-completed"}`}
      role="timer"
      aria-live="off"
      aria-label={label}
    >
      {label}
    </span>
  );
}

function ResultActions({ content }: { content: string }) {
  const [feedback, setFeedback] = useState("");
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const announce = (message: string) => {
    setFeedback(message);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(""), 2_400);
  };

  const copyResult = async () => {
    announce(await copyConversationResult(content) ? "已复制" : "复制失败");
  };

  const openWechat = async () => {
    const result = await openWechatWithConversationResult(content);
    if (result === "opened") announce("已复制，正在打开微信");
    if (result === "copied") announce("已复制，请打开微信粘贴");
    if (result === "failed") announce("无法打开微信");
  };

  return (
    <div className="result-actions">
      <button type="button" className="result-action-button" onClick={() => void copyResult()} title="复制回答" aria-label="复制回答">
        <Copy size={15} aria-hidden="true" />
      </button>
      <button type="button" className="result-action-button" onClick={() => void openWechat()} title="分享到微信" aria-label="分享到微信">
        <Share2 size={15} aria-hidden="true" />
      </button>
      <span className="result-action-feedback" role="status" aria-live="polite">{feedback}</span>
    </div>
  );
}

function MarkdownResult({ content, projectId, onOpenSource }: { content: string; projectId: string; onOpenSource?: (reference: SourceReference) => void }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href, ...props }) => {
            const reference = parseSourceReference(href);
            if (!reference || !projectId) return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
            return (
              <a
                {...props}
                className="source-reference-link"
                href={sourceViewerHref(projectId, reference)}
                title={`查看源码第 ${reference.line} 行`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !onOpenSource) return;
                  event.preventDefault();
                  onOpenSource(reference);
                }}
              >
                <FileCode2 size={13} aria-hidden="true" />{children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function LiveActivity({ step }: { step?: ToolStep }) {
  const label = activityLabel(step);
  return (
    <div className="live-activity" role="status" aria-label={label}>
      <span className="live-activity-icon" aria-hidden="true">{step ? toolIcon(step) : <LoaderCircle className="status-loading-icon" size={15} />}</span>
      <span className="live-activity-copy">{label}</span>
      <span className="live-activity-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

function ToolSteps({ steps }: { steps: ToolStep[] }) {
  const processState = steps.some((step) => step.status === "running")
    ? "running"
    : steps.some((step) => step.status === "failed")
      ? "failed"
      : steps.some((step) => step.status === "interrupted") ? "interrupted" : "completed";

  return (
    <details className={`tool-process tool-process-${processState}`}>
      <summary>
        <span className="tool-process-icon">{summaryIcon(steps)}</span>
        <span className="tool-process-copy">
          <strong>执行轨迹</strong>
          <small>{processSummary(steps)}</small>
        </span>
        <ChevronDown size={14} className="details-chevron" />
      </summary>
      <div className="tool-step-list">
        {steps.map((step) => (
          <div className={`tool-step tool-step-${step.status}`} key={step.id}>
            <span className="tool-step-indicator">{stepStatusIcon(step)}</span>
            <span className="tool-step-content">
              <span className="tool-step-heading">
                <small>{stepCategory(step)}</small>
                <strong>{compactInline(step.title, 120)}</strong>
              </span>
              {step.detail && <span className="tool-step-detail">{compactInline(step.detail)}</span>}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function summaryIcon(steps: ToolStep[]) {
  if (steps.some((step) => step.status === "running")) return <LoaderCircle className="status-loading-icon" size={15} />;
  if (steps.some((step) => step.status === "failed")) return <CircleX size={15} />;
  if (steps.some((step) => step.status === "interrupted")) return <CircleAlert size={15} />;
  return <CircleCheck size={15} />;
}

function stepStatusIcon(step: ToolStep) {
  if (step.status === "running") return <LoaderCircle className="status-loading-icon" size={13} />;
  if (step.status === "failed") return <CircleX size={13} />;
  if (step.status === "interrupted") return <CircleAlert size={13} />;
  return <CircleCheck size={13} />;
}

function toolIcon(step: ToolStep) {
  if (stepCategory(step) === "SQL") return <Database size={15} />;
  if (step.kind === "commandExecution") return <Terminal size={15} />;
  if (step.kind === "webSearch") return <Search size={15} />;
  if (step.kind === "fileChange") return <FileText size={15} />;
  if (step.kind === "reasoning" || step.kind === "plan" || step.kind === "contextCompaction") return <Brain size={15} />;
  if (step.kind === "imageView" || step.kind === "imageGeneration") return <Image size={15} />;
  return <Wrench size={15} />;
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
