import { describe, expect, it, vi } from "vitest";
import type { ApiRun, ApiSession, SessionSnapshot } from "../types";
import { needsSessionDetailRefresh, SessionDetailCache, type SessionDetailStore } from "./sessionDetailCache";

describe("SessionDetailCache", () => {
  it("deduplicates concurrent detail loads", async () => {
    const pending = deferred<SessionSnapshot>();
    const loader = { getSession: vi.fn(() => pending.promise), getRun: vi.fn() };
    const cache = new SessionDetailCache(memoryStore());

    const first = cache.load("https://runtime.example", "s1", loader);
    const second = cache.load("https://runtime.example", "s1", loader);
    pending.resolve(snapshot([]));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(loader.getSession).toHaveBeenCalledTimes(1);
  });

  it("reuses completed runs but refreshes active runs", async () => {
    const completed = run("done", "completed", 3);
    const active = run("live", "running", 2);
    const loader = {
      getSession: vi.fn()
        .mockResolvedValueOnce(snapshot([completed, active], 2))
        .mockResolvedValueOnce(snapshot([completed, active], 3)),
      getRun: vi.fn(async (runSummary: string) => runSummary === "done" ? completed : active),
    };
    const cache = new SessionDetailCache(memoryStore());

    await cache.load("https://runtime.example", "s1", loader);
    await cache.load("https://runtime.example", "s1", loader);

    expect(loader.getRun.mock.calls.map(([id]) => id)).toEqual(["done", "live", "live"]);
  });

  it("restores a fresh terminal snapshot and identifies stale catalog sequences", async () => {
    const detail = { session: session(), runs: [run("done", "completed", 2)], snapshotSessionSequence: 7, cachedAt: 1_000 };
    const store = memoryStore({ "https://runtime.example::s1": detail });
    const cache = new SessionDetailCache(store, () => 2_000);

    await expect(cache.restore("https://runtime.example/", "s1")).resolves.toEqual(detail);
    expect(needsSessionDetailRefresh(detail, 7)).toBe(false);
    expect(needsSessionDetailRefresh(detail, 8)).toBe(true);
  });

  it("treats active cached runs as stale even when the catalog sequence matches", () => {
    const detail = { session: session(), runs: [run("live", "running", 7)], snapshotSessionSequence: 7, cachedAt: 1_000 };

    expect(needsSessionDetailRefresh(detail, 7)).toBe(true);
  });

  it("namespaces memory entries by Runtime URL and purges removed sessions", async () => {
    const store = memoryStore();
    const cache = new SessionDetailCache(store);
    const first = { getSession: vi.fn(async () => snapshot([], 4)), getRun: vi.fn() };
    const second = { getSession: vi.fn(async () => snapshot([], 9)), getRun: vi.fn() };

    await cache.load("https://runtime-a.example", "s1", first);
    await cache.load("https://runtime-b.example", "s1", second);
    cache.remove("https://runtime-a.example", "s1");

    expect(cache.peek("https://runtime-a.example", "s1")).toBeUndefined();
    expect(cache.peek("https://runtime-b.example", "s1")?.snapshotSessionSequence).toBe(9);
    await expect(cache.restore("https://runtime-a.example", "s1")).resolves.toBeUndefined();
  });

  it("does not resurrect an archived session when its request resolves late", async () => {
    const pending = deferred<SessionSnapshot>();
    const store = memoryStore();
    const cache = new SessionDetailCache(store);
    const loading = cache.load("https://runtime.example", "s1", { getSession: () => pending.promise, getRun: vi.fn() });

    cache.remove("https://runtime.example", "s1");
    pending.resolve(snapshot([]));
    await loading;

    expect(cache.peek("https://runtime.example", "s1")).toBeUndefined();
    await expect(store.get("https://runtime.example::s1")).resolves.toBeNull();
  });

  it("falls back to memory when persistent storage fails", async () => {
    const failingStore: SessionDetailStore = {
      get: async () => { throw new Error("IndexedDB unavailable"); },
      put: async () => { throw new Error("IndexedDB unavailable"); },
      delete: async () => { throw new Error("IndexedDB unavailable"); },
    };
    const cache = new SessionDetailCache(failingStore);
    const loader = { getSession: vi.fn(async () => snapshot([])), getRun: vi.fn() };

    const loaded = await cache.load("https://runtime.example", "s1", loader);
    expect(cache.peek("https://runtime.example", "s1")).toEqual(loaded);
    await expect(cache.restore("https://runtime.example", "missing")).resolves.toBeUndefined();
    expect(() => cache.remove("https://runtime.example", "s1")).not.toThrow();
  });

  it("expires persistent snapshots after 24 hours", async () => {
    const detail = { session: session(), runs: [], snapshotSessionSequence: 7, cachedAt: 1_000 };
    const store = memoryStore({ "https://runtime.example::s1": detail });
    const cache = new SessionDetailCache(store, () => 24 * 60 * 60 * 1_000 + 1_001);

    await expect(cache.restore("https://runtime.example", "s1")).resolves.toBeUndefined();
    await expect(store.get("https://runtime.example::s1")).resolves.toBeNull();
  });

  it("persists only complete terminal snapshots", async () => {
    const store = memoryStore();
    const cache = new SessionDetailCache(store);
    const active = { getSession: vi.fn(async () => snapshot([run("live", "running", 2)])), getRun: vi.fn(async () => run("live", "running", 2)) };
    const complete = { getSession: vi.fn(async () => snapshot([run("done", "completed", 3)])), getRun: vi.fn(async () => run("done", "completed", 3)) };

    await cache.load("https://runtime.example", "active", active);
    await cache.load("https://runtime.example", "complete", complete);

    await expect(store.get("https://runtime.example::active")).resolves.toBeNull();
    await expect(store.get("https://runtime.example::complete")).resolves.not.toBeNull();
  });
});

function memoryStore(initial: Record<string, any> = {}): SessionDetailStore {
  const values = new Map(Object.entries(initial));
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

function session(): ApiSession {
  return { session_id: "s1", project_id: "p1", title: "Session", last_session_sequence: 7, created_at: "", updated_at: "" };
}

function run(runId: string, status: string, sequence: number): ApiRun {
  return { run_id: runId, session_id: "s1", status, persisted_through_sequence: sequence, final_sequence: sequence, created_at: "" };
}

function snapshot(runs: ApiRun[], sequence = 7): SessionSnapshot {
  return { session: session(), runs, snapshot_session_sequence: sequence, agent_presence: "online" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
