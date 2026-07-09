import type {
  DataHubAskDataStatus,
  DataHubAskTurn,
  DataHubDoneData,
  DataHubReactStepData,
  DataHubRoutingDecomposeData,
  DataHubStreamEvent,
  DataHubTableColumn,
  DataHubTableResult,
  DataHubToolCallData,
  DataHubToolResultData
} from "@/types/dataHub";

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
  const data = unwrapEventData(value);

  if (typeof data === "string") {
    return data;
  }

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
        return { key: column, title: column };
      }

      if (isRecord(column)) {
        const key =
          asString(column.name) ||
          asString(column.key) ||
          asString(column.field) ||
          asString(column.title) ||
          `col_${index + 1}`;
        const title = asString(column.title) || asString(column.label) || asString(column.name) || key;
        const type = asString(column.type) || undefined;
        return { key, title, type };
      }

      const key = `col_${index + 1}`;
      return { key, title: key };
    });
  }

  if (Array.isArray(parsedRows) && parsedRows.length > 0) {
    if (isRecord(parsedRows[0])) {
      return Object.keys(parsedRows[0]).map((key) => ({ key, title: key }));
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

export function createDataHubAskTurn(
  question: string,
  events: DataHubStreamEvent[],
  status: DataHubAskDataStatus,
  errorMessage = ""
): DataHubAskTurn {
  const turn: DataHubAskTurn = {
    question,
    status,
    assistantContent: "",
    infoMessages: [],
    routingEvents: [],
    reactSteps: [],
    toolCalls: [],
    toolResults: [],
    tableResults: [],
    chartResults: []
  };

  for (const event of events) {
    if (event.type.startsWith("routing_") && event.type !== "routing_decompose") {
      turn.routingEvents.push(event);
    }

    if (event.type === "routing_decompose") {
      turn.decompose = normalizeDecompose(event.data);
    }

    if (event.type === "react_step") {
      turn.reactSteps.push(normalizeReactStep(event.data));
    }

    if (event.type === "tool_call") {
      turn.toolCalls.push(normalizeToolCall(event.data));
    }

    if (event.type === "tool_result") {
      turn.toolResults.push(normalizeToolResult(event.data));
    }

    if (event.type === "content" || event.type === "text") {
      turn.assistantContent += readText(event.data);
    }

    if (event.type === "info" || event.type === "hallucination") {
      const message = readText(event.data);
      if (message) {
        turn.infoMessages.push(message);
      }
    }

    if (event.type === "table") {
      const table = normalizeDataHubTableResult(event.data, turn.tableResults.length);
      if (table) {
        turn.tableResults.push(table);
      }
    }

    if (event.type === "chart") {
      turn.chartResults.push(event.data);
    }

    if (event.type === "done") {
      turn.done = normalizeDone(event.data);
    }

    if (event.type === "error") {
      turn.error = readError(event.data);
    }
  }

  if (!turn.assistantContent && turn.done?.summary) {
    turn.assistantContent = turn.done.summary;
  }

  if (errorMessage && !turn.error) {
    turn.error = { message: errorMessage };
  }

  return turn;
}
