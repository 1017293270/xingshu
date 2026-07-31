import { getDataHubEventPayload } from "./dataHubEventAdapter";
import type {
  DataHubAgentExecutionCard,
  DataHubDoneData,
  DataHubExecutionBlock,
  DataHubExecutionProjection,
  DataHubExecutionSession,
  DataHubExecutionStatus,
  DataHubRoutingDecomposeData,
  DataHubStreamEvent,
  DataHubSubagentTreeNode
} from "@/types/dataHub";

type UnknownRecord = Record<string, unknown>;

export type DataHubExecutionProjectionOptions = {
  mainSessionId?: string;
  globalSessionId?: string;
  chatId?: string;
  fallbackAgentName?: string;
  terminalStatus?: Extract<DataHubExecutionStatus, "done" | "error">;
};

export type DataHubSubagentTreeEntry = {
  session: DataHubExecutionSession;
  level: number;
};

type EventIdentity = {
  sessionId?: string;
  globalSessionId?: string;
  parentSessionId?: string;
  chatId?: string;
  agentId?: string;
  agentName?: string;
  subagentId?: string;
  label?: string;
};

const fallbackAgentName = "AI 助手";
const mergeableBlockTypes = new Set(["thinking", "text"]);
const executionCardEventTypes = new Set([
  "agent_start",
  "thinking",
  "final_thinking",
  "content",
  "text",
  "table",
  "chart",
  "data_source_selected",
  "document_url",
  "citation_document"
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createOrchestrationState() {
  return {
    routingEvents: [],
    reactSteps: [],
    toolCalls: [],
    toolResults: []
  };
}

function createExecutionSession(
  seed: Partial<
    Pick<
      DataHubExecutionSession,
      | "sessionId"
      | "globalSessionId"
      | "parentSessionId"
      | "chatId"
      | "agentId"
      | "agentName"
      | "subagentId"
      | "label"
      | "startedAt"
    >
  > = {}
): DataHubExecutionSession {
  return {
    ...seed,
    status: "idle",
    finished: false,
    cards: [],
    orchestration: createOrchestrationState(),
    events: [],
    dataSources: [],
    tableResults: [],
    citationDocuments: [],
    documentResults: []
  };
}

/**
 * Creates an empty, serializable projection. The optional main-session seed is
 * useful for live streams, while history replay may let the first main event
 * provide the same identity.
 */
export function createDataHubExecutionProjection(
  options: DataHubExecutionProjectionOptions = {}
): DataHubExecutionProjection {
  return {
    mainSession: createExecutionSession({
      sessionId: optionalString(options.mainSessionId),
      globalSessionId: optionalString(options.globalSessionId),
      chatId: optionalString(options.chatId)
    }),
    subagentSessions: [],
    orphanedSubagentEvents: [],
    eventCount: 0,
    fallbackAgentName: optionalString(options.fallbackAgentName) ?? fallbackAgentName
  };
}

function exposedContent(event: DataHubStreamEvent): UnknownRecord | undefined {
  const payload = getDataHubEventPayload(event);
  return event.type === "subagent_exposed" && isRecord(payload) ? payload : undefined;
}

function eventIdentity(event: DataHubStreamEvent): EventIdentity {
  const exposed = exposedContent(event);
  const label = optionalString(event.label) ?? optionalString(exposed?.label);

  return {
    sessionId:
      event.type === "subagent_exposed"
        ? optionalString(exposed?.sessionId) ?? optionalString(event.sessionId)
        : optionalString(event.sessionId),
    globalSessionId: optionalString(event.globalSessionId),
    parentSessionId: optionalString(event.parentSessionId),
    chatId: optionalString(event.chatId),
    agentId: optionalString(event.agentId) ?? optionalString(exposed?.agentId),
    agentName: label ?? optionalString(event.agentName),
    subagentId: optionalString(event.subagentId) ?? optionalString(exposed?.subagentId),
    label
  };
}

function isSubagentEvent(
  projection: DataHubExecutionProjection,
  event: DataHubStreamEvent,
  identity: EventIdentity
): boolean {
  if (event.type === "subagent_exposed" || identity.parentSessionId || identity.subagentId) {
    return true;
  }

  if (
    identity.sessionId &&
    projection.subagentSessions.some((session) => session.sessionId === identity.sessionId)
  ) {
    return true;
  }

  const mainSessionId = projection.mainSession.sessionId;
  return Boolean(
    mainSessionId &&
      identity.sessionId &&
      identity.sessionId !== mainSessionId &&
      identity.globalSessionId === mainSessionId
  );
}

function resolveAgentName(
  event: DataHubStreamEvent,
  identity: EventIdentity,
  session: DataHubExecutionSession,
  fallback: string
): string {
  return (
    optionalString(event.agentName) ??
    identity.label ??
    identity.agentName ??
    session.label ??
    session.agentName ??
    fallback
  );
}

function cardId(
  agentName: string,
  index: number,
  timestamp?: number | string
): string {
  return JSON.stringify([agentName, index, timestamp ?? null]);
}

function normalizedBlockType(event: DataHubStreamEvent): string {
  if (event.type === "thinking" || event.type === "final_thinking" || event.isThinking) {
    return "thinking";
  }
  return event.type === "content" ? "text" : event.type;
}

function createBlock(event: DataHubStreamEvent): DataHubExecutionBlock {
  return {
    type: normalizedBlockType(event),
    sourceType: event.type,
    content: getDataHubEventPayload(event),
    isThinking: event.isThinking === true || normalizedBlockType(event) === "thinking",
    ...(event.timestamp === undefined ? {} : { timestamp: event.timestamp }),
    ...(optionalString(event.replyId) ? { replyId: optionalString(event.replyId) } : {}),
    ...(optionalNumber(event.modelCallIndex) === undefined
      ? {}
      : { modelCallIndex: optionalNumber(event.modelCallIndex) }),
    ...(optionalString(event.eventId) ? { eventId: optionalString(event.eventId) } : {}),
    ...(optionalNumber(event.sequence) === undefined
      ? {}
      : { sequence: optionalNumber(event.sequence) }),
    ...(optionalString(event.toolCallId) ? { toolCallId: optionalString(event.toolCallId) } : {})
  };
}

function upsertExecutionCard(
  cards: DataHubAgentExecutionCard[],
  event: DataHubStreamEvent,
  agentName: string
): DataHubAgentExecutionCard[] {
  const replyId = optionalString(event.replyId);
  const modelCallIndex = optionalNumber(event.modelCallIndex);
  const lastCardIndex = cards.length - 1;
  const cardIndex =
    lastCardIndex >= 0 && cards[lastCardIndex].agentName === agentName
      ? lastCardIndex
      : -1;
  const oldCard =
    cardIndex >= 0
      ? cards[cardIndex]
      : {
          id: cardId(agentName, cards.length, event.timestamp),
          agentName,
          ...(event.timestamp === undefined ? {} : { startedAt: event.timestamp }),
          status: "running" as const,
          blocks: []
        };

  let blocks = oldCard.blocks;
  const payload = getDataHubEventPayload(event);
  const hasBlock =
    event.type !== "agent_start" &&
    event.type !== "subagent_exposed" &&
    event.type !== "done" &&
    !(typeof payload === "string" && payload.length === 0);

  if (hasBlock) {
    const block = createBlock(event);
    const previous = blocks[blocks.length - 1];
    if (
      previous &&
      previous.type === block.type &&
      previous.isThinking === block.isThinking &&
      mergeableBlockTypes.has(block.type) &&
      typeof previous.content === "string" &&
      typeof block.content === "string" &&
      modelCallIndex !== undefined &&
      previous.modelCallIndex === modelCallIndex &&
      previous.replyId === replyId
    ) {
      blocks = [
        ...blocks.slice(0, -1),
        {
          ...previous,
          content: previous.content + block.content,
          ...(block.timestamp === undefined ? {} : { timestamp: block.timestamp })
        }
      ];
    } else {
      blocks = [...blocks, block];
    }
  }

  const nextCard: DataHubAgentExecutionCard = {
    ...oldCard,
    blocks,
    status: event.type === "error" ? "error" : oldCard.status,
    ...(event.timestamp === undefined ? {} : { updatedAt: event.timestamp })
  };

  if (cardIndex < 0) {
    return [...cards, nextCard];
  }

  return cards.map((card, index) => (index === cardIndex ? nextCard : card));
}

function completeCards(
  cards: DataHubAgentExecutionCard[],
  status: Extract<DataHubExecutionStatus, "done" | "error">
): DataHubAgentExecutionCard[] {
  return cards.map((card) =>
    card.status === "running"
      ? {
          ...card,
          status
        }
      : card
  );
}

function normalizeDoneData(payload: unknown): DataHubDoneData {
  if (isRecord(payload)) {
    return payload as DataHubDoneData;
  }
  return typeof payload === "string" && payload.trim() ? { summary: payload } : {};
}

function normalizeError(payload: unknown): DataHubExecutionSession["error"] {
  if (typeof payload === "string") {
    return {
      message: payload,
      detail: payload
    };
  }

  if (isRecord(payload)) {
    const rawCode = optionalNumber(payload.code);
    const message =
      optionalString(payload.message) ??
      optionalString(payload.error) ??
      optionalString(payload.summary) ??
      "DataHub 执行失败";
    return {
      ...(rawCode === undefined ? {} : { code: rawCode }),
      message,
      detail: payload
    };
  }

  return {
    message: "DataHub 执行失败",
    detail: payload
  };
}

function nextSessionStatus(
  session: DataHubExecutionSession,
  event: DataHubStreamEvent,
  done: DataHubDoneData | undefined
): DataHubExecutionStatus {
  if (event.type === "error" || done?.failed === true) {
    return "error";
  }
  if (session.status === "error") {
    return "error";
  }
  if (
    event.type === "done" ||
    event.finished === true ||
    event.requestFinished === true
  ) {
    return "done";
  }
  return session.status === "idle" ? "running" : session.status;
}

function updateOrchestration(
  session: DataHubExecutionSession,
  event: DataHubStreamEvent
): DataHubExecutionSession["orchestration"] {
  const orchestration = {
    ...session.orchestration,
    routingEvents: [...session.orchestration.routingEvents],
    reactSteps: [...session.orchestration.reactSteps],
    toolCalls: [...session.orchestration.toolCalls],
    toolResults: [...session.orchestration.toolResults]
  };

  if (event.type.startsWith("routing_")) {
    orchestration.routingEvents.push(event);
  }
  if (event.type === "routing_decompose" && isRecord(getDataHubEventPayload(event))) {
    orchestration.decompose = getDataHubEventPayload(event) as DataHubRoutingDecomposeData;
  }
  if (event.type === "react_step") {
    orchestration.reactSteps.push(event);
  }
  if (event.type === "tool_call") {
    orchestration.toolCalls.push(event);
  }
  if (event.type === "tool_result") {
    orchestration.toolResults.push(event);
  }

  return orchestration;
}

function renameCards(
  cards: DataHubAgentExecutionCard[],
  previousName: string | undefined,
  nextName: string | undefined
): DataHubAgentExecutionCard[] {
  if (!previousName || !nextName || previousName === nextName) {
    return cards;
  }

  return cards.map((card) =>
    card.agentName === previousName
      ? {
          ...card,
          agentName: nextName
        }
      : card
  );
}

function projectSessionEvent(
  session: DataHubExecutionSession,
  event: DataHubStreamEvent,
  identity: EventIdentity,
  fallback: string,
  isSubagent: boolean
): DataHubExecutionSession {
  const payload = getDataHubEventPayload(event);
  const done = event.type === "done" ? normalizeDoneData(payload) : undefined;
  const status = nextSessionStatus(session, event, done);
  const finished =
    session.finished ||
    status === "done" ||
    status === "error" ||
    event.type === "done" ||
    event.finished === true ||
    event.requestFinished === true;
  const nextLabel = identity.label ?? session.label;
  const nextAgentName = isSubagent
    ? nextLabel ?? identity.agentName ?? session.agentName
    : session.agentName ??
      (event.type === "agent_start" ? identity.agentName : undefined) ??
      identity.agentName;
  const eventAgentName = resolveAgentName(event, identity, session, fallback);
  let cards = renameCards(session.cards, session.agentName, nextAgentName);

  if (executionCardEventTypes.has(event.type)) {
    cards = upsertExecutionCard(cards, event, eventAgentName);
  }
  if (status === "done" || status === "error") {
    cards = completeCards(cards, status);
  }

  const nextSession: DataHubExecutionSession = {
    ...session,
    sessionId: session.sessionId ?? identity.sessionId,
    globalSessionId: session.globalSessionId ?? identity.globalSessionId,
    parentSessionId: isSubagent
      ? identity.parentSessionId ?? session.parentSessionId
      : undefined,
    chatId: session.chatId ?? identity.chatId,
    agentId: identity.agentId ?? session.agentId,
    agentName: nextAgentName,
    subagentId: identity.subagentId ?? session.subagentId,
    label: nextLabel,
    startedAt: session.startedAt ?? event.timestamp,
    updatedAt: event.timestamp ?? session.updatedAt,
    status,
    finished,
    cards,
    orchestration: updateOrchestration(session, event),
    events: [...session.events, event],
    dataSources:
      event.type === "data_source_selected"
        ? [...session.dataSources, payload]
        : session.dataSources,
    tableResults:
      event.type === "table" ? [...session.tableResults, payload] : session.tableResults,
    citationDocuments:
      event.type === "citation_document"
        ? [...session.citationDocuments, payload]
        : session.citationDocuments,
    documentResults:
      event.type === "document_url"
        ? [...session.documentResults, payload]
        : session.documentResults,
    ...(done ? { done } : {}),
    ...(event.type === "error" ? { error: normalizeError(payload) } : {})
  };

  if (done?.failed === true && !nextSession.error) {
    nextSession.error = {
      message: done.summary?.trim() || "DataHub 执行失败",
      detail: done
    };
  }

  return nextSession;
}

/**
 * Reduces one canonical DataHub event into a new projection. Child events are
 * routed exclusively by their own session identity and never enter the main
 * session's cards, orchestration arrays, terminal state, or event log.
 */
export function reduceDataHubExecutionEvent(
  projection: DataHubExecutionProjection,
  event: DataHubStreamEvent
): DataHubExecutionProjection {
  const identity = eventIdentity(event);
  const childEvent = isSubagentEvent(projection, event, identity);
  let mainSession = projection.mainSession;

  if (childEvent && !mainSession.sessionId && identity.globalSessionId) {
    mainSession = {
      ...mainSession,
      sessionId: identity.globalSessionId,
      globalSessionId: mainSession.globalSessionId ?? identity.globalSessionId,
      chatId: mainSession.chatId ?? identity.chatId
    };
  }

  if (childEvent) {
    if (!identity.sessionId) {
      return {
        ...projection,
        mainSession,
        orphanedSubagentEvents: [...projection.orphanedSubagentEvents, event],
        eventCount: projection.eventCount + 1
      };
    }

    const sessionIndex = projection.subagentSessions.findIndex(
      (session) => session.sessionId === identity.sessionId
    );
    const oldSession =
      sessionIndex >= 0
        ? projection.subagentSessions[sessionIndex]
        : createExecutionSession({
            sessionId: identity.sessionId,
            globalSessionId: identity.globalSessionId,
            parentSessionId: identity.parentSessionId ?? mainSession.sessionId,
            chatId: identity.chatId,
            agentId: identity.agentId,
            agentName: identity.agentName,
            subagentId: identity.subagentId,
            label: identity.label,
            startedAt: event.timestamp
          });
    const nextSession = projectSessionEvent(
      oldSession,
      event,
      {
        ...identity,
        parentSessionId: identity.parentSessionId ?? oldSession.parentSessionId
      },
      projection.fallbackAgentName,
      true
    );
    const subagentSessions =
      sessionIndex >= 0
        ? projection.subagentSessions.map((session, index) =>
            index === sessionIndex ? nextSession : session
          )
        : [...projection.subagentSessions, nextSession];

    return {
      ...projection,
      mainSession,
      subagentSessions,
      eventCount: projection.eventCount + 1
    };
  }

  const mainIdentity: EventIdentity = {
    ...identity,
    sessionId: mainSession.sessionId ?? identity.sessionId,
    globalSessionId: mainSession.globalSessionId ?? identity.globalSessionId,
    chatId: mainSession.chatId ?? identity.chatId
  };

  const nextMainSession = projectSessionEvent(
    mainSession,
    event,
    mainIdentity,
    projection.fallbackAgentName,
    false
  );

  // 主会话到达终态时，本轮编排整体结束：仍未收尾的子会话（如真实流中
  // 缺少路由到自身的 done 事件）一并级联收尾，避免编排流程永远停在运行中。
  const mainReachedTerminal =
    (nextMainSession.status === "done" || nextMainSession.status === "error") &&
    mainSession.status !== nextMainSession.status;

  const subagentSessions = mainReachedTerminal
    ? projection.subagentSessions.map((session) => {
        if (
          session.finished ||
          session.status === "done" ||
          session.status === "error"
        ) {
          return session;
        }
        const cascadeStatus = nextMainSession.status as "done" | "error";
        return {
          ...session,
          status: cascadeStatus,
          finished: true,
          updatedAt: event.timestamp ?? session.updatedAt,
          cards: completeCards(session.cards, cascadeStatus)
        };
      })
    : projection.subagentSessions;

  return {
    ...projection,
    mainSession: nextMainSession,
    subagentSessions,
    eventCount: projection.eventCount + 1
  };
}

/**
 * Projects either a completed history replay or a collected live stream using
 * the exact same reducer.
 */
export function projectDataHubExecutionEvents(
  events: Iterable<DataHubStreamEvent>,
  options: DataHubExecutionProjectionOptions = {}
): DataHubExecutionProjection {
  let projection = createDataHubExecutionProjection(options);
  for (const event of events) {
    projection = reduceDataHubExecutionEvent(projection, event);
  }

  const explicitMainStatus =
    projection.mainSession.status === "done" ||
    projection.mainSession.status === "error"
      ? projection.mainSession.status
      : undefined;
  const terminalStatus = explicitMainStatus ?? options.terminalStatus;

  if (terminalStatus) {
    const settleSession = (
      session: DataHubExecutionSession
    ): DataHubExecutionSession => {
      const sessionTerminalStatus =
        session.status === "done" || session.status === "error"
          ? session.status
          : terminalStatus;

      return {
        ...session,
        status: sessionTerminalStatus,
        finished: true,
        cards: completeCards(session.cards, sessionTerminalStatus)
      };
    };

    projection = {
      ...projection,
      mainSession: settleSession(projection.mainSession),
      subagentSessions: projection.subagentSessions.map(settleSession)
    };
  }

  return projection;
}

/** Builds the recursive child-session hierarchy without fabricating parents. */
export function buildDataHubSubagentTree(
  projection: Pick<DataHubExecutionProjection, "subagentSessions">
): DataHubSubagentTreeNode[] {
  const sessionById = new Map<string, DataHubExecutionSession>();
  const childIds = new Map<string, string[]>();

  for (const session of projection.subagentSessions) {
    if (session.sessionId) {
      sessionById.set(session.sessionId, session);
    }
  }

  const rootIds: string[] = [];
  for (const session of projection.subagentSessions) {
    const sessionId = session.sessionId;
    if (!sessionId) {
      continue;
    }
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId || !sessionById.has(parentSessionId) || parentSessionId === sessionId) {
      rootIds.push(sessionId);
      continue;
    }
    const children = childIds.get(parentSessionId) ?? [];
    children.push(sessionId);
    childIds.set(parentSessionId, children);
  }

  const visited = new Set<string>();
  const appendNode = (
    sessionId: string,
    level: number,
    ancestors: ReadonlySet<string>
  ): DataHubSubagentTreeNode | null => {
    const session = sessionById.get(sessionId);
    if (!session || ancestors.has(sessionId)) {
      return null;
    }
    visited.add(sessionId);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(sessionId);
    const children = (childIds.get(sessionId) ?? [])
      .map((childId) => appendNode(childId, level + 1, nextAncestors))
      .filter((node): node is DataHubSubagentTreeNode => node !== null);
    return {
      session,
      level,
      children
    };
  };

  const roots = rootIds
    .map((sessionId) => appendNode(sessionId, 0, new Set()))
    .filter((node): node is DataHubSubagentTreeNode => node !== null);

  // Corrupt or cyclic history must remain inspectable, but is never attached
  // to a fabricated parent.
  for (const sessionId of sessionById.keys()) {
    if (visited.has(sessionId)) {
      continue;
    }
    const node = appendNode(sessionId, 0, new Set());
    if (node) {
      roots.push(node);
    }
  }

  return roots;
}

/** Flattens the recursive tree for a sidebar while retaining nesting levels. */
export function flattenDataHubSubagentTree(
  tree: readonly DataHubSubagentTreeNode[]
): DataHubSubagentTreeEntry[] {
  const entries: DataHubSubagentTreeEntry[] = [];
  const append = (node: DataHubSubagentTreeNode) => {
    entries.push({
      session: node.session,
      level: node.level
    });
    node.children.forEach(append);
  };
  tree.forEach(append);
  return entries;
}
