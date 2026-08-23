import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Session, SessionStatus } from "../types";
import { SessionListStatusIcon, SessionStatusIcon, sessionListState } from "./SessionStatusIcon";

function session(status: SessionStatus, hasLatestRun = true): Pick<Session, "status" | "messages" | "hasLatestRun"> {
  return {
    status,
    hasLatestRun,
    messages: hasLatestRun ? [{ id: "message-1", role: "user", content: "test", createdAt: "10:00" }] : [],
  };
}

describe("SessionStatusIcon", () => {
  it.each([
    ["queued", "clock-3"],
    ["accepted", "circle-dot"],
    ["running", "loader-circle"],
    ["waiting", "circle-pause"],
    ["completed", "circle-check"],
    ["failed", "circle-x"],
    ["canceled", "circle-stop"],
  ] satisfies [SessionStatus, string][])("renders a distinct %s status icon", (status, iconName) => {
    const html = renderToStaticMarkup(<SessionStatusIcon status={status} />);

    expect(html).toContain(`lucide-${iconName}`);
    expect(html).toContain(`session-status-icon-${status}`);
  });

  it("animates only the running session icon", () => {
    const running = renderToStaticMarkup(<SessionStatusIcon status="running" />);
    const waiting = renderToStaticMarkup(<SessionStatusIcon status="waiting" />);

    expect(running).toContain("status-loading-icon");
    expect(waiting).not.toContain("status-loading-icon");
  });

  it.each([
    ["queued", "running"],
    ["accepted", "running"],
    ["running", "running"],
    ["waiting", "running"],
    ["completed", "completed"],
    ["failed", "interrupted"],
    ["canceled", "interrupted"],
  ] satisfies [SessionStatus, ReturnType<typeof sessionListState>][])('maps the latest %s run to the "%s" list state', (status, expected) => {
    expect(sessionListState(session(status))).toBe(expected);
  });

  it("leaves sessions without a latest run blank", () => {
    const emptySession = session("waiting", false);
    const html = renderToStaticMarkup(<SessionListStatusIcon session={emptySession} />);

    expect(sessionListState(emptySession)).toBe("empty");
    expect(html).toContain("session-list-status-placeholder");
    expect(html).not.toContain("<svg");
  });

  it.each([
    ["running", "loader-circle"],
    ["failed", "circle-alert"],
    ["canceled", "circle-alert"],
  ] satisfies [SessionStatus, string][])("renders the latest %s run with %s", (status, iconName) => {
    const html = renderToStaticMarkup(<SessionListStatusIcon session={session(status)} />);

    expect(html).toContain(`lucide-${iconName}`);
  });

  it("leaves the completed list status slot blank", () => {
    const html = renderToStaticMarkup(<SessionListStatusIcon session={session("completed")} />);

    expect(html).toContain("session-list-status-placeholder");
    expect(html).not.toContain("<svg");
  });
});
