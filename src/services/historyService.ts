import { requestDataHub } from "@/services/dataHubClient";
import {
  adaptDataHubStreamEvent,
  getDataHubEventPayload
} from "@/services/dataHubEventAdapter";
import { isAskTableSession } from "@/services/dataHubAskTable";
import { isWritingSessionId } from "@/services/dataHubWriting";
import { readDataHubSession } from "@/services/dataHubSession";
import {
  identifyDataHubChatMode,
  readRememberedHistorySessionKinds,
  rememberHistorySessionKind,
  resolveHistorySessionKind,
  type RememberedHistorySessionKinds
} from "@/services/historySessionKind";
import type {
  DataHubChatEvent,
  DataHubChatMessage,
  DataHubChatMode,
  DataHubChatSession,
  DataHubStreamEvent
} from "@/types/dataHub";
import type { HistoryFilter, HistorySession } from "@/types/history";
import { historySessions } from "./mock/historyMock";

type DataHubHistoryReplay = {
  sessionId: string;
  chatMode: DataHubChatMode;
  question: string;
  events: DataHubStreamEvent[];
  turns: DataHubHistoryReplayTurn[];
};

type DataHubHistoryReplayTurn = {
  id: string;
  question: string;
  sessionId: string | null;
  chatId: string;
  chatMode: DataHubChatMode;
  status: "done";
  events: DataHubStreamEvent[];
  error: string;
};

function shouldUseMockHistory() {
  return import.meta.env.MODE === "test";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return value.replace("T", " ").slice(0, 16);
}

/**
 * 问表与智写都是靠 sessionId 前缀隔离的辅助会话：它们不是问数会话，
 * 不能带着 chatMode 去做回放，否则会被送进 /ask-data 重放成问数对话。
 */
function replayableChatMode(session: DataHubChatSession): DataHubChatMode | undefined {
  const chatMode = session.chatMode;
  if (chatMode === "ask_table" || chatMode === "writing") return undefined;
  if (isWritingSessionId(session.sessionId)) return undefined;
  return chatMode;
}

/** 会话类型的判定规则与后端缺口见 resolveHistorySessionKind。 */
function mapDataHubSession(
  session: DataHubChatSession,
  remembered: RememberedHistorySessionKinds
): HistorySession {
  const title = session.title?.trim() || "未命名对话";
  const kind = resolveHistorySessionKind(
    { sessionId: session.sessionId, chatMode: replayableChatMode(session) },
    remembered
  );

  return {
    id: session.sessionId,
    sessionId: session.sessionId,
    title,
    summary: "来自 data-hub 的历史会话，点击后查看完整过程与结果。",
    categories: kind.categories,
    updatedAt: formatDateTime(session.updatedAt || session.createdAt),
    source: "data-hub",
    chatMode: kind.chatMode
  };
}

/**
 * 列表缓存之后才记下的类型（刚打开过的旧会话、刚跑完的编排）在渲染时补上，
 * 不必为了一个标签重新拉列表。已经认出类型的会话保持不变。
 */
export function withRememberedHistoryKinds(sessions: HistorySession[]): HistorySession[] {
  const remembered = readRememberedHistorySessionKinds();
  return sessions.map((session) => {
    if (session.source !== "data-hub" || !session.sessionId || session.categories.length) {
      return session;
    }
    const kind = resolveHistorySessionKind(
      { sessionId: session.sessionId, chatMode: session.chatMode },
      remembered
    );
    return kind.categories.length || (kind.chatMode && !session.chatMode)
      ? { ...session, chatMode: session.chatMode ?? kind.chatMode, categories: kind.categories }
      : session;
  });
}

export function filterHistorySessionList(sessions: HistorySession[], filter: HistoryFilter) {
  const keyword = filter.keyword?.trim();

  return sessions.filter((session) => {
    // 用到多种能力的编排会话在任一对应页签下都能找到；类型未知的只在「全部」里。
    const matchesCategory =
      !filter.category || filter.category === "全部" || session.categories.includes(filter.category);
    const matchesKeyword =
      !keyword || session.title.includes(keyword) || session.summary.includes(keyword);

    return matchesCategory && matchesKeyword;
  });
}

function sortBySeqOrTime<T extends { seqNum?: number; createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftSeq = left.seqNum ?? 0;
    const rightSeq = right.seqNum ?? 0;

    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }

    return String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? ""));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAssistantTextEvent(events: DataHubStreamEvent[]) {
  return events.some((event) => {
    if (event.parentSessionId) {
      return false;
    }

    // 过程说明不是回答；text_replace 才是收敛后的正式回答。
    if (event.type === "content" || event.type === "text" || event.type === "text_replace") {
      return event.textRole !== "progress";
    }

    if (event.type !== "done") {
      return false;
    }

    const payload = getDataHubEventPayload(event);
    return isRecord(payload) && typeof payload.summary === "string" && Boolean(payload.summary.trim());
  });
}

function toStreamEvent(event: DataHubChatEvent): DataHubStreamEvent | null {
  return adaptDataHubStreamEvent(event, {
    type: event.type,
    sessionId: event.sessionId,
    chatId: event.chatId,
    timestamp: event.createdAt ? Date.parse(event.createdAt) : undefined
  });
}

