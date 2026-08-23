import { describe, expect, it } from "vitest";
import { sourceFocusDocumentLine, sourceLanguageName } from "./SourceCodeEditor";
import type { SourceSnapshot } from "../types";

describe("sourceLanguageName", () => {
  it("uses CodeMirror language data for common workspace files", () => {
    expect(sourceLanguageName("src/App.tsx")).toBe("TSX");
    expect(sourceLanguageName("internal/main.go")).toBe("Go");
    expect(sourceLanguageName("Sources/Reader.swift")).toBe("Swift");
    expect(sourceLanguageName("queries/report.sql")).toBe("SQL");
    expect(sourceLanguageName("assets/unknown.bin")).toBe("Plain Text");
  });
});

describe("sourceFocusDocumentLine", () => {
  const snapshot: SourceSnapshot = {
    project_id: "project-1",
    path: "src/App.tsx",
    content: "line 40\nline 41\nline 42\nline 43\nline 44",
    start_line: 40,
    end_line: 44,
    total_lines: 100,
    focus_line: 42,
    truncated: true,
    sha256: "abc",
    modified_at: "2026-08-22T00:00:00Z",
  };

  it("maps the absolute focus line into a truncated editor document", () => {
    expect(sourceFocusDocumentLine(snapshot)).toBe(3);
    expect(sourceFocusDocumentLine({ ...snapshot, focus_line: 1 })).toBe(1);
    expect(sourceFocusDocumentLine({ ...snapshot, focus_line: 999 })).toBe(5);
  });
});
