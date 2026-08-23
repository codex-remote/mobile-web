import { describe, expect, it } from "vitest";
import type { ToolStep } from "../types";
import { activityLabel, compactInline, processSummary, stepCategory } from "./conversationPresentation";

function step(overrides: Partial<ToolStep> = {}): ToolStep {
  return {
    id: "step-1",
    kind: "commandExecution",
    title: "npm test",
    detail: "",
    status: "running",
    ...overrides,
  };
}

describe("conversation presentation", () => {
  it("describes the latest command and SQL activity concisely", () => {
    expect(activityLabel(step())).toBe("正在执行 npm test");
    const sql = step({ kind: "mcpToolCall", title: "query_postgres" });
    expect(activityLabel(sql)).toBe("正在查询 query_postgres");
    expect(stepCategory(sql)).toBe("SQL");
    expect(stepCategory(step({ kind: "fileChange", title: "update docs" }))).toBe("文件");
  });

  it("summarizes mixed tool states without exposing their output", () => {
    expect(processSummary([
      step({ id: "done", status: "completed" }),
      step({ id: "active" }),
    ])).toBe("1 项完成 · 1 项进行中");
    expect(processSummary([step({ status: "failed" })])).toBe("1 项操作 · 1 项失败");
    expect(processSummary([step({ status: "interrupted" })])).toBe("1 项操作 · 1 项中断");
  });

  it("flattens and bounds noisy details", () => {
    expect(compactInline("line one\n  line two")).toBe("line one line two");
    expect(compactInline("123456", 5)).toBe("1234…");
  });
});
