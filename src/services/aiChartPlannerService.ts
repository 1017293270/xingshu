import type { EChartsOption } from "echarts";
import type {
  AiChartColumnSummary,
  AiChartPlanRequest,
  AiChartPlanRequestSummary,
  AiChartPlanResult,
  AiChartTableSummary,
  AiChartType,
  GeneratedChartSpec
} from "@/types/aiChart";
import type { DataHubTableResult } from "@/types/dataHub";
import {
  requestDataHubAiChartPlan,
  type DataHubAiChartPlanner
} from "@/services/dataHubAiChartService";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";

type PlanAiChartOptions = {
  dataHubPlanner?: DataHubAiChartPlanner;
};

const supportedChartTypes: AiChartType[] = ["bar", "line", "pie"];
const sampleRowLimit = 3;
const emptyDominatedShare = 0.5;
const nonComparableDimensionPattern = /^(?:[-—–−]|未知|空值|空|null|none|n\/a|合计|总计|小计|全部|汇总|total)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "").replace(/%$/, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function dimensionLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function isNonComparableDimension(value: unknown): boolean {
  const label = dimensionLabel(value);
  return !label || nonComparableDimensionPattern.test(label);
}

function isRankLikeColumn(column: Pick<AiChartColumnSummary, "key" | "title">): boolean {
  return /排名|名次|\brank\b/i.test(`${column.title} ${column.key}`);
}

function rowMetricTotal(row: Record<string, unknown>, metricKeys: string[]): number {
  return metricKeys.reduce((sum, key) => sum + (toNumber(row[key]) ?? 0), 0);
}

function getComparableChartRows(
  table: DataHubTableResult,
  dimensionKey: string,
  _metricKeys: string[]
): Record<string, unknown>[] {
  return table.rows.filter((row) => !isNonComparableDimension(row[dimensionKey]));
}

function isEmptyDominatedTable(
  table: DataHubTableResult,
  dimensionKey: string,
  metricKeys: string[]
): boolean {
  if (table.rows.length === 0 || metricKeys.length === 0) {
    return false;
  }

  const totals = table.rows.map((row) => ({
    row,
    value: rowMetricTotal(row, metricKeys)
  }));
  const total = totals.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return false;
  }

  const dominant = totals.reduce((current, item) => (item.value > current.value ? item : current));
  if (isNonComparableDimension(dominant.row[dimensionKey])) {
    return true;
  }

  const junk = totals
    .filter((item) => isNonComparableDimension(item.row[dimensionKey]))
    .reduce((sum, item) => sum + item.value, 0);
  return junk / total >= emptyDominatedShare;
}

function inferColumnType(
  column: DataHubTableResult["columns"][number],
  rows: Record<string, unknown>[]
): AiChartColumnSummary["type"] {
  const title = `${column.title} ${column.key}`.toLowerCase();
  const explicitType = column.type?.toLowerCase();

  if (isRankLikeColumn({ key: column.key, title: column.title })) {
    return "dimension";
  }

  if (/date|time|日期|时间|月份|季度|年份|year|month|day/.test(title)) {
    return "time";
  }

  if (explicitType && /int|float|double|decimal|number|numeric|long|count|ratio|percent/.test(explicitType)) {
    return "number";
  }

  const sampledValues = rows.slice(0, 8).map((row) => row[column.key]).filter((value) => value !== null && value !== undefined && value !== "");
  if (sampledValues.length > 0 && sampledValues.every((value) => toNumber(value) !== null)) {
    return "number";
  }

  return "dimension";
}

function pickSampleRows(
  table: DataHubTableResult,
  columns: AiChartColumnSummary[]
): Record<string, unknown>[] {
  const metricKeys = columns.filter((column) => column.type === "number").map((column) => column.key);
  const dimensionKey = columns.find((column) => column.type === "dimension" || column.type === "time")?.key;
  const maxRow = metricKeys.length > 0
    ? table.rows.reduce<Record<string, unknown> | undefined>((current, row) => {
        if (!current) {
          return row;
        }
        return rowMetricTotal(row, metricKeys) > rowMetricTotal(current, metricKeys) ? row : current;
      }, undefined)
    : undefined;
  const preferredRows = [
    ...(maxRow ? [maxRow] : []),
    ...table.rows.filter((row) => !dimensionKey || !isNonComparableDimension(row[dimensionKey]))
  ];
  const selected: Record<string, unknown>[] = [];

  for (const row of preferredRows) {
    if (selected.includes(row)) {
      continue;
    }
    selected.push(row);
    if (selected.length >= sampleRowLimit) {
      break;
    }
  }

  return selected.map((row) =>
    columns.reduce<Record<string, unknown>>((result, column) => {
      result[column.key] = row[column.key];
      return result;
    }, {})
  );
}

