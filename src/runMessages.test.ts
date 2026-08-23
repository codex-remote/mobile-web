import { describe, expect, it } from "vitest";
import { messagesFromRun } from "./runtime/runMessages";
import type { ApiRun, ApiRunEvent } from "./types";

function runWith(events: ApiRunEvent[], status = "completed"): ApiRun {
  return {
    run_id: "run-1",
    session_id: "session-1",
    status,
    prompt: "检查实现",
    persisted_through_sequence: events.length,
    created_at: "2026-08-21T12:00:00Z",
    events,
  };
}

function event(type: string, payload: Record<string, unknown>, sequence: number): ApiRunEvent {
  return { agent_sequence: sequence, type, payload, occurred_at: "2026-08-21T12:00:00Z" };
}

describe("messagesFromRun", () => {
  it("keeps commentary out of the final Markdown response", () => {
    const messages = messagesFromRun(runWith([
      event("item.started", { item: { id: "commentary", type: "agentMessage", role: "assistant", phase: "commentary" } }, 1),
      event("assistant.delta", { text: "正在读取大量过程信息" }, 2),
      event("item.delta", { item_id: "commentary", field: "text", delta: "正在读取大量过程信息" }, 3),
      event("item.completed", { item: { id: "commentary", type: "agentMessage", role: "assistant", phase: "commentary", text: "正在读取大量过程信息" } }, 4),
      event("item.started", { item: { id: "final", type: "agentMessage", role: "assistant", phase: "final_answer" } }, 5),
      event("assistant.delta", { text: "## 结果\n\n已完成" }, 6),
      event("item.delta", { item_id: "final", field: "text", delta: "## 结果\n\n已完成" }, 7),
      event("item.completed", { item: { id: "final", type: "agentMessage", role: "assistant", phase: "final_answer", text: "## 结果\n\n已完成" } }, 8),
      event("turn.completed", {}, 9),
    ]));

    expect(messages[1]?.content).toBe("## 结果\n\n已完成");
    expect(messages[1]?.content).not.toContain("大量过程信息");
    expect(messages[1]?.durationMs).toBe(0);
  });

  it("keeps the server-reported duration for completed turns", () => {
    const messages = messagesFromRun(runWith([
      event("turn.completed", { duration_ms: 65_432 }, 1),
    ]));

    expect(messages[1]?.durationMs).toBe(65_432);
    expect(messages[1]?.startedAt).toBe("2026-08-21T12:00:00Z");
  });

  it("streams structured final-answer deltas before completion", () => {
    const messages = messagesFromRun(runWith([
      event("item.started", { item: { id: "final", type: "agentMessage", role: "assistant", phase: "final_answer" } }, 1),
      event("item.delta", { item_id: "final", field: "text", delta: "正在生成最终结果" }, 2),
    ], "running"));

    expect(messages[1]?.content).toBe("正在生成最终结果");
    expect(messages[1]?.streaming).toBe(true);
  });

  it("falls back to legacy assistant deltas when structured items are absent", () => {
    const messages = messagesFromRun(runWith([
      event("assistant.delta", { text: "兼容旧服务输出" }, 1),
      event("turn.completed", {}, 2),
    ]));

    expect(messages[1]?.content).toBe("兼容旧服务输出");
  });

  it("settles unfinished tool steps when a completed turn has no matching item completion", () => {
    const messages = messagesFromRun(runWith([
      event("item.started", { item: { id: "command-1", type: "commandExecution", command: "npm test" } }, 1),
      event("turn.completed", {}, 2),
    ]));

    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.toolSteps?.[0]?.status).toBe("completed");
  });

  it("marks unfinished tool steps as interrupted when the turn is canceled", () => {
    const messages = messagesFromRun(runWith([
      event("item.started", { item: { id: "command-1", type: "commandExecution", command: "npm test" } }, 1),
      event("turn.interrupted", {}, 2),
    ], "canceled"));

    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.toolSteps?.[0]?.status).toBe("interrupted");
  });

  it("uses terminal run status when a historical response omits terminal events", () => {
    const messages = messagesFromRun(runWith([
      event("item.started", { item: { id: "command-1", type: "commandExecution", command: "npm test" } }, 1),
    ], "failed"));

    expect(messages[1]?.toolSteps?.[0]?.status).toBe("failed");
  });
});
