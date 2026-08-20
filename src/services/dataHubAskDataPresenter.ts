import type {
  DataHubAskDataStatus,
  AskArtifactRef,
  DataHubAskTurn,
  DataHubCitationDocument,
  DataHubContentBlock,
  DataHubDataSourceSelected,
  DataHubDoneData,
  DataHubReactStepData,
  DataHubRoutingDecomposeData,
  DataHubStreamEvent,
  DataHubTableColumn,
  DataHubTableResult,
  DataHubToolCallData,
  DataHubToolResultData
} from "@/types/dataHub";
import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";

type UnknownRecord = Record<string, unknown>;

const actionLabels: Record<string, string> = {
  route_intent: "意图路由",
  locate_datasource: "定位数据源",
  plan_with_datasource_skill: "查看数据源 Skill 并规划",
  match_skill: "匹配业务语义",
  load_cube_meta: "加载语义模型",
  generate_query: "生成查询",
  execute_query: "执行查询",
  nl2sql_fallback: "SQL 兜底",
  finalize: "完成总结",
  decompose: "问题拆解",
  llm_decision: "Agent 决策"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const text = value.trim();
  if (!text) {
    return value;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function unwrapEventData(value: unknown): unknown {
  const parsed = parseJsonMaybe(value);

  if (isRecord(parsed) && "data" in parsed && typeof parsed.type === "string") {
    return parseJsonMaybe(parsed.data);
  }

  return parsed;
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const data = unwrapEventData(value);

  if (isRecord(data)) {
    return asString(data.text) || asString(data.content) || asString(data.message) || asString(data.summary);
  }

  return "";
}

function readError(value: unknown): { code?: number; message: string } | undefined {
  const data = unwrapEventData(value);

  if (typeof data === "string") {
    return { message: data };
  }

  if (isRecord(data)) {
    const code = typeof data.code === "number" ? data.code : undefined;
    const message =
      asString(data.message) || asString(data.error) || asString(data.errorMsg) || asString(data.summary);

    if (message) {
      return { code, message };
    }
  }

  return undefined;
}

function normalizeColumns(columns: unknown, rows: unknown): DataHubTableColumn[] {
  const parsedColumns = parseJsonMaybe(columns);
  const parsedRows = parseJsonMaybe(rows);

  if (Array.isArray(parsedColumns) && parsedColumns.length > 0) {
    return parsedColumns.map((column, index) => {
      if (typeof column === "string") {
        return { key: column, title: formatDataHubColumnTitle(column, column) };
      }

      if (isRecord(column)) {
        const key =
          asString(column.name) ||
          asString(column.key) ||
          asString(column.field) ||
          asString(column.title) ||
          `col_${index + 1}`;
        const rawTitle = asString(column.label) || asString(column.title) || asString(column.name) || key;
        const title = formatDataHubColumnTitle(rawTitle, key);
        const type = asString(column.type) || undefined;
        return { key, title, type };
      }

      const key = `col_${index + 1}`;
      return { key, title: key };
    });
  }

  if (Array.isArray(parsedRows) && parsedRows.length > 0) {
    if (isRecord(parsedRows[0])) {
      return Object.keys(parsedRows[0]).map((key) => ({
        key,
        title: formatDataHubColumnTitle(key, key)
      }));
    }

    if (Array.isArray(parsedRows[0])) {
      return parsedRows[0].map((_, index) => {
        const key = `col_${index + 1}`;
        return { key, title: key };
      });
    }
  }

  return [];
}

function normalizeRows(rows: unknown, columns: DataHubTableColumn[]): Record<string, unknown>[] {
  const parsedRows = parseJsonMaybe(rows);

  if (!Array.isArray(parsedRows)) {
    return [];
  }

  return parsedRows.map((row) => {
    if (Array.isArray(row)) {
      const effectiveColumns =
        columns.length > 0
          ? columns
          : row.map((_, index) => {
              const key = `col_${index + 1}`;
              return { key, title: key };
            });

      return effectiveColumns.reduce<Record<string, unknown>>((result, column, index) => {
        result[column.key] = row[index];
        return result;
      }, {});
    }

    if (isRecord(row)) {
      return row;
    }

    return { value: row };
  });
}

export function normalizeDataHubTableResult(input: unknown, tableIndex = 0): DataHubTableResult | null {
  const data = unwrapEventData(input);
  const candidate =
    isRecord(data) && (data.type === "table" || data.type === "result") && "data" in data ? data.data : data;
  const parsedCandidate = parseJsonMaybe(candidate);

  if (Array.isArray(parsedCandidate)) {
    const columns = normalizeColumns(undefined, parsedCandidate);
    return {
      columns,
      rows: normalizeRows(parsedCandidate, columns),
      totalRows: parsedCandidate.length,
      tableIndex
    };
  }

  if (!isRecord(parsedCandidate)) {
    return null;
  }

  const nested = parsedCandidate.result ?? parsedCandidate.payload;
  if (!("columns" in parsedCandidate) && !("rows" in parsedCandidate) && nested) {
    return normalizeDataHubTableResult(nested, tableIndex);
  }

  const rawRows =
    parsedCandidate.rows ?? parsedCandidate.records ?? parsedCandidate.values ?? parsedCandidate.data ?? [];
  const columns = normalizeColumns(parsedCandidate.columns, rawRows);
  const rows = normalizeRows(rawRows, columns);

  if (columns.length === 0 && rows.length === 0) {
    return null;
  }

  return {
    columns,
    rows,
    totalRows:
      typeof parsedCandidate.totalRows === "number"
        ? parsedCandidate.totalRows
        : typeof parsedCandidate.total === "number"
          ? parsedCandidate.total
          : typeof parsedCandidate.rowCount === "number"
            ? parsedCandidate.rowCount
            : rows.length,
    groupIndex: typeof parsedCandidate.groupIndex === "number" ? parsedCandidate.groupIndex : undefined,
    groupLabel: asString(parsedCandidate.groupLabel) || undefined,
    source: asString(parsedCandidate.source) || undefined,
    tableIndex
  };
}

/**
 * DataHub 正式回答规则，与平台 ChatService.AssistantReply
 * 以及 `finalAnswerAfterStream(summary, streamed, hasError)` 保持一致：
 * 终态 summary 优先，没有才用主会话流式文本；出错则不展示半成品。
 */
export function resolveDataHubFinalAnswer(
  summary: unknown,
  streamedContent: unknown,
  hasTerminalError: boolean
): string {
  if (hasTerminalError) {
    return "";
  }

  const finalSummary = String(summary ?? "").trim();
  return finalSummary || String(streamedContent ?? "").trim();
}

export function getDataHubActionLabel(action?: string): string {
  if (!action) {
    return "执行步骤";
  }

  return actionLabels[action] ?? action;
}

export function getDataHubStatusLabel(status?: string): string {
  if (status === "success") {
    return "完成";
  }

  if (status === "running") {
    return "运行中";
  }

  if (status === "error" || status === "fail") {
    return "失败";
  }

  return status || "处理中";
}

function normalizeReactStep(data: unknown): DataHubReactStepData {
  const record = isRecord(unwrapEventData(data)) ? (unwrapEventData(data) as UnknownRecord) : {};

  return {
    round: typeof record.round === "number" ? record.round : undefined,
    stepNum: typeof record.stepNum === "number" ? record.stepNum : undefined,
    action: asString(record.action),
    stepType: asString(record.stepType),
    status: asString(record.status),
    summary: asString(record.summary),
    content: asString(record.content),
    resultSummary: asString(record.resultSummary),
    reason: asString(record.reason),
    durationMs: typeof record.durationMs === "number" ? record.durationMs : undefined
  };
}

function normalizeToolCall(data: unknown): DataHubToolCallData {
  return isRecord(unwrapEventData(data)) ? (unwrapEventData(data) as DataHubToolCallData) : {};
}

function normalizeToolResult(data: unknown): DataHubToolResultData {
  return isRecord(unwrapEventData(data)) ? (unwrapEventData(data) as DataHubToolResultData) : {};
}

function normalizeDecompose(data: unknown): DataHubRoutingDecomposeData | undefined {
  const record = unwrapEventData(data);

  if (!isRecord(record)) {
    return undefined;
  }

  return {
    executionMode: asString(record.executionMode),
    subQuestions: Array.isArray(record.subQuestions) ? record.subQuestions.map(asString).filter(Boolean) : []
  };
}

function normalizeDone(data: unknown): DataHubDoneData | undefined {
  const record = unwrapEventData(data);

  return isRecord(record) ? (record as DataHubDoneData) : undefined;
}

function normalizeArtifact(data: unknown): AskArtifactRef | undefined {
  const record = unwrapEventData(data);
  if (!isRecord(record)) return undefined;
  const askRunId = asString(record.askRunId);
  const resolvedQuestion = asString(record.resolvedQuestion);
  if (!askRunId) return undefined;
  return {
    askRunId,
    resolvedQuestion,
    canFavorite: record.canFavorite === true
  };
}

function appendContentBlock(
  blocks: DataHubContentBlock[],
  content: string,
  event: DataHubStreamEvent
) {
  if (!content) {
    return;
  }

  const previous = blocks[blocks.length - 1];
  const sameModelCall =
    previous &&
    previous.replyId === event.replyId &&
    previous.modelCallIndex === event.modelCallIndex &&
    (event.modelCallIndex !== undefined ||
      (event.replyId === undefined && previous.replyId === undefined));

  if (sameModelCall) {
    previous.content += content;
    return;
  }

  blocks.push({
    content,
    replyId: event.replyId,
    modelCallIndex: event.modelCallIndex
  });
}

function normalizeDataSource(data: unknown): DataHubDataSourceSelected | undefined {
  const record = unwrapEventData(data);
  if (!isRecord(record)) {
    return undefined;
  }

  const datasourceId = record.datasourceId;
  const datasourceName = asString(record.datasourceName);
  if ((typeof datasourceId !== "string" && typeof datasourceId !== "number") || !datasourceName) {
    return undefined;
  }

  return { datasourceId, datasourceName };
}

function normalizeCitationDocument(data: unknown): DataHubCitationDocument | undefined {
  const record = unwrapEventData(data);
  if (!isRecord(record)) {
    return undefined;
  }

  const docId = asString(record.docId).trim();
  const docKey = asString(record.docKey).trim();
  const kbId = asString(record.kbId).trim();
  if (!docId || !docKey || !kbId) {
    return undefined;
  }

  return {
    docId,
    docKey,
    kbId,
    docName: asString(record.docName).trim() || undefined,
    fileName: asString(record.fileName).trim() || undefined,
    sourceAvailable: record.sourceAvailable !== false,
    markdownAvailable:
      typeof record.markdownAvailable === "boolean" ? record.markdownAvailable : undefined,
    fragments: Array.isArray(record.fragments)
      ? record.fragments.map(asString).map((fragment) => fragment.trim()).filter(Boolean).slice(0, 3)
      : []
  };
}

function appendCitationDocument(
  citations: DataHubCitationDocument[],
  citation: DataHubCitationDocument | undefined
) {
  if (!citation) {
    return;
  }

  const identity = `${citation.docId}::${citation.docKey}`;
  if (citations.some((item) => `${item.docId}::${item.docKey}` === identity)) {
    return;
  }

  citations.push(citation);
}

type DataHubTurnContext = {
  sessionId?: string | null;
  chatId?: string | null;
};

export function createDataHubAskTurn(
  question: string,
  events: DataHubStreamEvent[],
  status: DataHubAskDataStatus,
  errorMessage = "",
  context: DataHubTurnContext = {}
): DataHubAskTurn {
  const turn: DataHubAskTurn = {
    question,
    status,
    sessionId: context.sessionId || undefined,
    chatId: context.chatId || undefined,
    assistantContent: "",
    answerBlocks: [],
    thinkingContent: "",
    thinkingBlocks: [],
    infoMessages: [],
    dataSources: [],
    citationDocuments: [],
    routingEvents: [],
    reactSteps: [],
    toolCalls: [],
    toolResults: [],
    tableResults: [],
    chartResults: []
  };

  for (const event of events) {
    const payload = getDataHubEventPayload(event);
    const isSubagentEvent = Boolean(event.parentSessionId);

    if (!turn.sessionId && !isSubagentEvent && (event.globalSessionId || event.sessionId)) {
      turn.sessionId = event.globalSessionId || event.sessionId;
    }
    if (!turn.chatId && !isSubagentEvent && event.chatId) {
      turn.chatId = event.chatId;
    }

    // DataHub keeps every child execution in its own internal session. Child
    // results are rendered in the sub-agent detail view and never mutate the
    // root answer/result projection.
    if (isSubagentEvent) {
      continue;
    }

    if (event.type.startsWith("routing_") && event.type !== "routing_decompose") {
      turn.routingEvents.push(event);
    }

    if (event.type === "routing_decompose") {
      turn.decompose = normalizeDecompose(payload);
    }

    if (event.type === "react_step") {
      turn.reactSteps.push(normalizeReactStep(payload));
    }

    if (event.type === "tool_call") {
      turn.toolCalls.push(normalizeToolCall(payload));
    }

    if (event.type === "tool_result") {
      turn.toolResults.push(normalizeToolResult(payload));
    }

    if (event.type === "thinking" || event.type === "final_thinking" || event.isThinking) {
      appendContentBlock(turn.thinkingBlocks, readText(payload), event);
    } else if (event.type === "content" || event.type === "text") {
      appendContentBlock(turn.answerBlocks, readText(payload), event);
    }

    if (event.type === "info" || event.type === "hallucination") {
      const message = readText(payload);
      if (message) {
        turn.infoMessages.push(message);
      }
    }

    if (event.type === "data_source_selected") {
      const dataSource = normalizeDataSource(payload);
      if (
        dataSource &&
        !turn.dataSources.some((item) => String(item.datasourceId) === String(dataSource.datasourceId))
      ) {
        turn.dataSources.push(dataSource);
      }
    }

    if (event.type === "table") {
      const table = normalizeDataHubTableResult(payload, turn.tableResults.length);
      if (table) {
        turn.tableResults.push(table);
      }
    }

    if (event.type === "chart") {
      turn.chartResults.push(payload);
    }

    if (event.type === "done") {
      turn.done = normalizeDone(payload);
    }

    if (event.type === "ask_artifact") {
      turn.artifact = normalizeArtifact(payload);
    }

    if (event.type === "citation_document") {
      appendCitationDocument(turn.citationDocuments, normalizeCitationDocument(payload));
    }

    if (event.type === "error") {
      turn.error = readError(payload);
    }
  }

  for (const citation of turn.done?.citationDocuments ?? []) {
    appendCitationDocument(turn.citationDocuments, normalizeCitationDocument(citation));
  }

  if (turn.thinkingBlocks.length === 0 && turn.done?.thinkingContent) {
    turn.thinkingBlocks.push({ content: turn.done.thinkingContent });
  }
  turn.thinkingContent = turn.thinkingBlocks.map((block) => block.content).join("");

  if (errorMessage && !turn.error) {
    turn.error = { message: errorMessage };
  }

  const streamedAnswer = turn.answerBlocks.map((block) => block.content).join("");
  const officialAnswer = resolveDataHubFinalAnswer(
    turn.done?.summary,
    streamedAnswer,
    Boolean(turn.error)
  );
  turn.answerBlocks = officialAnswer
    ? officialAnswer === streamedAnswer
      ? turn.answerBlocks
      : [{ content: officialAnswer }]
    : [];
  turn.assistantContent = officialAnswer;

  return turn;
}
