import type { ChatMessage } from "../types";

type ScrollMetrics = Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">;

export type ConversationGuidePlan =
  | { profile: "none" | "long"; duration: 0; pause: 0 }
  | { profile: "short" | "medium"; duration: number; pause: number };

type AnimatedGuideProfile = Extract<ConversationGuidePlan["profile"], "short" | "medium">;

const SHORT_GUIDE_MAX_VIEWPORTS = 0.7;
const MEDIUM_GUIDE_MAX_VIEWPORTS = 2.5;

export function isConversationNearBottom(metrics: ScrollMetrics, threshold = 72): boolean {
  const distance = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return distance <= Math.max(0, threshold);
}

export function shouldFollowConversationTail(
  metrics: ScrollMetrics,
  previousScrollTop: number,
  currentlyFollowing: boolean,
  userInitiated = true,
  threshold = 72,
): boolean {
  if (isConversationNearBottom(metrics, threshold)) return true;
  if (!currentlyFollowing) return false;
  if (!userInitiated) return true;

  // A viewport or content resize changes the distance from the tail without
  // moving scrollTop. Only an actual upward movement means the reader left it.
  return metrics.scrollTop >= previousScrollTop;
}

export function lastUserMessageId(messages: Pick<ChatMessage, "id" | "role">[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") return messages[index]!.id;
  }
  return null;
}

export function conversationGuidePlan(distance: number, viewportHeight: number): ConversationGuidePlan {
  const normalizedDistance = Math.max(0, distance);
  const normalizedViewport = Math.max(1, viewportHeight);
  if (normalizedDistance <= 1) return { profile: "none", duration: 0, pause: 0 };

  const viewportDistance = normalizedDistance / normalizedViewport;
  if (viewportDistance <= SHORT_GUIDE_MAX_VIEWPORTS) {
    const duration = 400 + 150 * (viewportDistance / SHORT_GUIDE_MAX_VIEWPORTS);
    return { profile: "short", duration, pause: 0 };
  }
  if (viewportDistance <= MEDIUM_GUIDE_MAX_VIEWPORTS) {
    const range = MEDIUM_GUIDE_MAX_VIEWPORTS - SHORT_GUIDE_MAX_VIEWPORTS;
    const progress = (viewportDistance - SHORT_GUIDE_MAX_VIEWPORTS) / range;
    return { profile: "medium", duration: 1_200 + 1_200 * progress, pause: 220 };
  }
  return { profile: "long", duration: 0, pause: 0 };
}

export function conversationGuideScroll(start: number, end: number, progress: number, profile: AnimatedGuideProfile): number {
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  const positionProgress = profile === "short"
    ? 1 - (1 - normalizedProgress) ** 3
    : readingVelocityProgress(normalizedProgress);
  return start + (end - start) * positionProgress;
}

export function conversationQuestionScrollTop(
  currentScrollTop: number,
  viewportTop: number,
  questionTop: number,
  maxScrollTop: number,
  topOffset = 12,
): number {
  const target = currentScrollTop + questionTop - viewportTop - Math.max(0, topOffset);
  return Math.min(Math.max(0, maxScrollTop), Math.max(0, target));
}

function readingVelocityProgress(progress: number): number {
  const accelerationEnd = 0.12;
  const decelerationStart = 0.82;
  const decelerationDuration = 1 - decelerationStart;
  const totalArea = accelerationEnd / 2
    + decelerationStart - accelerationEnd
    + decelerationDuration / 2;

  if (progress < accelerationEnd) {
    return (progress * progress / (2 * accelerationEnd)) / totalArea;
  }
  if (progress < decelerationStart) {
    return (accelerationEnd / 2 + progress - accelerationEnd) / totalArea;
  }

  const decelerationProgress = progress - decelerationStart;
  const areaBeforeDeceleration = accelerationEnd / 2 + decelerationStart - accelerationEnd;
  const decelerationArea = decelerationProgress
    - decelerationProgress * decelerationProgress / (2 * decelerationDuration);
  return (areaBeforeDeceleration + decelerationArea) / totalArea;
}
