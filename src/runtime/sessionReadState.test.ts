import { describe, expect, it } from "vitest";
import type { ApiSession } from "../types";
import {
  baselineSessionReadState,
  isSessionUnread,
  loadSessionReadState,
  markSessionRead,
  saveSessionReadState,
  type SessionReadState,
} from "./sessionReadState";

describe("sessionReadState", () => {
  it("baselines existing historical sessions as read once", () => {
    const initial = baselineSessionReadState({ initialized: false, cursors: {} }, [session("one", 7)]);
    const unchanged = baselineSessionReadState(initial, [session("one", 9), session("two", 4)]);

    expect(initial).toEqual({ initialized: true, cursors: { one: 7 } });
    expect(unchanged).toBe(initial);
  });

  it("marks only a newer completed session unread", () => {
    const state: SessionReadState = { initialized: true, cursors: { one: 3 } };

    expect(isSessionUnread(state, "one", 4, "completed")).toBe(true);
    expect(isSessionUnread(state, "one", 3, "completed")).toBe(false);
    expect(isSessionUnread(state, "one", 4, "running")).toBe(false);
    expect(isSessionUnread(state, "one", 4, "canceled")).toBe(false);
  });

  it("advances the cursor when a session is opened and never moves it backward", () => {
    const initial: SessionReadState = { initialized: true, cursors: { one: 5 } };

    expect(markSessionRead(initial, "one", 4)).toBe(initial);
    expect(markSessionRead(initial, "one", 8)).toEqual({ initialized: true, cursors: { one: 8 } });
  });

  it("persists valid cursors and recovers from invalid storage", () => {
    let value = "";
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => { value = next; },
    };
    saveSessionReadState({ initialized: true, cursors: { one: 3 } }, storage);
    expect(loadSessionReadState(storage)).toEqual({ initialized: true, cursors: { one: 3 } });

    value = "not-json";
    expect(loadSessionReadState(storage)).toEqual({ initialized: false, cursors: {} });
  });
});

function session(id: string, sequence: number): ApiSession {
  return {
    session_id: id,
    project_id: "project-1",
    title: id,
    last_session_sequence: sequence,
    latest_run_status: "completed",
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
  };
}
