import type { ApiRun, SessionSnapshot } from "../types";

export type CachedSessionDetail = {
  session: SessionSnapshot["session"];
  runs: ApiRun[];
  snapshotSessionSequence: number;
  cachedAt: number;
};

export type SessionDetailLoader = {
  getSession(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot>;
  getRun(runId: string, signal?: AbortSignal): Promise<ApiRun>;
};

export interface SessionDetailStore {
  get(key: string): Promise<CachedSessionDetail | null>;
  put(key: string, value: CachedSessionDetail): Promise<void>;
  delete(key: string): Promise<void>;
}

type MemoryEntry = {
  detail?: CachedSessionDetail;
  inFlight?: Promise<CachedSessionDetail>;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DATABASE_NAME = "codex-remote-session-details";
const STORE_NAME = "details";
const MAX_ENTRIES = 20;
const MAX_BYTES = 20 * 1024 * 1024;

export class SessionDetailCache {
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly runs = new Map<string, ApiRun>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly store: SessionDetailStore = createIndexedDbSessionDetailStore(),
    private readonly now: () => number = Date.now,
  ) {}

  peek(baseUrl: string, sessionId: string): CachedSessionDetail | undefined {
    const key = cacheKey(baseUrl, sessionId);
    const entry = this.memory.get(key);
    if (entry?.detail && !entry.inFlight) {
      this.memory.delete(key);
      this.memory.set(key, entry);
    }
    return entry?.detail;
  }

  async restore(baseUrl: string, sessionId: string): Promise<CachedSessionDetail | undefined> {
    const key = cacheKey(baseUrl, sessionId);
    const memoryDetail = this.memory.get(key)?.detail;
    if (memoryDetail) return memoryDetail;

    try {
      const stored = await this.store.get(key);
      if (!stored) return undefined;
      if (this.now() - stored.cachedAt > CACHE_TTL_MS) {
        await this.store.delete(key);
        return undefined;
      }
      this.remember(key, stored);
      return stored;
    } catch {
      return undefined;
    }
  }

  load(baseUrl: string, sessionId: string, loader: SessionDetailLoader, signal?: AbortSignal): Promise<CachedSessionDetail> {
    const key = cacheKey(baseUrl, sessionId);
    const existing = this.memory.get(key);
    if (existing?.inFlight) return existing.inFlight;
    const generation = this.generations.get(key) ?? 0;

    const request = this.fetchDetail(baseUrl, sessionId, loader, signal)
      .then((detail) => {
        if ((this.generations.get(key) ?? 0) !== generation) return detail;
        this.remember(key, detail);
        if (detail.runs.every((run) => isTerminalRun(run.status))) {
          void this.store.put(key, detail).catch(() => undefined);
        }
        return detail;
      })
      .finally(() => {
        const current = this.memory.get(key);
        if (current?.inFlight === request) {
          this.memory.set(key, current.detail ? { detail: current.detail } : {});
        }
        if (!this.memory.get(key)?.inFlight && (this.generations.get(key) ?? 0) !== generation) {
          this.generations.delete(key);
        }
      });

    this.memory.set(key, { ...existing, inFlight: request });
    return request;
  }

  prime(baseUrl: string, detail: CachedSessionDetail): void {
    const key = cacheKey(baseUrl, detail.session.session_id);
    this.remember(key, detail);
    if (detail.runs.every((run) => isTerminalRun(run.status))) {
      void this.store.put(key, detail).catch(() => undefined);
    }
  }

  remove(baseUrl: string, sessionId: string): void {
    const key = cacheKey(baseUrl, sessionId);
    if (this.memory.get(key)?.inFlight) this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    else this.generations.delete(key);
    this.removeMemoryEntry(key);
    void this.store.delete(key).catch(() => undefined);
  }

  private async fetchDetail(baseUrl: string, sessionId: string, loader: SessionDetailLoader, signal?: AbortSignal): Promise<CachedSessionDetail> {
    const snapshot = await loader.getSession(sessionId, signal);
    const runs = await Promise.all((snapshot.runs ?? []).map(async (summary) => {
      const key = runKey(baseUrl, summary.run_id);
      const cached = this.runs.get(key);
      if (cached && canReuseRun(cached, summary)) return cached;
      return loader.getRun(summary.run_id, signal);
    }));
    return {
      session: snapshot.session,
      runs,
      snapshotSessionSequence: snapshot.snapshot_session_sequence,
      cachedAt: this.now(),
    };
  }

  private remember(key: string, detail: CachedSessionDetail): void {
    const inFlight = this.memory.get(key)?.inFlight;
    this.memory.delete(key);
    this.memory.set(key, { detail, inFlight });
    const separator = key.lastIndexOf("::");
    const baseUrl = separator >= 0 ? key.slice(0, separator) : "";
    for (const run of detail.runs) this.runs.set(runKey(baseUrl, run.run_id), run);
    while (this.memory.size > MAX_ENTRIES) {
      const oldest = [...this.memory].find(([, entry]) => !entry.inFlight)?.[0];
      if (!oldest) break;
      this.removeMemoryEntry(oldest);
    }
  }

  private removeMemoryEntry(key: string): void {
    const detail = this.memory.get(key)?.detail;
    this.memory.delete(key);
    if (!detail) return;
    const separator = key.lastIndexOf("::");
    const baseUrl = separator >= 0 ? key.slice(0, separator) : "";
    for (const run of detail.runs) this.runs.delete(runKey(baseUrl, run.run_id));
  }
}

export function needsSessionDetailRefresh(detail: CachedSessionDetail, catalogSequence: number): boolean {
  return detail.snapshotSessionSequence < catalogSequence || detail.runs.some((run) => !isTerminalRun(run.status));
}

function canReuseRun(cached: ApiRun, summary: ApiRun): boolean {
  return isTerminalRun(cached.status)
    && isTerminalRun(summary.status)
    && cached.status === summary.status
    && cached.persisted_through_sequence === summary.persisted_through_sequence
    && cached.final_sequence === summary.final_sequence;
}

function isTerminalRun(status: string): boolean {
  return ["completed", "failed", "canceled", "cancelled", "interrupted"].includes(status.toLowerCase());
}

function cacheKey(baseUrl: string, sessionId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}::${sessionId}`;
}

function runKey(baseUrl: string, runId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}::${runId}`;
}

