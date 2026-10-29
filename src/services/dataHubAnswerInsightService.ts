import { createAiChartPlanRequestSummary } from "@/services/aiChartPlannerService";
import { createAnswerMemory } from "@/services/answerMemory";
import { DataHubServiceError, requestDataHub } from "@/services/dataHubClient";
import { formatDataHubTableCell } from "@/services/dataHubTableExport";
import type { AiChartColumnSummary } from "@/types/aiChart";
import type {
  DataHubAnswerInsight,
  DataHubAnswerInsightItem,
  DataHubAnswerInsightRequest
} from "@/types/answerInsight";
import type { DataHubTableResult } from "@/types/dataHub";

const insightTableLimit = 4;
const insightRowLimit = 60;
const insightCellLimit = 80;
const insightFactLimit = 20;
const insightAnswerLimit = 6000;
// 后端上限 64k，留出余量给 JSON 转义。
const insightPayloadBudget = 48_000;
const insightLimit = 4;
const followUpLimit = 3;
const totalLabelPattern = /^(?:合计|总计|小计|共计|总数|全部|汇总|total)$/i;
const rankLikePattern = /排名|名次|\brank\b/i;
// 比率、均值类指标相加没有意义，只比较高低，不算合计和占比。
const nonAdditivePattern = /率|占比|比例|比重|百分比|平均|均价|单价|人均|户均|日均|月均|年均/;
const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

type Point = { label: string; value: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/,/g, "").replace(/%$/, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number) {
  return numberFormat.format(value);
}

function formatPercent(ratio: number, signed = false) {
  const text = `${numberFormat.format(Math.abs(ratio) * 100)}%`;
  if (!signed || ratio === 0) return text;
  return ratio > 0 ? `增长 ${text}` : `下降 ${text}`;
}

function labelOf(value: unknown) {
  return formatDataHubTableCell(value).trim();
}

/** 两行及以上才算一组数据：表格回答和图表只给一组数据用，单个数值由文字回答直接说。 */
export function isDataHubResultSet(table: DataHubTableResult) {
  return table.rows.length >= 2;
}

/** 时间标签按其中的数字排序（2025-01、2025年第3周、第10周）；格式不统一时保持返回顺序。 */
function sortByTime(points: Point[]) {
  const keys = points.map((point) => point.label.match(/\d+/g));
  const width = keys[0]?.length;
  if (!width || keys.some((parts) => parts?.length !== width)) return points;
  const sortKey = (parts: RegExpMatchArray) => parts.map((part) => part.padStart(4, "0")).join("");
  return points
    .map((point, index) => ({ point, key: sortKey(keys[index]!) }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ point }) => point);
}

