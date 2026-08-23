import type { ApiSession } from "../types";

const selectedSessionStorageKey = "codex-remote.selected-session-id.v1";

type SessionLocation = Pick<Location, "pathname" | "search" | "hash">;
type SessionHistory = Pick<History, "state" | "replaceState">;
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function retainSelectedSessionId(current: string, sessions: ApiSession[]): string {
  return current || sessions[0]?.session_id || "";
}

export function loadSelectedSessionId(location: Pick<Location, "search">, storage: SessionStorage): string {
  const fromUrl = validSessionId(new URLSearchParams(location.search).get("session"));
  if (fromUrl) return fromUrl;
  try {
    return validSessionId(storage.getItem(selectedSessionStorageKey));
  } catch {
    return "";
  }
}

export function persistSelectedSessionId(
  sessionId: string,
  location: SessionLocation,
  history: SessionHistory,
  storage: SessionStorage,
): void {
  const selected = validSessionId(sessionId);
  try {
    if (selected) storage.setItem(selectedSessionStorageKey, selected);
    else storage.removeItem(selectedSessionStorageKey);
  } catch {
    // URL persistence remains available when browser storage is unavailable.
  }

  const nextHref = sessionLocationHref(location, selected);
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) history.replaceState(history.state, "", nextHref);
}

export function sessionLocationHref(location: SessionLocation, sessionId: string): string {
  const query = new URLSearchParams(location.search);
  const selected = validSessionId(sessionId);
  if (selected) query.set("session", selected);
  else query.delete("session");
  const search = query.toString();
  return `${location.pathname || "/"}${search ? `?${search}` : ""}${location.hash}`;
}

function validSessionId(value: string | null): string {
  const selected = value?.trim() ?? "";
  return selected.length <= 512 ? selected : "";
}
