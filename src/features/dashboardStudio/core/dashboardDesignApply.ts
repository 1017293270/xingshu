import { appendQueryAssetChart, removeQueryAssetChart } from "@/services/dashboardModuleService";
import type { QueryColumnDefinition, QueryExecutionOutput } from "@/types/analytics";
import type {
  DashboardDesignApplyResult,
  DashboardDesignArchetype,
  DashboardDesignAssetData,
  DashboardDesignChange,
  DashboardDesignOps,
  DashboardDesignRejection,
  DashboardDesignSpec,
  DashboardDesignSpecWidget,
  DashboardDesignValueMode
} from "@/types/dashboardDesign";
import { dashboardDesignArchetypes } from "@/types/dashboardDesign";
import type {
  DashboardDataBinding,
  DashboardSchema,
  DashboardWidget,
  DashboardWidgetMapping,
  DashboardWidgetType
} from "@/types/dashboardStudio";
import {
  DEFAULT_DASHBOARD_BOARD_THEME_ID,
  applyDashboardBoardTheme,
  dashboardBoardThemes,
  getDashboardBoardTheme,
  getMatchingDashboardBoardThemeId
} from "./dashboardBoardThemes";
import { dashboardCanvasPresets } from "./dashboardCanvas";
import { dashboardChartVariants } from "./dashboardChartPresets";
import { fitDashboardCanvasHeight } from "./dashboardCompose";
import { getDashboardComponentDefinition } from "./dashboardComponentRegistry";
import {
  composeDashboardWithArchetype,
  dashboardDesignArchetypeCatalog,
  type DashboardDesignFlowEmphasis
} from "./dashboardDesignArchetypes";
import { inferDashboardDesignColumnKind, inferDashboardDesignOutputShape } from "./dashboardDesignContext";

/**
 * 把模型的语义稿落成真实 schema：这里是唯一做语义校验的地方。
 * 资产在不在、列存不存在、变体属不属于这个角色的族、数据形状撑不撑得起这张图——
 * 全部在落码前判掉，非法项进 rejected 并给中文理由，绝不让一张画不出来的图混进画布。
 */

/** 一屏之内超过 12 个组件就没法读了，模型再热情也要按住。 */
const MAX_WIDGETS = 12;
/** 占比图的类目上限：超过就该换成横向排行，环形图挤 20 个扇区没人看得懂。 */
const MAX_COMPOSITION_CATEGORIES = 12;

const CHART_TYPES = new Set<DashboardWidgetType>(["line", "area", "bar", "pie", "radar", "funnel"]);

/** 角色 → 允许的组件族。模型给的变体越界就退回该角色的默认变体。 */
const ROLE_TYPES: Record<string, DashboardWidgetType[]> = {
  trend: ["line", "area"],
  comparison: ["bar"],
  composition: ["pie", "radar", "funnel"]
};

const ROLE_LABELS: Record<string, string> = {
  kpi: "指标卡",
  trend: "趋势图",
  comparison: "对比图",
  composition: "占比图",
  detail: "明细表",
  narrative: "文本条"
};

type ResolvedOutput = {
  asset: DashboardDesignAssetData[string]["asset"];
  execution: DashboardDesignAssetData[string]["execution"];
  output: QueryExecutionOutput;
};

type ApplyContext = {
  changes: DashboardDesignChange[];
  rejected: DashboardDesignRejection[];
  heroWidgetId?: string;
  railWidgetIds: string[];
  emphasisById: Record<string, DashboardDesignFlowEmphasis>;
};

const FLOW_EMPHASIS: DashboardDesignFlowEmphasis[] = ["compact", "normal", "wide"];

