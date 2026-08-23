export type WechatLaunchResult = "opened" | "copied" | "failed";

type WechatActions = {
  copy: (text: string) => Promise<boolean>;
  open: (url: string) => void;
  userAgent: string;
};

export async function copyConversationResult(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // LAN development commonly runs outside a secure context.
    }
  }

  if (typeof document === "undefined" || !document.body) return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export async function openWechatWithConversationResult(
  text: string,
  actions: WechatActions = browserWechatActions(),
): Promise<WechatLaunchResult> {
  const copyTask = actions.copy(text);
  let opened = false;
  try {
    actions.open(wechatDeepLink(actions.userAgent));
    opened = true;
  } catch {
    // The result remains available through the clipboard fallback.
  }

  const copied = await copyTask;
  if (opened) return "opened";
  return copied ? "copied" : "failed";
}

export function wechatDeepLink(userAgent: string): string {
  if (/Android/i.test(userAgent)) {
    return "intent://#Intent;scheme=weixin;package=com.tencent.mm;end";
  }
  return "weixin://";
}

function browserWechatActions(): WechatActions {
  return {
    copy: copyConversationResult,
    open: (url) => window.location.assign(url),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
}
