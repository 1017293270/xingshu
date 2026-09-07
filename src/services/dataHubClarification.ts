import { parseDataHubJsonValue } from "@/services/dataHubEventAdapter";
import type {
  DataHubClarification,
  DataHubClarificationOption,
  DataHubClarificationResponse
} from "@/types/dataHub";

export const CLARIFICATION_EVENT_TYPE = "clarification";
export const CLARIFICATION_RESPONSE_EVENT_TYPE = "clarification_response";

/*
 * 受控澄清：Agent 调 AgentScope 原生 ask_user 把自己挂起，等用户从候选里选一个。
 * 下面的上限与白名单逐条对齐 DataHub 的 NativeInteraction（后端）与 agentExecution.ts
 * 的 isClarificationContent（前端）——它是安全边界，不是洁癖，不要自己放宽。
 */
const MAX_INTERACTION_ID_CHARS = 160;
const MAX_QUESTION_CHARS = 240;
const MAX_OPTIONS = 4;
const MAX_OPTION_LABEL_CHARS = 80;
export const MAX_CLARIFICATION_ANSWER_CHARS = 500;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 多一个键就整张作废：宁可不画卡，也不画一张字段来路不明的卡。 */
function hasOnlyKeys(value: UnknownRecord, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** DataHub 的事件常常包成 `{type, data}` 或再套一层 JSON 字符串。 */
function unwrap(payload: unknown): unknown {
  const parsed = parseDataHubJsonValue(payload);
  if (isRecord(parsed) && typeof parsed.type === "string" && "data" in parsed) {
    return parseDataHubJsonValue(parsed.data);
  }
  return parsed;
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isValidOption(option: unknown, native: boolean) {
  if (!isRecord(option)) {
    return false;
  }

  // 原生卡显示 label，提交可选 value；历史 XML 卡使用 reply 原文。
  return hasOnlyKeys(option, native ? ["label", "value"] : ["label", "reply"])
    && isBoundedText(option.label, MAX_OPTION_LABEL_CHARS)
    && (native
      ? option.value === undefined || isBoundedText(option.value, MAX_CLARIFICATION_ANSWER_CHARS)
      : isBoundedText(option.reply, MAX_CLARIFICATION_ANSWER_CHARS));
}

export function normalizeDataHubClarification(payload: unknown): DataHubClarification | null {
  const content = unwrap(payload);
  if (!isRecord(content)) {
    return null;
  }

  const { interactionId } = content;
  const native = typeof interactionId === "string";
  const valid = hasOnlyKeys(content, ["interactionId", "question", "options", "allowFreeText"])
    && (interactionId === undefined || (native && isBoundedText(interactionId, MAX_INTERACTION_ID_CHARS)))
    && isBoundedText(content.question, MAX_QUESTION_CHARS)
    && typeof content.allowFreeText === "boolean"
    && Array.isArray(content.options)
    && content.options.length > 0
    && content.options.length <= MAX_OPTIONS
    && content.options.every((option) => isValidOption(option, native));

  if (!valid) {
    return null;
  }

  const options = (content.options as UnknownRecord[]).map<DataHubClarificationOption>((option) => ({
    label: String(option.label),
    ...(typeof option.reply === "string" ? { reply: option.reply } : {}),
    ...(typeof option.value === "string" ? { value: option.value } : {})
  }));

  return {
    ...(native ? { interactionId: (interactionId as string).trim() } : {}),
    question: String(content.question),
    options,
    allowFreeText: content.allowFreeText === true
  };
}

export function normalizeDataHubClarificationResponse(
  payload: unknown
): DataHubClarificationResponse | null {
  const content = unwrap(payload);
  if (!isRecord(content)) {
    return null;
  }

  const { interactionId } = content;
  const valid = hasOnlyKeys(content, ["interactionId", "answer"])
    && (interactionId === undefined
      || interactionId === null
      || isBoundedText(interactionId, MAX_INTERACTION_ID_CHARS))
    && isBoundedText(content.answer, MAX_CLARIFICATION_ANSWER_CHARS);

  if (!valid) {
    return null;
  }

  return {
    ...(typeof interactionId === "string" ? { interactionId: interactionId.trim() } : {}),
    answer: String(content.answer).trim()
  };
}

/** 提交给后端的答案：历史 XML 卡给 reply 原文，原生卡优先 value，旧卡回退 label。 */
export function clarificationAnswerOf(option: DataHubClarificationOption) {
  return option.reply?.trim() || option.value?.trim() || option.label.trim();
}

/** 同一个 interactionId 视作同一张卡：续跑时后端会重发它，不能堆成两张。 */
export function appendDataHubClarification(
  clarifications: DataHubClarification[],
  clarification: DataHubClarification
) {
  const existing = clarification.interactionId
    ? clarifications.find((item) => item.interactionId === clarification.interactionId)
    : undefined;

  if (existing) {
    Object.assign(existing, clarification, { selectedAnswer: existing.selectedAnswer });
    return;
  }

  clarifications.push(clarification);
}

/**
 * 回填用户已选。没有 interactionId 的历史卡按「最后一张还没答的」认领，
 * 与 DataHub 的 applyClarificationResponse 保持一致。
 */
export function applyDataHubClarificationResponse(
  clarifications: DataHubClarification[],
  response: DataHubClarificationResponse
) {
  const target = response.interactionId
    ? clarifications.find((item) => item.interactionId === response.interactionId)
    : [...clarifications].reverse().find((item) => !item.interactionId && !item.selectedAnswer);

  if (target) {
    target.selectedAnswer = response.answer;
  }
}

/**
 * 澄清卡在整个会话里的唯一标识。浮层、收起状态、进场高亮都按它来认人，
 * 所以对话流和输入框上方那一份必须用同一个函数算，不能各写各的。
 */
export function clarificationKey(
  turnKey: string,
  clarification: DataHubClarification,
  index: number
) {
  return `${turnKey}:clarify:${clarification.interactionId || index}`;
}

/** 已选的卡是历史；只有未选的卡才卡着这一轮。 */
export function hasPendingClarification(turn: { clarifications?: DataHubClarification[] }) {
  return (turn.clarifications ?? []).some((item) => !item.selectedAnswer);
}
