import type { EChartsOption } from "echarts";
import { xingshuTokens } from "@/theme/xingshuTokens";
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
import { formatDataHubColumnTitle, formatDataHubTableTitle } from "@/services/dataHubFormat";

type PlanAiChartOptions = {
  dataHubPlanner?: DataHubAiChartPlanner;
};

const supportedChartTypes: AiChartType[] = ["bar", "line", "pie"];
const sampleRowLimit = 3;
const chartPlanTableLimit = 8;
const emptyDominatedShare = 0.5;
const emptyDimensionPattern = /^(?:[-—–−]|未知|空值|空|null|none|n\/a)$/i;
// 合计行是其余各行的加总，画进图里就重复计了一遍（饼图里恰好占掉一半）。
const totalDimensionPattern = /^(?:合计|总计|小计|共计|总数|全部|汇总|total)$/i;

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

/** 明确的一行单数值直接由正文回答，不显示无意义的结果表。 */
export function isDataHubScalarResult(table: DataHubTableResult): boolean {
  return table.totalRows === 1 && table.rows.length === 1 && table.columns.length === 1
    && toNumber(table.rows[0][table.columns[0].key]) !== null;
}

function dimensionLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/** 按读者看到的文字取值：去掉加粗/斜体、行内代码和删除线标记。 */
function plainMarkdownText(text: string): string {
  return text.replace(/[*`]|~~/g, "").replace(/^__(.+)__$/, "$1").trim();
}

/** 判定前还原成裸词：`**合计**`、`合 计`、`总计：`、`合计（3 类）` 都按「合计」认。 */
function bareDimensionLabel(value: unknown): string {
  return plainMarkdownText(dimensionLabel(value))
    .replace(/[\s\u3000]+/g, "")
    .replace(/[：:]+$/, "")
    .replace(/^(.+?)[（(][^（()）]*[)）]$/, "$1");
}

/** 名称对齐用：忽略空白、标点和大小写，让「广州思迈特软件有限公司」能匹配回答里的写法。 */
function normalizeRankingName(value: unknown): string {
  return dimensionLabel(value)
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，,。.、；;：:！!？?（）()【】[\]「」『』“”"'`~·\-—–_/\\|]/g, "");
}

function isTotalDimension(value: unknown): boolean {
  return totalDimensionPattern.test(bareDimensionLabel(value));
}