function metricFacts(
  metric: AiChartColumnSummary,
  points: Point[],
  dimension: AiChartColumnSummary | undefined,
  missing: number
): string[] {
  const name = `“${metric.title}”`;
  const facts: string[] = [];
  if (points.length === 1) {
    const [only] = points;
    facts.push(`${only.label ? `“${only.label}”的` : ""}${name}为 ${formatNumber(only.value)}`);
  } else {
    const additive = !nonAdditivePattern.test(metric.title);
    const sum = points.reduce((total, point) => total + point.value, 0);
    const average = sum / points.length;
    facts.push(additive
      ? `${name}共 ${points.length} 项，合计 ${formatNumber(sum)}，平均每项 ${formatNumber(average)}`
      : `${name}共 ${points.length} 项，平均 ${formatNumber(average)}`);

    if (dimension) {
      const max = points.reduce((best, point) => (point.value > best.value ? point : best));
      const min = points.reduce((best, point) => (point.value < best.value ? point : best));
      const canShare = additive && sum > 0 && points.every((point) => point.value >= 0);
      const share = (value: number) => (canShare ? `，占 ${formatPercent(value / sum)}` : "");
      facts.push(`${name}最高的是“${max.label}”${formatNumber(max.value)}${share(max.value)}；`
        + `最低的是“${min.label}”${formatNumber(min.value)}${share(min.value)}`);
      if (min.value > 0 && max.value / min.value >= 2) {
        facts.push(`${name}最高值是最低值的 ${formatNumber(max.value / min.value)} 倍`);
      }
      if (canShare && points.length > 4) {
        const top = [...points].sort((left, right) => right.value - left.value).slice(0, 3);
        const topSum = top.reduce((total, point) => total + point.value, 0);
        facts.push(`${name}排前 3 的“${top.map((point) => point.label).join("”“")}”合计占 ${formatPercent(topSum / sum)}`);
      }
    }

    if (dimension?.type === "time") {
      const first = points[0];
      const last = points[points.length - 1];
      const change = first.value === 0 ? "" : `，${formatPercent((last.value - first.value) / Math.abs(first.value), true)}`;
      facts.push(`${name}从“${first.label}”的 ${formatNumber(first.value)} 变为“${last.label}”的 ${formatNumber(last.value)}${change}`);
      if (points.length > 2) {
        let from = 0;
        for (let index = 1; index < points.length - 1; index += 1) {
          const step = Math.abs(points[index + 1].value - points[index].value);
          if (step > Math.abs(points[from + 1].value - points[from].value)) from = index;
        }
        const base = points[from].value;
        const delta = points[from + 1].value - base;
        if (delta !== 0) {
          facts.push(`${name}相邻两期变化最大的是“${points[from].label}”到“${points[from + 1].label}”，`
            + `${delta > 0 ? "增加" : "减少"} ${formatNumber(Math.abs(delta))}`
            + (base === 0 ? "" : `，${formatPercent(delta / Math.abs(base), true)}`));
        }
      }
    }
  }
  if (missing > 0) facts.push(`有 ${missing} 项的${name}为空`);
  return facts;
}

/**
 * 按返回的结果行算出合计、占比、最高最低、首末变化等事实，模型写洞察时引用它们，
 * 避免自己心算出错。合计行不参与统计；比率类指标只比高低，不相加。
 */
export function buildDataHubInsightFacts(table: DataHubTableResult, columns: AiChartColumnSummary[]): string[] {
  const usable = columns.filter((column) => !rankLikePattern.test(`${column.title} ${column.key}`));
  const dimension = usable.find((column) => column.type === "time") ?? usable.find((column) => column.type === "dimension");
  const metrics = usable.filter((column) => column.type === "number").slice(0, 3);
  const facts: string[] = [];
  if (table.totalRows > table.rows.length) {
    facts.push(`结果共 ${table.totalRows} 行，以下统计只基于返回的前 ${table.rows.length} 行`);
  }
  if (!metrics.length) {
    if (table.rows.length) facts.push(`共返回 ${table.rows.length} 条记录`);
    return facts;
  }

  const rows = dimension
    ? table.rows.filter((row) => !totalLabelPattern.test(labelOf(row[dimension.key])))
    : table.rows;
  for (const metric of metrics) {
    const all = rows.map((row) => ({
      label: dimension ? labelOf(row[dimension.key]) : "",
      value: numberOf(row[metric.key])
    }));
    const points = all.filter((point): point is Point => point.value !== null);
    if (!points.length) continue;
    const ordered = dimension?.type === "time" ? sortByTime(points) : points;
    facts.push(...metricFacts(metric, ordered, dimension, all.length - points.length));
  }
  return facts.slice(0, insightFactLimit).map((fact) => fact.slice(0, 300));
}

function compactCell(value: unknown) {
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value ?? null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > insightCellLimit ? `${text.slice(0, insightCellLimit)}…` : text;
}

/**
 * 组装数据洞察请求：一组数据排在前面，最多 4 张表、每张最多 60 行，超出体积预算时逐步减行。
 * 没有任何返回行时返回 null，不发请求。
 */
