import { dataHubChatModeFromSessionId } from "@/services/dataHubAskDataService";
import { isAskTableSessionId } from "@/services/dataHubAskTable";
import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import { isWritingSessionId } from "@/services/dataHubWriting";
import type { DataHubChatMode, DataHubStreamEvent } from "@/types/dataHub";
import type { HistoryCategory } from "@/types/history";

/** 多个类别并列时按这个顺序展示：查数据 · 查知识 · 找文档。 */
export const HISTORY_CATEGORY_ORDER: readonly HistoryCategory[] = ["数据洞察", "知识快查", "文档处理"];

const categoryByChatMode: Record<Exclude<DataHubChatMode, "agent">, HistoryCategory> = {
  ask: "数据洞察",
  rag: "知识快查",
  document_lookup: "文档处理"
};

/** 编排实际调用的子智能体：agentId 取自 subagent_exposed（ai-service MainSink）。 */
const categoryByAgentId: Record<string, HistoryCategory> = {
  "ask-data": "数据洞察",
  "ask-knowledge": "知识快查",
  "document-lookup": "文档处理"
};

/** 旧事件没有 agentId 时按展示名认；数据源选择等辅助子智能体不算一种能力。 */
const categoryByAgentName: Record<string, HistoryCategory> = {
  问数智能体: "数据洞察",
  问知智能体: "知识快查",
  找文档智能体: "文档处理"
};

const orchestratorAgentNames = new Set(["编排智能体", "编排 Agent", "OrchestratorAgent"]);
const analysisChatModes = new Set<unknown>(["ask", "rag", "document_lookup", "agent"]);
const historyCategories = new Set<unknown>(HISTORY_CATEGORY_ORDER);

const HISTORY_SESSION_KIND_STORAGE_KEY = "xingshu_history_session_kinds";
/** 只保留最近记过的这些会话；更早的会话再打开一次就会重新记上。 */
const HISTORY_SESSION_KIND_LIMIT = 300;

export type HistorySessionKind = {
  chatMode?: DataHubChatMode;
  categories: HistoryCategory[];
};

type RememberedHistorySessionKind = HistorySessionKind & { updatedAt: number };

export type RememberedHistorySessionKinds = Record<string, RememberedHistorySessionKind>;

