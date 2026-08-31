import type {
  DataHubAskDataStatus,
  AskArtifactRef,
  DataHubAskTurn,
  DataHubBusinessQueryContext,
  DataHubBusinessTrace,
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
import {
  appendDataHubClarification,
  applyDataHubClarificationResponse,
  normalizeDataHubClarification,
  normalizeDataHubClarificationResponse
} from "@/services/dataHubClarification";
import {
  formatDataHubCitationFragment,
  formatDataHubColumnTitle,
  extractChineseTableName,
  hasHanScript,
  pickHanLabel
} from "@/services/dataHubFormat";

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
        const rawTitle =
          pickHanLabel([
            asString(column.comment),
            asString(column.alias),
            asString(column.label),
            asString(column.shortTitle),
            asString(column.title),
            asString(column.tableTitle),
            asString(column.name)
          ]) ||
          asString(column.label) ||
          asString(column.title) ||
          asString(column.name) ||
          key;
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

function recordFromJson(value: unknown): UnknownRecord | undefined {
  const parsed = parseJsonMaybe(value);
  return isRecord(parsed) ? parsed : undefined;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function findNestedRecord(value: unknown, keys: string[]): UnknownRecord | undefined {
  const record = recordFromJson(value);
  if (!record) return undefined;
  for (const key of keys) {
    const nested = recordFromJson(record[key]);
    if (nested) return nested;
  }
  const result = recordFromJson(record.result) ?? recordFromJson(record.output);
  return result ? findNestedRecord(result, keys) : undefined;
}

function findQueryRecord(value: unknown): UnknownRecord | undefined {
  const record = recordFromJson(value);
  if (!record) return undefined;
  if (["measures", "dimensions", "timeDimensions", "filters"].some((key) => key in record)) {
    return record;
  }
  const direct = findNestedRecord(record, ["query", "cubeQuery", "cube_query", "cubeQueryJson"]);
  if (direct) return direct;
  const result = recordFromJson(record.result) ?? recordFromJson(record.output);
  return result ? findQueryRecord(result) : undefined;
}

function annotationFor(value: unknown): UnknownRecord | undefined {
  return findNestedRecord(value, ["annotation"]);
}

function annotationMember(
  annotation: UnknownRecord | undefined,
  member: string
): UnknownRecord | undefined {
  for (const key of ["measures", "dimensions", "timeDimensions"]) {
    const bucket = recordFromJson(annotation?.[key]);
    const meta = recordFromJson(bucket?.[member]);
    if (meta) return meta;
  }
  return undefined;
}

function friendlyMemberLabel(
  member: string,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord,
  fallbackIndex = 0
) {
  const column = columns.find((candidate) => candidate.key === member);
  const meta = annotationMember(annotation, member);
  const candidate =
    pickHanLabel([
      asString(meta?.shortTitle),
      asString(meta?.title),
      asString(meta?.label),
      column?.title
    ]) || column?.title || asString(meta?.shortTitle) || asString(meta?.title);
  const formatted = candidate ? formatDataHubColumnTitle(candidate, member) : "";
  if (formatted && !/[._]/.test(formatted)) return formatted;
  const mapped = formatDataHubColumnTitle(member, member);
  return mapped && !/[._]/.test(mapped) ? mapped : `业务字段 ${fallbackIndex + 1}`;
}

function stringMembers(value: unknown) {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

const filterOperatorLabels: Record<string, string> = {
  equals: "等于",
  notEquals: "不等于",
  contains: "包含",
  notContains: "不包含",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  inDateRange: "位于",
  beforeDate: "早于",
  afterDate: "晚于",
  set: "有值",
  notSet: "为空"
};

function filterDescriptions(
  value: unknown,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => filterDescriptions(item, columns, annotation));
  }
  const record = recordFromJson(value);
  if (!record) return [];
  for (const key of ["and", "or"]) {
    if (Array.isArray(record[key])) {
      const children = filterDescriptions(record[key], columns, annotation);
      return children.length
        ? [`${key === "and" ? "同时满足" : "满足任一"}：${children.join("；")}`]
        : [];
    }
  }
  const member = asString(record.member) || asString(record.dimension);
  if (!member) return [];
  const label = friendlyMemberLabel(member, columns, annotation);
  const operator = filterOperatorLabels[asString(record.operator)] || "符合";
  const values = Array.isArray(record.values)
    ? record.values.map(asString).filter(Boolean).slice(0, 6)
    : [asString(record.value)].filter(Boolean);
  return [`${label}${operator}${values.length ? `“${values.join("、")}”` : ""}`];
}

function aggregationLabel(member: string, meta?: UnknownRecord) {
  const value = `${asString(meta?.type)} ${member.slice(member.lastIndexOf(".") + 1)}`.toLowerCase();
  if (/countdistinct|count_distinct|distinct/.test(value)) return "去重计数";
  if (/count/.test(value)) return "计数";
  if (/sum|total/.test(value)) return "求和";
  if (/avg|average|mean/.test(value)) return "计算平均值";
  if (/\bmin\b|minimum/.test(value)) return "取最小值";
  if (/\bmax\b|maximum/.test(value)) return "取最大值";
  return "按企业语义模型定义计算";
}

function businessTerms(meta?: UnknownRecord) {
  const value = meta?.businessTerms ?? meta?.synonyms ?? meta?.aliases;
  return Array.isArray(value) ? value.map(asString).filter(Boolean).slice(0, 6) : [];
}

function timeDescriptions(
  value: unknown,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord
) {
  const granularityLabels: Record<string, string> = {
    day: "日",
    week: "周",
    month: "月",
    quarter: "季度",
    year: "年"
  };
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const record = recordFromJson(item);
    const member = asString(record?.dimension) || asString(item);
    if (!member) return [];
    const label = friendlyMemberLabel(member, columns, annotation, index);
    const range = Array.isArray(record?.dateRange)
      ? record.dateRange.map(asString).filter(Boolean).join(" 至 ")
      : asString(record?.dateRange);
    const granularity = asString(record?.granularity);
    const granularityLabel = granularityLabels[granularity.toLowerCase()] || granularity;
    return [`${label}${range ? `：${range}` : ""}${granularityLabel ? `（按${granularityLabel}）` : ""}`];
  });
}

