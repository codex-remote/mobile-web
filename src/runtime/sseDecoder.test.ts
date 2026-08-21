import { describe, expect, it } from "vitest";
import { SseDecoder } from "./sseDecoder";

describe("SseDecoder", () => {
  it("handles chunk boundaries and multiline data", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("id: 41\nevent: delta\ndata: {\"text\":" )).toEqual([]);
    expect(decoder.push("\"hello\"}\ndata: tail\n\n")).toEqual([
      { id: "41", event: "delta", data: "{\"text\":\"hello\"}\ntail" },
    ]);
  });

  it("ignores heartbeats and keeps the last event id", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(": heartbeat\n\nid: 8\ndata: first\n\ndata: second\n\n")).toEqual([
      { id: "8", event: undefined, data: "first" },
      { id: "8", event: undefined, data: "second" },
    ]);
  });

  it("flushes a final event without a trailing newline", () => {
    const decoder = new SseDecoder();
    decoder.push("id: 9\ndata: complete");
    expect(decoder.finish()).toEqual([{ id: "9", event: undefined, data: "complete" }]);
  });
});