type HistoryKindTurn = {
  /** 刚跑完的一轮知道自己的模式；回放的旧轮次缺省，只认事件里的正面证据。 */
  chatMode?: DataHubChatMode;
  events: DataHubStreamEvent[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAnalysisChatMode(value: unknown): value is DataHubChatMode {
  return analysisChatModes.has(value);
}

function orderCategories(values: Iterable<unknown>): HistoryCategory[] {
  const present = new Set(values);
  return HISTORY_CATEGORY_ORDER.filter((category) => present.has(category));
}

/** 只凭事件里的正面证据认出这一轮走的模式；认不出返回 undefined，兜底由调用方决定。 */
export function identifyDataHubChatMode(events: DataHubStreamEvent[]): DataHubChatMode | undefined {
  const rootEvents = events.filter((event) => !event.parentSessionId && event.type !== "subagent_exposed");
  const donePayloads = rootEvents
    .filter((event) => event.type === "done")
    .map(getDataHubEventPayload)
    .filter(isRecord);

  if (donePayloads.some((payload) => payload.documentLookup === true || payload.mode === "document_lookup")) {
    return "document_lookup";
  }
  if (
    donePayloads.some((payload) => payload.adaptiveTeam === true || payload.mode === "agent")
    || rootEvents.some((event) => orchestratorAgentNames.has(event.agentName ?? ""))
  ) {
    return "agent";
  }
  if (rootEvents.some((event) => event.agentName === "找文档智能体")) {
    return "document_lookup";
  }
  if (
    rootEvents.some((event) =>
      event.type === "citation_document" || event.agentName === "问知智能体" || event.agentName === "ask-knowledge")
    || donePayloads.some((payload) => payload.mode === "rag" || payload.askKnowledge === true)
  ) {
    return "rag";
  }
  if (
    rootEvents.some((event) => event.agentName === "问数智能体" || event.type === "table")
    || donePayloads.some((payload) => payload.mode === "ask")
  ) {
    return "ask";
  }
  return undefined;
}

/** 编排这一轮实际用到的能力：看子智能体身份，不看编排自己的开场白。 */
function orchestrationCategories(events: DataHubStreamEvent[]) {
  const categories = new Set<HistoryCategory>();
  for (const event of events) {
    if (!event.parentSessionId) {
      // 编排根直接重放已验证的数据查询（replay_data_query）时也会出结果表。
      if (event.type === "table") categories.add("数据洞察");
      continue;
    }
    const payload = event.type === "subagent_exposed" ? getDataHubEventPayload(event) : undefined;
    const agentId = event.agentId
      || (isRecord(payload) && typeof payload.agentId === "string" ? payload.agentId : "");
    const category = categoryByAgentId[agentId] ?? categoryByAgentName[event.agentName ?? ""];
    if (category) categories.add(category);
  }
  return categories;
}

export function historySessionKindFromTurns(turns: HistoryKindTurn[]): HistorySessionKind {
  let chatMode: DataHubChatMode | undefined;
  const categories = new Set<HistoryCategory>();
  for (const turn of turns) {
    const mode = turn.chatMode ?? identifyDataHubChatMode(turn.events);
    if (!mode) continue;
    chatMode ??= mode;
    if (mode === "agent") {
      orchestrationCategories(turn.events).forEach((category) => categories.add(category));
    } else {
      categories.add(categoryByChatMode[mode]);
    }
  }
  return { chatMode, categories: orderCategories(categories) };
}

function historyKindStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRememberedHistorySessionKinds(): RememberedHistorySessionKinds {
  try {
    const raw = historyKindStorage()?.getItem(HISTORY_SESSION_KIND_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([sessionId, value]) => {
      if (!isRecord(value)) return [];
      const categories = orderCategories(
        Array.isArray(value.categories) ? value.categories.filter((item) => historyCategories.has(item)) : []
      );
      const chatMode = isAnalysisChatMode(value.chatMode) ? value.chatMode : undefined;
      if (!chatMode && !categories.length) return [];
      const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : 0;
      return [[sessionId, { chatMode, categories, updatedAt }]];
    }));
  } catch {
    return {};
  }
}

function writeRememberedHistorySessionKinds(kinds: RememberedHistorySessionKinds) {
  try {
    const recent = Object.entries(kinds)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, HISTORY_SESSION_KIND_LIMIT);
    historyKindStorage()?.setItem(HISTORY_SESSION_KIND_STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    // 存储满了或被禁用：记不住就按未知处理，对话本身不受影响。
  }
}

/**
 * 记下会话实际用到的能力，与已有记录取并集：跑完一轮只看得到这一轮的子智能体，
 * 打开会话时看得到全部轮次。问表、智写这类辅助会话，以及前缀已经说明类别的单模式会话不用记。
 */
export function rememberHistorySessionKind(sessionId: string | null | undefined, turns: HistoryKindTurn[]) {
  if (!sessionId || isAskTableSessionId(sessionId) || isWritingSessionId(sessionId)) return;
  const prefixMode = dataHubChatModeFromSessionId(sessionId);
  if (prefixMode && prefixMode !== "agent") return;
  const kind = historySessionKindFromTurns(
    turns.map((turn) => ({ ...turn, chatMode: turn.chatMode ?? prefixMode }))
  );
  if (!kind.chatMode && !kind.categories.length) return;
  const kinds = readRememberedHistorySessionKinds();
  const previous = kinds[sessionId];
  kinds[sessionId] = {
    // 会话按创建时的模式回放，后来的轮次不改它的去向。
    chatMode: previous?.chatMode ?? kind.chatMode,
    categories: orderCategories([...(previous?.categories ?? []), ...kind.categories]),
    updatedAt: Date.now()
  };
  writeRememberedHistorySessionKinds(kinds);
}

/**
 * 历史列表里一条会话的类型。判定顺序：后端字段 → sessionId 前缀 → 本机记下的实际能力 → 未知。
 *
 * 会话类型最终应由后端在会话列表里返回（chatMode + 编排实际调用的子智能体）；
 * 现在接口只有 id、标题和时间，新会话靠前缀，编排会话与旧会话靠本机记忆。
 * 后端补上后前端优先用后端字段，本机记忆只补旧数据。认不出就是未知，不按标题关键词猜。
 */
export function resolveHistorySessionKind(
  session: { sessionId: string; chatMode?: unknown },
  remembered: RememberedHistorySessionKinds = readRememberedHistorySessionKinds()
): HistorySessionKind {
  const memory = remembered[session.sessionId];
  const chatMode = (isAnalysisChatMode(session.chatMode) ? session.chatMode : undefined)
    ?? dataHubChatModeFromSessionId(session.sessionId)
    ?? memory?.chatMode;
  if (chatMode && chatMode !== "agent") {
    return { chatMode, categories: [categoryByChatMode[chatMode]] };
  }
  return { chatMode, categories: memory?.categories ?? [] };
}
