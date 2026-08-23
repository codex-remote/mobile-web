import { describe, expect, it } from "vitest";
import { RuntimeRequestError, runtimeFailureFromError } from "./runtimeFailure";

describe("runtimeFailureFromError", () => {
  it("explains timeouts with the configured endpoint", () => {
    const failure = runtimeFailureFromError(
      new RuntimeRequestError("Run Server 连接超时", "timeout"),
      "http://192.168.1.8:18775",
    );

    expect(failure.title).toBe("Run Server 响应超时");
    expect(failure.detail).toContain("192.168.1.8:18775");
    expect(failure.technicalDetail).toBe("CONNECTION_TIMEOUT");
  });

  it("distinguishes authentication failures from network failures", () => {
    const failure = runtimeFailureFromError(
      new RuntimeRequestError("token expired", "unauthorized", 401, "UNAUTHORIZED"),
      "https://runtime.example.com",
    );

    expect(failure.title).toBe("连接凭证无效");
    expect(failure.action).toContain("Access Token");
    expect(failure.technicalDetail).toBe("UNAUTHORIZED / HTTP 401");
  });
});
