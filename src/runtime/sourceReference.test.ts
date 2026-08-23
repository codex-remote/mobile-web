import { describe, expect, it } from "vitest";
import { parseSourceReference, sourceReferenceFromLocation, sourceViewerHref } from "./sourceReference";

describe("source references", () => {
  it("parses absolute, relative, file, and line-anchor references", () => {
    expect(parseSourceReference("/Users/lee/work/mobile-web/src/App.tsx:199")).toEqual({ path: "/Users/lee/work/mobile-web/src/App.tsx", line: 199 });
    expect(parseSourceReference("src/runtime/client.ts#L40")).toEqual({ path: "src/runtime/client.ts", line: 40 });
    expect(parseSourceReference("file:///Users/lee/work/main.go:8:3")).toEqual({ path: "/Users/lee/work/main.go", line: 8 });
    expect(parseSourceReference("main.go:12")).toEqual({ path: "main.go", line: 12 });
    expect(parseSourceReference("/Users/lee/work/Dockerfile:7")).toEqual({ path: "/Users/lee/work/Dockerfile", line: 7 });
  });

  it("does not intercept normal web links or unqualified labels", () => {
    expect(parseSourceReference("https://example.com/src/App.tsx:20")).toBeNull();
    expect(parseSourceReference("README.md")).toBeNull();
    expect(parseSourceReference("javascript:alert(1)")).toBeNull();
    expect(parseSourceReference("custom:src/main.go:9")).toBeNull();
    expect(parseSourceReference("ftp://example.com/src/main.go:9")).toBeNull();
  });

  it("round trips the same-host viewer location", () => {
    const href = sourceViewerHref("project-1", { path: "src/App.tsx", line: 19 }, "?session=session-1");
    expect(href).toContain("?session=session-1#/code?");
    expect(sourceReferenceFromLocation({ hash: href.slice(href.indexOf("#")) } as Location)).toEqual({
      projectId: "project-1", path: "src/App.tsx", line: 19,
    });
  });
});
