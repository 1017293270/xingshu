import type {
  DataHubExecutionBlock,
  DataHubExecutionSession,
  DataHubStreamEvent,
  DataHubSubagentTreeNode
} from "@/types/dataHub";
import type { DataHubExecutionEventView } from "./types";

type UnknownRecord = Record<string, unknown>;

export const executionStatusLabel = {
  idle: "等待执行",
  running: "运行中",
  done: "已完成",
  error: "执行失败",
  cancelled: "已停止"
} as const;

export function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((item): item is string => Boolean(item))
    : [];
}

export function formatExecutionTime(value?: number | string): string {
  if (value === undefined) {
    return "";
  }
  const date =
    typeof value === "number" && value < 1_000_000_000_000
      ? new Date(value * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

export function formatExecutionDuration(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  if (value < 60_000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
  }
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function executionTimeMs(value?: number | string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value < 1_000_000_000_000
        ? value * 1000
        : value
      : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * 会话耗时：运行中按 nowMs 实时累计，结束后优先取后端 totalDurationMs，
 * 否则用 updatedAt - startedAt 兜底。
 */
export function sessionElapsedMs(
  session: DataHubExecutionSession,
  nowMs: number
): number | undefined {
  const startedMs = executionTimeMs(session.startedAt);
  if (session.status === "running" && startedMs !== undefined) {
    return Math.max(0, nowMs - startedMs);
  }
  if (session.done?.totalDurationMs !== undefined) {
    return session.done.totalDurationMs;
  }
  if (startedMs === undefined) {
    return undefined;
  }
  const endedMs = executionTimeMs(session.updatedAt);
  return endedMs === undefined ? undefined : Math.max(0, endedMs - startedMs);
}

/**
 * 按派发顺序（树的 DFS 展开序）为每个子智能体分配标识色 tone，
 * 取值按色相距离拉开，保证同屏相邻的智能体颜色不同；
 * 同一棵树在任何视图计算结果一致，可跨面板寻路。
 */
const SUBAGENT_TONE_SPREAD = [1, 3, 5, 2, 4, 6] as const;

export function assignSubagentTones(
  nodes: readonly DataHubSubagentTreeNode[]
): Map<string, number> {
  const tones = new Map<string, number>();
  flattenSubagentTree(nodes).forEach((node, index) => {
    const { session } = node;
    const key = session.sessionId ?? session.subagentId;
    if (!key || tones.has(key)) {
      return;
    }
    tones.set(
      key,
      SUBAGENT_TONE_SPREAD[index % SUBAGENT_TONE_SPREAD.length]
    );
  });
  return tones;
}

export function formatStructuredContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function executionBlockLabel(block: DataHubExecutionBlock): string {
  if (block.isThinking || block.type === "thinking" || block.type === "final_thinking") {
    return block.type === "final_thinking" ? "最终思考" : "思考过程";
  }
  const labels: Record<string, string> = {
    content: "正式回答",
    text: "正式回答",
    routing_intent: "意图识别",
    routing_skill: "能力路由",
    routing_strategy: "执行策略",
    routing_decompose: "任务拆解",
    react_step: "推理步骤",
    tool_call: "工具调用",
    tool_result: "工具结果",
    data_source_selected: "数据源",
    table: "查询结果",
    chart: "数据图表",
    citation_document: "引用文档",
    document_url: "原文",
    ask_artifact: "问数产物",
    info: "系统信息",
    hallucination: "可信度提示",
    error: "执行错误"
  };
  return labels[block.type] ?? labels[block.sourceType] ?? block.type;
}

function eventContent(event: DataHubStreamEvent): unknown {
  return event.content !== undefined ? event.content : event.data;
}

function eventStatus(event: DataHubStreamEvent): DataHubExecutionEventView["status"] {
  const record = asRecord(eventContent(event));
  const status = asString(record?.status)?.toLowerCase();
  if (
    event.type === "error" ||
    record?.failed === true ||
    status === "error" ||
    status === "fail" ||
    status === "failed"
  ) {
    return "error";
  }
  if (
    event.type === "done" ||
    event.type === "tool_result" ||
    event.finished ||
    status === "done" ||
    status === "success" ||
    status === "completed"
  ) {
    return "done";
  }
  if (status === "pending" || status === "idle") {
    return "idle";
  }
  return "running";
}

function toolName(record?: UnknownRecord): string | undefined {
  return (
    asString(record?.toolName) ??
    asString(record?.tool) ??
    asString(record?.name) ??
    asString(record?.action)
  );
}

function executionEventCopy(event: DataHubStreamEvent): {
  title: string;
  summary?: string;
  durationMs?: number;
} {
  const value = eventContent(event);
  const record = asRecord(value);
  const raw = asString(value);
  switch (event.type) {
    case "routing_intent":
      return {
        title: "识别用户意图",
        summary:
          asString(record?.intentLabel) ??
          asString(record?.intent) ??
          asString(record?.summary) ??
          raw
      };
    case "routing_skill":
      return {
        title: "匹配执行能力",
        summary:
          asString(record?.skillLabel) ??
          asString(record?.skillName) ??
          asString(record?.skill) ??
          asString(record?.summary) ??
          raw
      };
    case "routing_strategy":
      return {
        title: "制定执行策略",
        summary:
          asString(record?.strategyLabel) ??
          asString(record?.strategy) ??
          asString(record?.summary) ??
          raw
      };
    case "routing_decompose": {
      const questions = asStringArray(record?.subQuestions ?? record?.questions);
      return {
        title: "拆解任务",
        summary:
          questions.length > 0
            ? `拆分为 ${questions.length} 个子任务`
            : asString(record?.summary) ?? raw
      };
    }
    case "react_step": {
      const round = asNumber(
        record?.round ??
          record?.childRound ??
          record?.parentRound ??
          record?.sourceRound ??
          record?.stepNum
      );
      return {
        title: round !== undefined ? `第 ${round} 轮推理` : "执行推理步骤",
        summary:
          asString(record?.actionLabel) ??
          asString(record?.action) ??
          asString(record?.stepType) ??
          asString(record?.summary) ??
          asString(record?.content),
        durationMs: asNumber(record?.durationMs)
      };
    }
    case "tool_call": {
      const name = toolName(record);
      return {
        title: name ? `调用工具：${name}` : "调用工具",
        summary: asString(record?.summary) ?? asString(record?.step)
      };
    }
    case "tool_result": {
      const name = toolName(record);
      return {
        title: name ? `工具返回：${name}` : "工具返回结果",
        summary:
          asString(record?.summary) ??
          asString(record?.resultSummary) ??
          asString(record?.status),
        durationMs: asNumber(record?.durationMs)
      };
    }
    default:
      return { title: event.type, summary: raw };
  }
}

function orchestrationSequence(event: DataHubStreamEvent) {
  const record = asRecord(eventContent(event));
  return asNumber(event.sequence ?? record?.eventSequence);
}

function reactMergeIdentity(event: DataHubStreamEvent) {
  if (event.type !== "react_step") {
    return undefined;
  }
  const record = asRecord(eventContent(event));
  const toolCallId = asString(event.toolCallId ?? record?.toolCallId);
  return toolCallId ? `react:${toolCallId}` : undefined;
}

export function orchestrationEventsForSession(
  session: DataHubExecutionSession
): DataHubExecutionEventView[] {
  const events = [
    ...session.orchestration.routingEvents,
    ...session.orchestration.reactSteps,
    ...session.orchestration.toolCalls,
    ...session.orchestration.toolResults
  ];
  const unique = new Set<DataHubStreamEvent>();
  const merged: Array<{ event: DataHubStreamEvent; arrivalIndex: number }> = [];
  const reactIndexByIdentity = new Map<string, number>();

  events.forEach((event) => {
    if (unique.has(event)) {
      return;
    }
    unique.add(event);
    const arrivalIndex = session.events.indexOf(event);
    const identity = reactMergeIdentity(event);
    const previousIndex = identity ? reactIndexByIdentity.get(identity) : undefined;
    if (previousIndex === undefined) {
      if (identity) {
        reactIndexByIdentity.set(identity, merged.length);
      }
      merged.push({ event, arrivalIndex });
      return;
    }

    const previous = merged[previousIndex];
    const previousContent = asRecord(eventContent(previous.event));
    const nextContent = asRecord(eventContent(event));
    const content =
      previousContent && nextContent
        ? { ...previousContent, ...nextContent }
        : eventContent(event);
    previous.event = {
      ...previous.event,
      ...event,
      data: content,
      content
    };
  });

  return merged
    .map(({ event, arrivalIndex }, index) => {
      const copy = executionEventCopy(event);
      return {
        id: `${reactMergeIdentity(event) ?? event.type}-${event.timestamp ?? index}-${index}`,
        event,
        type: event.type,
        title: copy.title,
        summary: copy.summary,
        status: eventStatus(event),
        timestamp: event.timestamp,
        durationMs: copy.durationMs,
        agentName:
          event.agentName ?? asString(asRecord(eventContent(event))?.agentName),
        arrivalIndex
      };
    })
    .sort((left, right) => {
      const leftSequence = orchestrationSequence(left.event);
      const rightSequence = orchestrationSequence(right.event);
      if (leftSequence !== undefined && rightSequence !== undefined) {
        return leftSequence - rightSequence;
      }
      return left.arrivalIndex - right.arrivalIndex;
    })
    .map(({ arrivalIndex: _arrivalIndex, ...item }) => item);
}

export function routeValue(
  session: DataHubExecutionSession,
  type: string,
  ...keys: string[]
): string | undefined {
  const event = session.orchestration.routingEvents.find((item) => item.type === type);
  if (!event) {
    return undefined;
  }
  const record = asRecord(eventContent(event));
  for (const key of keys) {
    const value = asString(record?.[key]);
    if (value) {
      return value;
    }
  }
  return asString(eventContent(event));
}

export function flattenSubagentTree(
  nodes: readonly DataHubSubagentTreeNode[]
): DataHubSubagentTreeNode[] {
  const flattened: DataHubSubagentTreeNode[] = [];
  const seen = new Set<string>();
  const append = (node: DataHubSubagentTreeNode) => {
    const key = node.session.sessionId ?? node.session.subagentId ?? `${node.level}-${flattened.length}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    flattened.push(node);
    node.children.forEach(append);
  };
  nodes.forEach(append);
  return flattened;
}

export function sessionDisplayName(session: DataHubExecutionSession): string {
  return session.label?.trim() || session.agentName?.trim() || "子智能体";
}

export function latestExecutionBlock(
  session: DataHubExecutionSession
): DataHubExecutionBlock | undefined {
  for (let cardIndex = session.cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
    const blocks = session.cards[cardIndex]?.blocks;
    if (blocks?.length) {
      return blocks[blocks.length - 1];
    }
  }
  return undefined;
}

export function executionBlockSummary(block: DataHubExecutionBlock): string {
  const record = asRecord(block.content);
  return (
    asString(block.content) ??
    asString(record?.summary) ??
    asString(record?.resultSummary) ??
    asString(record?.message) ??
    asString(record?.status) ??
    executionBlockLabel(block)
  );
}

/** 运行中节点的实时活动文案：取最近一次执行块摘要，兜底为等待提示 */
export function sessionActivitySummary(session: DataHubExecutionSession): string {
  if (session.status === "error") {
    return session.error?.message || "执行失败，请查看详情";
  }
  if (session.status === "done") {
    return session.done?.summary || "子任务已完成";
  }
  const block = latestExecutionBlock(session);
  if (block) {
    return executionBlockSummary(block);
  }
  return session.status === "running" ? "等待智能体返回执行事件…" : "等待执行";
}
