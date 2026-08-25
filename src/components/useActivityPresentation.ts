import { useEffect, useRef, useState } from "react";
import type { ToolStep } from "../types";
import { activityLabel, compactInline } from "./conversationPresentation";

export type ActivityPresentation = {
  key: string;
  label: string;
  phase: "preparing" | "running" | "completed" | "composing";
  step?: ToolStep;
};

const COALESCE_MS = 120;
const MIN_VISIBLE_MS = 420;
const COMPLETED_HOLD_MS = 500;

export function useActivityPresentation(steps: ToolStep[], hasContent: boolean): ActivityPresentation {
  const target = activityTarget(steps, hasContent);
  const [presentation, setPresentation] = useState(target);
  const presentationRef = useRef(presentation);
  const visibleSinceRef = useRef(Date.now());

  useEffect(() => {
    const timers: number[] = [];
    const apply = (next: ActivityPresentation) => {
      if (presentationRef.current.key === next.key) return;
      presentationRef.current = next;
      visibleSinceRef.current = Date.now();
      setPresentation(next);
    };
    const schedule = (next: ActivityPresentation, baseDelay: number, after?: () => void) => {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - visibleSinceRef.current));
      const timer = window.setTimeout(() => {
        apply(next);
        after?.();
      }, Math.max(baseDelay, remaining));
      timers.push(timer);
    };

    if (presentationRef.current.key === target.key) {
      if (target.phase === "completed") {
        const timer = window.setTimeout(() => apply(composingActivity(false)), COMPLETED_HOLD_MS);
        timers.push(timer);
      }
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }

    schedule(target, COALESCE_MS, target.phase === "completed"
      ? () => {
          const timer = window.setTimeout(() => apply(composingActivity(false)), COMPLETED_HOLD_MS);
          timers.push(timer);
        }
      : undefined);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [target.key, target.label, target.phase]);

  return presentation;
}

export function activityTarget(steps: ToolStep[], hasContent: boolean): ActivityPresentation {
  const active = [...steps].reverse().find((step) => step.status === "running");
  if (active) {
    return { key: `running:${active.id}`, label: activityLabel(active), phase: "running", step: active };
  }
  if (hasContent) return composingActivity(true);
  const completed = steps.at(-1);
  if (completed) {
    const subject = compactInline(completed.title, 72);
    return {
      key: `completed:${completed.id}`,
      label: subject ? `已完成 ${subject}` : "步骤已完成",
      phase: "completed",
      step: completed,
    };
  }
  return { key: "preparing", label: "正在准备回复", phase: "preparing" };
}

function composingActivity(hasContent: boolean): ActivityPresentation {
  return {
    key: hasContent ? "composing:answer" : "composing:result",
    label: hasContent ? "正在生成回答" : "正在整理结果",
    phase: "composing",
  };
}
