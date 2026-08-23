import type { InspectorEvent, BootstrapSyncJob } from "../types";
import { createClientId } from "./clientId";
import type { RuntimeClient } from "./RuntimeClient";

export async function syncHistoryFromAgent(
  client: RuntimeClient,
  signal: AbortSignal,
  recordEvent: (direction: InspectorEvent["direction"], type: string, summary: string) => void,
  onProgress: (job: BootstrapSyncJob) => void,
): Promise<BootstrapSyncJob> {
  const keyName = "codex-remote.history-sync-idempotency-key";
  localStorage.removeItem("codex-remote.bootstrap-idempotency-key");
  for (let reconciliationAttempt = 0; reconciliationAttempt < 2; reconciliationAttempt++) {
    const key = localStorage.getItem(keyName) || createClientId();
    localStorage.setItem(keyName, key);
    recordEvent("up", "history.sync.start", reconciliationAttempt === 0 ? "Mac Agent" : "Mac Agent · 完整对账重试");
    const syncId = await client.startBootstrap(key, signal);
    let retryReconciliation = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      await delay(500, signal);
      const job = await client.getBootstrap(syncId, signal);
      onProgress(job);
      if (job.status === "completed") {
        localStorage.removeItem(keyName);
        recordEvent("down", "history.sync.completed", syncId);
        if (job.reconciliation_applied === false && reconciliationAttempt === 0) {
          retryReconciliation = true;
          recordEvent("system", "history.sync.reconciliation.retry", "断连续传仅完成导入，启动完整对账");
          break;
        }
        return job;
      }
      if (job.status === "failed") {
        localStorage.removeItem(keyName);
        throw new Error(job.error_message || "历史会话同步失败");
      }
    }
    if (retryReconciliation) continue;
    throw new Error("历史会话同步超时");
  }
  throw new Error("历史会话删除对账未完成");
}

export function historySyncCompletionMessage(reconciled: boolean | undefined, archivedProjects: number, archivedSessions: number): string {
  if (reconciled === false) return "历史已导入，删除对账将在下次同步重试";
  const hidden: string[] = [];
  if (archivedProjects > 0) hidden.push(`${archivedProjects} 个项目`);
  if (archivedSessions > 0) hidden.push(`${archivedSessions} 个会话`);
  return hidden.length > 0 ? `已隐藏 ${hidden.join("、")}` : "项目与会话已是最新";
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("The operation was aborted", "AbortError"));
    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