export function buildDataHubAnswerInsightRequest(
  question: string,
  answer: string,
  tables: DataHubTableResult[]
): DataHubAnswerInsightRequest | null {
  const withRows = tables.filter((table) => table.rows.length > 0 && table.columns.length > 0);
  const selected = [
    ...withRows.filter(isDataHubResultSet),
    ...withRows.filter((table) => !isDataHubResultSet(table))
  ].slice(0, insightTableLimit);
  if (!selected.length) return null;

  const summary = createAiChartPlanRequestSummary({ question, tables: selected });
  const insightTables = selected.map((table, index) => {
    const { columns, title, tableIndex, totalRows } = summary.tables[index];
    return {
      tableIndex,
      title,
      totalRows: Math.max(totalRows, table.rows.length),
      columns,
      rows: table.rows.slice(0, insightRowLimit).map((row) =>
        Object.fromEntries(columns.map((column) => [column.key, compactCell(row[column.key])]))
      ),
      facts: buildDataHubInsightFacts(table, columns)
    };
  });
  const request: DataHubAnswerInsightRequest = {
    question: question.trim().slice(0, 2000),
    ...(answer.trim() ? { answer: answer.trim().slice(0, insightAnswerLimit) } : {}),
    tables: insightTables
  };

  while (JSON.stringify(request).length > insightPayloadBudget) {
    const largest = request.tables.reduce((left, right) => (right.rows.length > left.rows.length ? right : left));
    if (largest.rows.length <= 5) break;
    largest.rows = largest.rows.slice(0, Math.ceil(largest.rows.length / 2));
  }
  return request;
}

function normalizeQuestion(text: string) {
  return text.replace(/[\s?？。.!！]/g, "");
}

export function normalizeDataHubAnswerInsight(raw: unknown, question = ""): DataHubAnswerInsight {
  const source = isRecord(raw) ? raw : {};
  const insights: DataHubAnswerInsightItem[] = (Array.isArray(source.insights) ? source.insights : [])
    .flatMap((item) => {
      if (!isRecord(item) || typeof item.detail !== "string" || !item.detail.trim()) return [];
      return [{ title: typeof item.title === "string" ? item.title.trim() : "", detail: item.detail.trim() }];
    })
    .slice(0, insightLimit);
  const asked = normalizeQuestion(question);
  const seen = new Set<string>();
  const followUps = (Array.isArray(source.followUps) ? source.followUps : [])
    .flatMap((item) => {
      if (typeof item !== "string") return [];
      const text = item.trim();
      const key = normalizeQuestion(text);
      if (!key || key === asked || seen.has(key)) return [];
      seen.add(key);
      return [text];
    })
    .slice(0, followUpLimit);
  return { insights, followUps };
}

export async function requestDataHubAnswerInsight(request: DataHubAnswerInsightRequest): Promise<DataHubAnswerInsight> {
  const raw = await requestDataHub<unknown>("/api/v1/chat/answer-insight", {
    method: "POST",
    body: JSON.stringify(request),
    timeoutMs: 60_000
  });
  return normalizeDataHubAnswerInsight(raw, request.question);
}

/** 后端还没部署这个接口（旧环境）：不算失败，直接不显示洞察。 */
export function isDataHubAnswerInsightUnavailable(error: unknown) {
  return error instanceof DataHubServiceError && (error.status === 404 || error.status === 501);
}

const answerInsightMemory = createAnswerMemory<DataHubAnswerInsight>(
  "xingshu_answer_insights",
  80,
  (value) => normalizeDataHubAnswerInsight(value)
);

/** 历史对话重新打开时沿用当时生成的洞察，不再重复调用模型。key 用会话与 chatId。 */
export function readRememberedAnswerInsight(key: string): DataHubAnswerInsight | undefined {
  return answerInsightMemory.read(key);
}

export function rememberAnswerInsight(key: string, insight: DataHubAnswerInsight) {
  answerInsightMemory.remember(key, insight);
}
