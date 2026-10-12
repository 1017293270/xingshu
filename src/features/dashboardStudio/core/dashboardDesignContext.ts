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
import { dashboardAnswerPlainText } from "./dashboardAnswerEvidence";
import { dashboardAnswerCandidates, dashboardAnswerMetric, type DashboardAnswerMetric } from "./dashboardAnswerOutputs";
import { dashboardBoardThemes, getMatchingDashboardBoardThemeId } from "./dashboardBoardThemes";
import { dashboardCanvasPresets, resolveDashboardCanvasPreset } from "./dashboardCanvas";
import { dashboardChartVariants } from "./dashboardChartPresets";
import { classifyColumn } from "./dashboardColumnSemantics";
import { dashboardDesignArchetypeCatalog } from "./dashboardDesignArchetypes";
import { dashboardOutputLabel } from "./dashboardDesignTitles";
import { widgetSemanticRole } from "./dashboardLayoutSolver";

/**
 * 发给模型的上下文：只有列名、样本行、收藏时的回答摘要和当前板的语义摘要，不带 SQL、不带全量结果。
 * 预算是硬约束——后端超过 64k 字符直接拒收，所以这里先按份数/列数/样本行/回答长度裁剪，
 * 仍然超标时依次丢样本行、丢历史、丢回答原文，宁可少给上下文也不让整轮请求失败。
 */

const MAX_ASSETS = 8;
const MAX_OUTPUTS_PER_ASSET = 6;
const MAX_COLUMNS_PER_OUTPUT = 24;
const MAX_SAMPLE_ROWS = 3;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 300;
const MAX_TEXT_CONTENT_CHARS = 120;
/** 回答摘要的上限（含省略号）：够装下结论句和几家排行，八份资产全满也只占预算的零头。 */
const MAX_ANSWER_CHARS = 300;
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
 * 0 行结果一律算 table：它画不出趋势也比不了分类，只配一张如实写着「暂无数据」的卡。
 */
export function inferDashboardDesignOutputShape(output: QueryExecutionOutput): DashboardDesignOutputShape {
  if (output.columns.length === 0 || output.rows.length === 0) return "table";
  const roles = output.columns.map((column) => classifyColumn(column, output.rows));
  if (output.rows.length === 1) return roles.includes("number") ? "scalar" : "table";
  if (roles.includes("time") && roles.includes("number")) return "time-series";
  if (roles.includes("dimension") || roles.includes("identifier")) return "category";
  return "table";
}

/** 模型读得懂的结果表名：后端给的多是 output_003 这种键，换成「结果表 3 · 字段、字段」。 */
function outputLabel(asset: QueryAsset, output: QueryExecutionOutput, likelyAnswer: boolean) {
  const defined = asset.stableVersion?.outputs.find((item) => item.outputKey === output.outputKey);
  const label = dashboardOutputLabel({ outputKey: output.outputKey, label: defined?.label, columns: output.columns });
  return likelyAnswer ? `${label} · 最可能是问题的答案` : label;
}

