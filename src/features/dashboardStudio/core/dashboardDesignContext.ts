import type { QueryAsset, QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";
import type {
  DashboardDesignArchetype,
  DashboardDesignAssetData,
  DashboardDesignAssetSummary,
  DashboardDesignBoardSummary,
  DashboardDesignCatalog,
  DashboardDesignColumnKind,
  DashboardDesignEmphasis,
  DashboardDesignHistoryTurn,
  DashboardDesignOutputShape,
  DashboardDesignOutputSummary,
  DashboardDesignRequest,
  DashboardDesignRole,
  DashboardDesignValueMode,
  DashboardDesignWidgetSummary
} from "@/types/dashboardDesign";
import { dashboardDesignArchetypes } from "@/types/dashboardDesign";
import type { DashboardSchema, DashboardWidget } from "@/types/dashboardStudio";
import { dashboardBoardThemes, getMatchingDashboardBoardThemeId } from "./dashboardBoardThemes";
import { dashboardCanvasPresets, resolveDashboardCanvasPreset } from "./dashboardCanvas";
import { dashboardChartVariants } from "./dashboardChartPresets";
import { classifyColumn } from "./dashboardColumnSemantics";
import { dashboardDesignArchetypeCatalog } from "./dashboardDesignArchetypes";
import { widgetSemanticRole } from "./dashboardLayoutSolver";

/**
 * 发给模型的上下文：只有列名、样本行和当前板的语义摘要，不带 SQL、不带全量结果。
 * 预算是硬约束——后端超过 64k 字符直接拒收，所以这里先按份数/列数/样本行裁剪，
 * 仍然超标时依次丢样本行、丢历史，宁可少给上下文也不让整轮请求失败。
 */

const MAX_ASSETS = 8;
const MAX_OUTPUTS_PER_ASSET = 6;
const MAX_COLUMNS_PER_OUTPUT = 24;
const MAX_SAMPLE_ROWS = 3;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 300;
const MAX_TEXT_CONTENT_CHARS = 120;
const MAX_REQUEST_CHARS = 60_000;
const FALLBACK_CANVAS = { width: 1920, height: 1080 };

/**
 * 列种类对外仍是三档（模型的语义契约不变），编号列归入 dimension：
 * 模型只需要知道「这列不是指标也不是时间」，编号与分类的区别由引擎自己把握。
 */
export function inferDashboardDesignColumnKind(
  column: QueryColumnDefinition,
  rows: Record<string, unknown>[]
): DashboardDesignColumnKind {
  const role = classifyColumn(column, rows);
  return role === "identifier" ? "dimension" : role;
}

/**
 * 结果表形状。
 * 单行且有数值列就是标量（不要求每一列都是数值——现实里的单值结果常常带一列口径说明）；
 * 时间序列要求至少两行，一行画不出趋势；剩下有分类列的算 category。
 */
export function inferDashboardDesignOutputShape(output: QueryExecutionOutput): DashboardDesignOutputShape {
  if (output.columns.length === 0) return "table";
  const roles = output.columns.map((column) => classifyColumn(column, output.rows));
  if (output.rows.length === 1) return roles.includes("number") ? "scalar" : "table";
  if (roles.includes("time") && roles.includes("number")) return "time-series";
  if (roles.includes("dimension") || roles.includes("identifier")) return "category";
  return "table";
}

function outputLabel(asset: QueryAsset, outputKey: string) {
  const defined = asset.stableVersion?.outputs.find((output) => output.outputKey === outputKey);
  return defined?.label?.trim() || outputKey;
}

function summarizeOutput(asset: QueryAsset, output: QueryExecutionOutput): DashboardDesignOutputSummary {
  const columns = output.columns.map((column) => ({
    columnId: column.columnId,
    key: column.key,
    label: column.label || column.title || column.key,
    kind: inferDashboardDesignColumnKind(column, output.rows)
  }));
  const keys = columns.map((column) => column.key);
  return {
    outputKey: output.outputKey,
    label: outputLabel(asset, output.outputKey),
    columns,
    totalRows: output.totalRows,
    sampleRows: output.rows.slice(0, MAX_SAMPLE_ROWS).map((row) =>
      Object.fromEntries(keys.map((key) => [key, row[key]]))
    ),
    shape: inferDashboardDesignOutputShape(output)
  };
}

export function summarizeDashboardDesignAsset(
  asset: QueryAsset,
  execution: QueryExecution
): DashboardDesignAssetSummary {
  return {
    assetId: asset.id,
    name: asset.name,
    question: asset.resolvedQuestion || asset.originalQuestion,
    outputs: execution.outputs.map((output) => summarizeOutput(asset, output))
  };
}

/** 求解器的语义角色不区分占比族；饼/雷达/漏斗在设计语言里是 composition，另外挑出来。 */
const COMPOSITION_TYPES = new Set<DashboardWidget["type"]>(["pie", "radar", "funnel"]);

export function dashboardDesignWidgetRole(widget: DashboardWidget): DashboardDesignRole {
  const role = widgetSemanticRole(widget);
  if (role === "comparison") return COMPOSITION_TYPES.has(widget.type) ? "composition" : "comparison";
  return role;
}

export function dashboardDesignWidgetEmphasis(
  width: number,
  canvasWidth: number
): DashboardDesignEmphasis {
  if (canvasWidth <= 0) return "normal";
  const ratio = width / canvasWidth;
  if (ratio >= 2 / 3) return "hero";
  if (ratio >= 1 / 2) return "wide";
  if (ratio >= 1 / 3) return "normal";
  return "compact";
}

function widgetSource(schema: DashboardSchema, widget: DashboardWidget) {
  const module = widget.moduleId ? schema.modules?.[widget.moduleId] : undefined;
  if (module) return module.source;
  const binding = widget.bindingId ? schema.dataBindings[widget.bindingId] : undefined;
  return binding?.sourceRef;
}

function summarizeWidget(schema: DashboardSchema, widget: DashboardWidget): DashboardDesignWidgetSummary {
  const source = widgetSource(schema, widget);
  const content = widget.type === "text" ? (widget.content ?? "").slice(0, MAX_TEXT_CONTENT_CHARS) : undefined;
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    role: dashboardDesignWidgetRole(widget),
    locked: widget.style.locked === true,
    ...(source?.assetId ? { assetId: source.assetId } : {}),
    ...(source?.outputKey ? { outputKey: source.outputKey } : {}),
    ...(widget.style.chartVariant ? { variant: widget.style.chartVariant } : {}),
    ...(widget.mapping.dimensionKey ? { dimensionKey: widget.mapping.dimensionKey } : {}),
    ...(widget.mapping.metricKeys?.length ? { metricKeys: [...widget.mapping.metricKeys] } : {}),
    ...(widget.mapping.valueMode ? { valueMode: widget.mapping.valueMode as DashboardDesignValueMode } : {}),
    emphasis: dashboardDesignWidgetEmphasis(widget.position.w, schema.canvas.width),
    ...(content ? { content } : {})
  };
}

