import { describe, expect, it } from "vitest";
import type { ApiRun } from "../types";
import { durationFromRun, formatTurnDuration, validDuration } from "./turnDuration";

function run(overrides: Partial<ApiRun>): ApiRun {
  return {
    run_id: "run-1",
    session_id: "session-1",
    status: "completed",
    persisted_through_sequence: 1,
    created_at: "2026-08-22T12:00:00Z",
    ...overrides,
  };
}

describe("turn duration", () => {
  it("prefers the duration reported by a terminal event", () => {
    expect(durationFromRun(run({
      started_at: "2026-08-22T12:00:00Z",
      finished_at: "2026-08-22T12:01:00Z",
      events: [{
        agent_sequence: 1,
        type: "turn.completed",
        payload: { duration_ms: 12_345 },
        occurred_at: "2026-08-22T12:01:00Z",
      }],
    }))).toBe(12_345);
  });

  it("falls back to the run timestamps", () => {
    expect(durationFromRun(run({
      started_at: "2026-08-22T12:00:00Z",
      finished_at: "2026-08-22T12:01:05Z",
    }))).toBe(65_000);
  });

  it("formats compact Chinese durations", () => {
    expect(formatTurnDuration(500)).toBe("<1秒");
    expect(formatTurnDuration(12_345)).toBe("12秒");
    expect(formatTurnDuration(65_000)).toBe("1分钟 5秒");
    expect(formatTurnDuration(296_000)).toBe("4分钟 56秒");
    expect(formatTurnDuration(3_725_000)).toBe("1小时 2分钟");
  });

  it("does not coerce missing server durations to zero", () => {
    expect(validDuration(null)).toBeUndefined();
    expect(validDuration("")).toBeUndefined();
    expect(validDuration(0)).toBe(0);
  });
});
