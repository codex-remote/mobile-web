import { describe, expect, it } from "vitest";
import { resolveKeyboardInset, shouldTrackKeyboardViewport } from "./keyboardViewport";

describe("shouldTrackKeyboardViewport", () => {
  it("starts with composer focus and follows the viewport until the applied frame is cleared", () => {
    expect(shouldTrackKeyboardViewport(true, false)).toBe(true);
    expect(shouldTrackKeyboardViewport(false, true)).toBe(true);
    expect(shouldTrackKeyboardViewport(false, false)).toBe(false);
  });
});

describe("resolveKeyboardInset", () => {
  it("does not override browsers that already resize the layout viewport", () => {
    expect(resolveKeyboardInset(500, 500, 0, 1)).toBeNull();
  });

  it("returns only the part of the keyboard that still overlaps the panned viewport", () => {
    expect(resolveKeyboardInset(844, 500.4, 280.2, 1)).toBe(63);
  });

  it("keeps the composer at the same visual bottom while Safari settles its focus pan", () => {
    expect(resolveKeyboardInset(844, 500, 0, 1)).toBe(344);
    expect(resolveKeyboardInset(844, 500, 180, 1)).toBe(164);
    expect(resolveKeyboardInset(844, 500, 280, 1)).toBe(64);
  });

  it("keeps the inset inside the layout viewport", () => {
    expect(resolveKeyboardInset(844, 500, 600, 1)).toBe(0);
    expect(resolveKeyboardInset(844, 500, -20, 1)).toBe(344);
  });

  it("does not interfere with user pinch zoom", () => {
    expect(resolveKeyboardInset(844, 500, 120, 1.5)).toBeNull();
  });

  it("rejects invalid and rounding-only differences", () => {
    expect(resolveKeyboardInset(844, Number.NaN, 0, 1)).toBeNull();
    expect(resolveKeyboardInset(844, 842.5, 0, 1)).toBeNull();
  });
});
