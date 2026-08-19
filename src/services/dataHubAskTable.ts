import type { DataHubChatSession, DataHubRequestChatMode } from "@/types/dataHub";
import type { TableTemplate } from "@/types/table";

/** 与 DataHub 问表页一致：会话表不存模式，用 sessionId 前缀做总记录隔离。 */
export const ASK_TABLE_SESSION_PREFIX = "ask-table-";
export const ASK_TABLE_CHAT_MODE: DataHubRequestChatMode = "ask_table";

const RECENT_ASK_TABLE_LIMIT = 8;

export function createAskTableSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${ASK_TABLE_SESSION_PREFIX}${crypto.randomUUID()}`;
  }

  return `${ASK_TABLE_SESSION_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function isAskTableSessionId(sessionId: string | number | undefined) {
  return String(sessionId ?? "").startsWith(ASK_TABLE_SESSION_PREFIX);
}

export function isAskTableSession(session: Pick<DataHubChatSession, "id" | "sessionId" | "chatMode">) {
  return session.chatMode === ASK_TABLE_CHAT_MODE || isAskTableSessionId(session.sessionId || session.id);
}

function formatSessionTime(value?: string) {
  if (!value) {
    return "问表记录";
  }

  return value.replace("T", " ").slice(0, 16);
}

export function inferAskTablePresentation(title: string): Pick<TableTemplate, "tag" | "iconId"> {
  if (/排行|排名|TOP/i.test(title)) {
    return { tag: "排行", iconId: "ranking" };
  }

  if (/统计|报表|同比|环比|汇总/.test(title)) {
    return { tag: "统计", iconId: "expense-statistics" };
  }

  if (/库存/.test(title)) {
    return { tag: "清单", iconId: "inventory" };
  }

  return { tag: "清单", iconId: "contact-list" };
}

export function mapAskTableSessionToTemplate(session: DataHubChatSession): TableTemplate {
  const sessionId = session.sessionId || String(session.id);
  const title = session.title?.trim() || "未命名制表";
  const presentation = inferAskTablePresentation(title);

  const updatedAt = session.updatedAt || session.createdAt;

  return {
    id: sessionId,
    title,
    description: formatSessionTime(updatedAt),
    prompt: title,
    updatedAt,
    ...presentation
  };
}

export function selectRecentAskTableTemplates(sessions: DataHubChatSession[]): TableTemplate[] {
  return [...sessions]
    .filter(isAskTableSession)
    .sort((left, right) => {
      const leftTime = String(left.updatedAt || left.createdAt || "");
      const rightTime = String(right.updatedAt || right.createdAt || "");
      return rightTime.localeCompare(leftTime);
    })
    .slice(0, RECENT_ASK_TABLE_LIMIT)
    .map(mapAskTableSessionToTemplate);
}
