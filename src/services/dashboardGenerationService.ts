import type { DataHubAskTurn, DataHubTableColumn, DataHubTableResult } from "@/types/dataHub";
import type {
  DashboardDataBinding,
  DashboardGenerationInput,
  DashboardRecord,
  DashboardSchema,
  DashboardWidget,
  DashboardWidgetPosition,
  DashboardWidgetType
} from "@/types/dashboardStudio";
import { migrateDashboardSchemaToFreeLayout } from "@/features/dashboardStudio/core/dashboardFreeLayout";

type DashboardGenerationOptions = {
  idFactory?: (prefix: string) => string;
  now?: Date;
  sourceQueryId?: string;
  spaceId?: number;
  dataMode?: "snapshot" | "live";
};

type BlankDashboardOptions = DashboardGenerationOptions & {
  title?: string;
};

type ColumnKind = "number" | "time" | "dimension";
type MetricValueMode = "first" | "latest" | "sum" | "max" | "average";

type BindingAnalysis = {
  binding: DashboardDataBinding;
  numericColumns: DataHubTableColumn[];
  timeColumn?: DataHubTableColumn;
  dimensionColumn?: DataHubTableColumn;
};

type MetricCandidate = {
  binding: DashboardDataBinding;
  column: DataHubTableColumn;
  title: string;
  subtitle: string;
  valueMode: MetricValueMode;
  /** 是否展示环比趋势：仅时序数据有意义，排名/单值场景关闭避免误导 */
  showTrend: boolean;
};

const defaultCanvas = {
  width: 1920,
  height: 1080,
  columns: 12 as const,
  rows: 10,
  background: "#EFF4FB"
};
const generatedCanvasRows = 8;
const maximumSnapshotRows = 200;
const maximumWidgets = 7;
const metricAccents = ["#1677FF", "#00A6E8", "#16A37A", "#6C7FF2"];
const chartSeriesColors = ["#1677FF", "#00A6E8", "#16A37A", "#F59E0B", "#6C7FF2", "#F26D6D"];
/** 生成大屏统一卡片面：白底、细边框、12px 圆角、深蓝信息层级 */
const cardSurface = { background: "#FFFFFF", borderColor: "#E3ECF9", borderRadius: 12, color: "#294469" } as const;
const questionMetricTerms = [
  "销售收入",
  "销售额",
  "咨询数",
  "订单量",
  "客户数",
  "用户数",
  "访问量",
  "调用量",
  "转化率",
  "增长率",
  "完成率",
  "占比",
  "营收",
  "金额",
  "数量"
];
const questionDimensionTerms = [
  "产品类别",
  "客户类型",
  "业务区域",
  "销售渠道",
  "社区",
  "区域",
  "部门",
  "产品",
  "渠道",
  "客户",
  "项目",
  "城市",
  "门店",
  "月份",
  "日期"
];

function defaultIdFactory(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/,/g, "").replace(/%$/, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferColumnKind(column: DataHubTableColumn, rows: Record<string, unknown>[]): ColumnKind {
  const descriptor = `${column.key} ${column.title} ${column.type ?? ""}`.toLowerCase();

  if (/date|time|year|month|day|week|quarter|日期|时间|年份|月份|季度|周/.test(descriptor)) {
    return "time";
  }
  if (/int|long|float|double|decimal|numeric|number|count|amount|ratio|percent|金额|数量|占比|比例|率|记录数/.test(descriptor)) {
    return "number";
  }

  const samples = rows
    .slice(0, 12)
    .map((row) => row[column.key])
    .filter((value) => value !== null && value !== undefined && value !== "");

  if (samples.length > 0 && samples.every((value) => toFiniteNumber(value) !== null)) {
    return "number";
  }
  return "dimension";
}

function findQuestionTerm(question: string, terms: string[]) {
  return terms.find((term) => question.includes(term));
}

function cleanTechnicalTitle(value: string) {
  return value
    .trim()
    .replace(/^.*?表[\s._·/-]+/, "")
    .replace(/[._-]+/g, " ")
    .replace(/表$/, "")
    .trim();
}

function normalizeColumnTitle(column: DataHubTableColumn, kind: ColumnKind, question: string) {
  const rawTitle = column.title || column.key;
  let title = cleanTechnicalTitle(rawTitle) || column.key;
  const questionMetric = findQuestionTerm(question, questionMetricTerms);
  const questionDimension = findQuestionTerm(question, questionDimensionTerms);

  if (kind === "number" && questionMetric && /^(记录数|计数|数量|数值|count|value)$/i.test(title)) {
    title = questionMetric;
  }
  if (kind === "dimension" && questionDimension && /^(项目名称|名称|项目|name)$/i.test(title)) {
    title = questionDimension;
  }

  return title;
}

function displayColumnTitle(column: DataHubTableColumn) {
  return (column.title || column.key).replace(/[（(][^）)]+[）)]/g, "").trim();
}

