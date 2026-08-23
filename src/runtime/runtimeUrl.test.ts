import { describe, expect, it } from "vitest";
import { resolveRuntimeUrl } from "./runtimeUrl";

describe("resolveRuntimeUrl", () => {
  it("follows the page host when no explicit Runtime URL is configured", () => {
    expect(resolveRuntimeUrl({ origin: "http://192.168.3.8:18774" })).toBe("http://192.168.3.8:18774");
  });

  it("preserves an IPv6 same-origin Gateway", () => {
    expect(resolveRuntimeUrl({ origin: "http://[::1]:18774" })).toBe("http://[::1]:18774");
  });
});
