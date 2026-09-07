import { splitDataHubThinkingEnvelope } from "./dataHubThinkingEnvelope";
import { getDataHubEventPayload } from "./dataHubEventAdapter";
import type { DataHubAskDataStatus, DataHubStreamEvent } from "@/types/dataHub";

function eventTime(event?: DataHubStreamEvent) {
  const value = event?.timestamp;
  if (value == null) return undefined;
  const time = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

const queryTypes = new Set([
  "subagent_exposed", "react_step", "tool_call", "tool_result", "data_source_selected"
]);
const resultAttachmentTypes = new Set(["table", "chart", "document_url", "citation_document"]);
type PhaseStatus = "running" | "done" | "error" | "cancelled";

/** 用真实事件边界推进阶段；检索中间表和子智能体的回答不能提前结束根任务。 */
export function getDataHubResponsePhases(
  events: DataHubStreamEvent[],
  status: DataHubAskDataStatus,
  startedAt?: number,
  endedAt?: number
) {
  let queryIndex = -1;
  let answerIndex = -1;
  let thinkingIndex = -1;
  let rootText = "";
  let rootReply = "";
  const childSessions = new Set<string>();
  for (const [index, event] of events.entries()) {
    const payload = getDataHubEventPayload(event);
    if (event.type === "subagent_exposed") {
      const exposedSession = payload && typeof payload === "object" && "sessionId" in payload && typeof payload.sessionId === "string"
        ? payload.sessionId : event.sessionId;
      if (exposedSession) childSessions.add(exposedSession);
    }
    const child = Boolean(event.parentSessionId || event.subagentId || (event.sessionId && childSessions.has(event.sessionId)));
    const toolActivity = event.type === "activity" && payload !== null && typeof payload === "object"
      && "kind" in payload && payload.kind === "tool";
    if (queryTypes.has(event.type) || toolActivity) {
      if (queryIndex < 0) queryIndex = index;
      answerIndex = -1;
      rootText = "";
      thinkingIndex = -1;
    } else if (resultAttachmentTypes.has(event.type) && queryIndex < 0) {
      queryIndex = index;
      if (answerIndex < 0) thinkingIndex = -1;
    }
    if (!child && (event.type === "thinking" || event.type === "final_thinking" || event.isThinking)) {
      thinkingIndex = index;
      answerIndex = -1;
      rootText = "";
    } else if (!child && (event.type === "text" || event.type === "content")) {
      const text = typeof payload === "string" ? payload
        : payload && typeof payload === "object" && "text" in payload ? payload.text
          : payload && typeof payload === "object" && "content" in payload ? payload.content : "";
      const reply = `${event.replyId ?? ""}::${event.modelCallIndex ?? ""}`;
      if (reply !== rootReply) {
        rootText = "";
        rootReply = reply;
        answerIndex = -1;
      }
      if (typeof text === "string") rootText += text;
      if (splitDataHubThinkingEnvelope(rootText).answer.trim() && answerIndex < 0) {
        answerIndex = index;
        thinkingIndex = -1;
      }
    }
  }
  const terminal = status === "done" || status === "error" || status === "cancelled";
  const interrupted = status === "error" || status === "cancelled";
  const terminalStatus: PhaseStatus = terminal ? status : "running";
  const queryStartedAt = queryIndex >= 0 && (answerIndex < 0 || queryIndex < answerIndex)
    ? eventTime(events[queryIndex]) : undefined;
  const answerStartedAt = answerIndex >= 0 ? eventTime(events[answerIndex]) : undefined;
  const thinkingEnd = thinkingIndex >= 0 ? endedAt : queryStartedAt ?? answerStartedAt ?? endedAt;
  const queryEnd = answerStartedAt ?? endedAt;
  const duration = (start?: number, end?: number) => start != null && end != null
    ? Math.max(0, end - start) : undefined;
  const thinkingStatus: PhaseStatus = interrupted ? status
    : thinkingIndex >= 0 ? terminalStatus
      : queryIndex >= 0 || answerIndex >= 0 ? "done" : terminalStatus;
  const queryStatus: PhaseStatus = interrupted ? status : answerIndex >= 0 ? "done" : terminalStatus;
  return {
    showQuery: queryIndex >= 0,
    showResult: answerIndex >= 0 || terminal,
    thinkingStatus,
    thinkingDurationMs: duration(startedAt, thinkingEnd),
    queryStatus,
    queryStartedAt,
    queryDurationMs: duration(queryStartedAt, queryEnd)
  };
}