function displayUnit(column: DataHubTableColumn) {
  const title = column.title || "";
  if (/%|百分比/.test(title)) {
    return "%";
  }
  const match = title.match(/[（(]([^）)]{1,8})[）)]/);
  return match?.[1] ?? "";
}

function topCountFromQuestion(question: string) {
  const arabic = question.match(/(?:排名)?前\s*(\d+)|top\s*(\d+)/i);
  if (arabic) {
    return Number(arabic[1] ?? arabic[2]);
  }

  const chinese = question.match(/(?:排名)?前\s*([一二三四五六七八九十])/);
  const values: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  return chinese?.[1] ? values[chinese[1]] : undefined;
}

function createTitle(question: string, dimensionTitle?: string, metricTitle?: string) {
  const topCount = topCountFromQuestion(question);
  if (topCount && dimensionTitle && metricTitle) {
    return `${dimensionTitle}${metricTitle} TOP ${topCount}`;
  }

  const normalized = question
    .trim()
    .replace(/[？?。！!]+$/g, "")
    .replace(/^(?:请|帮我|麻烦)?(?:统计一下|查询一下|查一下|看一下|分析一下|统计|查询|分析)/, "")
    .replace(/(?:如何|怎么样|是多少|有多少)$/g, "")
    .replace(/(?:的)?(?:情况|数据|结果)$/g, "")
    .trim();

  if (!normalized) {
    return "问数生成大屏";
  }
  return normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized;
}

function isCompositionMetric(column: DataHubTableColumn) {
  return /占比|比例|份额|构成|share|ratio|percent|percentage|rate/i.test(`${column.title} ${column.key}`);
}

function isGenericGroupLabel(value?: string) {
  return !value || /^(?:结果表|查询结果|数据结果|结果|table)\s*\d*$/i.test(value.trim());
}

function bindingLabel(
  table: DataHubTableResult,
  dimensionColumn: DataHubTableColumn | undefined,
  numericColumn: DataHubTableColumn | undefined,
  timeColumn: DataHubTableColumn | undefined,
  question: string
) {
  if (!isGenericGroupLabel(table.groupLabel)) {
    return cleanTechnicalTitle(table.groupLabel ?? "") || table.groupLabel || "问数结果";
  }

  const dimension = dimensionColumn ? displayColumnTitle(dimensionColumn) : findQuestionTerm(question, questionDimensionTerms);
  const metric = numericColumn ? displayColumnTitle(numericColumn) : findQuestionTerm(question, questionMetricTerms);
  if (timeColumn && metric) {
    return `${metric}趋势`;
  }
  if (dimension && metric && (topCountFromQuestion(question) || /排行|排名|前\s*[一二三四五六七八九十\d]+/.test(question))) {
    return `${dimension}${metric}排行`;
  }
  if (dimension && numericColumn && isCompositionMetric(numericColumn)) {
    return `${dimension}结构`;
  }
  if (dimension && metric) {
    return `${dimension}${metric}分析`;
  }
  return metric || dimension || "问数结果";
}

function normalizedTable(table: DataHubTableResult, tableIndex: number, question: string): DataHubTableResult {
  const rows = table.rows.slice(0, maximumSnapshotRows).map((row) => ({ ...row }));
  const copiedColumns = table.columns.map((column) => ({ ...column }));
  const kindByKey = new Map(copiedColumns.map((column) => [column.key, inferColumnKind(column, rows)]));
  const columns = copiedColumns
    .map((column) => ({
      ...column,
      title: normalizeColumnTitle(column, kindByKey.get(column.key) ?? "dimension", question)
    }))
    .sort((left, right) => {
      const leftKind = kindByKey.get(left.key);
      const rightKind = kindByKey.get(right.key);
      const score = (kind: ColumnKind | undefined) => (kind === "time" || kind === "dimension" ? 0 : 1);
      return score(leftKind) - score(rightKind);
    });
  const timeColumn = columns.find((column) => kindByKey.get(column.key) === "time");
  const dimensionColumn = timeColumn ?? columns.find((column) => kindByKey.get(column.key) === "dimension");
  const numericColumn = columns.find((column) => kindByKey.get(column.key) === "number");
  const normalized: DataHubTableResult = {
    ...table,
    columns,
    rows,
    totalRows: Math.max(table.totalRows, table.rows.length),
    tableIndex: table.tableIndex ?? tableIndex
  };

  normalized.groupLabel = bindingLabel(normalized, dimensionColumn, numericColumn, timeColumn, question);
  return normalized;
}

