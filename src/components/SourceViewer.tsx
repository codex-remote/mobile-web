import { CircleAlert, Copy, FileCode2, LoaderCircle, LocateFixed, Minus, Plus, RefreshCw, Settings2, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties } from "react";
import type { RuntimeClient } from "../runtime/RuntimeClient";
import type { SourceReference, SourceSnapshot } from "../types";
import type { SourceCodeEditorHandle } from "./SourceCodeEditor";
import { copyConversationResult } from "./conversationResultActions";
import { IconButton } from "./IconButton";

const SourceCodeEditor = lazy(() => import("./SourceCodeEditor").then((module) => ({ default: module.SourceCodeEditor })));

type SourceViewerProps = {
  client: RuntimeClient;
  projectId: string;
  projectName: string;
  reference: SourceReference;
  onClose: () => void;
  onOpenConnection: () => void;
};

const defaultSourceFontSize = 8;
const minimumSourceFontSize = 8;
const maximumSourceFontSize = 17;

export function SourceViewer({ client, projectId, projectName, reference, onClose, onOpenConnection }: SourceViewerProps) {
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [fontSize, setFontSize] = useState(defaultSourceFontSize);
  const [editorHandle, setEditorHandle] = useState<SourceCodeEditorHandle | null>(null);
  const captureEditorHandle = useCallback((handle: SourceCodeEditorHandle | null) => setEditorHandle(handle), []);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError("");
    void client.getProjectSource(projectId, reference.path, reference.line, 200, controller.signal)
      .then((value) => {
        setSnapshot(value);
        setState("ready");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setSnapshot(null);
        setError(sourceErrorMessage(requestError));
        setState("failed");
      });
    return () => controller.abort();
  }, [client, projectId, reference.line, reference.path, revision]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const displayPath = snapshot?.path ?? reference.path;
  const filename = displayPath.split("/").at(-1) || displayPath;
  const showConnectionAction = error === "源码访问令牌未配置" || error === "源码查看尚未启用";

  async function copyPath() {
    setFeedback(await copyConversationResult(`${displayPath}:${snapshot?.focus_line ?? reference.line}`) ? "路径已复制" : "复制失败");
    window.setTimeout(() => setFeedback(""), 2_000);
  }

  return (
    <section
      className="source-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`源码 ${filename}`}
      style={{ "--source-font-size": `${fontSize}px` } as CSSProperties}
    >
      <header className="source-viewer-header">
        <div className="source-viewer-identity">
          <span className="source-file-icon" aria-hidden="true"><FileCode2 size={16} /></span>
          <span>
            <strong>{filename}</strong>
            <small>{displayPath}</small>
          </span>
        </div>
        <div className="source-viewer-actions">
          <IconButton label="复制文件位置" onClick={() => void copyPath()} disabled={state !== "ready"}><Copy size={17} /></IconButton>
          <IconButton
            label={`返回聚焦行（第 ${snapshot?.focus_line || reference.line} 行）`}
            onClick={() => editorHandle?.returnToFocus()}
            disabled={state !== "ready" || !editorHandle}
            data-testid="return-source-focus"
          >
            <LocateFixed size={17} />
          </IconButton>
          <IconButton label="缩小代码" onClick={() => setFontSize((value) => Math.max(minimumSourceFontSize, value - 1))} disabled={fontSize <= minimumSourceFontSize}>
            <Minus size={17} />
          </IconButton>
          <IconButton label="放大代码" onClick={() => setFontSize((value) => Math.min(maximumSourceFontSize, value + 1))} disabled={fontSize >= maximumSourceFontSize}>
            <Plus size={17} />
          </IconButton>
          <IconButton label="关闭源码" onClick={onClose} data-testid="close-source" autoFocus><X size={19} /></IconButton>
        </div>
      </header>

      <div className="source-viewer-meta">
        <span>{projectName || "Mac 工作区"}</span>
        {snapshot && <span>第 {snapshot.focus_line || reference.line} 行 · 共 {snapshot.total_lines} 行 · {snapshot.sha256.slice(0, 8)}</span>}
        <span>{fontSize}px</span>
        <span className="source-viewer-feedback" role="status" aria-live="polite">{feedback}</span>
      </div>

      <div className="source-viewer-stage">
        {state === "loading" && (
          <div className="source-viewer-state" role="status">
            <LoaderCircle className="spinning-icon" size={21} />
            <strong>正在读取源码</strong>
          </div>
        )}
        {state === "failed" && (
          <div className="source-viewer-state source-viewer-error" role="alert">
            <CircleAlert size={22} />
            <strong>{error}</strong>
            <div>
              {showConnectionAction && (
                <button type="button" className="source-state-action" onClick={onOpenConnection}><Settings2 size={15} />连接设置</button>
              )}
              <button type="button" className="source-state-action" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} />重试</button>
            </div>
          </div>
        )}
        {state === "ready" && snapshot && (
          <div className="source-code-shell" aria-label={`${displayPath} 源码`}>
            {snapshot.truncated && snapshot.start_line > 1 && <div className="source-window-boundary">前文未载入 · 从第 {snapshot.start_line} 行开始</div>}
            <Suspense fallback={<div className="source-editor-loading" role="status"><LoaderCircle className="spinning-icon" size={20} /></div>}>
              <SourceCodeEditor ref={captureEditorHandle} snapshot={snapshot} />
            </Suspense>
            {snapshot.truncated && snapshot.end_line < snapshot.total_lines && <div className="source-window-boundary">后文未载入 · 文件共 {snapshot.total_lines} 行</div>}
          </div>
        )}
      </div>
    </section>
  );
}

function sourceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SOURCE_AUTH_REQUIRED")) return "源码访问令牌未配置";
  if (message.includes("SOURCE_READ_DISABLED")) return "源码查看尚未启用";
  if (message.includes("AGENT_OFFLINE")) return "Mac Agent 当前离线";
  if (message.includes("PROJECT_NOT_FOUND")) return "项目已不在 Mac 工作区";
  if (message.includes("SOURCE_NOT_FOUND")) return "文件已移动或删除";
  if (message.includes("SOURCE_FORBIDDEN")) return "该文件不允许远程查看";
  if (message.includes("SOURCE_BINARY")) return "此文件不是可显示的文本源码";
  if (message.includes("SOURCE_TOO_LARGE")) return "文件或目标行超出预览限制";
  if (message.includes("SOURCE_TIMEOUT")) return "读取源码超时";
  return "暂时无法读取源码";
}
