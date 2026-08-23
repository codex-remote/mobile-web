import { describe, expect, it } from "vitest";
import type { ApiSession } from "../types";
import {
  loadSelectedSessionId,
  persistSelectedSessionId,
  retainSelectedSessionId,
  sessionLocationHref,
} from "./sessionSelection";

const sessions = [session("visible-1"), session("visible-2")];

describe("retained session selection", () => {
  it("keeps a selection that remains visible", () => {
    expect(retainSelectedSessionId("visible-2", sessions)).toBe("visible-2");
  });

  it("does not silently replace a selection missing from the catalog", () => {
    expect(retainSelectedSessionId("archived", sessions)).toBe("archived");
  });

  it("selects the newest visible session only when no selection exists", () => {
    expect(retainSelectedSessionId("", sessions)).toBe("visible-1");
    expect(retainSelectedSessionId("", [])).toBe("");
  });
});

describe("session selection persistence", () => {
  it("prefers the URL over browser storage", () => {
    const storage = memoryStorage({ "codex-remote.selected-session-id.v1": "stored" });
    expect(loadSelectedSessionId({ search: "?session=url-session" }, storage)).toBe("url-session");
  });

  it("restores the browser-local selection when the URL has none", () => {
    const storage = memoryStorage({ "codex-remote.selected-session-id.v1": "stored" });
    expect(loadSelectedSessionId({ search: "" }, storage)).toBe("stored");
  });

  it("persists without dropping the source viewer hash or other query fields", () => {
    const storage = memoryStorage();
    const calls: string[] = [];
    persistSelectedSessionId(
      "session-2",
      { pathname: "/", search: "?mode=test", hash: "#/code?path=src%2FApp.tsx" },
      { state: { source: true }, replaceState: (_state, _unused, href) => calls.push(String(href)) },
      storage,
    );

    expect(storage.getItem("codex-remote.selected-session-id.v1")).toBe("session-2");
    expect(calls).toEqual(["/?mode=test&session=session-2#/code?path=src%2FApp.tsx"]);
  });

  it("removes only the session query when selection is cleared", () => {
    expect(sessionLocationHref({ pathname: "/", search: "?session=old&mode=test", hash: "" }, ""))
      .toBe("/?mode=test");
  });
});

function session(id: string): ApiSession {
  return {
    session_id: id,
    project_id: "project-1",
    title: id,
    last_session_sequence: 0,
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
  };
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}
