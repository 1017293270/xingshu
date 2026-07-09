import { requestDataHub } from "@/services/dataHubClient";
import { readDataHubSession } from "@/services/dataHubSession";
import type { DataHubChatEvent, DataHubChatMessage, DataHubChatSession, DataHubStreamEvent } from "@/types/dataHub";
import type { HistoryCategory, HistoryFilter, HistorySession } from "@/types/history";
import { historySessions } from "./mock/historyMock";

type DataHubHistoryReplay = {
  sessionId: string;
  question: string;
  events: DataHubStreamEvent[];
  turns: DataHubHistoryReplayTurn[];
};

type DataHubHistoryReplayTurn = {
  id: string;
  question: string;
  sessionId: string | null;
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

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return value.replace("T", " ").slice(0, 16);
}

function mapDataHubSession(session: DataHubChatSession): HistorySession {
  const title = session.title?.trim() || "未命名问数对话";

  return {
    id: session.sessionId,
    sessionId: session.sessionId,
    title,
    summary: "来自 data-hub 的历史会话，点击后恢复问数过程与结果。",
    category: inferCategory(title),
    updatedAt: formatDateTime(session.updatedAt || session.createdAt),
    source: "data-hub"
  };
}

function filterSessions(sessions: HistorySession[], filter: HistoryFilter) {
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

function hasAssistantTextEvent(events: DataHubStreamEvent[]) {
  return events.some((event) => ["content", "text", "done"].includes(event.type));
}

function toStreamEvent(event: DataHubChatEvent): DataHubStreamEvent {
  return {
    type: event.type,
    data: event.data,
    sessionId: event.sessionId,
    chatId: event.chatId,
    timestamp: event.createdAt ? Date.parse(event.createdAt) : undefined
  };
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
  return filterSessions(await listHistorySessions(), filter);
}

export async function loadDataHubHistoryReplay(sessionId: string): Promise<DataHubHistoryReplay> {
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
    const chatId = event.chatId || `event-${event.id}`;
    const entry = touchTurn(chatId, event.seqNum, event.createdAt);
    entry.events.push(toStreamEvent(event));
  }

  const turns = Array.from(turnMap.entries())
    .map(([chatId, entry], index) => {
      const assistantContent = entry.assistantMessages.map((message) => message.content).join("");
      const events =
        assistantContent && !hasAssistantTextEvent(entry.events)
          ? [...entry.events, { type: "done", data: { summary: assistantContent }, sessionId, chatId }]
          : entry.events;

      return {
        id: `${sessionId}-${chatId}-${index}`,
        question: entry.userMessage?.content || "历史问数对话",
        sessionId,
        status: "done" as const,
        events,
        error: "",
        firstSeq: entry.firstSeq,
        firstTime: entry.firstTime
      };
    })
    .filter((turn) => turn.question !== "历史问数对话" || turn.events.length > 0)
    .sort((left, right) => {
      if (left.firstSeq !== right.firstSeq) {
        return left.firstSeq - right.firstSeq;
      }

      return left.firstTime.localeCompare(right.firstTime);
    })
    .map(({ firstSeq: _firstSeq, firstTime: _firstTime, ...turn }) => turn);

  const firstOriginalTurn = turns.find((turn) => turn.question && turn.question !== "历史问数对话");
  const events = firstOriginalTurn?.events ?? [];

  return {
    sessionId,
    question: firstOriginalTurn?.question || "历史问数对话",
    events,
    turns
  };
}

export function filterMockHistorySessions(filter: HistoryFilter) {
  return filterSessions(historySessions, filter);
}