function analyzeBinding(binding: DashboardDataBinding): BindingAnalysis {
  const kinds = new Map(
    binding.table.columns.map((column) => [column.key, inferColumnKind(column, binding.table.rows)])
  );
  const numericColumns = binding.table.columns.filter((column) => kinds.get(column.key) === "number");
  const timeColumn = binding.table.columns.find((column) => kinds.get(column.key) === "time");
  const dimensionColumn = timeColumn ?? binding.table.columns.find((column) => kinds.get(column.key) === "dimension");
  return { binding, numericColumns, timeColumn, dimensionColumn };
}

function createWidget(
  input: Omit<DashboardWidget, "id" | "position" | "type">,
  type: DashboardWidgetType,
  position: DashboardWidgetPosition,
  idFactory: (prefix: string) => string
): DashboardWidget {
  return { ...input, id: idFactory("widget"), type, position };
}

function dimensionValueForMaximum(analysis: BindingAnalysis, metricKey: string) {
  const dimensionKey = analysis.dimensionColumn?.key;
  if (!dimensionKey) return "";

  let bestValue = Number.NEGATIVE_INFINITY;
  let bestLabel = "";
  analysis.binding.table.rows.forEach((row) => {
    const value = toFiniteNumber(row[metricKey]);
    if (value !== null && value > bestValue) {
      bestValue = value;
      bestLabel = String(row[dimensionKey] ?? "");
    }
  });
  return bestLabel;
}

function scalarMetricCandidates(analyses: BindingAnalysis[]): MetricCandidate[] {
  return analyses.flatMap((analysis) => {
    if (analysis.binding.table.rows.length > 1 || analysis.numericColumns.length === 0) {
      return [];
    }
    return analysis.numericColumns.slice(0, 4).map((column) => ({
      binding: analysis.binding,
      column,
      title: displayColumnTitle(column),
      subtitle: analysis.binding.label,
      valueMode: "first" as const,
      showTrend: false
    }));
  });
}

function primaryMetricCandidates(analysis?: BindingAnalysis): MetricCandidate[] {
  if (!analysis || analysis.numericColumns.length === 0) {
    return [];
  }

  const rows = analysis.binding.table.rows;
  const dimensionTitle = analysis.dimensionColumn ? displayColumnTitle(analysis.dimensionColumn) : "数据项";
  const primaryMetric = analysis.numericColumns[0];
  if (!primaryMetric) {
    return [];
  }

  if (analysis.timeColumn) {
    const latest = analysis.numericColumns.slice(0, 2).map((column) => ({
      binding: analysis.binding,
      column,
      title: `最新${displayColumnTitle(column)}`,
      subtitle: String(rows.at(-1)?.[analysis.timeColumn?.key ?? ""] ?? "最新周期"),
      valueMode: "latest" as const,
      showTrend: true
    }));
    return [
      ...latest,
      {
        binding: analysis.binding,
        column: primaryMetric,
        title: `峰值${displayColumnTitle(primaryMetric)}`,
        subtitle: dimensionValueForMaximum(analysis, primaryMetric.key) || "周期峰值",
        valueMode: "max" as const,
        showTrend: true
      },
      {
        binding: analysis.binding,
        column: primaryMetric,
        title: `平均${displayColumnTitle(primaryMetric)}`,
        subtitle: `按${dimensionTitle}计算`,
        valueMode: "average" as const,
        showTrend: true
      }
    ];
  }

  const metricTitle = displayColumnTitle(primaryMetric);
  return [
    {
      binding: analysis.binding,
      column: primaryMetric,
      title: `最高${metricTitle}`,
      subtitle: dimensionValueForMaximum(analysis, primaryMetric.key) || "领先项",
      valueMode: "max",
      showTrend: false
    },
    {
      binding: analysis.binding,
      column: primaryMetric,
      title: `${metricTitle}合计`,
      subtitle: `${rows.length} 个${dimensionTitle}`,
      valueMode: "sum",
      showTrend: false
    },
    {
      binding: analysis.binding,
      column: primaryMetric,
      title: `平均${metricTitle}`,
      subtitle: `按${dimensionTitle}计算`,
      valueMode: "average",
      showTrend: false
    }
  ];
}

