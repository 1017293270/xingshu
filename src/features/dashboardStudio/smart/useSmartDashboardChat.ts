import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyDashboardDesignOps,
  applyDashboardDesignSpec,
  resolveDashboardBoardThemeId
} from "@/features/dashboardStudio/core/dashboardDesignApply";
import {
  classifyColumn,
  metricColumnPriority,
  numericMetricColumns
} from "@/features/dashboardStudio/core/dashboardColumnSemantics";
import {
  buildDashboardDesignRequest,
  inferDashboardDesignOutputShape
} from "@/features/dashboardStudio/core/dashboardDesignContext";
import { boardTitle, shortWidgetTitle } from "@/features/dashboardStudio/core/dashboardDesignTitles";
import { parseDashboardDesignOps, parseDashboardDesignSpec } from "@/features/dashboardStudio/core/dashboardDesignSpec";
import { streamDashboardDesign } from "@/services/dashboardDesignService";
import type { QueryAsset, QueryColumnDefinition, QueryExecution } from "@/types/analytics";
import type {
  DashboardDesignAssetData,
  DashboardDesignChange,
  DashboardDesignHistoryTurn,
  DashboardDesignIssue,
  DashboardDesignRejection,
  DashboardDesignSpec,
  DashboardDesignSpecWidget,
  DashboardDesignValueMode
} from "@/types/dashboardDesign";
import type { DashboardSchema } from "@/types/dashboardStudio";

export type SmartDashboardCandidate = {
  schema: DashboardSchema;
  changes: DashboardDesignChange[];
  rejected: DashboardDesignRejection[];
};

export type SmartDashboardTurnKind = "generate" | "edit" | "fix";
export type SmartDashboardTurnStatus = "streaming" | "ready" | "applied" | "discarded" | "error" | "cancelled";

export type SmartDashboardTurn = {
  id: string;
  kind: SmartDashboardTurnKind;
  brief: string;
  narrative: string;
  status: SmartDashboardTurnStatus;
  error: string;
  candidate?: SmartDashboardCandidate;
  /** 模型没给出可用方案、由本地规则兜底搭出来的那一版。 */
  fallback?: boolean;
  /** 兜底的原因（后端 404、流断了、JSON 坏了…），面板要原样告诉用户。 */
  fallbackReason?: string;
};

export type UseSmartDashboardChatInput = {
  getSchema: () => DashboardSchema;
  applySchema: (schema: DashboardSchema, notice?: string) => Promise<void>;
  listAssets: (input?: { keyword?: string; scope?: "PRIVATE" | "SPACE" }) => Promise<QueryAsset[]>;
  previewAsset: (assetId: string) => Promise<QueryExecution>;
  initialAssetIds?: string[];
};

/** 一屏 12 个组件封顶，与引擎侧同一条线。 */
const MAX_LOCAL_WIDGETS = 12;
/** 指标卡超过四张就没有主次了，与设计诊断的 too-many-kpi 同一条线。 */
const MAX_LOCAL_KPI = 4;
/** 环形图挤过八个扇区就分不清了。 */
const MAX_LOCAL_COMPOSITION_CATEGORIES = 8;
/**
 * 渲染层不做聚合，一行就是一根柱子：明细表直接画对比图会出来几十根重名的柱子。
 * 超过这个行数的结果表只给指标卡与明细表。
 */
const MAX_PLOTTABLE_ROWS = 12;
/** 时间列几乎每行一个值才算真的趋势，否则只是一张按年度分组前的明细。 */
const MIN_SERIES_UNIQUE_RATIO = 0.8;

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 板上已经绑定过的资产：改版时模型也可以从这些资产里再加一张图。 */
export function boundAssetIds(schema: DashboardSchema): string[] {
  const ids = new Set<string>();
  for (const module of Object.values(schema.modules ?? {})) {
    if (module.source.kind === "query-asset" && module.source.assetId) ids.add(module.source.assetId);
  }
  for (const binding of Object.values(schema.dataBindings)) {
    if (binding.sourceRef?.kind === "query-asset" && binding.sourceRef.assetId) ids.add(binding.sourceRef.assetId);
  }
  return [...ids];
}

function distinctCount(rows: Record<string, unknown>[], key: string) {
  return new Set(rows.map((row) => String(row[key] ?? ""))).size;
}

