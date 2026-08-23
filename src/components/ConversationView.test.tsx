import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Session } from "../types";
import { ConversationView } from "./ConversationView";

const session: Session = {
  id: "session-1",
  projectId: "project-1",
  title: "不会重复出现的标题",
  preview: "不会重复出现的预览",
  status: "running",
  updatedLabel: "刚刚",
  messages: [
    { id: "user-1", role: "user", content: "检查查询", createdAt: "20:00" },
    {
      id: "assistant-1",
      role: "assistant",
      content: "## 结果\n\n- 已处理\n\n```sql\nselect 1;\n```",
      createdAt: "20:01",
      startedAt: "2026-08-22T12:00:00Z",
      streaming: true,
      toolSteps: [{
        id: "sql-1",
        kind: "mcpToolCall",
        title: "query_postgres",
        detail: "select 1",
        status: "running",
      }],
    },
  ],
};

describe("ConversationView", () => {
  it("renders final content as Markdown with live activity at its end", () => {
    const html = renderToStaticMarkup(<ConversationView session={session} />);

    expect(html).toContain("<h2>结果</h2>");
    expect(html).toContain("<pre><code class=\"language-sql\">select 1;");
    expect(html).toContain("正在查询 query_postgres");
    expect(html).toContain("data-message-id=\"user-1\" data-message-role=\"user\"");
    expect(html).toContain("已处理");
    expect(html).toContain("message-duration-processing");
    expect(html.indexOf("正在查询 query_postgres")).toBeGreaterThan(html.indexOf("select 1;"));
    expect(html).not.toContain("<details class=\"tool-process tool-process-running\" open");
    expect(html).not.toContain("不会重复出现的预览");
  });

  it("omits empty completed assistant records", () => {
    const html = renderToStaticMarkup(
      <ConversationView
        session={{
          ...session,
          messages: [{ id: "empty", role: "assistant", content: "", createdAt: "20:02" }],
        }}
      />,
    );

    expect(html).not.toContain("message-assistant");
  });

  it("shows an explicit unavailable state instead of a new-conversation prompt", () => {
    const html = renderToStaticMarkup(
      <ConversationView session={{ ...session, title: "会话不可用", messages: [] }} unavailable />,
    );

    expect(html).toContain("不在当前目录");
    expect(html).toContain("无法打开此会话");
    expect(html).toContain("可能已在 Mac 上删除或归档");
    expect(html).not.toContain("从这里开始");
  });

  it("shows a conversation-shaped skeleton instead of the empty-session prompt while loading", () => {
    const html = renderToStaticMarkup(
      <ConversationView session={{ ...session, messages: [] }} detailStatus="loading" />,
    );

    expect(html).toContain("conversation-skeleton");
    expect(html).toContain("正在载入会话");
    expect(html).not.toContain("从这里开始");
    expect(html).not.toContain("等待第一条指令");
  });

  it("shows the new-session prompt only after an empty detail loads successfully", () => {
    const html = renderToStaticMarkup(
      <ConversationView session={{ ...session, messages: [] }} detailStatus="ready" />,
    );

    expect(html).toContain("从这里开始");
    expect(html).not.toContain("conversation-skeleton");
  });

  it("keeps cached messages visible when a background refresh fails", () => {
    const html = renderToStaticMarkup(
      <ConversationView session={session} detailStatus="stale-error" detailError="网络不可用" onRetry={() => undefined} />,
    );

    expect(html).toContain("暂时无法同步，正在显示上次内容");
    expect(html).toContain("aria-label=\"重新同步会话\"");
    expect(html).toContain("检查查询");
    expect(html).not.toContain("会话载入失败");
  });

  it("shows an explicit retry state when loading fails without a cache", () => {
    const html = renderToStaticMarkup(
      <ConversationView session={{ ...session, messages: [] }} detailStatus="failed" detailError="请求超时" onRetry={() => undefined} />,
    );

    expect(html).toContain("会话载入失败");
    expect(html).toContain("请求超时");
    expect(html).toContain("重新载入");
    expect(html).not.toContain("从这里开始");
  });

  it("shows copy and share actions only after an assistant result completes", () => {
    const completed = renderToStaticMarkup(
      <ConversationView
        session={{
          ...session,
          status: "completed",
          messages: session.messages.map((message) => ({ ...message, streaming: false })),
        }}
      />,
    );
    const streaming = renderToStaticMarkup(<ConversationView session={session} />);

    expect(completed).toContain("aria-label=\"复制回答\"");
    expect(completed).toContain("aria-label=\"分享到微信\"");
    expect(completed).not.toContain("<span>复制</span>");
    expect(completed).not.toContain("<span>分享</span>");
    expect(streaming).not.toContain("aria-label=\"复制回答\"");
    expect(streaming).not.toContain("aria-label=\"分享到微信\"");
  });

  it("shows the elapsed time for completed assistant turns", () => {
    const html = renderToStaticMarkup(
      <ConversationView
        session={{
          ...session,
          status: "completed",
          messages: session.messages.map((message) => message.role === "assistant"
            ? { ...message, streaming: false, durationMs: 65_000 }
            : message),
        }}
      />,
    );

    expect(html).toContain("已处理 1分钟 5秒");
    expect(html).toContain("aria-label=\"已处理 1分钟 5秒\"");
    expect(html).toContain("message-duration-completed");
  });

  it("renders interrupted tool traces without a loading spinner", () => {
    const html = renderToStaticMarkup(
      <ConversationView
        session={{
          ...session,
          status: "canceled",
          messages: session.messages.map((message) => message.role === "assistant"
            ? {
                ...message,
                streaming: false,
                toolSteps: message.toolSteps?.map((step) => ({ ...step, status: "interrupted" as const })),
              }
            : message),
        }}
      />,
    );

    expect(html).toContain("tool-process-interrupted");
    expect(html).toContain("1 项操作 · 1 项中断");
    expect(html).not.toContain("status-loading-icon");
  });

  it("routes local source references to the same-host code viewer", () => {
    const html = renderToStaticMarkup(
      <ConversationView
        session={{
          ...session,
          messages: [{
            id: "source", role: "assistant", createdAt: "20:03",
            content: "查看 [ConversationView.tsx](/Users/lee/work/mobile-web/src/components/ConversationView.tsx:199) 和 [文档](https://example.com/docs)。",
          }],
        }}
      />,
    );

    expect(html).toContain("class=\"source-reference-link\"");
    expect(html).toContain("/#/code?project=project-1&amp;path=%2FUsers%2Flee%2Fwork%2Fmobile-web%2Fsrc%2Fcomponents%2FConversationView.tsx&amp;line=199");
    expect(html).toContain("href=\"https://example.com/docs\" target=\"_blank\"");
    expect(html).not.toContain("href=\"/Users/lee/work/mobile-web/src/components/ConversationView.tsx:199\"");
  });
});