/** 上一轮对话里点名过的宽度意图跟着 schema 走，这一轮重排时继续守住。 */
function readFlowEmphasis(schema: DashboardSchema): Record<string, DashboardDesignFlowEmphasis> {
  return Object.fromEntries(
    Object.entries(schema.design?.emphasisById ?? {}).filter(
      (entry): entry is [string, DashboardDesignFlowEmphasis] =>
        FLOW_EMPHASIS.includes(entry[1] as DashboardDesignFlowEmphasis)
    )
  );
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/**
 * 当前整板主题：先认 schema.design 里记下的那一档（逐卡改色后反推不出来），
 * 再退回配色反推，最后落到默认档。
 */
export function resolveDashboardBoardThemeId(schema: DashboardSchema): string {
  const declared = schema.design?.themeId;
  if (declared && dashboardBoardThemes.some((theme) => theme.id === declared)) return declared;
  return getMatchingDashboardBoardThemeId(schema) || DEFAULT_DASHBOARD_BOARD_THEME_ID;
}

/**
 * 当前构图原型：老看板没有记录，就按「有没有一张通栏主图」反推，
 * 免得一次简单的改标题把用户原来的主从结构重排成另一副样子。
 */
function resolveDesignArchetype(schema: DashboardSchema): DashboardDesignArchetype {
  const declared = dashboardDesignArchetypes.find((item) => item === schema.design?.archetype);
  if (declared) return declared;
  const hasHero = schema.widgets.some(
    (widget) => CHART_TYPES.has(widget.type) && widget.position.w >= (schema.canvas.width * 2) / 3
  );
  return hasHero ? "trend-led" : "kpi-led";
}

function archetypeTitle(archetype: DashboardDesignArchetype) {
  return dashboardDesignArchetypeCatalog.find((item) => item.id === archetype)?.title ?? archetype;
}

function resolveOutput(data: DashboardDesignAssetData, assetId?: string, outputKey?: string): ResolvedOutput | null {
  if (!assetId || !outputKey) return null;
  const entry = data[assetId] ?? Object.values(data).find((item) => item.asset.id === assetId);
  if (!entry) return null;
  const output = entry.execution.outputs.find((item) => item.outputKey === outputKey);
  return output ? { asset: entry.asset, execution: entry.execution, output } : null;
}

function displayUnitOf(column?: QueryColumnDefinition) {
  const title = column?.label || column?.title || "";
  if (/%|百分比/.test(title)) return "%";
  return title.match(/[（(]([^）)]{1,8})[）)]/)?.[1] ?? "";
}

function variantAcceptsShape(requirement: string, shape: string) {
  if (shape === "scalar" || shape === "table") return false;
  if (requirement === "time-series") return shape === "time-series";
  return true;
}

function defaultVariantId(role: string, metricCount: number) {
  if (role === "trend") return metricCount > 1 ? "area-bold" : "line-smooth";
  if (role === "comparison") return "bar-vertical";
  return "pie-donut";
}

/** binding 里存的是渲染用的表快照，列形状与查询输出不同，这里统一成一种再判种类。 */
function bindingColumns(binding?: DashboardDataBinding): QueryColumnDefinition[] {
  return (binding?.table.columns ?? []).map((column) => ({
    columnId: column.columnId ?? column.key,
    key: column.key,
    label: column.title,
    type: column.type
  }));
}

function bindingShape(binding?: DashboardDataBinding) {
  if (!binding) return "table";
  return inferDashboardDesignOutputShape({
    outputKey: binding.id,
    columns: bindingColumns(binding),
    rows: binding.table.rows,
    totalRows: binding.table.totalRows
  });
}

function numericColumnsOf(columns: QueryColumnDefinition[], rows: Record<string, unknown>[]) {
  return columns.filter((column) => inferDashboardDesignColumnKind(column, rows) === "number");
}

function applyMappingColumns(
  mapping: DashboardWidgetMapping,
  columns: QueryColumnDefinition[],
  dimensionKey: string | undefined,
  metricKeys: string[] | undefined
): DashboardWidgetMapping {
  const next: DashboardWidgetMapping = { ...mapping };
  if (dimensionKey) {
    const column = columns.find((item) => item.key === dimensionKey);
    next.dimensionKey = column?.key ?? next.dimensionKey;
    next.dimensionColumnId = column?.columnId ?? next.dimensionColumnId;
  }
  if (metricKeys && metricKeys.length > 0) {
    const selected = metricKeys
      .map((key) => columns.find((item) => item.key === key))
      .filter((column): column is QueryColumnDefinition => Boolean(column));
    if (selected.length > 0) {
      next.metricKeys = selected.map((column) => column.key);
      next.metricColumnIds = selected.map((column) => column.columnId);
    }
  }
  return next;
}

