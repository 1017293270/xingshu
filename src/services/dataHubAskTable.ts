import { stripTemplateLaunchReference } from "@/services/tableTemplateService";
import type { DataHubAskTableChatMode, DataHubChatSession } from "@/types/dataHub";
import type { TableTemplate } from "@/types/table";

/** 与 DataHub 问表页一致：会话表不存模式，用 sessionId 前缀做总记录隔离。 */
export const ASK_TABLE_SESSION_PREFIX = "ask-table-";
export const ASK_TABLE_CHAT_MODE: DataHubAskTableChatMode = "ask_table";

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

/**
 * 制表会话的标题 = 这次会话的第一句话：取第一行非空文本，行内空白收成一个空格。
 * 多行需求只拿首行，模板发起时空一行拼上的「表结构参考」连同后端截断留下的半截都在后面几行，自然落掉。
 * 会话页页头、顶栏会话下拉、我的表格列表都走这一个口径，同一个会话在三处读起来是同一句话。
 */
export function formatAskTableSessionTitle(text?: string | null) {
  const firstLine = (text ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  return firstLine.replace(/\s+/g, " ");
}

export function mapAskTableSessionToTemplate(session: DataHubChatSession): TableTemplate {
  const sessionId = session.sessionId || String(session.id);
  // 后端会话标题就是首条用户消息（超 50 字截断），所以它既是列表标题的来源，也是「复制制表要求」的原文
  const rawTitle = session.title?.trim() ?? "";
  const title = formatAskTableSessionTitle(rawTitle) || "未命名制表";
  const presentation = inferAskTablePresentation(title);

  const updatedAt = session.updatedAt || session.createdAt;

  return {
    id: sessionId,
    title,
    description: formatSessionTime(updatedAt),
    prompt: stripTemplateLaunchReference(rawTitle) || title,
    updatedAt,
    ...presentation
  };
}

/**
 * 当前空间里的全部制表会话，最近更新的在前。后端这个列表不分页，这里也不截断：
 * 列表页要能翻到每一个会话，露出几条由展示层自己决定（我的表格先露 10 条、会话下拉留最近一批）。
 */
export function selectRecentAskTableTemplates(sessions: DataHubChatSession[]): TableTemplate[] {
  return [...sessions]
    .filter(isAskTableSession)
    .sort((left, right) => {
      const leftTime = String(left.updatedAt || left.createdAt || "");
      const rightTime = String(right.updatedAt || right.createdAt || "");
      return rightTime.localeCompare(leftTime);
    })
    .map(mapAskTableSessionToTemplate);
}