function summarizeTable(table: DataHubTableResult, index: number): AiChartTableSummary {
  const columns = table.columns.map((column) => ({
    key: column.key,
    title: formatDataHubColumnTitle(column.title, column.key),
    type: inferColumnType(column, table.rows)
  }));

  return {
    tableIndex: table.tableIndex ?? index,
    title: table.groupLabel || `结果表 ${table.tableIndex !== undefined ? table.tableIndex + 1 : index + 1}`,
    totalRows: table.totalRows,
    columns,
    sampleRows: pickSampleRows(table, columns)
  };
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && splitMarkdownRow(trimmed).length >= 2;
}

function markdownColumnKey(title: string, index: number): string {
  return title || `col_${index + 1}`;
}

function extractMarkdownRankingTables(markdown: string): DataHubTableResult[] {
  const lines = markdown.split(/\r?\n/);
  const tables: DataHubTableResult[] = [];
  let lastTitle = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const boldTitle = line.match(/^\*\*(.+)\*\*$/);
    if (heading) {
      lastTitle = heading[2].trim();
    } else if (boldTitle) {
      lastTitle = boldTitle[1].trim();
    } else if (line && line.length <= 80 && !line.startsWith("口径") && !isMarkdownTableRow(line)) {
      lastTitle = line.replace(/[：:]\s*$/, "");
    }

    if (!isMarkdownTableRow(line) || !isMarkdownTableSeparator(lines[index + 1] ?? "")) {
      continue;
    }

    const headers = splitMarkdownRow(line);
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && isMarkdownTableRow(lines[index] ?? "")) {
      rows.push(splitMarkdownRow(lines[index] ?? ""));
      index += 1;
    }
    index -= 1;

    if (headers.length < 2 || rows.length < 2) {
      continue;
    }

    const columns = headers.map((title, columnIndex) => ({
      key: markdownColumnKey(title, columnIndex),
      title,
      type: isRankLikeColumn({ key: title, title }) ? "dimension" : undefined
    }));
    const mappedRows = rows.map((cells) =>
      columns.reduce<Record<string, unknown>>((result, column, columnIndex) => {
        result[column.key] = cells[columnIndex] ?? "";
        return result;
      }, {})
    );
    const inferred = columns.map((column) => ({
      ...column,
      type: inferColumnType(column, mappedRows)
    }));
    const hasDimension = inferred.some((column) => column.type === "dimension" || column.type === "time");
    const hasMetric = inferred.some((column) => column.type === "number" && !isRankLikeColumn(column));
    if (!hasDimension || !hasMetric) {
      continue;
    }

    tables.push({
      columns: inferred,
      rows: mappedRows,
      totalRows: mappedRows.length,
      groupLabel: lastTitle || "回答中的排行表",
      source: "answer"
    });
  }

  return tables;
}

function isHealthyRankingTable(table: DataHubTableResult, index = 0): boolean {
  const summary = summarizeTable(table, index);
  const keys = getPreferredChartKeys(summary);
  if (!keys) {
    return false;
  }

  const comparableRows = getComparableChartRows(
    table,
    keys.dimensionColumn.key,
    [keys.metricColumn.key]
  );
  return comparableRows.length > 1
    && !isEmptyDominatedTable(table, keys.dimensionColumn.key, [keys.metricColumn.key]);
}

export function resolveAiChartTables(request: AiChartPlanRequest): DataHubTableResult[] {
  const sqlTables = request.tables.filter((table) => table.source !== "answer");
  const alreadyHasAnswerTables = request.tables.some((table) => table.source === "answer");
  const shouldUseAnswerRanking = Boolean(request.answer)
    && !alreadyHasAnswerTables
    && sqlTables.length > 0
    && !sqlTables.some((table, index) => isHealthyRankingTable(table, table.tableIndex ?? index));
  const answerTables = shouldUseAnswerRanking && request.answer
    ? extractMarkdownRankingTables(request.answer)
    : [];
  return [
    ...request.tables,
    ...answerTables.map((table, index) => ({
      ...table,
      tableIndex: table.tableIndex ?? request.tables.length + index
    }))
  ];
}