type StoredRecord = {
  key: string;
  value: CachedSessionDetail;
  byteSize: number;
  accessedAt: number;
};

function createIndexedDbSessionDetailStore(): SessionDetailStore {
  if (typeof indexedDB === "undefined") return noopStore;
  return {
    async get(key) {
      const database = await openDatabase();
      const record = await requestResult<StoredRecord | undefined>(database.transaction(STORE_NAME).objectStore(STORE_NAME).get(key));
      if (!record) return null;
      record.accessedAt = Date.now();
      void writeRecord(database, record).catch(() => undefined);
      return record.value;
    },
    async put(key, value) {
      const database = await openDatabase();
      await writeRecord(database, { key, value, byteSize: JSON.stringify(value).length * 2, accessedAt: Date.now() });
      await pruneStore(database);
    },
    async delete(key) {
      const database = await openDatabase();
      await transactionDone(database.transaction(STORE_NAME, "readwrite"), (store) => { store.delete(key); });
    },
  };
}

const noopStore: SessionDetailStore = {
  get: async () => null,
  put: async () => undefined,
  delete: async () => undefined,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord(database: IDBDatabase, record: StoredRecord): Promise<void> {
  return transactionDone(database.transaction(STORE_NAME, "readwrite"), (store) => { store.put(record); });
}

function transactionDone(transaction: IDBTransaction, operation: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function pruneStore(database: IDBDatabase): Promise<void> {
  const records = await requestResult<StoredRecord[]>(database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll());
  records.sort((left, right) => right.accessedAt - left.accessedAt);
  let bytes = 0;
  const expiredKeys = records.flatMap((record, index) => {
    bytes += record.byteSize;
    return index >= MAX_ENTRIES || bytes > MAX_BYTES ? [record.key] : [];
  });
  if (expiredKeys.length === 0) return;
  await transactionDone(database.transaction(STORE_NAME, "readwrite"), (store) => {
    for (const key of expiredKeys) store.delete(key);
  });
}
