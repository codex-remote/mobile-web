import type { ApiSession, SessionStatus } from "../types";

const storageKey = "codex-remote.session-read-state.v1";

export type SessionReadState = {
  initialized: boolean;
  cursors: Record<string, number>;
};

const emptyState: SessionReadState = { initialized: false, cursors: {} };

export function loadSessionReadState(storage: Pick<Storage, "getItem"> = window.localStorage): SessionReadState {
  try {
    const value = storage.getItem(storageKey);
    if (!value) return emptyState;
    const parsed = JSON.parse(value) as Partial<SessionReadState>;
    if (parsed.initialized !== true || !parsed.cursors || typeof parsed.cursors !== "object") return emptyState;
    const cursors = Object.fromEntries(
      Object.entries(parsed.cursors).filter((entry): entry is [string, number] => Number.isFinite(entry[1]) && entry[1] >= 0),
    );
    return { initialized: true, cursors };
  } catch {
    return emptyState;
  }
}

export function saveSessionReadState(state: SessionReadState, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // A disabled or full localStorage must not block the session list.
  }
}

export function baselineSessionReadState(state: SessionReadState, sessions: ApiSession[]): SessionReadState {
  if (state.initialized) return state;
  const cursors = { ...state.cursors };
  for (const session of sessions) cursors[session.session_id] = validSequence(session.last_session_sequence);
  return { initialized: true, cursors };
}

export function markSessionRead(state: SessionReadState, sessionId: string, sequence: number): SessionReadState {
  const nextSequence = validSequence(sequence);
  if (state.initialized && (state.cursors[sessionId] ?? 0) >= nextSequence) return state;
  return { initialized: true, cursors: { ...state.cursors, [sessionId]: nextSequence } };
}

export function isSessionUnread(state: SessionReadState, sessionId: string, sequence: number, status: SessionStatus): boolean {
  return status === "completed" && validSequence(sequence) > (state.cursors[sessionId] ?? 0);
}

function validSequence(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
