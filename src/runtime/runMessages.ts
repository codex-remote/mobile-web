import { durationFromRun } from "../components/turnDuration";
import { settleRunningToolSteps, terminalToolStepStatus } from "../components/toolStepState";
import type { ApiRun, ChatMessage, SessionStatus, ToolStep } from "../types";

export function messagesFromRun(run: ApiRun): ChatMessage[] {
  const user: ChatMessage = { id: `user_${run.run_id}`, role: "user", content: run.prompt || "", createdAt: displayTime(run.created_at) };
  let content = "";
  let terminal = false;
  let failedMessage = run.error_message || "";
  let tools: ToolStep[] = [];
  let terminalToolStatus: Exclude<ToolStep["status"], "running"> | undefined;
  let assistantStreamMode: ChatMessage["assistantStreamMode"] = "legacy";
  let responseItemId = "";
  for (const event of run.events ?? []) {
    const payload = event.payload ?? {};
    if (event.type === "assistant.delta" && assistantStreamMode === "legacy") {
      content += String(payload.text ?? payload.delta ?? "");
    }
    if (event.type === "item.delta") {
      const itemId = String(payload.item_id ?? "");
      if (assistantStreamMode === "final" && itemId && itemId === responseItemId && payload.field === "text") {
        content += String(payload.delta ?? "");
      }
    }
    if (event.type === "item.started" || event.type === "item.completed") {
      const item = payload.item as Record<string, unknown> | undefined;
      const tool = toolFromItem(item, event.type === "item.completed" ? "completed" : "running");
      if (tool) tools = upsertToolStep(tools, tool);
      if (isAssistantItem(item)) {
        const finalAnswer = isFinalAssistantItem(item);
        assistantStreamMode = finalAnswer ? "final" : "commentary";
        responseItemId = finalAnswer ? String(item?.id ?? "") : "";
        if (finalAnswer) {
          if (event.type === "item.started") content = "";
          if (event.type === "item.completed" && item?.text) content = String(item.text);
        }
      }
    }
    if (event.type === "turn.failed") failedMessage ||= String(payload.message ?? payload.error ?? "执行失败");
    if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.interrupted") {
      terminal = true;
      terminalToolStatus = terminalToolStepStatus(event.type);
    }
  }
  tools = settleRunningToolSteps(tools, terminalToolStatus ?? terminalToolStepStatus(run.status)) ?? [];
  const assistant: ChatMessage = {
    id: `assistant_${run.run_id}`,
    role: "assistant",
    content: content || (run.status === "failed" ? failedMessage : ""),
    createdAt: displayTime(run.started_at || run.created_at),
    startedAt: run.started_at || run.created_at,
    durationMs: durationFromRun(run),
    streaming: !terminal && isActiveStatus(run.status),
    toolSteps: tools,
    assistantStreamMode,
    responseItemId: responseItemId || undefined,
  };
  return [user, assistant];
}

export function toolFromItem(item: Record<string, unknown> | undefined, status: ToolStep["status"]): ToolStep | null {
  if (!item) return null;
  const type = String(item.type ?? "");
  if (item.role === "user" || item.role === "assistant" || type === "userMessage" || type === "agentMessage") return null;
  const itemStatus = String(item.status ?? "");
  const exitCode = typeof item.exit_code === "number" ? item.exit_code : undefined;
  const failed = itemStatus === "failed" || itemStatus === "declined" || (exitCode !== undefined && exitCode !== 0);
  const title = itemTitle(item, type);
  return {
    id: String(item.id ?? `${type}_${title}`),
    kind: type || "tool",
    title,
    detail: compactToolDetail(item),
    status: failed ? "failed" : status,
  };
}

export function isFinalAssistantItem(item: Record<string, unknown> | undefined): boolean {
  if (!isAssistantItem(item)) return false;
  const phase = String(item?.phase ?? "");
  return !phase || phase === "final_answer";
}

export function isAssistantItem(item: Record<string, unknown> | undefined): boolean {
  return item?.role === "assistant" || item?.type === "agentMessage";
}

export function normalizeStatus(status?: string): SessionStatus {
  if (status === "queued" || status === "accepted" || status === "running" || status === "completed" || status === "failed" || status === "canceled") return status;
  if (isActiveStatus(status)) return "running";
  return "waiting";
}

export function isActiveStatus(status?: string): boolean {
  return status === "queued" || status === "accepted" || status === "running" || status === "dispatching" || status === "waiting_agent" || status === "recovering" || status === "finalizing";
}

export function upsertToolStep(steps: ToolStep[], next: ToolStep): ToolStep[] {
  const found = steps.some((step) => step.id === next.id);
  return found ? steps.map((step) => step.id === next.id ? next : step) : [...steps, next];
}

function itemTitle(item: Record<string, unknown>, type: string): string {
  const changes = Array.isArray(item.changes) ? item.changes as Record<string, unknown>[] : [];
  const changedPath = changes.find((change) => typeof change.path === "string")?.path;
  const value = item.command ?? item.query ?? item.name ?? item.tool ?? item.path ?? changedPath ?? type;
  return compactText(String(value || "执行工具"), 180);
}

function compactToolDetail(item: Record<string, unknown>): string {
  const duration = typeof item.duration_ms === "number" ? `${Math.max(0, Math.round(item.duration_ms))} ms` : "";
  const value = item.output ?? item.cwd ?? item.server ?? duration;
  return compactText(String(value ?? ""), 180);
}

function compactText(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function displayTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
