import type { Session } from "../types";
import { isActiveStatus } from "./runMessages";

export function mergeBackgroundSession(existing: Session | undefined, refreshed: Session): Session {
  if (!existing || !isActiveStatus(refreshed.status) || !existing.messages.some((message) => message.streaming)) {
    return refreshed;
  }
  return { ...refreshed, messages: existing.messages };
}
