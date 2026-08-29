import type { DataHubRequestChatMode } from "@/types/dataHub";

/** 与问表同构：会话表不存模式，用 sessionId 前缀把智写会话和问数隔离开。 */
export const WRITING_SESSION_PREFIX = "writing-";
export const WRITING_CHAT_MODE: DataHubRequestChatMode = "writing";

export function createWritingSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${WRITING_SESSION_PREFIX}${crypto.randomUUID()}`;
  }

  return `${WRITING_SESSION_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function isWritingSessionId(sessionId: string | number | undefined) {
  return String(sessionId ?? "").startsWith(WRITING_SESSION_PREFIX);
}
