import { describe, expect, it } from "vitest";
import type { Session } from "../types";
import { mergeBackgroundSession } from "./sessionRefresh";

describe("mergeBackgroundSession", () => {
  it("keeps live messages when an active background snapshot lags behind", () => {
    const existing = session("running", "live delta", true);
    const refreshed = session("running", "older snapshot", true);

    expect(mergeBackgroundSession(existing, refreshed).messages[0]?.content).toBe("live delta");
  });

  it("accepts a terminal snapshot so the active message can settle", () => {
    const existing = session("running", "live delta", true);
    const refreshed = session("completed", "final answer", false);

    expect(mergeBackgroundSession(existing, refreshed)).toBe(refreshed);
  });
});

function session(status: Session["status"], content: string, streaming: boolean): Session {
  return {
    id: "s1",
    projectId: "p1",
    title: "Session",
    preview: "Prompt",
    status,
    updatedLabel: "",
    messages: [{ id: "assistant_r1", role: "assistant", content, createdAt: "", streaming }],
  };
}
