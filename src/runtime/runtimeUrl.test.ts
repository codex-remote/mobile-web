import { describe, expect, it } from "vitest";
import { resolveRuntimeUrl } from "./runtimeUrl";

describe("resolveRuntimeUrl", () => {
  it("follows the page host when no explicit Runtime URL is configured", () => {
    expect(resolveRuntimeUrl(undefined, { protocol: "http:", hostname: "192.168.3.8" })).toBe("http://192.168.3.8:18775");
  });

  it("preserves an explicit Runtime URL override", () => {
    expect(resolveRuntimeUrl(" https://runtime.example.com/ ", { protocol: "http:", hostname: "192.168.3.8" })).toBe(
      "https://runtime.example.com",
    );
  });

  it("formats IPv6 page hosts", () => {
    expect(resolveRuntimeUrl(undefined, { protocol: "http:", hostname: "::1" })).toBe("http://[::1]:18775");
  });
});
