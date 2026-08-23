import { afterEach, describe, expect, it, vi } from "vitest";
import { historySyncCompletionMessage, syncHistoryFromAgent } from "./runtime/historySync";
import type { RuntimeClient } from "./runtime/RuntimeClient";
import type { BootstrapSyncJob } from "./types";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  vi.useRealTimers();
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("history synchronization reconciliation", () => {
  it("starts one fresh job after a resumed import completes without reconciliation", async () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    let starts = 0;
    const client = {
      startBootstrap: vi.fn(async () => `sync-${++starts}`),
      getBootstrap: vi.fn(async (syncId: string) => completedJob(syncId, syncId === "sync-2")),
    } as unknown as RuntimeClient;

    const resultPromise = syncHistoryFromAgent(client, new AbortController().signal, vi.fn(), vi.fn());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(client.startBootstrap).toHaveBeenCalledTimes(2);
    expect(result.sync_id).toBe("sync-2");
    expect(result.reconciliation_applied).toBe(true);
    expect(values.has("codex-remote.history-sync-idempotency-key")).toBe(false);
  });

  it("reports project and session reconciliation separately", () => {
    expect(historySyncCompletionMessage(true, 1, 2)).toBe("已隐藏 1 个项目、2 个会话");
    expect(historySyncCompletionMessage(false, 0, 0)).toContain("下次同步重试");
  });
});

function completedJob(syncId: string, reconciled: boolean): BootstrapSyncJob {
  return {
    sync_id: syncId,
    status: "completed",
    last_committed_batch_no: 1,
    item_count: 0,
    reconciliation_applied: reconciled,
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:01Z",
  };
}