function selectMetricCandidates(analyses: BindingAnalysis[], primary?: BindingAnalysis) {
  const scalar = scalarMetricCandidates(analyses);
  const primaryCandidates = primaryMetricCandidates(primary);
  const candidates = scalar.length >= 2 ? [...scalar, ...primaryCandidates] : [...primaryCandidates, ...scalar];
  const unique = new Map<string, MetricCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.binding.id}:${candidate.column.key}:${candidate.valueMode}`;
    if (!unique.has(key)) unique.set(key, candidate);
  });
  return Array.from(unique.values()).slice(0, scalar.length >= 2 ? 4 : 3);
}

function createMetricWidgets(
  candidates: MetricCandidate[],
  idFactory: (prefix: string) => string
): DashboardWidget[] {
  if (candidates.length === 0) return [];
  const width = Math.floor(defaultCanvas.columns / candidates.length);

  return candidates.map((candidate, index) =>
    createWidget(
      {
        title: candidate.title,
        subtitle: candidate.subtitle,
        bindingId: candidate.binding.id,
        mapping: {
          metricKeys: [candidate.column.key],
          valueMode: candidate.valueMode,
          displayUnit: displayUnit(candidate.column) || undefined
        },
        style: { ...cardSurface, accent: metricAccents[index] ?? "#1677FF", showTrend: candidate.showTrend }
      },
      "metric",
      { x: index * width, y: 1, w: index === candidates.length - 1 ? 12 - index * width : width, h: 2 },
      idFactory
    )
  );
}

function chartTypeFor(analysis: BindingAnalysis): DashboardWidgetType {
  if (analysis.timeColumn) return "line";
  if (analysis.numericColumns.some(isCompositionMetric) && analysis.binding.table.rows.length <= 8) return "pie";
  return "bar";
}

/**
 * 同图多指标量级悬殊时只保留主指标，避免次指标被压成贴地直线。
 * 被过滤的字段仍完整呈现在明细表中。
 */
function scaleCompatibleMetricKeys(analysis: BindingAnalysis, keys: string[]) {
  if (keys.length <= 1) return keys;

  const rows = analysis.binding.table.rows;
  const maxima = new Map(
    keys.map((key) => [
      key,
      rows.reduce((maximum, row) => Math.max(maximum, Math.abs(toFiniteNumber(row[key]) ?? 0)), 0)
    ])
  );
  const primaryMax = maxima.get(keys[0] ?? "") ?? 0;
  if (primaryMax <= 0) return keys;

  return keys.filter((key, index) => {
    if (index === 0) return true;
    const ratio = (maxima.get(key) ?? 0) / primaryMax;
    return ratio >= 0.2 && ratio <= 5;
  });
}

function createPrimaryContentWidgets(
  analysis: BindingAnalysis | undefined,
  idFactory: (prefix: string) => string
): DashboardWidget[] {
  if (!analysis || analysis.binding.table.rows.length === 0) {
    return [];
  }

  const { binding, dimensionColumn, numericColumns, timeColumn } = analysis;
  const hasChart = Boolean(dimensionColumn && numericColumns.length > 0);
  const tableTitle = timeColumn
    ? "趋势数据明细"
    : dimensionColumn
      ? `${displayColumnTitle(dimensionColumn)}明细`
      : "数据明细";
  const tableWidget = (position: DashboardWidgetPosition) =>
    createWidget(
      {
        title: tableTitle,
        subtitle: `共 ${binding.table.totalRows} 行`,
        bindingId: binding.id,
        mapping: {},
        style: { ...cardSurface, accent: "#1677FF" }
      },
      "table",
      position,
      idFactory
    );

  if (!hasChart || !dimensionColumn) {
    return [tableWidget({ x: 0, y: 3, w: 12, h: 5 })];
  }

  const chartType = chartTypeFor(analysis);
  const metricKeys = scaleCompatibleMetricKeys(
    analysis,
    numericColumns.slice(0, chartType === "pie" ? 1 : 2).map((column) => column.key)
  );
  const chartSubtitle = timeColumn
    ? `趋势变化 · ${binding.table.rows.length} 个周期`
    : chartType === "pie"
      ? `结构占比 · ${binding.table.rows.length} 项`
      : `排名对比 · ${binding.table.rows.length} 项`;
  const chartWidget = (position: DashboardWidgetPosition) =>
    createWidget(
      {
        title: binding.label,
        subtitle: chartSubtitle,
        bindingId: binding.id,
        mapping: { dimensionKey: dimensionColumn.key, metricKeys },
        style: {
          ...cardSurface,
          accent: chartType === "pie" ? "#00A6E8" : "#1677FF",
          seriesColors: [...chartSeriesColors],
          showLegend: metricKeys.length > 1 || chartType === "pie",
          smooth: chartType === "line"
        }
      },
      chartType,
      position,
      idFactory
    );

  // 类目/排名数据：柱状图看排名对比，饼图看结构占比，双图并排丰富表达
  const primaryMetric = numericColumns[0];
  if (chartType === "bar" && primaryMetric && binding.table.rows.length >= 3) {
    return [
      chartWidget({ x: 0, y: 3, w: 6, h: 5 }),
      createWidget(
        {
          title: `${displayColumnTitle(primaryMetric)}结构占比`,
          subtitle: `结构占比 · ${binding.table.rows.length} 项`,
          bindingId: binding.id,
          mapping: { dimensionKey: dimensionColumn.key, metricKeys: [primaryMetric.key] },
          style: {
            ...cardSurface,
            accent: "#00A6E8",
            seriesColors: [...chartSeriesColors],
            showLegend: true
          }
        },
        "pie",
        { x: 6, y: 3, w: 3, h: 5 },
        idFactory
      ),
      tableWidget({ x: 9, y: 3, w: 3, h: 5 })
    ];
  }

  return [chartWidget({ x: 0, y: 3, w: 8, h: 5 }), tableWidget({ x: 8, y: 3, w: 4, h: 5 })];
}

function sanitizeSummary(value?: string) {
  return (value ?? "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatInsightNumber(value: number, unit: string) {
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}${unit}`;
}