function createNarrativeWidget(schema: DashboardSchema, spec: DashboardDesignSpecWidget) {
  const definition = getDashboardComponentDefinition("text");
  const content = spec.content ?? spec.title;
  const zIndex = schema.widgets.reduce((maximum, widget) => Math.max(maximum, widget.style.zIndex ?? 0), 0) + 1;
  const widget: DashboardWidget = {
    id: createId("widget"),
    type: "text",
    name: definition.title,
    title: spec.title || content,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    content,
    props: { text: content },
    mapping: {},
    position: { x: 24, y: 24, w: definition.defaultSize.w, h: definition.defaultSize.h },
    style: { ...definition.defaultStyle, locked: false, visible: true, zIndex }
  };
  return widget;
}

const BANNER_ROLE = "banner";

function isBannerWidget(widget: DashboardWidget) {
  return widget.type === "text" && widget.props?.designRole === BANNER_ROLE;
}

/**
 * 整板标题条：大屏没有独立页头，标题与结论靶句都靠首条文本组件呈现，
 * 与一键成屏的产物长一副面孔（居中大字 + 品牌色短线 + 洞察副标题）。
 * 模型给的 narrative 卡只当脚注，标题条一律由引擎按 spec.title 生成，不指望模型记得写。
 */
function createBannerWidget(schema: DashboardSchema, title: string, subtitle?: string): DashboardWidget {
  const zIndex = schema.widgets.reduce((maximum, widget) => Math.max(maximum, widget.style.zIndex ?? 0), 0) + 1;
  return {
    id: createId("widget"),
    type: "text",
    name: "大屏标题",
    title,
    ...(subtitle ? { subtitle } : {}),
    content: title,
    props: { text: title, designRole: BANNER_ROLE },
    mapping: {},
    position: { x: 24, y: 24, w: Math.max(360, schema.canvas.width - 48), h: 120 },
    style: {
      background: "transparent",
      accent: "#1677FF",
      color: "#0F2B50",
      fontSize: 30,
      fontWeight: 800,
      textAlign: "center",
      locked: false,
      visible: true,
      zIndex
    }
  };
}

/**
 * 落一个组件：先判数据撑不撑得起这个角色，再按角色改写类型、变体、映射与文案。
 * 返回 null 表示已记 rejected，调用方跳过即可。
 */