export function createAiChartPlanRequestSummary(request: AiChartPlanRequest): AiChartPlanRequestSummary {
  return {
    question: request.question,
    tables: resolveAiChartTables(request).map(summarizeTable)
  };
}

function getPreferredChartKeys(table: AiChartTableSummary) {
  const timeColumn = table.columns.find((column) => column.type === "time");
  const dimensionColumn = timeColumn
    ?? table.columns.find((column) => (column.type === "dimension" || column.type === "time") && !isRankLikeColumn(column))
    ?? table.columns.find((column) => column.type === "dimension" || column.type === "time");
  const metricColumn = table.columns.find((column) => column.type === "number" && !isRankLikeColumn(column));

  if (!dimensionColumn || !metricColumn) {
    return null;
  }

  return {
    timeColumn,
    dimensionColumn,
    metricColumn
  };
}

function scoreChartableTable(table: AiChartTableSummary, source?: DataHubTableResult): number {
  const keys = getPreferredChartKeys(table);
  if (!keys || table.totalRows <= 1) {
    return Number.NEGATIVE_INFINITY;
  }

  const comparableCount = source
    ? getComparableChartRows(source, keys.dimensionColumn.key, [keys.metricColumn.key]).length
    : table.totalRows;
  if (comparableCount <= 1) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (comparableCount >= 2 && comparableCount <= 12) {
    score += 40;
  } else if (comparableCount > 20) {
    score -= 15;
  }

  if (source && isEmptyDominatedTable(source, keys.dimensionColumn.key, [keys.metricColumn.key])) {
    score -= 120;
  }

  if (source?.source === "answer") {
    score += 20;
  }

  if (table.columns.some((column) => isRankLikeColumn(column))) {
    score += 15;
  }

  return score;
}

function findChartableShape(summary: AiChartPlanRequestSummary, tables: DataHubTableResult[] = []) {
  const ranked = summary.tables
    .map((table) => {
      const source = tables.find((candidate, index) => (candidate.tableIndex ?? index) === table.tableIndex);
      return { table, score: scoreChartableTable(table, source) };
    })
    .filter((item) => item.score !== Number.NEGATIVE_INFINITY)
    .sort((left, right) => right.score - left.score || left.table.tableIndex - right.table.tableIndex);

  return ranked[0]?.table;
}

function createLocalChartPlan(
  summary: AiChartPlanRequestSummary,
  tables: DataHubTableResult[] = [],
  reason = "已使用本地规则生成图表建议。"
): AiChartPlanResult | null {
  const table = findChartableShape(summary, tables);
  if (!table) {
    return null;
  }

  const keys = getPreferredChartKeys(table);
  if (!keys) {
    return null;
  }

  const chartType: AiChartType = keys.timeColumn ? "line" : "bar";
  const allowedTypes: AiChartType[] = keys.timeColumn ? ["line", "bar"] : ["bar", "pie"];

  return {
    chartable: true,
    reason,
    chartType,
    allowedTypes,
    title: `${keys.dimensionColumn.title}分布`,
    tableIndex: table.tableIndex,
    dimensionKey: keys.dimensionColumn.key,
    metricKeys: [keys.metricColumn.key]
  };
}

function isRecoverableAiPlanError(error: unknown) {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /AI 没有返回可解析|AI 返回格式不正确|AI 没有返回图表判断内容|DataHub 模型返回的图表规划无效/i.test(
    error.message
  );
}