/**
 * 当前板摘要。themeId 为 null 表示整板配色认不出任何一档目录主题（用户逐卡改过色），
 * 模型看到 null 就知道「当前是自定义配色」，而不是误以为板上没有主题。
 */
export function summarizeDashboardDesignBoard(schema: DashboardSchema): DashboardDesignBoardSummary {
  const declared = schema.design?.themeId;
  const themeId = dashboardBoardThemes.some((theme) => theme.id === declared)
    ? declared!
    : getMatchingDashboardBoardThemeId(schema) || null;
  const archetype = dashboardDesignArchetypes.find((item) => item === schema.design?.archetype);
  const preset = resolveDashboardCanvasPreset(schema.canvas.width, schema.canvas.height);

  return {
    title: schema.title,
    ...(schema.description ? { subtitle: schema.description } : {}),
    themeId,
    ...(archetype ? { archetype: archetype as DashboardDesignArchetype } : {}),
    canvas: {
      width: schema.canvas.width,
      height: schema.canvas.height,
      ...(preset ? { preset: preset.id } : {})
    },
    widgets: schema.widgets.map((widget) => summarizeWidget(schema, widget))
  };
}

export function buildDashboardDesignCatalog(): DashboardDesignCatalog {
  return {
    themes: dashboardBoardThemes.map((theme) => ({
      id: theme.id,
      title: theme.title,
      mode: theme.mode,
      description: theme.description
    })),
    variants: dashboardChartVariants.map((variant) => ({
      id: variant.id,
      type: variant.type,
      title: variant.title,
      dataRequirement: variant.dataRequirement
    })),
    archetypes: dashboardDesignArchetypeCatalog.map((archetype) => ({ ...archetype })),
    canvasPresets: dashboardCanvasPresets.map((preset) => ({
      id: preset.id,
      label: preset.label,
      width: preset.width,
      height: preset.height
    }))
  };
}

/** 列裁剪后要顺手把样本行里失效的 key 抹掉，否则模型会引用一个它看不到定义的列。 */
function trimAssetSummary(asset: DashboardDesignAssetSummary): DashboardDesignAssetSummary {
  return {
    ...asset,
    outputs: asset.outputs.slice(0, MAX_OUTPUTS_PER_ASSET).map((output) => {
      const columns = output.columns.slice(0, MAX_COLUMNS_PER_OUTPUT);
      const keys = columns.map((column) => column.key);
      return {
        ...output,
        columns,
        sampleRows: output.sampleRows
          .slice(0, MAX_SAMPLE_ROWS)
          .map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))
      };
    })
  };
}

function trimHistory(history: DashboardDesignHistoryTurn[]): DashboardDesignHistoryTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, MAX_HISTORY_CHARS)
  }));
}

function withoutSampleRows(assets: DashboardDesignAssetSummary[]): DashboardDesignAssetSummary[] {
  return assets.map((asset) => ({
    ...asset,
    outputs: asset.outputs.map((output) => ({ ...output, sampleRows: [] }))
  }));
}

export function buildDashboardDesignRequest(input: {
  brief: string;
  schema?: DashboardSchema;
  data: DashboardDesignAssetData;
  history: DashboardDesignHistoryTurn[];
}): DashboardDesignRequest {
  const assets = Object.values(input.data)
    .slice(0, MAX_ASSETS)
    .map((entry) => trimAssetSummary(summarizeDashboardDesignAsset(entry.asset, entry.execution)));

  let request: DashboardDesignRequest = {
    brief: input.brief,
    assets,
    ...(input.schema ? { board: summarizeDashboardDesignBoard(input.schema) } : {}),
    catalog: buildDashboardDesignCatalog(),
    canvas: input.schema
      ? { width: input.schema.canvas.width, height: input.schema.canvas.height }
      : { ...FALLBACK_CANVAS },
    history: trimHistory(input.history)
  };

  if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
    request = { ...request, assets: withoutSampleRows(request.assets) };
  }
  if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
    request = { ...request, history: [] };
  }
  return request;
}
