import { describe, expect, it } from "vitest";
import type { ToolStep } from "../types";
import { activityTarget } from "./useActivityPresentation";

describe("activityTarget", () => {
  it("uses one stable preparation state before tools arrive", () => {
    expect(activityTarget([], false)).toMatchObject({ phase: "preparing", label: "正在准备回复" });
  });

  it("shows the current running tool", () => {
    expect(activityTarget([step("running")], false)).toMatchObject({ phase: "running", label: "正在执行 npm test" });
  });

  it("keeps a completed step before entering result composition", () => {
    expect(activityTarget([step("completed")], false)).toMatchObject({ phase: "completed", label: "已完成 npm test" });
  });

  it("uses answer composition once response content is visible", () => {
    expect(activityTarget([step("completed")], true)).toMatchObject({ phase: "composing", label: "正在生成回答" });
  });
});

function step(status: ToolStep["status"]): ToolStep {
  return { id: "test", kind: "commandExecution", title: "npm test", detail: "", status };
}