function getLocalGuardResult(
  summary: AiChartPlanRequestSummary,
  tables: DataHubTableResult[]
): AiChartPlanResult | null {
  if (summary.tables.length === 0) {
    return { chartable: false, reason: "暂无可用于生成图表的问数表格。" };
  }

  const totalRows = summary.tables.reduce((count, table) => count + table.totalRows, 0);
  if (totalRows === 0) {
    return { chartable: false, reason: "表格没有数据行，不适合生成图表。" };
  }

  const numericColumnCount = summary.tables.reduce(
    (count, table) => count + table.columns.filter((column) => column.type === "number").length,
    0
  );
  if (numericColumnCount === 0) {
    return { chartable: false, reason: "结果中没有可度量的数值字段，不适合生成图表。" };
  }

  if (totalRows <= 1) {
    return { chartable: false, reason: "结果只有一个具体数值，不适合生成图表。" };
  }

  if (!findChartableShape(summary, tables)) {
    return { chartable: false, reason: "结果缺少维度与数值的对应关系，不适合生成图表。" };
  }

  return null;
}

export function canAutoGenerateAiChart(request: AiChartPlanRequest) {
  const tables = resolveAiChartTables(request);
  return getLocalGuardResult(createAiChartPlanRequestSummary({ question: request.question, tables }), tables) === null;
}

function normalizeAiPlan(parsed: unknown): AiChartPlanResult {
  if (!isRecord(parsed)) {
    throw new Error("DataHub 模型返回的图表规划无效");
  }

  const chartType = typeof parsed.chartType === "string" && supportedChartTypes.includes(parsed.chartType as AiChartType)
    ? (parsed.chartType as AiChartType)
    : undefined;
  const allowedTypes = Array.isArray(parsed.allowedTypes)
    ? parsed.allowedTypes.filter((type): type is AiChartType => typeof type === "string" && supportedChartTypes.includes(type as AiChartType))
    : chartType
      ? [chartType]
      : [];
  const metricKeys = Array.isArray(parsed.metricKeys)
    ? parsed.metricKeys.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
    : [];

  return {
    chartable: Boolean(parsed.chartable),
    reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason : "AI 已完成图表判断。",
    chartType,
    allowedTypes,
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    tableIndex: typeof parsed.tableIndex === "number" ? parsed.tableIndex : undefined,
    dimensionKey: typeof parsed.dimensionKey === "string" ? parsed.dimensionKey : undefined,
    metricKeys
  };
}

export async function planAiChart(
  request: AiChartPlanRequest,
  options: PlanAiChartOptions = {}
): Promise<AiChartPlanResult> {
  const tables = resolveAiChartTables(request);
  const summary = createAiChartPlanRequestSummary({ question: request.question, tables });
  const localGuard = getLocalGuardResult(summary, tables);

  if (localGuard) {
    return localGuard;
  }

  try {
    const plan = await (options.dataHubPlanner ?? requestDataHubAiChartPlan)(summary);
    return normalizeAiPlan(plan);
  } catch (error) {
    if (isRecoverableAiPlanError(error)) {
      const fallbackPlan = createLocalChartPlan(
        summary,
        tables,
        "AI 返回内容不完整，已使用本地规则生成图表建议。"
      );
      if (fallbackPlan) {
        return fallbackPlan;
      }
    }

    throw error;
  }
}

function findTableForPlan(plan: AiChartPlanResult, tables: DataHubTableResult[]) {
  const candidates =
    typeof plan.tableIndex === "number"
      ? tables.filter((table, index) => (table.tableIndex ?? index) === plan.tableIndex)
      : tables;

  return candidates.find((table) => {
    const keys = new Set(table.columns.map((column) => column.key));
    return Boolean(plan.dimensionKey && keys.has(plan.dimensionKey) && plan.metricKeys?.every((key) => keys.has(key)));
  });
}

function getTableIndex(table: DataHubTableResult, tables: DataHubTableResult[]) {
  const fallbackIndex = tables.indexOf(table);
  return table.tableIndex ?? (fallbackIndex >= 0 ? fallbackIndex : 0);
}

function getTableTitle(table: DataHubTableResult, tables: DataHubTableResult[]) {
  const tableIndex = getTableIndex(table, tables);
  return table.groupLabel || `结果表 ${tableIndex + 1}`;
}

