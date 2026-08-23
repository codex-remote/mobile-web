import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRuntimeClient } from "./httpRuntimeClient";

describe("HttpRuntimeClient connection failures", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts an unresponsive request after eight seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const client = new HttpRuntimeClient("http://127.0.0.1:18775", "");

    const rejection = expect(client.listProjects()).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(8_000);

    await rejection;
  });

  it("classifies a browser network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const client = new HttpRuntimeClient("http://127.0.0.1:18775", "");

    await expect(client.listProjects()).rejects.toMatchObject({ kind: "network" });
  });

  it("preserves an authentication response code and message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      success: false,
      error: { code: "TOKEN_EXPIRED", message: "Access token expired" },
    }), { status: 401, headers: { "Content-Type": "application/json" } }))));
    const client = new HttpRuntimeClient("https://runtime.example.com", "expired");

    await expect(client.listProjects()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
      code: "TOKEN_EXPIRED",
      message: "Access token expired",
    });
  });

  it("uses the HTTP status when an upstream returns a non-JSON error page", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("Bad gateway", { status: 502 }))));
    const client = new HttpRuntimeClient("https://runtime.example.com", "");

    await expect(client.listProjects()).rejects.toMatchObject({ kind: "server", status: 502, code: "HTTP_502" });
  });

  it("refreshes once and retries a Runtime request after 401", async () => {
    let token = "expired";
    const refresh = vi.fn(async () => {
      token = "fresh";
      return token;
    });
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer expired") {
        return Promise.resolve(new Response(JSON.stringify({ success: false, error: { code: "AUTH_ACCESS_EXPIRED", message: "expired" } }), { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: { items: [], agent_presence: "online" } }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpRuntimeClient("", { getAccessToken: () => token, refresh });

    await expect(client.listProjects()).resolves.toEqual({ items: [], agentPresence: "online" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
