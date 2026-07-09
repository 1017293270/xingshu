import type { EChartsOption } from "echarts";
import type {
  AiChartColumnSummary,
  AiChartPlanRequest,
  AiChartPlanRequestSummary,
  AiChartPlanResult,
  AiChartTableSummary,
  AiChartType,
  AiProviderConfig,
  GeneratedChartSpec
} from "@/types/aiChart";
import type { DataHubTableResult } from "@/types/dataHub";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";

type AiFetch = typeof fetch;

type PlanAiChartOptions = {
  providerConfig?: AiProviderConfig | null;
  fetcher?: AiFetch;
};

const supportedChartTypes: AiChartType[] = ["bar", "line", "pie"];
const sampleRowLimit = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/%$/, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function inferColumnType(
  column: DataHubTableResult["columns"][number],
  rows: Record<string, unknown>[]
): AiChartColumnSummary["type"] {
  const title = `${column.title} ${column.key}`.toLowerCase();
  const explicitType = column.type?.toLowerCase();

  if (explicitType && /int|float|double|decimal|number|numeric|long|count|ratio|percent/.test(explicitType)) {
    return "number";
  }

  if (/date|time|日期|时间|月份|季度|年份|year|month|day/.test(title)) {
    return "time";
  }

  const sampledValues = rows.slice(0, 8).map((row) => row[column.key]).filter((value) => value !== null && value !== undefined && value !== "");
  if (sampledValues.length > 0 && sampledValues.every((value) => toNumber(value) !== null)) {
    return "number";
  }

  return "dimension";
}

function summarizeTable(table: DataHubTableResult, index: number): AiChartTableSummary {
  const columns = table.columns.map((column) => ({
    key: column.key,
    title: formatDataHubColumnTitle(column.title),
    type: inferColumnType(column, table.rows)
  }));

  return {
    tableIndex: table.tableIndex ?? index,
    title: table.groupLabel || `结果表 ${table.tableIndex !== undefined ? table.tableIndex + 1 : index + 1}`,
    totalRows: table.totalRows,
    columns,
    sampleRows: table.rows.slice(0, sampleRowLimit).map((row) =>
      columns.reduce<Record<string, unknown>>((result, column) => {
        result[column.key] = row[column.key];
        return result;
      }, {})
    )
  };
}

export function createAiChartPlanRequestSummary(request: AiChartPlanRequest): AiChartPlanRequestSummary {
  return {
    question: request.question,
    tables: request.tables.map(summarizeTable)
  };
}

function findChartableShape(summary: AiChartPlanRequestSummary) {
  return summary.tables.find((table) => {
    const numericColumns = table.columns.filter((column) => column.type === "number");
    const dimensionColumns = table.columns.filter((column) => column.type === "dimension" || column.type === "time");
    return table.totalRows > 1 && numericColumns.length > 0 && dimensionColumns.length > 0;
  });
}

function createLocalChartPlan(summary: AiChartPlanRequestSummary, reason = "已使用本地规则生成图表建议。"): AiChartPlanResult | null {
  const table = findChartableShape(summary);
  if (!table) {
    return null;
  }

  const timeColumn = table.columns.find((column) => column.type === "time");
  const dimensionColumn = timeColumn ?? table.columns.find((column) => column.type === "dimension");
  const metricColumn = table.columns.find((column) => column.type === "number");

  if (!dimensionColumn || !metricColumn) {
    return null;
  }

  const chartType: AiChartType = timeColumn ? "line" : "bar";
  const allowedTypes: AiChartType[] = timeColumn ? ["line", "bar"] : ["bar", "pie"];

  return {
    chartable: true,
    reason,
    chartType,
    allowedTypes,
    title: `${dimensionColumn.title}分布`,
    tableIndex: table.tableIndex,
    dimensionKey: dimensionColumn.key,
    metricKeys: [metricColumn.key]
  };
}

function isRecoverableAiPlanError(error: unknown) {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /AI 没有返回可解析|AI 返回格式不正确|AI 没有返回图表判断内容/i.test(error.message);
}

function getLocalGuardResult(summary: AiChartPlanRequestSummary): AiChartPlanResult | null {
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

  if (!findChartableShape(summary)) {
    return { chartable: false, reason: "结果缺少维度与数值的对应关系，不适合生成图表。" };
  }

  return null;
}

function joinProviderUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function stripModelText(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseAiPlan(text: string): AiChartPlanResult {
  const parsed = JSON.parse(stripModelText(text)) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("AI 没有返回可解析的图表判断");
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

async function requestRemoteAiPlan(
  summary: AiChartPlanRequestSummary,
  config: AiProviderConfig,
  fetcher: AiFetch
): Promise<AiChartPlanResult> {
  const response = await fetcher(joinProviderUrl(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_completion_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            "你是企业数据产品的图表规划器。只返回严格 JSON，不要 Markdown。判断表格结果能否生成图表，并从 bar、line、pie 中选择。不要编造字段。"
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "基于 question、columns、sampleRows、totalRows 判断能否图表化。单个具体数字或只有一行通常不可图表化。字段必须来自 columns.key。",
            outputSchema: {
              chartable: "boolean",
              reason: "string",
              chartType: "bar | line | pie",
              allowedTypes: ["bar", "line", "pie"],
              title: "string",
              tableIndex: "number, 必须来自 data.tables[].tableIndex",
              dimensionKey: "string",
              metricKeys: ["string"]
            },
            data: summary
          })
        }
      ]
    })
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const message =
      payload && isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : response.statusText || "AI 图表判断失败";
    throw new Error(message);
  }

  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("AI 返回格式不正确");
  }

  const firstChoice = payload.choices[0];
  const content =
    isRecord(firstChoice) && isRecord(firstChoice.message) && typeof firstChoice.message.content === "string"
      ? firstChoice.message.content
      : "";

  if (!content) {
    throw new Error("AI 没有返回图表判断内容");
  }

  return parseAiPlan(content);
}

export async function planAiChart(
  request: AiChartPlanRequest,
  options: PlanAiChartOptions = {}
): Promise<AiChartPlanResult> {
  const summary = createAiChartPlanRequestSummary(request);
  const localGuard = getLocalGuardResult(summary);

  if (localGuard) {
    return localGuard;
  }

  if (!options.providerConfig?.apiKey) {
    return { chartable: false, reason: "请先配置 AI 供应商和 API Key。" };
  }

  try {
    return await requestRemoteAiPlan(summary, options.providerConfig, options.fetcher ?? fetch);
  } catch (error) {
    if (isRecoverableAiPlanError(error)) {
      const fallbackPlan = createLocalChartPlan(summary, "AI 返回内容不完整，已使用本地规则生成图表建议。");
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

export function buildGeneratedChartSpec(
  plan: AiChartPlanResult,
  tables: DataHubTableResult[]
): GeneratedChartSpec | null {
  if (!plan.chartable || !plan.chartType || !plan.dimensionKey || !plan.metricKeys?.length) {
    return null;
  }

  const table = findTableForPlan(plan, tables);
  if (!table) {
    return null;
  }

  const allowedTypes = (plan.allowedTypes?.length ? plan.allowedTypes : [plan.chartType]).filter((type) =>
    supportedChartTypes.includes(type)
  );

  if (!allowedTypes.includes(plan.chartType)) {
    allowedTypes.unshift(plan.chartType);
  }

  return {
    title: plan.title || "AI 生成图表",
    reason: plan.reason,
    chartType: plan.chartType,
    allowedTypes: Array.from(new Set(allowedTypes)),
    table,
    tableIndex: getTableIndex(table, tables),
    tableTitle: getTableTitle(table, tables),
    dimensionKey: plan.dimensionKey,
    metricKeys: plan.metricKeys
  };
}

function metricTitle(table: DataHubTableResult, key: string) {
  return formatDataHubColumnTitle(table.columns.find((column) => column.key === key)?.title || key);
}

export function buildGeneratedChartOption(spec: GeneratedChartSpec, chartType = spec.chartType): EChartsOption {
  const categories = spec.table.rows.map((row) => String(row[spec.dimensionKey] ?? "-"));
  const metrics = spec.metricKeys.map((key) => ({
    key,
    name: metricTitle(spec.table, key),
    values: spec.table.rows.map((row) => toNumber(row[key]) ?? 0)
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
          data: categories.map((name, index) => ({ name, value: metric.values[index] }))
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