function derivedInsight(analysis?: BindingAnalysis) {
  const metric = analysis?.numericColumns[0];
  const dimension = analysis?.dimensionColumn;
  if (!analysis || !metric || !dimension) return "已从本次问数结果中提炼关键指标与数据明细。";

  let maximum = Number.NEGATIVE_INFINITY;
  let label = "";
  analysis.binding.table.rows.forEach((row) => {
    const value = toFiniteNumber(row[metric.key]);
    if (value !== null && value > maximum) {
      maximum = value;
      label = String(row[dimension.key] ?? "");
    }
  });
  if (!Number.isFinite(maximum)) return "已从本次问数结果中提炼关键指标与数据明细。";

  const metricTitle = displayColumnTitle(metric);
  const dimensionTitle = displayColumnTitle(dimension);
  return `${label || "领先项"}的${metricTitle}最高，为 ${formatInsightNumber(maximum, displayUnit(metric))}；当前大屏聚焦 ${analysis.binding.table.rows.length} 个${dimensionTitle}的对比与明细。`;
}

function conciseInsight(summary: string | undefined, primary?: BindingAnalysis) {
  const cleaned = sanitizeSummary(summary);
  if (cleaned && cleaned.length <= 80) {
    return cleaned;
  }
  const generated = derivedInsight(primary);
  if (generated.length <= 90) return generated;
  return `${generated.slice(0, 89)}…`;
}

