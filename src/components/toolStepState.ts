import type { ToolStep } from "../types";

type TerminalToolStepStatus = Exclude<ToolStep["status"], "running">;

export function terminalToolStepStatus(value: string): TerminalToolStepStatus | undefined {
  if (value === "turn.completed" || value === "completed") return "completed";
  if (value === "turn.failed" || value === "failed") return "failed";
  if (value === "turn.interrupted" || value === "canceled" || value === "interrupted") return "interrupted";
  return undefined;
}

export function settleRunningToolSteps(
  steps: ToolStep[] | undefined,
  terminalStatus: TerminalToolStepStatus | undefined,
): ToolStep[] | undefined {
  if (!steps || !terminalStatus || !steps.some((step) => step.status === "running")) return steps;
  return steps.map((step) => step.status === "running" ? { ...step, status: terminalStatus } : step);
}