function normalizeBusinessQueryContext(
  value: unknown,
  columns: DataHubTableColumn[]
): DataHubBusinessQueryContext | undefined {
  const query = findQueryRecord(value);
  const annotation = annotationFor(value);
  if (!query && !annotation) return undefined;

  const measures = stringMembers(query?.measures);
  const dimensions = stringMembers(query?.dimensions);
  const times = timeDescriptions(query?.timeDimensions, columns, annotation);
  const measureLabels = measures.map((member, index) =>
    friendlyMemberLabel(member, columns, annotation, index));
  const dimensionLabels = dimensions.map((member, index) =>
    friendlyMemberLabel(member, columns, annotation, measureLabels.length + index));
  const calculationEntries = measures.map((member, index) => {
    const label = measureLabels[index];
    return `${label}：${aggregationLabel(member, annotationMember(annotation, member))}`;
  });
  const synonymEntries = measures.concat(dimensions).flatMap((member, index) => {
    const terms = businessTerms(annotationMember(annotation, member));
    return terms.length
      ? [`${friendlyMemberLabel(member, columns, annotation, index)}：${terms.join("、")}`]
      : [];
  });
  const cubeNames = new Set(
    measures.concat(dimensions).concat(
      Array.isArray(query?.timeDimensions)
        ? query.timeDimensions.map((item) => asString(recordFromJson(item)?.dimension)).filter(Boolean)
        : []
    ).map((member) => member.split(".")[0]).filter(Boolean)
  );
  const outer = recordFromJson(value);
  const nested = recordFromJson(outer?.result) ?? recordFromJson(outer?.output);
  const rawUsedAssets = outer?.usedAssets ?? nested?.usedAssets;
  const usedAssets = Array.isArray(rawUsedAssets) ? rawUsedAssets : [];
  const assetLabels = usedAssets.flatMap((asset) => {
    const record = recordFromJson(asset);
    const label = pickHanLabel([
      asString(record?.businessName),
      asString(record?.displayName),
      asString(record?.assetTitle),
      asString(record?.assetName)
    ]);
    return label ? [label] : [];
  });
  const tableLabels = columns.flatMap((column) => {
    const label = extractChineseTableName(column.title) || extractChineseTableName(column.key);
    return label ? [label] : [];
  });

  return {
    dataTables: uniqueStrings([...assetLabels, ...tableLabels]),
    fields: uniqueStrings([...measureLabels, ...dimensionLabels, ...columns.map((column) => column.title)]),
    filters: uniqueStrings(filterDescriptions(query?.filters, columns, annotation)),
    calculations: uniqueStrings(calculationEntries),
    relationships: query
      ? [cubeNames.size > 1
          ? "多个业务主题按已发布语义模型关系关联"
          : "单一业务主题，本次没有跨主题关联"]
      : [],
    metricDefinitions: uniqueStrings(measures.map((member, index) => {
      const meta = annotationMember(annotation, member);
      const definition = pickHanLabel([
        asString(meta?.businessDefinition),
        asString(meta?.definition),
        asString(meta?.businessDescription),
        asString(meta?.description)
      ]);
      return `${measureLabels[index]}：${definition || "采用企业语义模型中已发布的指标口径"}`;
    })),
    synonymMappings: uniqueStrings(synonymEntries),
    time: uniqueStrings(times)
  };
}