function buildDesignWidget(
  schema: DashboardSchema,
  spec: DashboardDesignSpecWidget,
  data: DashboardDesignAssetData,
  context: ApplyContext
): { schema: DashboardSchema; widgetId: string } | null {
  const label = spec.title || ROLE_LABELS[spec.role] || spec.ref;
  // 标题条是引擎自己加的，不占模型那 12 张的名额，否则模型按上限给满会被莫名拒掉一张。
  if (schema.widgets.filter((widget) => !isBannerWidget(widget)).length >= MAX_WIDGETS) {
    context.rejected.push({ target: label, reason: `一屏最多 ${MAX_WIDGETS} 个组件，已超出` });
    return null;
  }

  if (spec.role === "narrative") {
    const widget = createNarrativeWidget(schema, spec);
    return {
      schema: { ...schema, widgets: [...schema.widgets, widget] },
      widgetId: widget.id
    };
  }

  const resolved = resolveOutput(data, spec.assetId, spec.outputKey);
  if (!resolved) {
    context.rejected.push({ target: label, reason: "引用的收藏问数结果不在本次选中的数据里" });
    return null;
  }

  const { asset, execution, output } = resolved;
  const shape = inferDashboardDesignOutputShape(output);
  const columns = output.columns;
  const numericColumns = numericColumnsOf(columns, output.rows);
  let role = spec.role;

  if (role === "kpi" && numericColumns.length === 0) {
    context.rejected.push({ target: label, reason: "该结果表没有数值列，做不了指标卡" });
    return null;
  }
  if (role === "trend" && shape !== "time-series") {
    context.rejected.push({ target: label, reason: "该结果表没有时间列，画不了趋势图" });
    return null;
  }
  if ((role === "comparison" || role === "composition") && shape !== "category" && shape !== "time-series") {
    context.rejected.push({ target: label, reason: "该结果表没有可用的维度列，画不了对比图" });
    return null;
  }
  let degraded = false;
  if (role === "composition" && output.totalRows > MAX_COMPOSITION_CATEGORIES) {
    role = "comparison";
    degraded = true;
    context.changes.push({
      kind: "degrade",
      label: `「${label}」类目 ${output.totalRows} 项过多，占比图改为对比图`
    });
  }

  const isChartRole = role === "trend" || role === "comparison" || role === "composition";
  // 降级过的组件不再追究模型给的原图种：降级本身已经作为 change 说明过了，
  // 再补一条「饼图不属于对比图」只会让变更清单看起来像出了两个错。
  let variant = spec.variant && !degraded ? dashboardChartVariants.find((item) => item.id === spec.variant) : undefined;
  if (isChartRole && spec.variant && !degraded && !variant) {
    context.rejected.push({ target: label, reason: `图种「${spec.variant}」不在变体目录里，已改用默认图种` });
  }
  if (isChartRole && variant && !ROLE_TYPES[role].includes(variant.type)) {
    context.rejected.push({ target: label, reason: `图种「${variant.title}」不属于${ROLE_LABELS[role]}，已改用默认图种` });
    variant = undefined;
  }
  if (isChartRole && variant && !variantAcceptsShape(variant.dataRequirement, shape)) {
    context.rejected.push({ target: label, reason: `图种「${variant.title}」要求的数据形状与该结果表不符，已改用默认图种` });
    variant = undefined;
  }
  if (isChartRole && !variant) {
    const fallbackId = defaultVariantId(role, spec.metricKeys?.length ?? 1);
    variant = dashboardChartVariants.find((item) => item.id === fallbackId);
  }

  let appended;
  try {
    appended = appendQueryAssetChart(schema, asset, execution, output.outputKey);
  } catch (error) {
    context.rejected.push({ target: label, reason: error instanceof Error ? error.message : "结果表无法生成组件" });
    return null;
  }

  const next = appended.schema;
  const widget = next.widgets.find((item) => item.id === appended.widgetId)!;
  const targetType: DashboardWidgetType = role === "kpi"
    ? "metric"
    : role === "detail"
      ? "table"
      : variant!.type;
  const definition = getDashboardComponentDefinition(targetType);

  widget.type = targetType;
  widget.name = definition.title;
  widget.style = {
    ...definition.defaultStyle,
    ...widget.style,
    ...(variant && isChartRole ? { chartVariant: variant.id, accent: variant.accent } : {})
  };
  if (!isChartRole) delete widget.style.chartVariant;

  if (role === "kpi") {
    const requested = spec.metricKey ?? spec.metricKeys?.[0];
    const metric = numericColumns.find((column) => column.key === requested) ?? numericColumns[0]!;
    if (requested && metric.key !== requested) {
      context.rejected.push({ target: label, reason: `指标列「${requested}」不在该结果表里，已改用「${metric.label}」` });
    }
    const valueMode: DashboardDesignValueMode = spec.valueMode
      ?? (output.rows.length === 1 ? "first" : shape === "time-series" ? "latest" : "sum");
    widget.mapping = {
      metricKeys: [metric.key],
      metricColumnIds: [metric.columnId],
      valueMode,
      ...(displayUnitOf(metric) ? { displayUnit: displayUnitOf(metric) } : {})
    };
    widget.style.showTrend = spec.showTrend ?? false;
  } else if (role === "detail") {
    widget.mapping = {};
  } else {
    const metricLimit = role === "composition" ? 1 : 2;
    const requestedMetrics = spec.metricKeys?.slice(0, metricLimit);
    const unknownMetrics = requestedMetrics?.filter((key) => !columns.some((column) => column.key === key)) ?? [];
    if (unknownMetrics.length > 0) {
      context.rejected.push({ target: label, reason: `指标列「${unknownMetrics.join("、")}」不在该结果表里，已按推断取列` });
    }
    if (spec.dimensionKey && !columns.some((column) => column.key === spec.dimensionKey)) {
      context.rejected.push({ target: label, reason: `维度列「${spec.dimensionKey}」不在该结果表里，已按推断取列` });
    }
    widget.mapping = applyMappingColumns(
      { ...widget.mapping, metricKeys: widget.mapping.metricKeys?.slice(0, metricLimit), metricColumnIds: widget.mapping.metricColumnIds?.slice(0, metricLimit) },
      columns,
      spec.dimensionKey,
      requestedMetrics?.filter((key) => columns.some((column) => column.key === key))
    );
  }

  if (spec.title) widget.title = spec.title;
  if (spec.subtitle) widget.subtitle = spec.subtitle;

  context.changes.push({
    kind: "add",
    widgetId: widget.id,
    label: `新增 ${definition.title}「${widget.title}」`
  });
  return { schema: next, widgetId: widget.id };
}

