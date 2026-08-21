import { ArrowUp, Square, TerminalSquare } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";

type ComposerProps = {
  disabled?: boolean;
  running: boolean;
  projectName: string;
  onSubmit: (prompt: string) => void;
  onStop: () => void;
};

export function Composer({ disabled, running, projectName, onSubmit, onStop }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || disabled || running) return;
    setDraft("");
    onSubmit(prompt);
  }

  return (
    <div className="composer-zone">
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="给 Codex 发送指令"
          aria-label="任务指令"
          rows={1}
          disabled={disabled}
          data-testid="composer-input"
        />
        <div className="composer-toolbar">
          <span className="composer-context"><TerminalSquare size={13} />{projectName}</span>
          {running ? (
            <IconButton label="停止执行" tone="danger" onClick={onStop} data-testid="stop-run">
              <Square size={15} fill="currentColor" />
            </IconButton>
          ) : (
            <IconButton
              label="发送"
              tone="solid"
              type="submit"
              disabled={!draft.trim() || disabled}
              data-testid="send-prompt"
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </IconButton>
          )}
        </div>
      </form>
      <p className="composer-caption">当前会话中的变更会在 Mac 上执行</p>
    </div>
  );
}
