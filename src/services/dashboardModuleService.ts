import { getDashboardComponentDefinition } from "@/features/dashboardStudio/core/dashboardComponentRegistry";
import type {
  QueryAsset,
  QueryColumnDefinition,
  QueryExecution,
  QueryExecutionOutput
} from "@/types/analytics";
import type {
  DashboardDataBinding,
  DashboardDataSourceRef,
  DashboardModule,
  DashboardSchema,
  DashboardWidget,
  DashboardWidgetMapping,
  DashboardWidgetPosition,
  DashboardWidgetStyle,
  DashboardWidgetType
} from "@/types/dashboardStudio";

const CANVAS_PADDING = 24;
const WIDGET_GAP = 24;
const POSITION_STEP = 24;
const MIN_COMPONENT_SIZE = 24;
const CARD_SURFACE = {
  background: "#FFFFFF",
  borderColor: "#E3ECF9",
  borderRadius: 12,
  color: "#294469"
} as const;
const CHART_SERIES_COLORS = ["#1677FF", "#00A6E8", "#16A37A", "#F59E0B", "#6C7FF2", "#F26D6D"];
const DETAIL_INTENT_PATTERN = /哪些|哪几|列出|罗列|列表|明细|清单|详情|逐条|台账|名录|\blist\b|\bdetails?\b/i;
const AGGREGATE_INTENT_PATTERN = /汇总|统计|趋势|变化|对比|分布|占比|构成|排名|合计|总计|平均|\btop(?:\s*\d+)?\b/i;

type ColumnKind = "number" | "time" | "dimension";

type OutputAnalysis = {
  numericColumns: QueryColumnDefinition[];
  timeColumn?: QueryColumnDefinition;
  dimensionColumn?: QueryColumnDefinition;
};

export type AppendQueryAssetChartResult = {
  schema: DashboardSchema;
  widgetId: string;
  moduleId: string;
  bindingId: string;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/,/g, "").replace(/%$/, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferColumnKind(column: QueryColumnDefinition, rows: Record<string, unknown>[]): ColumnKind {
  const descriptor = `${column.key} ${column.label} ${column.title ?? ""} ${column.type ?? ""}`.toLowerCase();
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
  return samples.length > 0 && samples.every((value) => toFiniteNumber(value) !== null)
    ? "number"
    : "dimension";
}

function analyzeOutput(output: QueryExecutionOutput): OutputAnalysis {
  const kindByColumnId = new Map(
    output.columns.map((column) => [column.columnId, inferColumnKind(column, output.rows)])
  );
  const numericColumns = output.columns.filter((column) => kindByColumnId.get(column.columnId) === "number");
  const timeColumn = output.columns.find((column) => kindByColumnId.get(column.columnId) === "time");
  const dimensionColumn = timeColumn
    ?? output.columns.find((column) => kindByColumnId.get(column.columnId) === "dimension");
  return { numericColumns, timeColumn, dimensionColumn };
}

function displayColumnTitle(column?: QueryColumnDefinition) {
  if (!column) return "";
  return (column.label || column.title || column.key).replace(/[（(][^）)]+[）)]/g, "").trim();
}

function displayUnit(column?: QueryColumnDefinition) {
  const title = column?.label || column?.title || "";
  if (/%|百分比/.test(title)) return "%";
  return title.match(/[（(]([^）)]{1,8})[）)]/)?.[1] ?? "";
}

function isCompositionMetric(column: QueryColumnDefinition) {
  return /占比|比例|份额|构成|share|ratio|percent|percentage|rate/i.test(
    `${column.label} ${column.title ?? ""} ${column.key}`
  );
}