/** 分类维度里挑基数最小的那一列：六家甲方比八十个合同名称好读得多。 */
function pickDimension(columns: QueryColumnDefinition[], rows: Record<string, unknown>[]) {
  const byRole = (role: string) =>
    columns
      .filter((column) => classifyColumn(column, rows) === role)
      .sort((left, right) => distinctCount(rows, left.key) - distinctCount(rows, right.key));
  return byRole("dimension")[0] ?? byRole("identifier")[0];
}

/**
 * 本地兜底方案：模型崩了、JSON 坏了或一条组件都不合法时，按结果表形状搭一版规矩的板。
 * 宁可给一版平淡但正确的，也不让用户对着一条错误干等。
 *
 * 三条硬规矩：标题走 shortWidgetTitle（资产名往往是一整段资产描述，不能直接当标题）；
 * 指标只取解析得出数的列；同一份结果表最多出两种表达，不把 KPI/趋势/对比/占比全堆上去。
 */
export function buildLocalDesignSpec(
  schema: DashboardSchema,
  data: DashboardDesignAssetData,
  brief: string
): DashboardDesignSpec {
  const kpis: Array<{ widget: DashboardDesignSpecWidget; priority: number }> = [];
  const charts: Array<{ widget: DashboardDesignSpecWidget; weight: number }> = [];
  const details: DashboardDesignSpecWidget[] = [];

  for (const { asset, execution } of Object.values(data)) {
    const titleAsset = { name: asset.name, question: asset.resolvedQuestion || asset.originalQuestion };
    for (const output of execution.outputs) {
      const ref = `${asset.id}:${output.outputKey}`;
      const base = { assetId: asset.id, outputKey: output.outputKey };
      const metrics = numericMetricColumns(output.columns, output.rows);
      const metric = metrics[0];
      const time = output.columns.find((column) => classifyColumn(column, output.rows) === "time");
      const dimension = pickDimension(output.columns, output.rows);
      const shape = inferDashboardDesignOutputShape(output);
      const detail: DashboardDesignSpecWidget = {
        ref: `${ref}:detail`,
        role: "detail",
        ...base,
        title: shortWidgetTitle({ role: "detail", asset: titleAsset })
      };

      if (!metric) {
        details.push(detail);
        continue;
      }
      const kpi = (
        valueMode: DashboardDesignValueMode,
        options: { showTrend?: boolean; qualifier?: string } = {}
      ): DashboardDesignSpecWidget => ({
        ref: `${ref}:kpi`,
        role: "kpi",
        ...base,
        metricKey: metric.key,
        valueMode,
        showTrend: options.showTrend ?? false,
        title: shortWidgetTitle({
          role: "kpi",
          metricLabel: metric.label,
          asset: titleAsset,
          ...(options.qualifier ? { qualifier: options.qualifier } : {})
        })
      });

      if (shape === "scalar") {
        kpis.push({ widget: kpi("first"), priority: metricColumnPriority(metric) });
        continue;
      }
      // 真正的时间序列每行一个时间点；八十行合同挤在三个年度上不是趋势，是一张明细表。
      const plottableSeries = time
        && shape === "time-series"
        && distinctCount(output.rows, time.key) >= output.rows.length * MIN_SERIES_UNIQUE_RATIO;
      if (time && plottableSeries) {
        kpis.push({ widget: kpi("latest", { showTrend: true }), priority: metricColumnPriority(metric) });
        charts.push({
          widget: {
            ref: `${ref}:trend`,
            role: "trend",
            ...base,
            variant: "line-smooth",
            dimensionKey: time.key,
            metricKeys: [metric.key],
            title: shortWidgetTitle({ role: "trend", metricLabel: metric.label, asset: titleAsset })
          },
          // 趋势图最适合当主图，同样行数下压过对比图。
          weight: output.rows.length * 2
        });
        continue;
      }
      if (dimension && output.rows.length <= MAX_PLOTTABLE_ROWS) {
        charts.push({
          widget: {
            ref: `${ref}:bar`,
            role: "comparison",
            ...base,
            variant: "bar-vertical",
            dimensionKey: dimension.key,
            metricKeys: [metric.key],
            title: shortWidgetTitle({
              role: "comparison",
              metricLabel: metric.label,
              dimensionLabel: dimension.label,
              asset: titleAsset
            })
          },
          weight: output.rows.length
        });
        if (distinctCount(output.rows, dimension.key) <= MAX_LOCAL_COMPOSITION_CATEGORIES) {
          charts.push({
            widget: {
              ref: `${ref}:pie`,
              role: "composition",
              ...base,
              variant: "pie-donut",
              dimensionKey: dimension.key,
              metricKeys: [metric.key],
              title: shortWidgetTitle({ role: "composition", metricLabel: metric.label, asset: titleAsset })
            },
            // 占比图不当主图：一个大环形图撑不起一整屏。
            weight: 0
          });
        }
        continue;
      }
      // 行数太多画不了图，但金额合计仍然值得一张卡，明细表照常沉底。
      kpis.push({ widget: kpi("sum", { qualifier: "合计" }), priority: metricColumnPriority(metric) });
      details.push(detail);
    }
  }

  const rankedKpis = kpis
    .map((item, index) => ({ ...item, index }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, MAX_LOCAL_KPI)
    .map((item) => item.widget);
  // 数据最厚的那张图占主图位，紧随其后的两张贴到侧轨——构图器认的就是这个顺序。
  const heroIndex = charts.reduce(
    (best, item, index) => (item.weight > (charts[best]?.weight ?? -1) ? index : best),
    0
  );
  const ordered = charts.length > 0 ? [charts[heroIndex]!, ...charts.filter((_, index) => index !== heroIndex)] : [];
  const composedCharts = ordered.map((item, index) => (
    index === 0
      ? { ...item.widget, emphasis: "hero" as const }
      : index <= 2
        ? { ...item.widget, placement: "rail" as const }
        : item.widget
  ));
  const widgets = [...rankedKpis, ...composedCharts, ...details].slice(0, MAX_LOCAL_WIDGETS);

  const firstAsset = Object.values(data)[0]?.asset;
  const title = boardTitle(
    brief,
    firstAsset ? { name: firstAsset.name, question: firstAsset.resolvedQuestion } : undefined,
    schema.title
  );
  return {
    narrative: "",
    title,
    insight: `按 ${Object.keys(data).length} 份收藏问数的结果形状自动编排`,
    themeId: resolveDashboardBoardThemeId(schema),
    archetype: composedCharts.some((widget) => widget.role === "trend") ? "trend-led" : "kpi-led",
    widgets
  };
}

function historyOf(turns: SmartDashboardTurn[]): DashboardDesignHistoryTurn[] {
  return turns
    .filter((turn) => turn.kind !== "fix" && (turn.status === "ready" || turn.status === "applied" || turn.status === "discarded"))
    .flatMap((turn) => [
      { role: "user" as const, content: turn.brief },
      ...(turn.narrative ? [{ role: "assistant" as const, content: turn.narrative }] : [])
    ]);
}

/**
 * 智享大屏的对话状态机：一轮 = 用户一句话 → 模型叙事（流式）→ 引擎落出候选 schema → 用户「应用」。
 * 候选永远先落在面板里，不碰画布；只有 applySchema 那一下才进设计器的撤销历史。
 */
export function useSmartDashboardChat(input: UseSmartDashboardChatInput) {
  const { getSchema, applySchema, listAssets, previewAsset } = input;
  const [turns, setTurns] = useState<SmartDashboardTurn[]>([]);
  const [assets, setAssets] = useState<QueryAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(() => input.initialAssetIds ?? []);
  const controllerRef = useRef<AbortController | null>(null);
  const dataRef = useRef<DashboardDesignAssetData>({});
  const assetsRef = useRef<QueryAsset[]>([]);
  const turnsRef = useRef<SmartDashboardTurn[]>([]);
  const narrativeBufferRef = useRef(new Map<string, string>());
  const flushTimerRef = useRef<number | undefined>(undefined);

  turnsRef.current = turns;

  const patchTurn = useCallback((turnId: string, patch: Partial<SmartDashboardTurn> | ((turn: SmartDashboardTurn) => SmartDashboardTurn)) => {
    setTurns((current) => current.map((turn) => {
      if (turn.id !== turnId) return turn;
      return typeof patch === "function" ? patch(turn) : { ...turn, ...patch };
    }));
  }, []);

  /* 叙事增量很密，攒一帧再落 state，避免每个 token 都触发整栏重渲染。 */
  const flushNarrative = useCallback(() => {
    flushTimerRef.current = undefined;
    const buffered = narrativeBufferRef.current;
    if (buffered.size === 0) return;
    const batch = new Map(buffered);
    buffered.clear();
    setTurns((current) => current.map((turn) => {
      const pending = batch.get(turn.id);
      return pending ? { ...turn, narrative: `${turn.narrative}${pending}` } : turn;
    }));
  }, []);

  const queueNarrative = useCallback((turnId: string, delta: string) => {
    const buffered = narrativeBufferRef.current;
    buffered.set(turnId, `${buffered.get(turnId) ?? ""}${delta}`);
    if (flushTimerRef.current === undefined) {
      flushTimerRef.current = window.setTimeout(flushNarrative, 16);
    }
  }, [flushNarrative]);

  const refreshAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetsError("");
    try {
      const list = await listAssets();
      assetsRef.current = list;
      setAssets(list);
      return list;
    } catch (error) {
      setAssetsError(errorMessage(error, "收藏问数列表加载失败"));
      return assetsRef.current;
    } finally {
      setAssetsLoading(false);
    }
  }, [listAssets]);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (flushTimerRef.current !== undefined) window.clearTimeout(flushTimerRef.current);
  }, []);

  /**
   * 取齐执行数据：选中的资产缺一份就报错；板上已绑定但列表里看不到的（别人共享后又收回的）
   * 静默跳过，模型若引用到它引擎会给出中文拒绝理由。
   */
  const ensureData = useCallback(async (ids: string[], required: Set<string>) => {
    let list = assetsRef.current;
    for (const id of ids) {
      if (dataRef.current[id]) continue;
      let asset = list.find((item) => item.id === id);
      if (!asset) {
        list = await refreshAssets();
        asset = list.find((item) => item.id === id);
      }
      if (!asset) {
        if (required.has(id)) throw new Error("选中的收藏问数已不可用，请重新选择");
        continue;
      }
      const execution = await previewAsset(asset.id);
      if (execution.status !== "SUCCESS") {
        throw new Error(execution.errorMessage || `「${asset.name}」的查询预览未成功`);
      }
      dataRef.current[id] = { asset, execution };
    }
    return dataRef.current;
  }, [previewAsset, refreshAssets]);

  const settleError = useCallback((turnId: string, message: string) => {
    flushNarrative();
    patchTurn(turnId, { status: "error", error: message });
  }, [flushNarrative, patchTurn]);

  const send = useCallback((brief: string, options: { mode?: "generate" | "edit"; hint?: string } = {}) => {
    const trimmed = brief.trim();
    if (!trimmed || controllerRef.current) return undefined;

    const schema = getSchema();
    const hasContent = schema.widgets.some((widget) => !widget.style.locked);
    const kind: SmartDashboardTurnKind = options.mode ?? (hasContent ? "edit" : "generate");
    const turnId = createId("turn");
    const history = historyOf(turnsRef.current);
    setTurns((current) => [
      ...current,
      { id: turnId, kind, brief: trimmed, narrative: "", status: "streaming", error: "" }
    ]);

    void (async () => {
      const required = new Set(selectedAssetIds);
      const ids = [...new Set([...selectedAssetIds, ...boundAssetIds(schema)])];
      if (kind === "generate" && ids.length === 0) {
        settleError(turnId, "先在上方选择至少一份收藏问数，我才知道用什么数据设计。");
        return;
      }

      let data: DashboardDesignAssetData;
      try {
        data = await ensureData(ids, required);
      } catch (error) {
        settleError(turnId, errorMessage(error, "读取收藏问数失败"));
        return;
      }

      const request = buildDashboardDesignRequest({
        brief: options.hint ? `${trimmed}\n${options.hint}` : trimmed,
        ...(schema.widgets.length > 0 ? { schema } : {}),
        data,
        history
      });

      let candidate: SmartDashboardCandidate | undefined;
      let failure = "";
      const finish = () => {
        controllerRef.current = null;
        flushNarrative();
        if (candidate) {
          patchTurn(turnId, { status: "ready", candidate });
          return;
        }
        if (kind === "generate") {
          const local = buildLocalDesignSpec(schema, data, trimmed);
          if (local.widgets.length > 0) {
            const applied = applyDashboardDesignSpec(schema, local, data);
            const reason = failure || "大屏设计服务没有返回可用的设计稿";
            patchTurn(turnId, (turn) => ({
              ...turn,
              status: "ready",
              fallback: true,
              fallbackReason: reason,
              candidate: applied,
              narrative: `${turn.narrative ? `${turn.narrative}\n` : ""}模型这次没有给出可用的设计稿（${reason}），先按本地规则搭了一版，可以在这基础上继续改。`
            }));
            return;
          }
        }
        patchTurn(turnId, { status: "error", error: failure || "模型没有返回可用的修改方案" });
      };

      controllerRef.current = streamDashboardDesign(kind === "edit" ? "edit" : "generate", request, {
        onEvent: (event) => {
          if (event.type === "message") {
            queueNarrative(turnId, event.delta);
          } else if (event.type === "spec") {
            const parsed = parseDashboardDesignSpec(event.spec);
            if (parsed.spec) {
              const applied = applyDashboardDesignSpec(schema, parsed.spec, data);
              candidate = { ...applied, rejected: [...parsed.rejected, ...applied.rejected] };
            } else {
              failure = parsed.rejected[0]?.reason ?? "模型没有返回可用的设计稿";
            }
          } else if (event.type === "ops") {
            const parsed = parseDashboardDesignOps(event.ops);
            if (parsed.ops) {
              const applied = applyDashboardDesignOps(schema, parsed.ops, data);
              candidate = { ...applied, rejected: [...parsed.rejected, ...applied.rejected] };
            } else {
              failure = parsed.rejected[0]?.reason ?? "模型没有返回可用的修改清单";
            }
          } else if (event.type === "error") {
            failure = event.message;
          }
        },
        onDone: finish,
        onError: (error) => {
          failure = errorMessage(error, "大屏设计服务连接失败");
          finish();
        }
      });
    })();

    return turnId;
  }, [ensureData, flushNarrative, getSchema, patchTurn, queueNarrative, selectedAssetIds, settleError]);

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controllerRef.current = null;
    controller.abort();
    flushNarrative();
    setTurns((current) => current.map((turn) => (
      turn.status === "streaming" ? { ...turn, status: "cancelled" } : turn
    )));
  }, [flushNarrative]);

  const apply = useCallback(async (turnId: string) => {
    const turn = turnsRef.current.find((item) => item.id === turnId);
    if (!turn?.candidate) return;
    try {
      await applySchema(turn.candidate.schema, "已应用智享方案，可撤销");
      patchTurn(turnId, { status: "applied" });
    } catch (error) {
      patchTurn(turnId, { error: errorMessage(error, "应用到画布失败") });
    }
  }, [applySchema, patchTurn]);

  const discard = useCallback((turnId: string) => {
    patchTurn(turnId, (turn) => ({ ...turn, status: "discarded", candidate: undefined }));
  }, [patchTurn]);

  /** 「换个方向」：同一句需求再生成一版，并把上一版的思路带给模型让它换构图。 */
  const regenerate = useCallback(() => {
    const last = [...turnsRef.current].reverse().find((turn) => turn.kind === "generate");
    if (!last) return undefined;
    return send(last.brief, { mode: "generate", hint: "请换一种构图原型与主题方向，不要重复上一版。" });
  }, [send]);

  const applyFix = useCallback(async (issue: DashboardDesignIssue) => {
    if (!issue.fix?.length) return;
    const schema = getSchema();
    const result = applyDashboardDesignOps(schema, { narrative: "", ops: issue.fix }, dataRef.current);
    const turnId = createId("turn");
    try {
      await applySchema(result.schema, "已按诊断修复，可撤销");
      setTurns((current) => [
        ...current,
        {
          id: turnId,
          kind: "fix",
          brief: issue.message,
          narrative: result.changes.map((change) => change.label).join("；") || "已按诊断调整。",
          status: "applied",
          error: "",
          candidate: result
        }
      ]);
    } catch (error) {
      setTurns((current) => [
        ...current,
        { id: turnId, kind: "fix", brief: issue.message, narrative: "", status: "error", error: errorMessage(error, "修复失败") }
      ]);
    }
  }, [applySchema, getSchema]);

  const busy = useMemo(() => turns.some((turn) => turn.status === "streaming"), [turns]);

  return {
    turns,
    busy,
    assets,
    assetsLoading,
    assetsError,
    refreshAssets,
    selectedAssetIds,
    setSelectedAssetIds,
    send,
    regenerate,
    stop,
    apply,
    discard,
    applyFix
  };
}