export function createDashboardDraftFromTables(
  input: DashboardGenerationInput,
  options: DashboardGenerationOptions = {}
): DashboardSchema {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const idFactory = options.idFactory ?? defaultIdFactory;
  const sourceQueryId = input.sourceQueryId ?? options.sourceQueryId;
  const requestedMode = input.dataMode ?? options.dataMode ?? "snapshot";
  const dataMode = requestedMode === "live" && sourceQueryId ? "live" : "snapshot";
  const dataBindings: Record<string, DashboardDataBinding> = {};
  const orderedBindings: DashboardDataBinding[] = [];

  input.tables.forEach((sourceTable, index) => {
    if (sourceTable.columns.length === 0) return;

    const table = normalizedTable(sourceTable, index, input.question);
    const bindingId = idFactory("binding");
    const binding: DashboardDataBinding = {
      id: bindingId,
      label: table.groupLabel || `问数结果 ${index + 1}`,
      mode: dataMode,
      sourceQueryId,
      tableIndex: table.tableIndex ?? index,
      table
    };
    dataBindings[bindingId] = binding;
    orderedBindings.push(binding);
  });

  const analyses = orderedBindings.map(analyzeBinding);
  // 标记绑定数据形态：柱状图按类目着色、组件兼容性判断都依赖它
  analyses.forEach((analysis) => {
    const resultKind = analysis.timeColumn ? "time-series" : analysis.dimensionColumn ? "category" : undefined;
    if (resultKind) analysis.binding.resultKind = resultKind;
  });
  const primary = analyses.find(
    (analysis) => analysis.binding.table.rows.length > 1 && analysis.dimensionColumn && analysis.numericColumns.length > 0
  ) ?? analyses.find((analysis) => analysis.binding.table.rows.length > 0);
  const dimensionTitle = primary?.dimensionColumn ? displayColumnTitle(primary.dimensionColumn) : undefined;
  const metricTitle = primary?.numericColumns[0] ? displayColumnTitle(primary.numericColumns[0]) : undefined;
  const dashboardTitle = createTitle(input.question, dimensionTitle, metricTitle);
  const insight = conciseInsight(input.summary, primary);
  const widgets: DashboardWidget[] = [
    createWidget(
      {
        title: dashboardTitle,
        subtitle: insight,
        mapping: {},
        style: {
          accent: "#1677FF",
          color: "#0F2B50",
          fontSize: 30,
          fontWeight: 800,
          textAlign: "center"
        }
      },
      "text",
      { x: 0, y: 0, w: 12, h: 1 },
      idFactory
    ),
    ...createMetricWidgets(selectMetricCandidates(analyses, primary), idFactory),
    ...createPrimaryContentWidgets(primary, idFactory)
  ].slice(0, maximumWidgets);

  return migrateDashboardSchemaToFreeLayout({
    schemaVersion: 1,
    id: idFactory("dashboard"),
    title: dashboardTitle,
    description: insight,
    canvas: { ...defaultCanvas, rows: generatedCanvasRows },
    source: {
      kind: "ask-data",
      question: input.question,
      summary: input.summary,
      queryId: sourceQueryId,
      spaceId: input.spaceId ?? options.spaceId,
      generatedAt: nowIso,
      plannerVersion: 2
    },
    dataBindings,
    widgets,
    createdAt: nowIso,
    updatedAt: nowIso
  });
}

export function createDashboardDraftFromAskTurn(
  turn: DataHubAskTurn,
  options: DashboardGenerationOptions = {}
) {
  if (turn.status !== "done") {
    throw new Error("问数尚未完成，暂时不能生成大屏");
  }
  if (turn.tableResults.length === 0) {
    throw new Error("问数结果中没有可用于生成大屏的表格");
  }

  return createDashboardDraftFromTables(
    {
      question: turn.question,
      summary: turn.assistantContent || turn.done?.summary,
      tables: turn.tableResults,
      sourceQueryId: options.sourceQueryId,
      spaceId: options.spaceId,
      dataMode: options.dataMode
    },
    options
  );
}

export function replanLegacyDashboardDraft(record: DashboardRecord): DashboardSchema | null {
  const source = record.schema.source;
  if (
    record.status !== "draft" ||
    record.revision > 1 ||
    source.kind !== "ask-data" ||
    source.plannerVersion !== 1
  ) {
    return null;
  }

  const bindings = Object.values(record.schema.dataBindings).sort(
    (left, right) => (left.tableIndex ?? 0) - (right.tableIndex ?? 0)
  );
  if (bindings.length === 0) {
    return null;
  }

  const replanned = createDashboardDraftFromTables(
    {
      question: source.question || record.schema.title,
      summary: source.summary || record.schema.description,
      tables: bindings.map((binding) => binding.table),
      sourceQueryId: source.queryId,
      spaceId: source.spaceId,
      dataMode: bindings.some((binding) => binding.mode === "live") ? "live" : "snapshot"
    },
    {
      sourceQueryId: source.queryId,
      spaceId: source.spaceId
    }
  );

  return {
    ...replanned,
    id: record.id,
    createdAt: record.schema.createdAt
  };
}

export function createBlankDashboard(options: BlankDashboardOptions = {}): DashboardSchema {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const idFactory = options.idFactory ?? defaultIdFactory;

  return {
    schemaVersion: 2,
    id: idFactory("dashboard"),
    title: options.title?.trim() || "未命名大屏",
    description: "",
    canvas: { ...defaultCanvas, scaleMode: "fit-screen" },
    source: {
      kind: "blank",
      generatedAt: nowIso,
      plannerVersion: 2
    },
    dataBindings: {},
    widgets: [],
    createdAt: nowIso,
    updatedAt: nowIso
  };
}
