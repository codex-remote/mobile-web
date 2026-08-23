import { ArrowUp, Keyboard, Square, TerminalSquare } from "lucide-react";
import { type FormEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import {
  resolveKeyboardInset,
  shouldTrackKeyboardViewport,
} from "../runtime/keyboardViewport";
import { IconButton } from "./IconButton";

type ComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  running: boolean;
  projectName: string;
  onSubmit: (prompt: string) => void;
  onStop: () => void;
};

function preserveComposerFocus(event: PointerEvent<HTMLButtonElement>) {
  // A mobile keyboard resize can move the button between pointer-down and click, dropping the submit.
  event.preventDefault();
}

export function Composer({ disabled, placeholder = "给 Codex 发送指令", running, projectName, onSubmit, onStop }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerFocusedRef = useRef(false);
  const syncKeyboardViewportRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft]);

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const root = document.documentElement;
    const publishHeight = () => {
      root.style.setProperty("--composer-zone-height", `${Math.ceil(zone.getBoundingClientRect().height)}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(zone);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--composer-zone-height");
    };
  }, []);

  useEffect(() => {
    if (!window.visualViewport) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;

    const clearKeyboardViewport = () => {
      root.style.removeProperty("--composer-keyboard-inset");
    };

    const keyboardViewportApplied = () => root.style.getPropertyValue("--composer-keyboard-inset") !== "";

    // Moving only by the bottom overlap cancels Safari's focus pan without reflowing the whole app.
    const syncKeyboardViewport = () => {
      const applied = keyboardViewportApplied();
      if (!shouldTrackKeyboardViewport(composerFocusedRef.current, applied)) return;

      const keyboardInset = resolveKeyboardInset(
        document.documentElement.clientHeight,
        viewport.height,
        viewport.offsetTop,
        viewport.scale,
      );
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (keyboardInset === null) return clearKeyboardViewport();
        root.style.setProperty("--composer-keyboard-inset", `${keyboardInset}px`);
      });
    };

    syncKeyboardViewportRef.current = syncKeyboardViewport;
    viewport.addEventListener("resize", syncKeyboardViewport);
    viewport.addEventListener("scroll", syncKeyboardViewport);
    window.addEventListener("resize", syncKeyboardViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      syncKeyboardViewportRef.current = () => undefined;
      viewport.removeEventListener("resize", syncKeyboardViewport);
      viewport.removeEventListener("scroll", syncKeyboardViewport);
      window.removeEventListener("resize", syncKeyboardViewport);
      clearKeyboardViewport();
    };
  }, []);

  function setComposerFocus(nextFocused: boolean) {
    composerFocusedRef.current = nextFocused;
    setFocused(nextFocused);
    syncKeyboardViewportRef.current();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || disabled || running) return;
    setDraft("");
    onSubmit(prompt);
  }

  return (
    <div ref={zoneRef} className={`composer-zone ${focused ? "composer-zone-focused" : ""}`}>
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setComposerFocus(true)}
          onBlur={() => setComposerFocus(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          aria-label="任务指令"
          rows={1}
          disabled={disabled}
          enterKeyHint="send"
          data-testid="composer-input"
        />
        <div className="composer-toolbar">
          <span className="composer-context"><TerminalSquare size={13} />{projectName}</span>
          <span className="composer-actions">
            {focused && (
              <IconButton
                label="收起键盘"
                type="button"
                className="keyboard-dismiss-button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  textareaRef.current?.blur();
                }}
                onClick={() => textareaRef.current?.blur()}
                data-testid="dismiss-keyboard"
              >
                <Keyboard size={17} />
              </IconButton>
            )}
            {running ? (
              <IconButton
                label="停止执行"
                tone="danger"
                onPointerDown={preserveComposerFocus}
                onClick={onStop}
                data-testid="stop-run"
              >
                <Square size={15} fill="currentColor" />
              </IconButton>
            ) : (
              <IconButton
                label="发送"
                tone="solid"
                type="submit"
                disabled={!draft.trim() || disabled}
                onPointerDown={preserveComposerFocus}
                data-testid="send-prompt"
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </IconButton>
            )}
          </span>
        </div>
      </form>
      <p className="composer-caption" aria-hidden={focused}>当前会话中的变更会在 Mac 上执行</p>
    </div>
  );
}