/** hero 只能有一个：第一个占住，后面的降为加宽，并把降级理由说清楚。 */
function claimHero(context: ApplyContext, widgetId: string, label: string) {
  if (context.heroWidgetId && context.heroWidgetId !== widgetId) {
    context.rejected.push({ target: label, reason: "同一稿只能有一个主图，已降为加宽" });
    return;
  }
  context.heroWidgetId = widgetId;
  context.changes.push({ kind: "emphasis", widgetId, label: `「${label}」→ 主图` });
}

function finalize(
  schema: DashboardSchema,
  themeId: string,
  archetype: DashboardDesignArchetype,
  context: ApplyContext
): DashboardSchema {
  const themed = applyDashboardBoardTheme(schema, themeId, { includeLocked: false });
  // 被移除的组件不能把宽度意图留在 schema 里，否则日后同 id 复用会莫名其妙变宽。
  const emphasisById = Object.fromEntries(
    Object.entries(context.emphasisById).filter(([widgetId]) =>
      themed.widgets.some((widget) => widget.id === widgetId)
    )
  );
  const hasEmphasis = Object.keys(emphasisById).length > 0;
  const composed = composeDashboardWithArchetype(themed, archetype, {
    ...(context.heroWidgetId ? { heroWidgetId: context.heroWidgetId } : {}),
    ...(context.railWidgetIds.length > 0 ? { railWidgetIds: context.railWidgetIds } : {}),
    ...(hasEmphasis ? { emphasisById } : {})
  });
  return {
    ...fitDashboardCanvasHeight(composed),
    design: { archetype, themeId, ...(hasEmphasis ? { emphasisById } : {}) },
    updatedAt: new Date().toISOString()
  };
}

function resolveThemeId(requested: string | undefined, current: string, context: ApplyContext) {
  if (!requested) return current;
  if (dashboardBoardThemes.some((theme) => theme.id === requested)) {
    if (requested !== current) {
      context.changes.push({ kind: "theme", label: `整板主题 → ${getDashboardBoardTheme(requested).title}` });
    }
    return requested;
  }
  context.rejected.push({ target: "整板主题", reason: `主题「${requested}」不在主题库里，已保持当前主题` });
  return current;
}

function applyCanvasPreset(schema: DashboardSchema, presetId: string | undefined, context: ApplyContext) {
  if (!presetId) return schema;
  const preset = dashboardCanvasPresets.find((item) => item.id === presetId);
  if (!preset) {
    context.rejected.push({ target: "画布尺寸", reason: `尺寸档「${presetId}」不认识，已保持当前画布` });
    return schema;
  }
  if (schema.canvas.width === preset.width && schema.canvas.height === preset.height) return schema;
  context.changes.push({ kind: "canvas", label: `画布 → ${preset.label}` });
  return {
    ...schema,
    canvas: { ...schema.canvas, width: preset.width, height: preset.height }
  };
}

