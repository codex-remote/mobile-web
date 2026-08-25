import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RuntimeFailure } from "../runtime/runtimeFailure";
import { ConnectionOverlay } from "./ConnectionOverlay";

const failure: RuntimeFailure = {
  kind: "timeout",
  title: "Run Server 响应超时",
  detail: "127.0.0.1:18775 在规定时间内没有响应。",
  action: "检查服务进程。",
  technicalDetail: "CONNECTION_TIMEOUT",
};

describe("ConnectionOverlay", () => {
  it("shows a concise full-overlay connection state while the initial request is pending", () => {
    const html = renderToStaticMarkup(
      <ConnectionOverlay
        state="checking"
        failure={null}
        nextRetryAt={null}
        onRetry={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    expect(html).toContain("正在连接 Run Server");
    expect(html).toContain("请稍候");
    expect(html).toContain("connection-overlay-content");
    expect(html).not.toContain("connection-overlay-panel");
    expect(html).not.toContain("connection-route");
  });

  it("shows a minimal disconnected state with recovery actions", () => {
    const html = renderToStaticMarkup(
      <ConnectionOverlay
        state="failed"
        failure={failure}
        nextRetryAt={Date.now() + 3_000}
        onRetry={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    expect(html).toContain("role=\"alertdialog\"");
    expect(html).toContain("Run Server 已断开");
    expect(html).toMatch(/[123] 秒后重试/);
    expect(html).toContain("aria-label=\"立即重试\"");
    expect(html).toContain("aria-label=\"打开连接检查器\"");
    expect(html).not.toContain("CONNECTION_TIMEOUT");
    expect(html).not.toContain(failure.detail);
  });
});
