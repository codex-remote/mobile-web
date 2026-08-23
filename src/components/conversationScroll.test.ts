import { describe, expect, it } from "vitest";
import {
  conversationGuidePlan,
  conversationGuideScroll,
  conversationQuestionScrollTop,
  isConversationNearBottom,
  lastUserMessageId,
  shouldFollowConversationTail,
} from "./conversationScroll";

describe("isConversationNearBottom", () => {
  it("keeps following while the reader remains near the tail", () => {
    expect(isConversationNearBottom({ scrollHeight: 1200, clientHeight: 600, scrollTop: 528 })).toBe(true);
    expect(isConversationNearBottom({ scrollHeight: 1200, clientHeight: 600, scrollTop: 600 })).toBe(true);
  });

  it("pauses following when the reader scrolls into history", () => {
    expect(isConversationNearBottom({ scrollHeight: 1200, clientHeight: 600, scrollTop: 500 })).toBe(false);
  });

  it("treats non-scrollable content as already at the tail", () => {
    expect(isConversationNearBottom({ scrollHeight: 500, clientHeight: 600, scrollTop: 0 })).toBe(true);
  });
});

describe("shouldFollowConversationTail", () => {
  it("keeps following when a keyboard or orientation resize shortens the viewport", () => {
    expect(shouldFollowConversationTail(
      { scrollHeight: 1200, clientHeight: 350, scrollTop: 600 },
      600,
      true,
    )).toBe(true);
  });

  it("pauses only after the reader actually scrolls upward", () => {
    expect(shouldFollowConversationTail(
      { scrollHeight: 1200, clientHeight: 350, scrollTop: 500 },
      600,
      true,
    )).toBe(false);
  });

  it("ignores upward movement caused by automatic layout or restoration", () => {
    expect(shouldFollowConversationTail(
      { scrollHeight: 1200, clientHeight: 350, scrollTop: 0 },
      600,
      true,
      false,
    )).toBe(true);
  });

  it("resumes only after a paused reader returns near the tail", () => {
    expect(shouldFollowConversationTail(
      { scrollHeight: 1200, clientHeight: 350, scrollTop: 700 },
      500,
      false,
    )).toBe(false);
    expect(shouldFollowConversationTail(
      { scrollHeight: 1200, clientHeight: 350, scrollTop: 800 },
      700,
      false,
    )).toBe(true);
  });
});

describe("last-turn conversation guide", () => {
  it("anchors the guide to the final user question", () => {
    expect(lastUserMessageId([
      { id: "user-1", role: "user" },
      { id: "assistant-1", role: "assistant" },
      { id: "system-1", role: "system" },
      { id: "user-2", role: "user" },
      { id: "assistant-2", role: "assistant" },
    ])).toBe("user-2");
    expect(lastUserMessageId([{ id: "assistant", role: "assistant" }])).toBeNull();
  });

  it("selects a distance-aware guide profile", () => {
    expect(conversationGuidePlan(0, 800)).toEqual({ profile: "none", duration: 0, pause: 0 });
    expect(conversationGuidePlan(400, 800)).toEqual({ profile: "short", duration: expect.closeTo(507.14, 1), pause: 0 });
    expect(conversationGuidePlan(1_280, 800)).toEqual({ profile: "medium", duration: 1_800, pause: 220 });
    expect(conversationGuidePlan(2_400, 800)).toEqual({ profile: "long", duration: 0, pause: 0 });
  });

  it("uses a quick ease-out for short answers", () => {
    const halfway = conversationGuideScroll(100, 1_100, 0.5, "short");

    expect(halfway).toBe(975);
    expect(conversationGuideScroll(100, 1_100, 1, "short")).toBe(1_100);
  });

  it("accelerates, cruises, then decelerates for medium answers", () => {
    const velocity = (progress: number) => conversationGuideScroll(0, 1_000, progress + 0.02, "medium")
      - conversationGuideScroll(0, 1_000, progress, "medium");

    expect(velocity(0.02)).toBeLessThan(velocity(0.3));
    expect(velocity(0.3)).toBeCloseTo(velocity(0.6), 6);
    expect(velocity(0.9)).toBeLessThan(velocity(0.6));
    expect(conversationGuideScroll(100, 1_100, 1, "medium")).toBeCloseTo(1_100, 8);
  });

  it("clamps animation progress", () => {
    expect(conversationGuideScroll(100, 1_100, -1, "medium")).toBe(100);
    expect(conversationGuideScroll(100, 1_100, 2, "medium")).toBeCloseTo(1_100, 8);
  });

  it("places the final question below the viewport edge and respects scroll bounds", () => {
    expect(conversationQuestionScrollTop(400, 100, 300, 1_200)).toBe(588);
    expect(conversationQuestionScrollTop(0, 100, 80, 1_200)).toBe(0);
    expect(conversationQuestionScrollTop(1_000, 100, 500, 1_200)).toBe(1_200);
  });
});
