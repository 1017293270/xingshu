import type { DataHubStreamEvent } from "@/types/dataHub";

type UnknownRecord = Record<string, unknown>;

const stringPayloadEventTypes = [
  "content",
  "text",
  "thinking",
  "final_thinking",
  "info",
  "hallucination"
];

const knownDataHubEventTypes = new Set([
  "agent_start",
  "subagent_exposed",
  "thinking",
  "final_thinking",
  "routing_intent",
  "routing_skill",
  "routing_strategy",
  "routing_decompose",
  "react_step",
  "tool_call",
  "tool_result",
  "info",
  "content",
  "text",
  "data_source_selected",
  "table",
  "chart",
  "ask_artifact",
  "document_url",
  "citation_document",
  "hallucination",
  "done",
  "error"
]);

export type DataHubEventDefaults = Partial<
  Pick<
    DataHubStreamEvent,
    | "type"
    | "agentName"
    | "agentId"
    | "isThinking"
    | "sessionId"
    | "globalSessionId"
    | "parentSessionId"
    | "subagentId"
    | "label"
    | "replyId"
    | "modelCallIndex"
    | "chatId"
    | "eventId"
    | "sequence"
    | "toolCallId"
    | "rawType"
    | "timestamp"
    | "eventFinished"
    | "requestFinished"
    | "finished"
  >
>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function parseDataHubJsonValue(value: unknown): unknown {
  let parsed = value;

  for (let depth = 0; depth < 5 && typeof parsed === "string"; depth += 1) {
    const text = parsed.trim();
    if (!text || (!text.startsWith("{") && !text.startsWith("[") && !text.startsWith('"'))) {
      break;
    }

    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      break;
    }
  }

  return parsed;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalTimestamp(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function defaultsFromRecord(record: UnknownRecord, defaults: DataHubEventDefaults): DataHubEventDefaults {
  return {
    type: asOptionalString(record.type) ?? defaults.type,
    agentName: asOptionalString(record.agentName) ?? defaults.agentName,
    agentId: asOptionalString(record.agentId) ?? defaults.agentId,
    isThinking: asOptionalBoolean(record.isThinking) ?? defaults.isThinking,
    sessionId: asOptionalString(record.sessionId) ?? defaults.sessionId,
    globalSessionId: asOptionalString(record.globalSessionId) ?? defaults.globalSessionId,
    parentSessionId: asOptionalString(record.parentSessionId) ?? defaults.parentSessionId,
    subagentId: asOptionalString(record.subagentId) ?? defaults.subagentId,
    label: asOptionalString(record.label) ?? defaults.label,
    replyId: asOptionalString(record.replyId) ?? defaults.replyId,
    modelCallIndex: asOptionalNumber(record.modelCallIndex) ?? defaults.modelCallIndex,
    chatId: asOptionalString(record.chatId) ?? defaults.chatId,
    eventId: asOptionalString(record.eventId) ?? defaults.eventId,
    sequence:
      asOptionalNumber(record.sequence ?? record.eventSequence) ?? defaults.sequence,
    toolCallId: asOptionalString(record.toolCallId) ?? defaults.toolCallId,
    rawType: asOptionalString(record.rawType) ?? defaults.rawType,
    timestamp: asOptionalTimestamp(record.timestamp ?? record.createdAt) ?? defaults.timestamp,
    eventFinished: asOptionalBoolean(record.eventFinished) ?? defaults.eventFinished,
    requestFinished: asOptionalBoolean(record.requestFinished) ?? defaults.requestFinished,
    finished: asOptionalBoolean(record.finished) ?? defaults.finished
  };
}

function looksLikeNestedEvent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (hasOwn(value, "data") && knownDataHubEventTypes.has(value.type)) {
    return true;
  }

  return [
    "content",
    "agentName",
    "agentId",
    "isThinking",
    "sessionId",
    "globalSessionId",
    "parentSessionId",
    "subagentId",
    "label",
    "replyId",
    "modelCallIndex",
    "chatId",
    "eventId",
    "sequence",
    "eventSequence",
    "toolCallId",
    "rawType",
    "timestamp",
    "createdAt",
    "eventFinished",
    "requestFinished",
    "finished"
  ].some((key) => hasOwn(value, key));
}

function isNestedEventWrapper(
  value: unknown,
  depth = 0,
  expectedType?: string
): value is UnknownRecord {
  if (!isRecord(value) || depth >= 5) {
    return false;
  }

  if (looksLikeNestedEvent(value)) {
    return true;
  }

  if (
    value.type === expectedType &&
    stringPayloadEventTypes.includes(expectedType ?? "") &&
    hasOwn(value, "data")
  ) {
    return true;
  }

  const keys = Object.keys(value);
  if (keys.length !== 1 || (keys[0] !== "data" && keys[0] !== "content")) {
    return false;
  }

  return isNestedEventWrapper(
    parseDataHubJsonValue(value[keys[0]]),
    depth + 1,
    expectedType
  );
}

/**
 * Converts live SSE payloads and persisted event wrappers into one canonical
 * shape. New `type/content`, legacy `type/data`, and nested JSON strings all
 * pass through this function.
 */
export function adaptDataHubStreamEvent(
  value: unknown,
  defaults: DataHubEventDefaults = {}
): DataHubStreamEvent | null {
  const parsed = parseDataHubJsonValue(value);

  if (!isRecord(parsed)) {
    return defaults.type
      ? {
          ...defaults,
          type: defaults.type,
          data: parsed,
          content: parsed
        }
      : null;
  }

  const metadata = defaultsFromRecord(parsed, defaults);
  const rawData = hasOwn(parsed, "data") ? parseDataHubJsonValue(parsed.data) : undefined;

  if (isNestedEventWrapper(rawData, 0, metadata.type)) {
    return adaptDataHubStreamEvent(rawData, metadata);
  }

  if (
    !metadata.type &&
    isNestedEventWrapper(parseDataHubJsonValue(parsed.content))
  ) {
    return adaptDataHubStreamEvent(parseDataHubJsonValue(parsed.content), metadata);
  }

  if (!metadata.type) {
    return null;
  }

  const preservesStringPayload = stringPayloadEventTypes.includes(metadata.type);
  const payload = hasOwn(parsed, "content")
    ? parsed.content
    : hasOwn(parsed, "data")
      ? preservesStringPayload && typeof parsed.data === "string"
        ? parsed.data
        : rawData
      : parsed;

  const event: DataHubStreamEvent = {
    type: metadata.type,
    data: payload,
    content: payload
  };

  for (const key of [
    "agentName",
    "agentId",
    "isThinking",
    "sessionId",
    "globalSessionId",
    "parentSessionId",
    "subagentId",
    "label",
    "replyId",
    "modelCallIndex",
    "chatId",
    "eventId",
    "sequence",
    "toolCallId",
    "rawType",
    "timestamp",
    "eventFinished",
    "requestFinished",
    "finished"
  ] as const) {
    const metadataValue = metadata[key];
    if (metadataValue !== undefined) {
      Object.assign(event, { [key]: metadataValue });
    }
  }

  return event;
}

export function getDataHubEventPayload(event: DataHubStreamEvent): unknown {
  return event.data ?? event.content;
}
