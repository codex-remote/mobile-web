import { describe, expect, it, vi } from "vitest";
import { openWechatWithConversationResult, wechatDeepLink } from "./conversationResultActions";

const resultText = "## 已完成\n\n- 修复滚动";

describe("openWechatWithConversationResult", () => {
  it("copies the result and opens WeChat on iPhone", async () => {
    const copy = vi.fn().mockResolvedValue(true);
    const open = vi.fn();

    await expect(openWechatWithConversationResult(resultText, {
      copy,
      open,
      userAgent: "Mozilla/5.0 (iPhone)",
    })).resolves.toBe("opened");
    expect(copy).toHaveBeenCalledWith(resultText);
    expect(open).toHaveBeenCalledWith("weixin://");
    expect(copy.mock.invocationCallOrder[0]!).toBeLessThan(open.mock.invocationCallOrder[0]!);
  });

  it("targets the official WeChat package on Android", async () => {
    const copy = vi.fn().mockResolvedValue(true);
    const open = vi.fn();

    await expect(openWechatWithConversationResult(resultText, {
      copy,
      open,
      userAgent: "Mozilla/5.0 (Linux; Android 15)",
    })).resolves.toBe("opened");
    expect(open).toHaveBeenCalledWith("intent://#Intent;scheme=weixin;package=com.tencent.mm;end");
  });

  it("keeps a clipboard fallback when the deep link cannot open", async () => {
    const copy = vi.fn().mockResolvedValue(true);
    const open = vi.fn(() => { throw new Error("unsupported"); });

    await expect(openWechatWithConversationResult(resultText, {
      copy,
      open,
      userAgent: "desktop",
    })).resolves.toBe("copied");
  });
});

describe("wechatDeepLink", () => {
  it("uses the universal registered scheme outside Android", () => {
    expect(wechatDeepLink("Mozilla/5.0 (iPad)")).toBe("weixin://");
  });
});
