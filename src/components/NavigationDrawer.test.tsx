import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavigationDrawer } from "./NavigationDrawer";

const noOp = () => undefined;

describe("NavigationDrawer", () => {
  it("keeps presence and the sync action on the Mac row", () => {
    const html = renderToStaticMarkup(
      <NavigationDrawer
        open
        projects={[{ id: "project-1", name: "Mobile Web", path: "/workspace/mobile-web", accent: "#3d619f", updatedLabel: "" }]}
        sessions={[]}
        selectedSessionId=""
        onSelectSession={noOp}
        onNewSession={noOp}
        creatingProjectId=""
        historySyncState={{ status: "syncing", processed: 3, total: 10, archived: 0, archivedProjects: 0, message: "正在同步" }}
        onSyncHistory={noOp}
        onClose={noOp}
        onOpenInspector={noOp}
        agentOnline
      />,
    );

    expect(html).toContain('class="presence-dot " aria-label="在线"');
    expect(html).not.toContain(">项目同步<");
    expect(html).toContain('aria-label="正在同步历史会话"');
    expect(html).toContain('aria-label="历史会话同步进度"');
    expect(html).not.toContain("Run Server ·");
    expect(html).toContain('src="/brand-mark.png"');
    expect(html.indexOf("Lee 的 MacBook Pro")).toBeLessThan(html.indexOf('aria-label="正在同步历史会话"'));
    expect(html.indexOf('aria-label="正在同步历史会话"')).toBeLessThan(html.indexOf('aria-label="在线"'));
  });

  it("marks a successful sync message for automatic dismissal", () => {
    const html = renderToStaticMarkup(
      <NavigationDrawer
        open
        projects={[]}
        sessions={[]}
        selectedSessionId=""
        onSelectSession={noOp}
        onNewSession={noOp}
        creatingProjectId=""
        historySyncState={{ status: "completed", processed: 10, total: 10, archived: 0, archivedProjects: 0, message: "项目与会话已是最新" }}
        onSyncHistory={noOp}
        onClose={noOp}
        onOpenInspector={noOp}
        agentOnline
      />,
    );

    expect(html).toContain("agent-panel-completed");
    expect(html).toContain("项目与会话已是最新");
  });

  it("shows the offline presence state without restoring transport copy", () => {
    const html = renderToStaticMarkup(
      <NavigationDrawer
        open
        projects={[]}
        sessions={[]}
        selectedSessionId=""
        onSelectSession={noOp}
        onNewSession={noOp}
        creatingProjectId=""
        historySyncState={{ status: "idle", processed: 0, total: 0, archived: 0, archivedProjects: 0, message: "" }}
        onSyncHistory={noOp}
        onClose={noOp}
        onOpenInspector={noOp}
        agentOnline={false}
      />,
    );

    expect(html).toContain("presence-dot-offline");
    expect(html).toContain('aria-label="离线"');
    expect(html).not.toContain("Run Server ·");
    expect(html).not.toContain('class="agent-copy"><strong>Lee 的 MacBook Pro</strong><small>');
  });
});