function columnsFromAnnotation(value: unknown) {
  const annotation = recordFromJson(value);
  if (!annotation) return undefined;
  const columns = ["measures", "dimensions", "timeDimensions"].flatMap((key) => {
    const bucket = recordFromJson(annotation[key]);
    return bucket
      ? Object.entries(bucket).map(([name, meta]) => ({ name, ...recordFromJson(meta) }))
      : [];
  });
  return columns.length ? columns : undefined;
}

function tableCommentFromAnnotation(value: unknown) {
  const annotation = recordFromJson(value);
  if (!annotation) return undefined;

  for (const key of ["measures", "dimensions", "timeDimensions"]) {
    const bucket = recordFromJson(annotation[key]);
    if (!bucket) continue;

    for (const value of Object.values(bucket)) {
      const meta = recordFromJson(value);
      const title = asString(meta?.title).trim();
      const shortTitle = asString(meta?.shortTitle).trim();
      if (!title || !shortTitle || title === shortTitle || !title.endsWith(shortTitle)) continue;

      const comment = title.slice(0, -shortTitle.length).replace(/[\s|｜·:：/—-]+$/u, "").trim();
      if (hasHanScript(comment)) return comment;
    }
  }

  return undefined;
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
  const columns = normalizeColumns(
    parsedCandidate.columns ?? columnsFromAnnotation(parsedCandidate.annotation),
    rawRows
  );
  const rows = normalizeRows(rawRows, columns);
  const annotatedTableComment = tableCommentFromAnnotation(parsedCandidate.annotation);

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
    groupLabel:
      [
        asString(parsedCandidate.tableComment),
        annotatedTableComment,
        asString(parsedCandidate.tableTitle),
        asString(parsedCandidate.comment),
        asString(parsedCandidate.remark),
        asString(parsedCandidate.caption),
        asString(parsedCandidate.entityName),
        asString(parsedCandidate.modelName),
        asString(parsedCandidate.groupLabel),
        asString(parsedCandidate.tableName)
      ].find(hasHanScript) ||
      asString(parsedCandidate.groupLabel) ||
      asString(parsedCandidate.tableName) ||
      undefined,
    source: asString(parsedCandidate.source) || undefined,
    business: normalizeBusinessQueryContext(parsedCandidate, columns),
    tableIndex
  };
}

function isOrchestrationStatusSummary(summary: string) {
  const text = summary.trim();
  if (!text || text.length > 24 || /[，,；;：:]/.test(text)) {
    return false;
  }
  return /完成/.test(text);
}

/**
 * DataHub 正式回答规则，与平台 ChatService.AssistantReply
 * 以及 `finalAnswerAfterStream(summary, streamed, hasError)` 保持一致：
 * 终态 summary 优先，没有才用主会话流式文本；出错则不展示半成品。
 * Agent 编排的 done.summary 经常只是「均已完成」这类收束状态，不能盖掉流式综合结论。
 */
export function resolveDataHubFinalAnswer(
  summary: unknown,
  streamedContent: unknown,
  hasTerminalError: boolean,
  options: { keepRicherStreamedAnswer?: boolean } = {}
): string {
  if (hasTerminalError) {
    return "";
  }

  const finalSummary = String(summary ?? "").trim();
  const streamedText = String(streamedContent ?? "").trim();
  if (options.keepRicherStreamedAnswer && streamedText && isOrchestrationStatusSummary(finalSummary)) {
    return streamedText;
  }
  return finalSummary || streamedText;
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
    kbName: asString(record.kbName).trim() || undefined,
    docName: asString(record.docName).trim() || undefined,
    fileName: asString(record.fileName).trim() || undefined,
    chapter:
      asString(record.chapter).trim() ||
      asString(record.sectionName).trim() ||
      asString(record.heading).trim() ||
      undefined,
    pageNumber:
      asString(record.pageNumber).trim() ||
      asString(record.page_number).trim() ||
      asString(record.page).trim() ||
      asString(record.page_idx).trim() ||
      undefined,
    sourceAvailable: record.sourceAvailable !== false,
    markdownAvailable:
      typeof record.markdownAvailable === "boolean" ? record.markdownAvailable : undefined,
    fragments: Array.isArray(record.fragments)
      ? record.fragments.map(asString).map(formatDataHubCitationFragment).filter(Boolean).slice(0, 3)
      : []
  };
}