export function applyDashboardDesignSpec(
  schema: DashboardSchema,
  spec: DashboardDesignSpec,
  data: DashboardDesignAssetData
): DashboardDesignApplyResult {
  const context: ApplyContext = { changes: [], rejected: [], railWidgetIds: [], emphasisById: {} };
  let next = structuredClone(schema);

  // 整稿替换：未锁定的组件连同它们的 binding / module 一起清掉，锁定组件原样留在板上。
  const lockedWidgets = next.widgets.filter((widget) => widget.style.locked);
  for (const widget of next.widgets.filter((item) => !item.style.locked)) {
    next = removeQueryAssetChart(next, widget.id);
  }

  if (spec.title) next.title = spec.title;
  const description = spec.insight ?? spec.subtitle;
  if (description) next.description = description;
  next = applyCanvasPreset(next, spec.canvasPreset, context);

  const banner = createBannerWidget(next, spec.title || next.title, description);
  next = { ...next, widgets: [...next.widgets, banner] };
  context.changes.push({ kind: "banner", widgetId: banner.id, label: `标题条「${banner.title}」` });

  const created: Array<{ spec: DashboardDesignSpecWidget; widgetId: string }> = [];
  for (const widgetSpec of spec.widgets) {
    const built = buildDesignWidget(next, widgetSpec, data, context);
    if (!built) continue;
    next = built.schema;
    created.push({ spec: widgetSpec, widgetId: built.widgetId });
  }

  // 新组件排在锁定组件之前：构图器按数组顺序认「开头的文本条是标题」，
  // 顺序错了首条叙事就会被当成脚注沉到板底。
  const createdIds = new Set([banner.id, ...created.map((item) => item.widgetId)]);
  next.widgets = [
    ...next.widgets.filter((widget) => createdIds.has(widget.id)),
    ...next.widgets.filter((widget) => !createdIds.has(widget.id) && !lockedWidgets.some((locked) => locked.id === widget.id)),
    ...next.widgets.filter((widget) => lockedWidgets.some((locked) => locked.id === widget.id))
  ];

  for (const item of created) {
    if (item.spec.emphasis === "hero") {
      claimHero(context, item.widgetId, item.spec.title || item.widgetId);
    }
  }
  // 侧轨贴着主图站：只有紧随主图的那一两个请求成立，其余忽略并说明。
  const heroIndex = created.findIndex((item) => item.widgetId === context.heroWidgetId);
  for (let index = 0; index < created.length; index += 1) {
    const item = created[index]!;
    if (item.spec.placement !== "rail") continue;
    const adjacent = heroIndex >= 0 && index > heroIndex && index - heroIndex <= 2 && context.railWidgetIds.length < 2;
    if (adjacent) context.railWidgetIds.push(item.widgetId);
    else context.changes.push({ kind: "rail", widgetId: item.widgetId, label: `「${item.spec.title}」不紧邻主图，侧轨位置已忽略` });
  }

  const themeId = resolveThemeId(spec.themeId, resolveDashboardBoardThemeId(next), context);
  context.changes.push({ kind: "archetype", label: `构图 → ${archetypeTitle(spec.archetype)}` });
  return { schema: finalize(next, themeId, spec.archetype, context), changes: context.changes, rejected: context.rejected };
}

function findWidget(schema: DashboardSchema, widgetId: string) {
  return schema.widgets.find((widget) => widget.id === widgetId);
}

