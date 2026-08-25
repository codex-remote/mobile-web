import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRuntimeClient } from "./httpRuntimeClient";
import { resolveRuntimeTransportMode } from "./RuntimeClient";

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

  it("reads a JSON event batch through the polling transport", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
      return Promise.resolve(new Response(JSON.stringify({
        success: true,
        data: {
          events: [{ id: "4", type: "assistant.delta", run_id: "run-1", delta: "hello" }],
          next_cursor: 4,
          has_more: false,
          timed_out: false,
          terminal: true,
          status: "completed",
        },
        meta: { schema_version: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpRuntimeClient("https://runtime.example.com", "token", "poll");

    const events = [];
    for await (const event of client.watchRun("run-1", 3)) events.push(event);

    expect(events).toEqual([{ id: "4", type: "assistant.delta", run_id: "run-1", runId: "run-1", delta: "hello" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://runtime.example.com/v1/runtime/runs/run-1/events:poll?after=3&wait_ms=15000&limit=100",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("continues polling after an empty timeout without yielding a synthetic event", async () => {
    const responses = [
      { events: [], next_cursor: 3, has_more: false, timed_out: true, terminal: false, status: "running" },
      { events: [{ id: "4", type: "turn.completed", run_id: "run-1" }], next_cursor: 4, has_more: false, timed_out: false, terminal: true, status: "completed" },
    ];
    const fetchMock = vi.fn((_url: string) => Promise.resolve(new Response(JSON.stringify({
      success: true,
      data: responses.shift(),
      meta: { schema_version: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpRuntimeClient("https://runtime.example.com", "token", "poll");

    const events = [];
    for await (const event of client.watchRun("run-1", 3)) events.push(event);

    expect(events.map((event) => event.type)).toEqual(["turn.completed"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://runtime.example.com/v1/runtime/runs/run-1/events:poll?after=3&wait_ms=15000&limit=100",
      "https://runtime.example.com/v1/runtime/runs/run-1/events:poll?after=3&wait_ms=15000&limit=100",
    ]);
  });

  it("advances the polling cursor across bounded event batches", async () => {
    const responses = [
      { events: [{ id: "4", type: "assistant.delta", run_id: "run-1", delta: "a" }], next_cursor: 4, has_more: true, timed_out: false, terminal: false, status: "running" },
      { events: [{ id: "5", type: "turn.completed", run_id: "run-1" }], next_cursor: 5, has_more: false, timed_out: false, terminal: true, status: "completed" },
    ];
    const fetchMock = vi.fn((_url: string) => Promise.resolve(new Response(JSON.stringify({
      success: true,
      data: responses.shift(),
      meta: { schema_version: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpRuntimeClient("https://runtime.example.com", "token", "poll");

    const events = [];
    for await (const event of client.watchRun("run-1", 3)) events.push(event);

    expect(events.map((event) => event.id)).toEqual(["4", "5"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://runtime.example.com/v1/runtime/runs/run-1/events:poll?after=3&wait_ms=15000&limit=100",
      "https://runtime.example.com/v1/runtime/runs/run-1/events:poll?after=4&wait_ms=15000&limit=100",
    ]);
  });

  it("preserves the existing SSE watch path", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(
      "id: 5\nevent: turn.completed\ndata: {\"type\":\"turn.completed\",\"run_id\":\"run-1\"}\n\n",
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpRuntimeClient("https://runtime.example.com", "token", "sse");

    const events = [];
    for await (const event of client.watchRun("run-1", 4)) events.push(event);

    expect(events.map((event) => event.type)).toEqual(["turn.completed"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://runtime.example.com/v1/runtime/runs/run-1/events?after=4",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("Runtime transport entry selection", () => {
  it("uses the build-selected transport without a route-specific override", () => {
    expect(resolveRuntimeTransportMode()).toBe("sse");
  });
});
