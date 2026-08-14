import { requestDataHub } from "@/services/dataHubClient";
import {
  adaptDataHubStreamEvent,
  getDataHubEventPayload
} from "@/services/dataHubEventAdapter";
import { readDataHubSession } from "@/services/dataHubSession";
import type {
  DataHubChatEvent,
  DataHubChatMessage,
  DataHubChatMode,
  DataHubChatSession,
  DataHubStreamEvent
} from "@/types/dataHub";
import type { HistoryCategory, HistoryFilter, HistorySession } from "@/types/history";
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

function inferCategory(text: string): HistoryCategory {
  if (/文档|报告|写作|材料|附件/.test(text)) {
    return "文档处理";
  }

  if (/数据|分析|统计|趋势|问数|指标|报表|经营/.test(text)) {
    return "数据洞察";
  }

  return "知识快查";
}

export function resolveHistoryCategory(
  chatMode: DataHubChatMode | null | undefined,
  fallbackText: string
): HistoryCategory {
  if (chatMode === "document_lookup") {
    return "文档处理";
  }
  if (chatMode === "rag") {
    return "知识快查";
  }
  if (chatMode === "ask" || chatMode === "agent") {
    return "数据洞察";
  }
  return inferCategory(fallbackText);
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return value.replace("T", " ").slice(0, 16);
}

function mapDataHubSession(session: DataHubChatSession): HistorySession {
  const title = session.title?.trim() || "未命名对话";

  return {
    id: session.sessionId,
    sessionId: session.sessionId,
    title,
    summary: "来自 data-hub 的历史会话，点击后查看完整过程与结果。",
    category: resolveHistoryCategory(session.chatMode, title),
    updatedAt: formatDateTime(session.updatedAt || session.createdAt),
    source: "data-hub",
    chatMode: session.chatMode
  };
}

export function filterHistorySessionList(sessions: HistorySession[], filter: HistoryFilter) {
  const keyword = filter.keyword?.trim();

  return sessions.filter((session) => {
    const matchesCategory =
      !filter.category || filter.category === "全部" || session.category === filter.category;
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

    if (event.type === "content" || event.type === "text") {
      return true;
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

function inferChatMode(
  events: DataHubStreamEvent[],
  fallbackMode: DataHubChatMode = "ask"
): DataHubChatMode {
  const rootEvents = events.filter(
    (event) => !event.parentSessionId && event.type !== "subagent_exposed"
  );

  for (const event of rootEvents) {
    if (event.type !== "done") continue;
    const payload = getDataHubEventPayload(event);
    if (!isRecord(payload)) continue;
    if (payload.documentLookup === true || payload.mode === "document_lookup") {
      return "document_lookup";
    }
    if (payload.adaptiveTeam === true || payload.mode === "agent") {
      return "agent";
    }
  }

  if (
    rootEvents.some(
      (event) =>
        event.agentName === "编排智能体" ||
        event.agentName === "编排 Agent" ||
        event.agentName === "OrchestratorAgent"
    )
  ) {
    return "agent";
  }

  for (const event of rootEvents) {
    if (
      event.type === "citation_document" ||
      event.agentName === "问知智能体" ||
      event.agentName === "ask-knowledge"
    ) {
      return "rag";
    }

    if (event.type !== "done") continue;
    const payload = getDataHubEventPayload(event);
    if (
      isRecord(payload) &&
      (payload.mode === "rag" || payload.askKnowledge === true)
    ) {
      return "rag";
    }
  }

  return fallbackMode;
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

  return sessions.map(mapDataHubSession);
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