function normalizeIntentText(...values: Array<string | undefined>) {
  return values
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function hasDetailIntent(asset: QueryAsset) {
  return DETAIL_INTENT_PATTERN.test(
    normalizeIntentText(asset.name, asset.originalQuestion, asset.resolvedQuestion)
  );
}

function selectedOutputIntent(asset: QueryAsset, outputKey: string) {
  const definition = asset.stableVersion?.outputs.find((output) => output.outputKey === outputKey);
  const label = normalizeIntentText(definition?.label || outputKey);
  if (DETAIL_INTENT_PATTERN.test(label)) return "detail";
  if (AGGREGATE_INTENT_PATTERN.test(label)) return "aggregate";
  return hasDetailIntent(asset) ? "detail" : "neutral";
}

function inferWidgetType(
  asset: QueryAsset,
  output: QueryExecutionOutput,
  analysis: OutputAnalysis
): DashboardWidgetType {
  if (selectedOutputIntent(asset, output.outputKey) === "detail") return "table";
  if (output.rows.length === 1 && analysis.numericColumns.length > 0) return "metric";
  if (analysis.timeColumn && analysis.numericColumns.length > 0) return "line";
  if (analysis.dimensionColumn && analysis.numericColumns.length > 0) {
    return analysis.numericColumns.some(isCompositionMetric) && output.rows.length <= 8 ? "pie" : "bar";
  }
  return "table";
}

function topCountFromQuestion(question: string) {
  const arabic = question.match(/(?:排名)?前\s*(\d+)|top\s*(\d+)/i);
  return arabic ? Number(arabic[1] ?? arabic[2]) : undefined;
}

function chartTitle(asset: QueryAsset, analysis: OutputAnalysis) {
  const dimensionTitle = displayColumnTitle(analysis.dimensionColumn);
  const metricTitle = displayColumnTitle(analysis.numericColumns[0]);
  const topCount = topCountFromQuestion(asset.resolvedQuestion);
  if (topCount && dimensionTitle && metricTitle) {
    return `${dimensionTitle}${metricTitle} TOP ${topCount}`;
  }

  const normalizedQuestion = asset.resolvedQuestion
    .trim()
    .replace(/[？?。！!]+$/g, "")
    .replace(/^(?:请|帮我|麻烦)?(?:统计一下|查询一下|查一下|看一下|分析一下|统计|查询|分析)/, "")
    .replace(/(?:如何|怎么样|是多少|有多少)$/g, "")
    .replace(/(?:的)?(?:情况|数据|结果)$/g, "")
    .trim();
  if (normalizedQuestion) {
    return normalizedQuestion.length > 28 ? `${normalizedQuestion.slice(0, 28)}…` : normalizedQuestion;
  }
  if (analysis.timeColumn && metricTitle) return `${metricTitle}趋势`;
  if (dimensionTitle && metricTitle) return `${dimensionTitle}${metricTitle}`;
  return asset.name.trim() || metricTitle || dimensionTitle || "收藏问数组件";
}

function scaleCompatibleMetricColumns(
  output: QueryExecutionOutput,
  columns: QueryColumnDefinition[]
) {
  if (columns.length <= 1) return columns;
  const maxima = columns.map((column) =>
    output.rows.reduce(
      (maximum, row) => Math.max(maximum, Math.abs(toFiniteNumber(row[column.key]) ?? 0)),
      0
    )
  );
  const primaryMaximum = maxima[0] ?? 0;
  if (primaryMaximum <= 0) return columns;
  return columns.filter((_, index) => {
    if (index === 0) return true;
    const ratio = (maxima[index] ?? 0) / primaryMaximum;
    return ratio >= 0.2 && ratio <= 5;
  });
}

function createMapping(
  type: DashboardWidgetType,
  output: QueryExecutionOutput,
  analysis: OutputAnalysis
): DashboardWidgetMapping {
  if (type === "metric") {
    const metric = analysis.numericColumns[0];
    return metric ? {
      metricColumnIds: [metric.columnId],
      metricKeys: [metric.key],
      valueMode: "first",
      displayUnit: displayUnit(metric) || undefined
    } : {};
  }
  if (type === "line" || type === "bar" || type === "pie") {
    const dimension = analysis.dimensionColumn;
    const metricLimit = type === "pie" ? 1 : 2;
    const metrics = scaleCompatibleMetricColumns(output, analysis.numericColumns.slice(0, metricLimit));
    return {
      dimensionColumnId: dimension?.columnId,
      dimensionKey: dimension?.key,
      metricColumnIds: metrics.map((column) => column.columnId),
      metricKeys: metrics.map((column) => column.key)
    };
  }
  return {};
}

function createSubtitle(
  type: DashboardWidgetType,
  output: QueryExecutionOutput,
  asset: QueryAsset
) {
  if (type === "metric") return asset.name;
  if (type === "line") return `趋势变化 · ${output.rows.length} 个周期`;
  if (type === "pie") return `结构占比 · ${output.rows.length} 项`;
  if (type === "bar") return `分类对比 · ${output.rows.length} 项`;
  return `共 ${output.totalRows} 行 · ${asset.name}`;
}

function createWidgetStyle(
  type: DashboardWidgetType,
  metricCount: number,
  zIndex: number
): DashboardWidgetStyle {
  const definition = getDashboardComponentDefinition(type);
  const accent = type === "pie" ? "#00A6E8" : "#1677FF";
  return {
    ...definition.defaultStyle,
    ...CARD_SURFACE,
    accent,
    seriesColors: type === "line" || type === "bar" || type === "pie"
      ? [...CHART_SERIES_COLORS]
      : definition.defaultStyle.seriesColors,
    showLegend: type === "pie" || metricCount > 1,
    showTrend: type === "metric" ? false : definition.defaultStyle.showTrend,
    smooth: type === "line" ? true : definition.defaultStyle.smooth,
    locked: false,
    visible: true,
    zIndex
  };
}

function overlaps(left: DashboardWidgetPosition, right: DashboardWidgetPosition) {
  return !(
    left.x + left.w + WIDGET_GAP <= right.x
    || right.x + right.w + WIDGET_GAP <= left.x
    || left.y + left.h + WIDGET_GAP <= right.y
    || right.y + right.h + WIDGET_GAP <= left.y
  );
}

function findAvailablePosition(
  current: DashboardSchema,
  desiredSize: Pick<DashboardWidgetPosition, "w" | "h">
) {
  const availableWidth = Math.max(MIN_COMPONENT_SIZE, current.canvas.width - CANVAS_PADDING * 2);
  const width = Math.min(desiredSize.w, availableWidth);
  const height = Math.max(MIN_COMPONENT_SIZE, desiredSize.h);
  const startX = current.canvas.width >= width + CANVAS_PADDING * 2 ? CANVAS_PADDING : 0;
  const maximumX = Math.max(startX, current.canvas.width - width - CANVAS_PADDING);
  const maximumY = Math.max(CANVAS_PADDING, current.canvas.height - height - CANVAS_PADDING);

  for (let y = CANVAS_PADDING; y <= maximumY; y += POSITION_STEP) {
    for (let x = startX; x <= maximumX; x += POSITION_STEP) {
      const candidate = { x, y, w: width, h: height };
      if (current.widgets.every((widget) => !overlaps(candidate, widget.position))) {
        return candidate;
      }
    }
  }

  const y = current.widgets.reduce(
    (maximum, widget) => Math.max(maximum, widget.position.y + widget.position.h),
    0
  ) + WIDGET_GAP;
  return { x: startX, y, w: width, h: height };
}

function createSourceRef(
  asset: QueryAsset,
  execution: QueryExecution,
  outputKey: string,
  parameters: Record<string, unknown>
): DashboardDataSourceRef {
  return {
    kind: asset.datasourceId ? "query-asset" : "legacy-snapshot",
    assetId: asset.id,
    queryVersionId: execution.versionId,
    outputKey,
    parameterValues: clone(parameters)
  };
}

export function appendQueryAssetChart(
  current: DashboardSchema,
  asset: QueryAsset,
  execution: QueryExecution,
  outputKey: string,
  parameters: Record<string, unknown> = {}
): AppendQueryAssetChartResult {
  if (execution.status !== "SUCCESS") {
    throw new Error(execution.errorMessage || "查询预览尚未成功，无法生成组件");
  }
  const output = execution.outputs.find((item) => item.outputKey === outputKey);
  if (!output) throw new Error("查询预览中没有选定的结果表");
  if (output.columns.length === 0) throw new Error("该结果表没有可用字段，无法生成组件");

  const analysis = analyzeOutput(output);
  const type = inferWidgetType(asset, output, analysis);
  const definition = getDashboardComponentDefinition(type);
  const bindingId = createId("binding");
  const moduleId = createId("module");
  const widgetId = createId("widget");
  const sourceRef = createSourceRef(asset, execution, outputKey, parameters);
  const title = chartTitle(asset, analysis);
  const tableColumns = output.columns.map((column) => ({
    columnId: column.columnId,
    key: column.key,
    title: column.label || column.title || column.key,
    type: column.type
  }));
  const resultKind: DashboardDataBinding["resultKind"] = type === "metric"
    ? "metric"
    : type === "line"
      ? "time-series"
      : type === "bar" || type === "pie"
        ? "category"
        : "table";
  const binding: DashboardDataBinding = {
    id: bindingId,
    label: asset.name,
    mode: asset.datasourceId ? "live" : "snapshot",
    sourceQueryId: asset.id,
    resultKind,
    metricLabel: displayColumnTitle(analysis.numericColumns[0]) || undefined,
    status: output.rows.length > 0 ? "success" : "empty",
    sourceRef,
    refreshPolicy: { mode: "manual" },
    refreshable: Boolean(asset.datasourceId),
    lastUpdatedAt: output.updatedAt ?? execution.createdAt,
    table: {
      columns: tableColumns,
      rows: clone(output.rows),
      totalRows: output.totalRows,
      groupLabel: asset.name,
      source: "query-asset"
    }
  };
  const nextZIndex = current.widgets.reduce(
    (maximum, widget) => Math.max(maximum, widget.style.zIndex ?? 0),
    0
  ) + 1;
  const position = findAvailablePosition(current, definition.defaultSize);
  const widget: DashboardWidget = {
    id: widgetId,
    moduleId,
    bindingId,
    type,
    name: definition.title,
    title,
    subtitle: createSubtitle(type, output, asset),
    props: definition.defaultProps ? clone(definition.defaultProps) : undefined,
    mapping: createMapping(type, output, analysis),
    position,
    style: createWidgetStyle(type, analysis.numericColumns.length, nextZIndex)
  };
  const module: DashboardModule = {
    id: moduleId,
    title: asset.name,
    bindingId,
    widgetIds: [widgetId],
    source: sourceRef
  };
  const requiredHeight = Math.max(current.canvas.height, position.y + position.h + CANVAS_PADDING);
  const schema = {
    ...clone(current),
    canvas: {
      ...current.canvas,
      height: requiredHeight,
      rows: Math.max(current.canvas.rows, Math.ceil(requiredHeight / 90))
    },
    dataBindings: { ...current.dataBindings, [bindingId]: binding },
    modules: { ...(current.modules ?? {}), [moduleId]: module },
    widgets: [...current.widgets, widget],
    updatedAt: new Date().toISOString()
  } satisfies DashboardSchema;

  return { schema, widgetId, moduleId, bindingId };
}

export function removeQueryAssetChart(
  current: DashboardSchema,
  widgetId: string
) {
  const removedWidget = current.widgets.find((widget) => widget.id === widgetId);
  if (!removedWidget) return clone(current);

  const next = clone(current);
  const widgets = next.widgets.filter((widget) => widget.id !== widgetId);
  const modules = { ...(next.modules ?? {}) };
  const dataBindings = { ...next.dataBindings };
  const moduleId = removedWidget.moduleId;
  const module = moduleId ? modules[moduleId] : undefined;

  if (module && moduleId) {
    const remainingWidgetIds = module.widgetIds.filter((id) => id !== widgetId)
      .filter((id) => widgets.some((widget) => widget.id === id));
    if (remainingWidgetIds.length > 0) {
      modules[moduleId] = { ...module, widgetIds: remainingWidgetIds };
    } else {
      delete modules[moduleId];
      const bindingStillUsed = widgets.some((widget) => widget.bindingId === module.bindingId)
        || Object.values(modules).some((item) => item.bindingId === module.bindingId);
      if (!bindingStillUsed) delete dataBindings[module.bindingId];
    }
  } else if (removedWidget.bindingId) {
    const bindingStillUsed = widgets.some((widget) => widget.bindingId === removedWidget.bindingId)
      || Object.values(modules).some((item) => item.bindingId === removedWidget.bindingId);
    if (!bindingStillUsed) delete dataBindings[removedWidget.bindingId];
  }

  return {
    ...next,
    dataBindings,
    modules,
    widgets,
    updatedAt: new Date().toISOString()
  } satisfies DashboardSchema;
}

export function removeQueryAssetModule(
  current: DashboardSchema,
  moduleId: string
) {
  const module = current.modules?.[moduleId];
  if (!module) return clone(current);

  const next = clone(current);
  const widgets = next.widgets.filter((widget) =>
    widget.moduleId !== moduleId && !module.widgetIds.includes(widget.id)
  );
  const modules = { ...(next.modules ?? {}) };
  const dataBindings = { ...next.dataBindings };

  delete modules[moduleId];

  const bindingStillUsed = widgets.some((widget) => widget.bindingId === module.bindingId)
    || Object.values(modules).some((item) => item.bindingId === module.bindingId);
  if (!bindingStillUsed) delete dataBindings[module.bindingId];

  return {
    ...next,
    dataBindings,
    modules,
    widgets,
    updatedAt: new Date().toISOString()
  } satisfies DashboardSchema;
}
