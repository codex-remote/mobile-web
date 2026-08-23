import type { ApiRun } from "../types";

const TERMINAL_EVENTS = new Set(["turn.completed", "turn.failed", "turn.interrupted"]);

export function durationFromRun(run: ApiRun): number | undefined {
  const terminalEvent = [...(run.events ?? [])].reverse().find((event) => TERMINAL_EVENTS.has(event.type));
  const reported = validDuration(terminalEvent?.payload?.duration_ms);
  if (reported !== undefined) return reported;

  const startedAt = run.started_at || run.created_at;
  const finishedAt = run.finished_at || terminalEvent?.occurred_at;
  return durationBetween(startedAt, finishedAt);
}

export function durationBetween(startedAt?: string, finishedAt?: string): number | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const started = new Date(startedAt).valueOf();
  const finished = new Date(finishedAt).valueOf();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return undefined;
  return Math.max(0, finished - started);
}

export function validDuration(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

export function formatTurnDuration(durationMs: number): string {
  if (durationMs > 0 && durationMs < 1_000) return "<1秒";
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}秒`;

  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}小时 ${minutes}分钟` : `${hours}小时`;
  return seconds > 0 ? `${minutes}分钟 ${seconds}秒` : `${minutes}分钟`;
}