function businessIntent(turn: DataHubAskTurn, question: string) {
  const event = turn.routingEvents.find((item) => item.type === "routing_intent");
  const record = recordFromJson(event ? getDataHubEventPayload(event) : undefined);
  const routed = [record?.message, record?.summary, record?.intentLabel, record?.intent]
    .map(asString)
    .find((value) => value && (hasHanScript(value) || !/^[a-z0-9_-]+$/i.test(value)));
  return routed || `用户希望：${question}`;
}

function inferredLocation(value: UnknownRecord, fragments: string[]) {
  const blob = [
    asString(value.docName),
    asString(value.fileName),
    ...fragments
  ].filter(Boolean).join(" ");
  const chapter =
    asString(value.chapter) ||
    asString(value.sectionName) ||
    asString(value.heading) ||
    blob.match(/第[\d一二三四五六七八九十百千]+章[^，。\s]*/)?.[0];
  const pageNumber =
    asString(value.pageNumber) ||
    asString(value.page_number) ||
    asString(value.page) ||
    asString(value.page_idx) ||
    blob.match(/第?\s*\d+\s*页/)?.[0];
  return { chapter, pageNumber };
}

function businessDocuments(turn: DataHubAskTurn, supplementalDocuments: unknown[] = []) {
  const raw = [
    ...turn.citationDocuments,
    ...supplementalDocuments,
    ...(Array.isArray(turn.done?.documentResults) ? turn.done.documentResults : [])
  ];
  const seen = new Set<string>();
  return raw.flatMap((item) => {
    const record = recordFromJson(item);
    if (!record) return [];
    const docName =
      asString(record.docName) ||
      asString(record.fileName) ||
      asString(record.title) ||
      asString(record.docKey) ||
      "未命名文档";
    const kbName = asString(record.kbName) || "企业知识库";
    const fragments = uniqueStrings([
      ...(Array.isArray(record.fragments) ? record.fragments.map(asString) : []),
      asString(record.snippet),
      asString(record.excerpt)
    ]).slice(0, 3);
    const identity = `${kbName}::${docName}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    const location = inferredLocation(record, fragments);
    return [{
      kbName,
      docName,
      chapter: location.chapter,
      pageNumber: location.pageNumber,
      fragments
    }];
  });
}

function mergeBusinessContexts(contexts: DataHubBusinessQueryContext[]) {
  const merge = (key: keyof DataHubBusinessQueryContext) =>
    uniqueStrings(contexts.flatMap((context) => context[key]));
  return {
    dataTables: merge("dataTables"),
    fields: merge("fields"),
    filters: merge("filters"),
    calculations: merge("calculations"),
    relationships: merge("relationships"),
    metricDefinitions: merge("metricDefinitions"),
    synonymMappings: merge("synonymMappings"),
    time: merge("time")
  };
}

export function buildDataHubBusinessTrace(
  turn: DataHubAskTurn,
  question: string,
  kind: "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT",
  agentNames: string[] = [],
  supplemental: {
    tableResults?: DataHubTableResult[];
    citationDocuments?: unknown[];
    dataSources?: unknown[];
  } = {}
): DataHubBusinessTrace {
  const tableResults = supplemental.tableResults ?? turn.tableResults;
  const columns = tableResults.flatMap((table) => table.columns);
  const contexts = [
    ...tableResults.map((table) => table.business),
    ...turn.toolResults.map((result) => normalizeBusinessQueryContext(result, columns))
  ].filter((context): context is DataHubBusinessQueryContext => Boolean(context));
  const business = mergeBusinessContexts(contexts);
  const dataSources = uniqueStrings([
    ...turn.dataSources.map((source) => source.datasourceName),
    ...(supplemental.dataSources ?? [])
      .map((source) => normalizeDataSource(source)?.datasourceName)
  ]);
  const documents = businessDocuments(turn, supplemental.citationDocuments);
  const knowledgeBases = uniqueStrings(documents.map((document) => document.kbName));
  const dataTables = business.dataTables.length
    ? business.dataTables
    : dataSources.map((source) => `${source}中的业务数据`);
  const fields = business.fields.length
    ? business.fields
    : uniqueStrings(columns.map((column) => column.title));
  const questions = turn.decompose?.subQuestions?.length
    ? turn.decompose.subQuestions
    : [question];
  const agents = uniqueStrings(agentNames);
  const fallbackAgent = kind === "ASK_DATA"
    ? "问数智能体"
    : kind === "ASK_KNOWLEDGE"
      ? "问知智能体"
      : kind === "DOCUMENT_LOOKUP"
        ? "找文档智能体"
        : "编排智能体";
  const target = kind === "ASK_DATA"
    ? uniqueStrings([...dataSources, ...dataTables]).join("、") || "企业内可访问数据"
    : kind === "AGENT"
      ? uniqueStrings([...dataSources, ...dataTables, ...knowledgeBases]).join("、") || "企业内可用数据与知识能力"
      : knowledgeBases.join("、") || "企业内可访问知识库";
  const dataTarget = uniqueStrings([...dataSources, ...dataTables]).join("、");
  const knowledgeTarget = knowledgeBases.join("、");
  const rowCount = tableResults.reduce((sum, table) => sum + table.totalRows, 0);
  const steps = uniqueStrings([
    turn.routingEvents.length || turn.decompose || turn.status === "done"
      ? `已理解问题${questions.length > 1 ? `并拆分为 ${questions.length} 个子任务` : ""}`
      : "正在理解问题",
    dataSources.length ? `已确认数据范围：${dataSources.join("、")}` : undefined,
    tableResults.length
      ? `已获得 ${tableResults.length} 份结构化结果，共 ${rowCount} 行`
      : undefined,
    documents.length
      ? `已从 ${knowledgeBases.length} 个知识库复核 ${documents.length} 份文档`
      : undefined,
    turn.assistantContent || turn.status === "done" ? "已汇总并复核最终结果" : undefined
  ]);
  const hasDataQuery = tableResults.length > 0 || contexts.length > 0;
  const numericFields = uniqueStrings(columns
    .filter((column) => /int|float|double|decimal|number|numeric|count|ratio|percent/i.test(column.type ?? ""))
    .map((column) => column.title));

  return {
    intent: businessIntent(turn, question),
    tasks: questions.map((taskQuestion, index) => {
      const agentName = agents[index] || fallbackAgent;
      const taskIdentity = `${agentName} ${taskQuestion}`;
      const taskTarget = /知识|制度|政策|文档|问知/.test(taskIdentity)
        ? knowledgeTarget
        : /数据|指标|统计|问数/.test(taskIdentity)
          ? dataTarget
          : "";
      return {
        id: `task-${index + 1}`,
        agentName,
        question: taskQuestion,
        target: taskTarget || target
      };
    }),
    steps,
    dataSources,
    dataTables,
    fields,
    filters: business.filters.length
      ? business.filters
      : hasDataQuery ? ["本次未设置额外筛选条件"] : [],
    calculations: business.calculations.length
      ? business.calculations
      : hasDataQuery ? ["本次结果采用企业语义模型已发布的计算规则"] : [],
    relationships: business.relationships.length
      ? business.relationships
      : hasDataQuery ? ["单一业务主题，本次没有跨主题关联"] : [],
    metricDefinitions: business.metricDefinitions.length
      ? business.metricDefinitions
      : numericFields.map((field) => `${field}：采用企业语义模型中已发布的指标口径`),
    synonymMappings: business.synonymMappings.length
      ? business.synonymMappings
      : hasDataQuery ? ["本次未返回可复核的同义词映射"] : [],
    time: uniqueStrings([
      ...business.time,
      asString((turn.done as UnknownRecord | undefined)?.dataAsOf)
        ? `数据截至 ${asString((turn.done as UnknownRecord).dataAsOf)}`
        : undefined
    ]),
    documents
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
    chartResults: [],
    clarifications: []
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

    /* 受控澄清：Agent 挂在 ask_user 上等用户选，续跑时后端先回一条 response 回填已选。 */
    if (event.type === "clarification") {
      const clarification = normalizeDataHubClarification(payload);
      if (clarification) {
        appendDataHubClarification(turn.clarifications, clarification);
      }
    }

    if (event.type === "clarification_response") {
      const response = normalizeDataHubClarificationResponse(payload);
      if (response) {
        applyDataHubClarificationResponse(turn.clarifications, response);
      }
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
    Boolean(turn.error),
    {
      keepRicherStreamedAnswer:
        turn.done?.mode === "agent" || turn.done?.adaptiveTeam === true
    }
  );
  turn.answerBlocks = officialAnswer
    ? officialAnswer === streamedAnswer
      ? turn.answerBlocks
      : [{ content: officialAnswer }]
    : [];
  turn.assistantContent = officialAnswer;

  return turn;
}