/** 回放走哪个页面只看根会话；子智能体用到了什么由 rememberHistorySessionKind 另记。 */
function inferChatMode(
  events: DataHubStreamEvent[],
  fallbackMode: DataHubChatMode = "ask"
): DataHubChatMode {
  return identifyDataHubChatMode(events) ?? fallbackMode;
}

export async function listHistorySessions(): Promise<HistorySession[]> {
  if (shouldUseMockHistory()) {
    return historySessions;
  }

  const session = readDataHubSession();
  if (!session.spaceId) {
    return [];
  }

  const sessions = await requestDataHub<DataHubChatSession[]>("/api/v1/chat/sessions/list", {
    method: "POST",
    body: JSON.stringify({ spaceId: session.spaceId }),
    spaceId: session.spaceId
  });

  const remembered = readRememberedHistorySessionKinds();
  return sessions
    .filter((item) => !isAskTableSession(item)
      && item.chatMode !== "writing"
      && !isWritingSessionId(item.sessionId || item.id))
    .map((item) => mapDataHubSession(item, remembered));
}

export async function filterHistorySessions(filter: HistoryFilter) {
  return filterHistorySessionList(await listHistorySessions(), filter);
}

export async function loadDataHubHistoryReplay(
  sessionId: string,
  fallbackMode: DataHubChatMode = "ask"
): Promise<DataHubHistoryReplay> {
  const [messages, rawEvents] = await Promise.all([
    requestDataHub<DataHubChatMessage[]>("/api/v1/chat/messages/list", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    }),
    requestDataHub<DataHubChatEvent[]>("/api/v1/chat/events/list", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    })
  ]);
  const orderedMessages = sortBySeqOrTime(messages);
  const orderedEvents = sortBySeqOrTime(rawEvents);
  const turnMap = new Map<
    string,
    {
      userMessage?: DataHubChatMessage;
      assistantMessages: DataHubChatMessage[];
      events: DataHubStreamEvent[];
      firstSeq: number;
      firstTime: string;
    }
  >();

  const touchTurn = (chatId: string, seqNum?: number, createdAt?: string) => {
    const entry =
      turnMap.get(chatId) ??
      {
        assistantMessages: [],
        events: [],
        firstSeq: Number.MAX_SAFE_INTEGER,
        firstTime: ""
      };

    if (typeof seqNum === "number") {
      entry.firstSeq = Math.min(entry.firstSeq, seqNum);
    }

    if (createdAt && (!entry.firstTime || createdAt < entry.firstTime)) {
      entry.firstTime = createdAt;
    }

    turnMap.set(chatId, entry);
    return entry;
  };

  for (const message of orderedMessages) {
    const chatId = message.chatId || `message-${message.id}`;
    const entry = touchTurn(chatId, message.seqNum, message.createdAt);

    if (message.role === "user" && !entry.userMessage) {
      entry.userMessage = message;
    } else if (message.role !== "user") {
      entry.assistantMessages.push(message);
    }
  }

  for (const event of orderedEvents) {
    const streamEvent = toStreamEvent(event);
    if (!streamEvent) {
      continue;
    }
    const chatId = streamEvent.chatId || event.chatId || `event-${event.id}`;
    const entry = touchTurn(chatId, event.seqNum, event.createdAt);
    entry.events.push(streamEvent);
  }

  const turns = Array.from(turnMap.entries())
    .map(([chatId, entry], index) => {
      const assistantContent = entry.assistantMessages.map((message) => message.content).join("");
      const events =
        assistantContent && !hasAssistantTextEvent(entry.events)
          ? [
              ...entry.events,
              {
                type: "text",
                data: assistantContent,
                content: assistantContent,
                sessionId,
                globalSessionId: sessionId,
                chatId,
                finished: false
              }
            ]
          : entry.events;
      const chatMode = inferChatMode(events, fallbackMode);

      return {
        id: `${sessionId}-${chatId}-${index}`,
        question: entry.userMessage?.content || "历史对话",
        sessionId,
        chatId,
        chatMode,
        status: "done" as const,
        events,
        error: "",
        firstSeq: entry.firstSeq,
        firstTime: entry.firstTime
      };
    })
    .filter((turn) => turn.question !== "历史对话" || turn.events.length > 0)
    .sort((left, right) => {
      if (left.firstSeq !== right.firstSeq) {
        return left.firstSeq - right.firstSeq;
      }

      return left.firstTime.localeCompare(right.firstTime);
    })
    .map(({ firstSeq: _firstSeq, firstTime: _firstTime, ...turn }) => turn);

  const firstOriginalTurn = turns.find((turn) => turn.question && turn.question !== "历史对话");
  const events = firstOriginalTurn?.events ?? [];
  const chatMode = turns[0]?.chatMode ?? fallbackMode;
  // 打开会话本来就拉回了全部事件，顺手记下它实际用到的能力：
  // 后端列表不返回模式，旧会话打开过一次之后历史页就能分对类。只认事件里的证据，不用兜底模式。
  rememberHistorySessionKind(sessionId, turns.map((turn) => ({ events: turn.events })));

  return {
    sessionId,
    chatMode,
    question: firstOriginalTurn?.question || "历史对话",
    events,
    turns
  };
}

export function filterMockHistorySessions(filter: HistoryFilter) {
  return filterHistorySessionList(historySessions, filter);
}
