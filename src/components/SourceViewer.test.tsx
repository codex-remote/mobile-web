import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeClient } from "../runtime/RuntimeClient";
import { SourceViewer } from "./SourceViewer";

describe("SourceViewer", () => {
  it("opens as a full viewer with readable defaults and an explicit close action", () => {
    const client = { getProjectSource: vi.fn() } as unknown as RuntimeClient;
    const html = renderToStaticMarkup(
      <SourceViewer
        client={client}
        projectId="project-1"
        projectName="Codex Remote"
        reference={{ path: "src/App.tsx", line: 42 }}
        onClose={() => undefined}
        onOpenConnection={() => undefined}
      />,
    );

    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("aria-modal=\"true\"");
    expect(html).toContain("--source-font-size:8px");
    expect(html).toContain("aria-label=\"返回聚焦行（第 42 行）\"");
    expect(html).toContain("data-testid=\"return-source-focus\"");
    expect(html).toContain("aria-label=\"缩小代码\"");
    expect(html).toContain("aria-label=\"放大代码\"");
    expect(html).toContain("aria-label=\"关闭源码\"");
    expect(html).toContain("data-testid=\"close-source\"");
  });
});
