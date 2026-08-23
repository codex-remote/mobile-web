import type { ToolStep } from "../types";

const DATABASE_PATTERN = /(^|[^a-z0-9])(sql|postgres(?:ql)?|mysql|sqlite|psql|数据库)([^a-z0-9]|$)/i;
const SQL_STATEMENT_PATTERN = /^\s*(select|insert|update|delete|with|explain|create\s+table|alter\s+table)\b/i;

export function activityLabel(step?: ToolStep): string {
  if (!step) return "正在整理结果";

  const subject = compactInline(step.title, 72);
  if (isSqlStep(step)) return subject ? `正在查询 ${subject}` : "正在查询数据库";
  if (step.kind === "commandExecution") return subject ? `正在执行 ${subject}` : "正在执行命令";
  if (step.kind === "webSearch") return subject ? `正在搜索 ${subject}` : "正在搜索资料";
  if (step.kind === "fileChange") return subject ? `正在更新 ${subject}` : "正在更新文件";
  if (step.kind === "reasoning" || step.kind === "plan") return "正在分析上下文";
  if (step.kind === "imageView") return "正在查看图片";
  if (step.kind === "imageGeneration") return "正在生成图片";
  if (step.kind === "contextCompaction") return "正在整理上下文";
  return subject ? `正在使用 ${subject}` : "正在处理";
}

export function processSummary(steps: ToolStep[]): string {
  const running = steps.filter((step) => step.status === "running").length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const interrupted = steps.filter((step) => step.status === "interrupted").length;
  const completed = steps.length - running - failed - interrupted;

  if (running > 0) return completed > 0 ? `${completed} 项完成 · ${running} 项进行中` : `${running} 项进行中`;
  if (failed > 0 || interrupted > 0) {
    const outcomes = [];
    if (failed > 0) outcomes.push(`${failed} 项失败`);
    if (interrupted > 0) outcomes.push(`${interrupted} 项中断`);
    return `${steps.length} 项操作 · ${outcomes.join(" · ")}`;
  }
  return `已完成 ${steps.length} 项操作`;
}

export function stepCategory(step: ToolStep): string {
  if (isSqlStep(step)) return "SQL";
  if (step.kind === "commandExecution") return "命令";
  if (step.kind === "webSearch") return "搜索";
  if (step.kind === "fileChange") return "文件";
  if (step.kind === "reasoning" || step.kind === "plan") return "分析";
  if (step.kind === "imageView" || step.kind === "imageGeneration") return "图片";
  if (step.kind === "contextCompaction") return "上下文";
  return "工具";
}

export function compactInline(value: string, limit = 160): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function isSqlStep(step: ToolStep): boolean {
  if (["webSearch", "fileChange", "reasoning", "plan", "imageView", "imageGeneration", "contextCompaction"].includes(step.kind)) return false;
  return DATABASE_PATTERN.test(`${step.kind} ${step.title} ${step.detail}`)
    || SQL_STATEMENT_PATTERN.test(step.title)
    || SQL_STATEMENT_PATTERN.test(step.detail);
}