function resolveChartSelection(plan: AiChartPlanResult, tables: DataHubTableResult[]) {
  const selected = findTableForPlan(plan, tables);
  if (!selected || !plan.dimensionKey || !plan.metricKeys?.length) {
    return null;
  }

  const selectedKeys = {
    dimensionKey: plan.dimensionKey,
    metricKeys: plan.metricKeys,
    title: plan.title
  };

  if (!isEmptyDominatedTable(selected, selectedKeys.dimensionKey, selectedKeys.metricKeys)) {
    return { table: selected, ...selectedKeys };
  }

  const summary = createAiChartPlanRequestSummary({ question: "", tables });
  const better = findChartableShape(summary, tables);
  const betterTable = better
    ? tables.find((candidate, index) => (candidate.tableIndex ?? index) === better.tableIndex)
    : undefined;
  const betterKeys = better ? getPreferredChartKeys(better) : null;
  if (
    !betterTable
    || !betterKeys
    || betterTable === selected
    || isEmptyDominatedTable(betterTable, betterKeys.dimensionColumn.key, [betterKeys.metricColumn.key])
  ) {
    return { table: selected, ...selectedKeys };
  }

  return {
    table: betterTable,
    dimensionKey: betterKeys.dimensionColumn.key,
    metricKeys: [betterKeys.metricColumn.key],
    title: betterTable.groupLabel || `${betterKeys.dimensionColumn.title}分布`
  };
}

export function buildGeneratedChartSpec(
  plan: AiChartPlanResult,
  tables: DataHubTableResult[]
): GeneratedChartSpec | null {
  if (!plan.chartable || !plan.chartType || !plan.dimensionKey || !plan.metricKeys?.length) {
    return null;
  }

  const selection = resolveChartSelection(plan, tables);
  if (!selection) {
    return null;
  }

  const comparableRows = getComparableChartRows(
    selection.table,
    selection.dimensionKey,
    selection.metricKeys
  );
  const hasFiniteMetricValue = comparableRows.some((row) =>
    selection.metricKeys.some((key) => toNumber(row[key]) !== null)
  );
  if (!hasFiniteMetricValue) {
    return null;
  }

  const allowedTypes = (plan.allowedTypes?.length ? plan.allowedTypes : [plan.chartType]).filter((type) =>
    supportedChartTypes.includes(type)
  );

  if (!allowedTypes.includes(plan.chartType)) {
    allowedTypes.unshift(plan.chartType);
  }

  const chartTable = {
    ...selection.table,
    rows: comparableRows,
    totalRows: comparableRows.length
  };

  return {
    title: selection.title || plan.title || "AI 生成图表",
    reason: plan.reason,
    chartType: plan.chartType,
    allowedTypes: Array.from(new Set(allowedTypes)),
    table: chartTable,
    tableIndex: getTableIndex(selection.table, tables),
    tableTitle: getTableTitle(selection.table, tables),
    dimensionKey: selection.dimensionKey,
    metricKeys: selection.metricKeys
  };
}

function metricTitle(table: DataHubTableResult, key: string) {
  const column = table.columns.find((candidate) => candidate.key === key);
  return formatDataHubColumnTitle(column?.title || key, column?.key || key);
}

export function buildGeneratedChartOption(spec: GeneratedChartSpec, chartType = spec.chartType): EChartsOption {
  const categories = spec.table.rows.map((row) => String(row[spec.dimensionKey] ?? "-"));
  const metrics = spec.metricKeys.map((key) => ({
    key,
    name: metricTitle(spec.table, key),
    values: spec.table.rows.map((row) => toNumber(row[key]))
  }));

  if (chartType === "pie") {
    const metric = metrics[0];

    return {
      title: { text: spec.title, left: 12, top: 8, textStyle: { fontSize: 15, fontWeight: 700 } },
      tooltip: { trigger: "item" },
      legend: { bottom: 0, type: "scroll" },
      series: [
        {
          name: metric.name,
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "48%"],
          data: categories.flatMap((name, index) => {
            const value = metric.values[index];
            return value === null ? [] : [{ name, value }];
          })
        }
      ]
    };
  }

  return {
    title: { text: spec.title, left: 12, top: 8, textStyle: { fontSize: 15, fontWeight: 700 } },
    grid: { left: 42, right: 24, top: 58, bottom: 42 },
    tooltip: { trigger: "axis" },
    legend: { top: 30 },
    xAxis: { type: "category", data: categories, axisLabel: { interval: 0, rotate: categories.length > 5 ? 24 : 0 } },
    yAxis: { type: "value" },
    series: metrics.map((metric) => ({
      name: metric.name,
      type: chartType,
      smooth: chartType === "line",
      data: metric.values
    }))
  };
}