/** 截到 limit 个 UTF-16 码元以内（含省略号），不把代理对劈成两半。 */
function truncateText(text: string, limit: number) {
  if (text.length <= limit) return text;
  let end = limit - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

/** 收藏时的回答：markdown 转纯文本、压成一行再截短；老收藏没有回答时是空串。 */
function answerSummaryText(answerText?: string) {
  return truncateText(dashboardAnswerPlainText(answerText).replace(/\s+/g, " ").trim(), MAX_ANSWER_CHARS);
}

/**
 * output 须已清洗列名（dashboardAnswerCandidates 给出的就是）：列种类与形状都按短业务名判。
 * answer 是回答引用的那一列，只在它确实是本表的列时才写进摘要。
 */
function summarizeOutput(
  asset: QueryAsset,
  output: QueryExecutionOutput,
  likelyAnswer: boolean,
  answer?: DashboardAnswerMetric
): DashboardDesignOutputSummary {
  const columns = output.columns.map((column) => ({
    columnId: column.columnId,
    key: column.key,
    label: column.label || column.title || column.key,
    kind: inferDashboardDesignColumnKind(column, output.rows)
  }));
  const keys = columns.map((column) => column.key);
  const answerMetric = answer && keys.includes(answer.metricKey) ? answer : undefined;
  return {
    outputKey: output.outputKey,
    label: outputLabel(asset, output, likelyAnswer),
    columns,
    totalRows: output.totalRows,
    sampleRows: output.rows.slice(0, MAX_SAMPLE_ROWS).map((row) =>
      Object.fromEntries(keys.map((key) => [key, row[key]]))
    ),
    shape: inferDashboardDesignOutputShape(output),
    ...(answerMetric ? { answerMetricKey: answerMetric.metricKey } : {}),
    ...(answerMetric?.valueMode ? { answerValueMode: answerMetric.valueMode } : {})
  };
}

/**
 * 收藏里存着整轮问数的每一次查询。给模型的只留非空结果，最可能是答案的那张排第一并在 label 里点明，
 * 探查查询与 0 行结果不再挤占每份资产六张表的名额。
 * 收藏带着回答原文时再给两样：回答摘要（answer），以及排第一那张表上回答引用的列与合计口径
 * （answerMetricKey / answerValueMode，与「加入看板」、本地兜底同一套 dashboardAnswerMetric）。
 * 老收藏没有回答，这几个键一个都不出，请求体与以前逐字节一致。
 */
export function summarizeDashboardDesignAsset(
  asset: QueryAsset,
  execution: QueryExecution
): DashboardDesignAssetSummary {
  const outputs = dashboardAnswerCandidates(asset, execution.outputs);
  const answer = answerSummaryText(asset.answerText);
  const answerMetric = outputs[0] ? dashboardAnswerMetric(asset, execution.outputs, outputs[0].outputKey) : undefined;
  return {
    assetId: asset.id,
    name: asset.name,
    question: asset.resolvedQuestion || asset.originalQuestion,
    ...(answer ? { answer } : {}),
    outputs: outputs.map((output, index) =>
      summarizeOutput(asset, output, index === 0 && outputs.length > 1, index === 0 ? answerMetric : undefined)
    )
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

/** 列裁到上限；回答引用的那一列落在上限之外时顶替最后一列留下，answerMetricKey 不能指向模型看不到的列。 */
function trimColumns(output: DashboardDesignOutputSummary) {
  const columns = output.columns.slice(0, MAX_COLUMNS_PER_OUTPUT);
  const answerKey = output.answerMetricKey;
  if (!answerKey || columns.some((column) => column.key === answerKey)) return columns;
  const answerColumn = output.columns.find((column) => column.key === answerKey);
  return answerColumn ? [...columns.slice(0, -1), answerColumn] : columns;
}

/** 列裁剪后要顺手把样本行里失效的 key 抹掉，否则模型会引用一个它看不到定义的列。 */
function trimAssetSummary(asset: DashboardDesignAssetSummary): DashboardDesignAssetSummary {
  return {
    ...asset,
    outputs: asset.outputs.slice(0, MAX_OUTPUTS_PER_ASSET).map((output) => {
      const columns = trimColumns(output);
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

/** 只丢回答摘要；answerMetricKey / answerValueMode 只有几十字，留着照样能把模型引到对的列与口径。 */
function withoutAnswers(assets: DashboardDesignAssetSummary[]): DashboardDesignAssetSummary[] {
  return assets.map((asset) => {
    const next = { ...asset };
    delete next.answer;
    return next;
  });
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

  // 超预算时按「丢了损失最小」的顺序裁：样本行最占地方，列定义还在，模型照样认得出每列是什么；
  // 历史是对话上下文，当前板摘要已经带着前几轮落下来的结果；回答原文是用户看到的结论，
  // 模型据此挑表、写标题与洞察，最后才丢，丢了也还有 answerMetricKey / answerValueMode 兜着。
  if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
    request = { ...request, assets: withoutSampleRows(request.assets) };
  }
  if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
    request = { ...request, history: [] };
  }
  if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
    request = { ...request, assets: withoutAnswers(request.assets) };
  }
  return request;
}