function isNonComparableDimension(value: unknown): boolean {
  const label = bareDimensionLabel(value);
  return !label || emptyDimensionPattern.test(label) || totalDimensionPattern.test(label);
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

  // 合计行本来就比每一项都大，它不是空桶，也不该算进分母。
  const totals = table.rows
    .filter((row) => !isTotalDimension(row[dimensionKey]))
    .map((row) => ({
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

  if (/date|time|日期|时间|月份|季度|年份|年度|year|month|day/.test(title)) {
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
    title: formatDataHubTableTitle(table, index),
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

    // 单元格按渲染后的文字取值，`**260**` 才能当数值，`**合计**` 才认得出是合计行。
    const headers = splitMarkdownRow(line).map(plainMarkdownText);
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && isMarkdownTableRow(lines[index] ?? "")) {
      rows.push(splitMarkdownRow(lines[index] ?? "").map(plainMarkdownText));
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

const answerRankingUnits = "%|万元|亿元|份|个|条|家|项|次|笔|元";
const answerRankingValue = "(\\d[\\d,]*(?:\\.\\d+)?)";
const answerRankingParenthesizedPattern = new RegExp(
  `^([^：:（()）]{2,40}?)\\s*[（(]\\s*${answerRankingValue}\\s*(${answerRankingUnits})?\\s*[)）]`
);
const answerRankingColonPattern = new RegExp(
  `^([^：:（()）]{2,40}?)\\s*[：:]\\s*${answerRankingValue}\\s*(?:(${answerRankingUnits})|(?=$|[，,。；;]))`
);
const answerRankingSpacedPattern = new RegExp(
  `^(.{2,40}?)\\s+${answerRankingValue}\\s*(${answerRankingUnits})?\\s*[。．，,；;]*$`
);
const answerRankingListItemPattern = /^(?:[-*•·]\s+|\d+[.)、]\s*|[（(]\d+[)）]\s*)(.+)$/;
const answerRankingBareLineLimit = 60;
const answerRankingIgnoredNamePattern =
  /^(?:口径|口径说明|说明|备注|注|注意|数据来源|来源|统计口径|统计范围|统计方式|数据范围|时间范围|样本量|样本数|合计|总计|小计|总数|总量|总额|占比|其他|其它)$/;
const answerRankingIgnoredNamePrefixPattern =
  /^(?:以下|如下|上述|其中|共计|共|总共|一共|合计|总计|大约|约|另外|此外|例如|比如|注)/;
const answerRankingUnitTitles: Record<string, string> = {
  "%": "占比（%）",
  份: "数量（份）",
  个: "数量（个）",
  条: "数量（条）",
  家: "数量（家）",
  项: "数量（项）",
  次: "数量（次）",
  笔: "数量（笔）",
  元: "金额（元）",
  万元: "金额（万元）",
  亿元: "金额（亿元）"
};
const answerRankingDimensionTitles: Array<[RegExp, string]> = [
  [/公司|企业|供应商|厂商|集团/, "公司"],
  [/单位|机构|部门|科室/, "单位"],
  [/项目|工程/, "项目"],
  [/地区|区域|城市|省份|社区/, "地区"],
  [/类型|类别|种类|品类/, "类型"]
];
const answerRankingNameKey = "name";
const answerRankingValueKey = "value";
const answerRankingTableLabel = "回答中的排名";
const answerRankingMetricFallbackTitle = "数值";
const answerRankingReason = "图表按回答中的数值绘制，与正文口径一致。";
const defaultChartTitle = "AI 生成图表";

type AnswerRankingEntry = {
  name: string;
  value: number;
  unit: string;
};

function cleanAnswerRankingName(value: string) {
  return value
    .replace(/[*`]/g, "")
    .replace(/^[\s"'「」『』“”（(【[]+|[\s"'「」『』“”）)】\]：:]+$/g, "")
    .trim();
}

function isUsableAnswerRankingName(value: string) {
  return (
    value.length >= 2
    && !answerRankingIgnoredNamePattern.test(value)
    && !answerRankingIgnoredNamePrefixPattern.test(value)
  );
}

function parseAnswerRankingEntry(text: string): AnswerRankingEntry | null {
  const cleaned = text.replace(/[*`]/g, "").trim();
  const matched =
    cleaned.match(answerRankingParenthesizedPattern)
    ?? cleaned.match(answerRankingColonPattern)
    ?? cleaned.match(answerRankingSpacedPattern);
  if (!matched) {
    return null;
  }

  const name = cleanAnswerRankingName(matched[1] ?? "");
  const value = toNumber(matched[2] ?? "");
  if (!isUsableAnswerRankingName(name) || value === null) {
    return null;
  }

  return { name, value, unit: matched[3] ?? "" };
}

function inferAnswerRankingDimensionTitle(label: string, names: string[]) {
  const context = `${label} ${names.join(" ")}`;
  return answerRankingDimensionTitles.find(([pattern]) => pattern.test(context))?.[1] ?? "名称";
}

function buildAnswerRankingTable(
  entries: AnswerRankingEntry[],
  itemCount: number,
  label: string
): DataHubTableResult | null {
  // 列表里过半是说明项时，这段文字更像口径描述而不是排名。
  if (entries.length < 2 || entries.length * 2 < itemCount) {
    return null;
  }

  if (new Set(entries.map((entry) => entry.unit)).size > 1) {
    return null;
  }

  const names = entries.map((entry) => entry.name);
  if (new Set(names.map(normalizeRankingName)).size !== names.length) {
    return null;
  }

  return {
    columns: [
      { key: answerRankingNameKey, title: inferAnswerRankingDimensionTitle(label, names), type: "dimension" },
      {
        key: answerRankingValueKey,
        title: answerRankingUnitTitles[entries[0].unit] ?? answerRankingMetricFallbackTitle,
        type: "number"
      }
    ],
    rows: entries.map((entry) => ({
      [answerRankingNameKey]: entry.name,
      [answerRankingValueKey]: entry.value
    })),
    totalRows: entries.length,
    groupLabel: label || answerRankingTableLabel,
    source: "answer"
  };
}

/** 解析回答正文里的要点式排名（`- **公司（13 份）**：…`、`1. 公司：13 份`、`公司 13 份`）。 */
export function extractAnswerRankingList(markdown: string): DataHubTableResult[] {
  const lines = markdown.split(/\r?\n/);
  const tables: DataHubTableResult[] = [];
  let contextLabel = "";
  let blockLabel = "";
  let block: { indent: number; entries: AnswerRankingEntry[]; itemCount: number } | null = null;

  const flushBlock = () => {
    if (block) {
      const table = buildAnswerRankingTable(block.entries, block.itemCount, blockLabel);
      if (table) {
        tables.push(table);
      }
    }
    block = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const indent = rawLine.length - rawLine.replace(/^\s+/, "").length;
    // 更深缩进的子要点是对上一条的解释，不参与排名。
    if (block && indent > block.indent) {
      continue;
    }

    if (isMarkdownTableRow(line)) {
      flushBlock();
      continue;
    }

    const listItem = line.match(answerRankingListItemPattern);
    const entry =
      listItem || line.length <= answerRankingBareLineLimit
        ? parseAnswerRankingEntry(listItem?.[1] ?? line)
        : null;

    if (entry) {
      if (!block) {
        block = { indent, entries: [], itemCount: 0 };
        blockLabel = contextLabel;
      }
      block.entries.push(entry);
      block.itemCount += 1;
      continue;
    }

    if (listItem) {
      if (block) {
        block.itemCount += 1;
      }
      continue;
    }

    flushBlock();
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const boldTitle = line.match(/^\*\*(.+?)\*\*[：:]?$/);
    const plainTitle = line.length <= 80 ? line : "";
    contextLabel = (heading?.[1] ?? boldTitle?.[1] ?? plainTitle).replace(/[：:]\s*$/, "").trim();
  }

  flushBlock();

  return tables;
}

function extractAnswerRankings(markdown: string): DataHubTableResult[] {
  return [...extractMarkdownRankingTables(markdown), ...extractAnswerRankingList(markdown)];
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
  return comparableRows.length > 0
    && !isEmptyDominatedTable(table, keys.dimensionColumn.key, [keys.metricColumn.key]);
}

export function resolveAiChartTables(request: AiChartPlanRequest): DataHubTableResult[] {
  const alreadyHasAnswerTables = request.tables.some((table) => table.source === "answer");
  // 正文口径可能是多张结果表合并后的重新排名，所以只要回答里有排名就一并送进规划，
  // 由一致性门决定最终画哪一张；没有结构化结果表时仍然不靠正文单独起图。
  const shouldUseAnswerRanking = Boolean(request.answer)
    && !alreadyHasAnswerTables
    && request.tables.some((table) => table.source !== "answer");
  const answerTables = shouldUseAnswerRanking && request.answer
    ? extractAnswerRankings(request.answer)
    : [];
  return [
    ...request.tables,
    ...answerTables.map((table, index) => ({
      ...table,
      tableIndex: table.tableIndex ?? request.tables.length + index
    }))
  ];
}

function withAnswerTableRetained(selected: DataHubTableResult[], tables: DataHubTableResult[]) {
  const answerTable = tables.find((table) => table.source === "answer");
  if (!answerTable || selected.includes(answerTable) || selected.some((table) => table.source === "answer")) {
    return selected;
  }

  // 回答口径是一致性门的判据，超出表数上限时也要留一张给模型和后续对账。
  return [...selected.slice(0, chartPlanTableLimit - 1), answerTable];
}

export function createAiChartPlanRequestSummary(request: AiChartPlanRequest): AiChartPlanRequestSummary {
  const tables = resolveAiChartTables(request);
  const selectedTables = tables.length <= chartPlanTableLimit
    ? tables
    : withAnswerTableRetained(
        tables
          .map((table, index) => ({
            table,
            index,
            chartable: isHealthyRankingTable(table, table.tableIndex ?? index)
          }))
          .sort((left, right) => Number(right.chartable) - Number(left.chartable) || left.index - right.index)
          .slice(0, chartPlanTableLimit)
          .map(({ table }) => table),
        tables
      );

  return {
    question: request.question,
    tables: selectedTables.map(summarizeTable)
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
  if (!keys || table.totalRows === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const comparableCount = source
    ? getComparableChartRows(source, keys.dimensionColumn.key, [keys.metricColumn.key]).length
    : table.totalRows;
  if (comparableCount === 0) {
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

  const ranking = /排名|排行|前\s*\d|top\s*\d|最多|最少|降序|升序/i.test(summary.question);
  const chartType: AiChartType = keys.timeColumn && !ranking ? "line" : "bar";
  const allowedTypes: AiChartType[] = keys.timeColumn && !ranking ? ["line", "bar"] : ["bar", "pie"];

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

  const chartableShape = findChartableShape(summary, tables);
  if (totalRows <= 1 && !chartableShape) {
    return { chartable: false, reason: "结果只有一个具体数值，不适合生成图表。" };
  }

  if (!chartableShape) {
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
    const normalized = normalizeAiPlan(plan);
    // 问题明确要求排名时，时间字段也是分类维度，不能连成时间趋势。
    if (normalized.chartable && /排名|排行|前\s*\d|top\s*\d|最多|最少|降序|升序/i.test(request.question)) {
      return { ...normalized, chartType: "bar", allowedTypes: ["bar", "pie"] };
    }
    return normalized;
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
  return formatDataHubTableTitle(table, getTableIndex(table, tables));
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

type RankingSelection = {
  table: DataHubTableResult;
  rows: Record<string, unknown>[];
  dimensionKey: string;
  metricKey: string;
};

function getRankingSelection(table: DataHubTableResult, index: number): RankingSelection | null {
  const keys = getPreferredChartKeys(summarizeTable(table, index));
  if (!keys) {
    return null;
  }

  const rows = getComparableChartRows(table, keys.dimensionColumn.key, [keys.metricColumn.key]).filter(
    (row) => toNumber(row[keys.metricColumn.key]) !== null
  );
  if (rows.length < 2) {
    return null;
  }

  return { table, rows, dimensionKey: keys.dimensionColumn.key, metricKey: keys.metricColumn.key };
}

function matchesRankingName(left: unknown, right: unknown) {
  const leftName = normalizeRankingName(left);
  const rightName = normalizeRankingName(right);
  if (!leftName || !rightName) {
    return false;
  }

  if (leftName === rightName) {
    return true;
  }

  // 单字名称的包含关系太容易误撞，只对两字以上的名称做包含匹配。
  return (
    (leftName.length >= 2 && rightName.includes(leftName))
    || (rightName.length >= 2 && leftName.includes(rightName))
  );
}

function isSameRankingValue(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(Math.abs(left), Math.abs(right), 1) * 1e-9;
}

/**
 * 判定候选表能否复现回答里的排名：同名条目数值必须相同，回答的第一名必须出现在表里，
 * 且每个回答条目都必须在候选表里出现，不能用部分排名冒充最终排名。
 */
function reproducesAnswerRanking(
  ranking: RankingSelection,
  candidate: { table: DataHubTableResult; dimensionKey: string; metricKeys: string[] }
) {
  const metricKey = candidate.metricKeys[0];
  if (!metricKey) {
    return false;
  }

  const candidateRows = getComparableChartRows(candidate.table, candidate.dimensionKey, candidate.metricKeys);
  let matched = 0;

  for (const row of ranking.rows) {
    const hit = candidateRows.find((candidateRow) =>
      matchesRankingName(row[ranking.dimensionKey], candidateRow[candidate.dimensionKey])
    );
    if (!hit) {
      continue;
    }

    const answerValue = toNumber(row[ranking.metricKey]);
    const candidateValue = toNumber(hit[metricKey]);
    if (answerValue === null || candidateValue === null || !isSameRankingValue(answerValue, candidateValue)) {
      return false;
    }
    matched += 1;
  }

  const leader = ranking.rows[0]?.[ranking.dimensionKey];
  if (!candidateRows.some((row) => matchesRankingName(leader, row[candidate.dimensionKey]))) {
    return false;
  }

  return matched === ranking.rows.length && candidateRows.length === ranking.rows.length;
}

/**
 * 回答里的排名是最终口径（可能由多张结果表合并重排得到），图表不能和它冲突：
 * 选中的结果表复现不了这组数值时，改画能复现的结果表，都复现不了就直接画回答里的数值。
 */
export function reconcileChartSpecWithAnswer(
  spec: GeneratedChartSpec,
  tables: DataHubTableResult[]
): GeneratedChartSpec {
  if (!tables.some((table) => table.source === "answer")) {
    return spec;
  }

  if (spec.table.source === "answer") {
    return { ...spec, reason: answerRankingReason, tableTitle: answerRankingTableLabel };
  }

  const indexed = tables.map((table, index) => ({ table, index: table.tableIndex ?? index }));
  const rankings = indexed
    .filter(({ table }) => table.source === "answer")
    .map(({ table, index }) => getRankingSelection(table, index))
    .filter((ranking): ranking is RankingSelection => ranking !== null);
  if (rankings.length === 0) {
    return spec;
  }

  const selected = { table: spec.table, dimensionKey: spec.dimensionKey, metricKeys: spec.metricKeys };
  if (rankings.some((ranking) => reproducesAnswerRanking(ranking, selected))) {
    return spec;
  }

  const target = rankings[0];
  const backing = indexed
    .filter(({ table, index }) => table.source !== "answer" && index !== spec.tableIndex)
    .map(({ table, index }) => getRankingSelection(table, index))
    .find(
      (candidate): candidate is RankingSelection =>
        candidate !== null
        && reproducesAnswerRanking(target, {
          table: candidate.table,
          dimensionKey: candidate.dimensionKey,
          metricKeys: [candidate.metricKey]
        })
    );
  const source = backing ?? target;
  const chartType = spec.chartType === "line" ? "bar" : spec.chartType;

  return {
    ...spec,
    title: spec.title && spec.title !== defaultChartTitle
      ? spec.title
      : source.table.groupLabel || answerRankingTableLabel,
    reason: answerRankingReason,
    chartType,
    allowedTypes: Array.from(new Set<AiChartType>([chartType, "bar", "pie"])),
    table: { ...source.table, rows: source.rows, totalRows: source.rows.length },
    tableIndex: getTableIndex(source.table, tables),
    tableTitle: backing ? getTableTitle(source.table, tables) : answerRankingTableLabel,
    dimensionKey: source.dimensionKey,
    metricKeys: [source.metricKey]
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

  return reconcileChartSpecWithAnswer(
    {
      title: selection.title || plan.title || defaultChartTitle,
      reason: plan.reason,
      chartType: plan.chartType,
      allowedTypes: Array.from(new Set(allowedTypes)),
      table: chartTable,
      tableIndex: getTableIndex(selection.table, tables),
      tableTitle: getTableTitle(selection.table, tables),
      dimensionKey: selection.dimensionKey,
      metricKeys: selection.metricKeys
    },
    tables
  );
}

function metricTitle(table: DataHubTableResult, key: string) {
  const column = table.columns.find((candidate) => candidate.key === key);
  return formatDataHubColumnTitle(column?.title || key, column?.key || key);
}

export function buildGeneratedChartOption(
  spec: GeneratedChartSpec,
  chartType = spec.chartType,
  barView?: { rowOffset?: number; metricKey?: string; compact?: boolean }
): EChartsOption {
  const dimension = spec.table.columns.find((column) => column.key === spec.dimensionKey);
  const rows = chartType === "line" && dimension && inferColumnType(dimension, spec.table.rows) === "time"
    ? [...spec.table.rows].sort((left, right) => String(left[spec.dimensionKey] ?? "").localeCompare(
      String(right[spec.dimensionKey] ?? ""), "zh-CN", { numeric: true }))
    : spec.table.rows;
  const categories = rows.map((row) => String(row[spec.dimensionKey] ?? "-"));
  const metrics = spec.metricKeys.map((key) => ({
    key,
    name: metricTitle(spec.table, key),
    values: rows.map((row) => toNumber(row[key]))
  }));

  if (chartType === "bar" && barView) {
    const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumSignificantDigits: 4 });
    const precise = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 20 });
    const palette = [xingshuTokens.colorPrimary, xingshuTokens.colorSuccess];
    // 颜色以原指标顺序为准，不能因只看第二个指标就变成第一个指标的颜色。
    const selected = metrics.map((metric, index) => ({ ...metric, color: palette[index % palette.length] }))
      .filter((metric) => !barView.metricKey || metric.key === barView.metricKey);
    const formatCompact = (value: unknown) => {
      const number = toNumber(value);
      return number === null ? "" : compact.format(number);
    };
    return {
      title: { show: false },
      grid: { left: barView.compact ? 12 : 240, right: barView.compact ? 64 : 96, top: 48, bottom: 32 },
      legend: { top: 0, type: "scroll", textStyle: { color: xingshuTokens.colorTextSecondary } },
      tooltip: {
        trigger: "axis", renderMode: "richText", confine: true,
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const item = Array.isArray(params) ? params[0] : params;
          const index = isRecord(item) && typeof item.dataIndex === "number" ? item.dataIndex : -1;
          if (index < 0 || index >= rows.length) return "";
          return [categories[index], ...selected.map((metric) => {
            const value = metric.values[index];
            return `${metric.name}：${value === null ? "—" : precise.format(value)}`;
          })].join("\n");
        }
      },
      xAxis: {
        type: "value", splitNumber: barView.compact ? 2 : 5,
        axisLabel: { formatter: formatCompact, color: xingshuTokens.colorTextTertiary },
        splitLine: { lineStyle: { color: xingshuTokens.colorBorder } }
      },
      yAxis: {
        type: "category", inverse: true,
        data: categories.map((name, index) => `${(barView.rowOffset ?? 0) + index + 1}. ${name}`),
        axisLabel: { interval: 0, width: barView.compact ? 200 : 216, overflow: "truncate", color: xingshuTokens.colorTextSecondary,
          inside: Boolean(barView.compact), align: barView.compact ? "left" : "right",
          verticalAlign: barView.compact ? "bottom" : "middle", padding: barView.compact ? [0, 0, 24, 0] : 0,
          fontSize: barView.compact ? 11 : 12, margin: barView.compact ? 0 : 8,
          formatter: (value: string) => value.replace(/\s+/g, " ") },
        axisTick: { show: false }, axisLine: { show: false }
      },
      series: selected.map((metric) => ({
        id: metric.key, name: metric.name, type: "bar", data: metric.values, barMaxWidth: 14,
        itemStyle: { color: metric.color, borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: "right", color: xingshuTokens.colorTextSecondary,
          formatter: (params: { value: unknown }) => formatCompact(params.value) }
      }))
    };
  }

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
