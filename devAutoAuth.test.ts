import { describe, expect, it } from "vitest";
import { isLoopbackAddress, isLoopbackHost, isLoopbackOrigin } from "./devAutoAuth";

describe("Codex debug auto auth boundary", () => {
  it("accepts only loopback socket addresses and hosts", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.20")).toBe(false);
    expect(isLoopbackHost("127.0.0.1:4173")).toBe(true);
    expect(isLoopbackHost("localhost:4173")).toBe(true);
    expect(isLoopbackHost("192.168.1.20:4173")).toBe(false);
  });

  it("rejects non-loopback and malformed origins", () => {
    expect(isLoopbackOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isLoopbackOrigin("http://localhost:4173")).toBe(true);
    expect(isLoopbackOrigin("https://example.com")).toBe(false);
    expect(isLoopbackOrigin("not-an-origin")).toBe(false);
  });
});