export function applyDashboardDesignOps(
  schema: DashboardSchema,
  ops: DashboardDesignOps,
  data: DashboardDesignAssetData
): DashboardDesignApplyResult {
  const context: ApplyContext = {
    changes: [],
    rejected: [],
    railWidgetIds: [],
    emphasisById: readFlowEmphasis(schema)
  };
  let next = structuredClone(schema);
  let themeId = resolveDashboardBoardThemeId(next);
  let archetype = resolveDesignArchetype(next);

  for (const op of ops.ops) {
    const widget = "widgetId" in op ? findWidget(next, op.widgetId) : undefined;
    if ("widgetId" in op && !widget) {
      context.rejected.push({ target: op.widgetId, reason: "板上找不到这个组件" });
      continue;
    }
    if (widget?.style.locked && op.op !== "set_emphasis") {
      context.rejected.push({ target: widget.title, reason: "组件已锁定，不能改动" });
      continue;
    }

    switch (op.op) {
      case "set_theme": {
        themeId = resolveThemeId(op.themeId, themeId, context);
        break;
      }
      case "set_archetype": {
        archetype = op.archetype;
        context.changes.push({ kind: "archetype", label: `构图 → ${archetypeTitle(op.archetype)}` });
        break;
      }
      case "set_canvas": {
        next = applyCanvasPreset(next, op.preset, context);
        break;
      }
      case "set_board_title": {
        next.title = op.title;
        const description = op.insight ?? op.subtitle;
        if (description) next.description = description;
        const banner = next.widgets.find((item) => isBannerWidget(item) && !item.style.locked);
        if (banner) {
          banner.title = op.title;
          banner.content = op.title;
          banner.props = { ...(banner.props ?? {}), text: op.title };
          if (description) banner.subtitle = description;
        }
        context.changes.push({ kind: "board-title", label: `整板标题 → ${op.title}` });
        break;
      }
      case "add_widget": {
        const built = buildDesignWidget(next, op.widget, data, context);
        if (!built) break;
        next = built.schema;
        if (op.widget.emphasis === "hero") claimHero(context, built.widgetId, op.widget.title || built.widgetId);
        break;
      }
      case "remove_widget": {
        context.changes.push({ kind: "remove", widgetId: op.widgetId, label: `移除「${widget!.title}」` });
        next = removeQueryAssetChart(next, op.widgetId);
        break;
      }
      case "retype_widget": {
        const variant = dashboardChartVariants.find((item) => item.id === op.variant);
        if (!variant) {
          context.rejected.push({ target: widget!.title, reason: `图种「${op.variant}」不在变体目录里` });
          break;
        }
        const binding = widget!.bindingId ? next.dataBindings[widget!.bindingId] : undefined;
        if (!binding) {
          context.rejected.push({ target: widget!.title, reason: "组件没有绑定数据，换不了图种" });
          break;
        }
        const shape = bindingShape(binding);
        if (!variantAcceptsShape(variant.dataRequirement, shape)) {
          context.rejected.push({ target: widget!.title, reason: `图种「${variant.title}」要求的数据形状与该组件的数据不符` });
          break;
        }
        const columns = bindingColumns(binding);
        const targetDefinition = getDashboardComponentDefinition(variant.type);
        const metricLimit = ["pie", "radar", "funnel"].includes(variant.type) ? 1 : 2;
        widget!.type = variant.type;
        widget!.name = targetDefinition.title;
        widget!.props = { ...(targetDefinition.defaultProps ?? {}), ...(widget!.props ?? {}) };
        widget!.style = {
          ...targetDefinition.defaultStyle,
          ...widget!.style,
          chartVariant: variant.id,
          accent: variant.accent
        };
        widget!.mapping = applyMappingColumns(
          {
            ...widget!.mapping,
            metricKeys: widget!.mapping.metricKeys?.slice(0, metricLimit),
            metricColumnIds: widget!.mapping.metricColumnIds?.slice(0, metricLimit)
          },
          columns,
          widget!.mapping.dimensionKey,
          widget!.mapping.metricKeys?.slice(0, metricLimit)
        );
        context.changes.push({ kind: "retype", widgetId: widget!.id, label: `「${widget!.title}」→ ${variant.title}` });
        break;
      }
      case "set_emphasis": {
        // 主图与侧轨走各自的出口，之前记下的流式宽度意图要一并清掉，免得两套意图打架。
        delete context.emphasisById[widget!.id];
        if (op.emphasis === "hero") {
          claimHero(context, widget!.id, widget!.title);
        } else if (op.placement === "rail") {
          if (context.railWidgetIds.length < 2) {
            context.railWidgetIds.push(widget!.id);
            context.changes.push({ kind: "rail", widgetId: widget!.id, label: `「${widget!.title}」→ 主图侧轨` });
          } else {
            context.changes.push({ kind: "rail", widgetId: widget!.id, label: `侧轨最多两张，「${widget!.title}」按常规排布` });
          }
        } else {
          context.emphasisById[widget!.id] = op.emphasis;
          context.changes.push({
            kind: "emphasis",
            widgetId: widget!.id,
            label: `「${widget!.title}」→ ${op.emphasis === "wide" ? "加宽" : op.emphasis === "normal" ? "标准" : "紧凑"}`
          });
        }
        break;
      }
      case "retitle": {
        widget!.title = op.title;
        if (op.subtitle) widget!.subtitle = op.subtitle;
        context.changes.push({ kind: "retitle", widgetId: widget!.id, label: `组件标题 → ${op.title}` });
        break;
      }
      case "set_text": {
        if (widget!.type !== "text") {
          context.rejected.push({ target: widget!.title, reason: "只有文本条能改正文" });
          break;
        }
        widget!.content = op.content;
        widget!.props = { ...(widget!.props ?? {}), text: op.content };
        context.changes.push({ kind: "text", widgetId: widget!.id, label: `文本条正文已更新` });
        break;
      }
      case "set_kpi": {
        if (widget!.type !== "metric") {
          context.rejected.push({ target: widget!.title, reason: "只有指标卡能改取值方式" });
          break;
        }
        const binding = widget!.bindingId ? next.dataBindings[widget!.bindingId] : undefined;
        const columns = bindingColumns(binding);
        if (op.metricKey) {
          const column = columns.find((item) => item.key === op.metricKey);
          if (!column) {
            context.rejected.push({ target: widget!.title, reason: `指标列「${op.metricKey}」不在该组件的数据里` });
          } else {
            widget!.mapping = {
              ...widget!.mapping,
              metricKeys: [column.key],
              metricColumnIds: [column.columnId],
              ...(displayUnitOf(column) ? { displayUnit: displayUnitOf(column) } : {})
            };
          }
        }
        if (op.valueMode) widget!.mapping.valueMode = op.valueMode;
        if (op.showTrend !== undefined) widget!.style.showTrend = op.showTrend;
        context.changes.push({ kind: "kpi", widgetId: widget!.id, label: `「${widget!.title}」指标口径已更新` });
        break;
      }
      case "set_mapping": {
        if (!CHART_TYPES.has(widget!.type)) {
          context.rejected.push({ target: widget!.title, reason: "只有图表能改数据映射" });
          break;
        }
        const binding = widget!.bindingId ? next.dataBindings[widget!.bindingId] : undefined;
        const columns = bindingColumns(binding);
        const unknown = [
          ...(op.dimensionKey && !columns.some((item) => item.key === op.dimensionKey) ? [op.dimensionKey] : []),
          ...(op.metricKeys ?? []).filter((key) => !columns.some((item) => item.key === key))
        ];
        if (unknown.length > 0) {
          context.rejected.push({ target: widget!.title, reason: `列「${unknown.join("、")}」不在该组件的数据里` });
        }
        const metricLimit = ["pie", "radar", "funnel"].includes(widget!.type) ? 1 : 2;
        const metricKeys = op.metricKeys?.filter((key) => columns.some((item) => item.key === key)).slice(0, metricLimit);
        const dimensionKey = op.dimensionKey && columns.some((item) => item.key === op.dimensionKey)
          ? op.dimensionKey
          : undefined;
        if (!dimensionKey && (!metricKeys || metricKeys.length === 0)) break;
        widget!.mapping = applyMappingColumns(widget!.mapping, columns, dimensionKey, metricKeys);
        context.changes.push({ kind: "mapping", widgetId: widget!.id, label: `「${widget!.title}」数据映射已更新` });
        break;
      }
      default: {
        const order = new Map(op.widgetIds.map((id, index) => [id, index]));
        next.widgets = [...next.widgets].sort((left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
        );
        context.changes.push({ kind: "reorder", label: "组件顺序已调整" });
        break;
      }
    }
  }

  return { schema: finalize(next, themeId, archetype, context), changes: context.changes, rejected: context.rejected };
}
