import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDashboardDesignSpec } from "@/features/dashboardStudio/core/dashboardDesignApply";
import {
  buildDashboardChartOption,
  resolveDashboardMetric
} from "@/features/dashboardStudio/core/dashboardWidgetData";
import {
  CONTRACT_CUBE,
  FLOW_CUBE,
  PROJECT_CUBE,
  RANKING_ANSWER,
  SALES_ANSWER,
  customerRankingAsset,
  favoriteAsset,
  favoriteColumn,
  favoriteExecution,
  favoriteOutput,
  monthlyIncomeAsset,
  mustSignAsset,
  salesAsset,
  salesDetailAsset,
  salesRecheckAsset,
  withAnswer
} from "@/features/dashboardStudio/testing/favoriteAnswerFixtures";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { streamDashboardDesign } from "@/services/dashboardDesignService";
import { contractDesignData, standardDesignData } from "@/test/dashboardDesignFixtures";
import type { QueryAsset, QueryExecution, QueryExecutionOutput } from "@/types/analytics";
import type {
  DashboardDesignAssetData,
  DashboardDesignSpec,
  DashboardDesignSpecWidget,
  DashboardDesignStreamEvent
} from "@/types/dashboardDesign";
import type { DashboardSchema } from "@/types/dashboardStudio";
import {
  boundAssetIds,
  buildLocalDesignSpec,
  fillAnswerMetricDefaults,
  useSmartDashboardChat
} from "./useSmartDashboardChat";

vi.mock("@/services/dashboardDesignService", () => ({
  streamDashboardDesign: vi.fn()
}));

const streamMock = vi.mocked(streamDashboardDesign);
const feedbackAssets = [salesAsset, mustSignAsset, monthlyIncomeAsset];
/** beta0.4 反馈里的三份收藏：执行结果保持后端原样（调用顺序、全称列名、含 0 行）。 */
function feedbackDesignData(): DashboardDesignAssetData {
  return Object.fromEntries(feedbackAssets.map((asset) => [asset.id, { asset, execution: favoriteExecution(asset) }]));
}
const data = standardDesignData();
const assets = Object.values(data).map((entry) => entry.asset);

const spec: DashboardDesignSpec = {
  narrative: "先看合计，再看趋势与区域对比。",
  title: "营收驾驶舱",
  themeId: "xingshu-ice",
  archetype: "trend-led",
  widgets: [
    { ref: "total", role: "kpi", assetId: "asset-total", outputKey: "total", metricKey: "total", valueMode: "first", title: "订单总数" },
    {
      ref: "trend",
      role: "trend",
      assetId: "asset-revenue",
      outputKey: "monthly",
      variant: "line-smooth",
      dimensionKey: "month",
      metricKeys: ["revenue"],
      title: "月度营收趋势",
      emphasis: "hero"
    },
    {
      ref: "region",
      role: "comparison",
      assetId: "asset-region",
      outputKey: "region",
      variant: "bar-vertical",
      dimensionKey: "region",
      metricKeys: ["sales"],
      title: "区域销售"
    }
  ]
};

/** 让假流在下一个微任务里按顺序吐事件，模拟 SSE 到达。 */
function scriptStream(events: DashboardDesignStreamEvent[], options: { fail?: string } = {}) {
  streamMock.mockImplementation((_kind, _request, handlers) => {
    queueMicrotask(() => {
      for (const event of events) handlers.onEvent(event);
      if (options.fail) handlers.onError?.(new Error(options.fail));
      else handlers.onDone?.();
    });
    return new AbortController();
  });
}

function setup(schema: DashboardSchema = createBlankDashboard({ title: "空板" }), selected = ["asset-total", "asset-revenue", "asset-region"]) {
  const applySchema = vi.fn(async () => undefined);
  const listAssets = vi.fn(async () => assets);
  const previewAsset = vi.fn(async (assetId: string) => data[assetId]!.execution);
  const hook = renderHook(() => useSmartDashboardChat({
    getSchema: () => schema,
    applySchema,
    listAssets,
    previewAsset,
    initialAssetIds: selected
  }));
  return { ...hook, applySchema, listAssets, previewAsset };
}

describe("useSmartDashboardChat", () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  it("streams a generate turn into a candidate schema and applies it on demand", async () => {
    scriptStream([
      { type: "message", delta: "先看合计，" },
      { type: "message", delta: "再看趋势。" },
      { type: "spec", spec },
      { type: "done", modelId: "kimi" }
    ]);
    const { result, applySchema, previewAsset } = setup();

    await waitFor(() => expect(result.current.assets).toHaveLength(4));
    act(() => {
      result.current.send("做一块营收驾驶舱");
    });
    expect(result.current.turns[0]).toMatchObject({ kind: "generate", status: "streaming", brief: "做一块营收驾驶舱" });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));
    const turn = result.current.turns[0]!;
    expect(turn.narrative).toBe("先看合计，再看趋势。");
    expect(turn.candidate?.schema.title).toBe("营收驾驶舱");
    expect(turn.candidate?.schema.widgets.map((widget) => widget.type)).toEqual(
      expect.arrayContaining(["metric", "line", "bar"])
    );
    expect(previewAsset).toHaveBeenCalledTimes(3);
    expect(streamMock).toHaveBeenCalledWith("generate", expect.objectContaining({
      brief: "做一块营收驾驶舱",
      assets: expect.arrayContaining([expect.objectContaining({ assetId: "asset-total" })])
    }), expect.anything());

    await act(async () => {
      await result.current.apply(turn.id);
    });
    expect(applySchema).toHaveBeenCalledWith(turn.candidate!.schema, "已应用智享方案，可撤销");
    expect(result.current.turns[0]?.status).toBe("applied");
  });

  it("给模型的上下文里答案排第一、没有 0 行结果，列名是短业务名", async () => {
    scriptStream([{ type: "spec", spec }, { type: "done", modelId: "kimi" }]);
    const { result } = renderHook(() => useSmartDashboardChat({
      getSchema: () => createBlankDashboard({ title: "空板" }),
      applySchema: vi.fn(async () => undefined),
      listAssets: vi.fn(async () => feedbackAssets),
      previewAsset: vi.fn(async (assetId: string) => favoriteExecution(feedbackAssets.find((asset) => asset.id === assetId)!)),
      initialAssetIds: feedbackAssets.map((asset) => asset.id)
    }));

    await waitFor(() => expect(result.current.assets).toHaveLength(3));
    act(() => {
      result.current.send("做一块经营大屏");
    });
    await waitFor(() => expect(streamMock).toHaveBeenCalled());

    const request = streamMock.mock.calls[0]![1];
    const outputsOf = (assetId: string) => request.assets.find((asset) => asset.assetId === assetId)!.outputs;
    expect(outputsOf("asset-sales").map((output) => output.outputKey)).toEqual(["output_003", "output_001"]);
    expect(outputsOf("asset-sales")[0]!.label).toContain("最可能是问题的答案");
    expect(outputsOf("asset-must-sign").map((output) => output.outputKey)).toEqual(["output_002"]);
    expect(outputsOf("asset-monthly-income").map((output) => output.outputKey)).toEqual(["output_002", "output_001"]);
    const serialized = JSON.stringify(request);
    for (const cube of [PROJECT_CUBE, CONTRACT_CUBE, FLOW_CUBE]) expect(serialized).not.toContain(cube);
  });

  it("refuses to generate on an empty board without any selected asset", async () => {
    const { result } = setup(createBlankDashboard({ title: "空板" }), []);

    act(() => {
      result.current.send("随便画一块");
    });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe("error"));
    expect(result.current.turns[0]?.error).toContain("至少一份收藏问数");
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("falls back to a local layout when the model stream fails during generation", async () => {
    scriptStream([{ type: "message", delta: "我想想…" }], { fail: "大屏设计服务连接失败" });
    const { result } = setup();

    await waitFor(() => expect(result.current.assets).toHaveLength(4));
    act(() => {
      result.current.send("营收总览");
    });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));
    const turn = result.current.turns[0]!;
    expect(turn.fallback).toBe(true);
    // 兜底原因要透传到面板，用户才知道是后端没部署还是模型没绑定
    expect(turn.fallbackReason).toBe("大屏设计服务连接失败");
    expect(turn.narrative).toContain("本地规则");
    expect(turn.narrative).toContain("具体原因见下方提示");
    // 原因只在警示条里说一次，叙事句不跟着变长
    expect(turn.narrative).not.toContain("大屏设计服务连接失败");
    expect(turn.candidate?.schema.widgets.length).toBeGreaterThan(1);
  });

  it("falls back with a stated reason when the endpoint is not deployed", async () => {
    scriptStream([{ type: "error", code: 404, message: "Not Found" }]);
    const { result } = setup();

    await waitFor(() => expect(result.current.assets).toHaveLength(4));
    act(() => {
      result.current.send("营收总览");
    });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));
    expect(result.current.turns[0]?.fallbackReason).toBe("Not Found");
  });

  it("truncates a very long fallback reason so the notice stays readable", async () => {
    const long = `大屏设计服务返回了空的事件流：${"模型原文".repeat(200)}`;
    scriptStream([{ type: "error", code: 500, message: long }]);
    const { result } = setup();

    await waitFor(() => expect(result.current.assets).toHaveLength(4));
    act(() => {
      result.current.send("营收总览");
    });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));
    const turn = result.current.turns[0]!;
    expect(turn.fallbackReason).toHaveLength(401);
    expect(turn.fallbackReason?.endsWith("…")).toBe(true);
    expect(turn.fallbackReason?.startsWith("大屏设计服务返回了空的事件流：")).toBe(true);
    expect(turn.narrative).not.toContain("模型原文");
  });

  it("sends an edit turn with ops when the board already has content", async () => {
    const seeded = applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), spec, data).schema;
    const chartId = seeded.widgets.find((widget) => widget.type === "line")!.id;
    scriptStream([
      { type: "message", delta: "把趋势图换成面积图。" },
      { type: "ops", ops: { narrative: "", ops: [{ op: "retype_widget", widgetId: chartId, variant: "area-soft" }] } },
      { type: "done", modelId: "kimi" }
    ]);
    const { result } = setup(seeded, []);

    act(() => {
      result.current.send("趋势图换成面积图");
    });

    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));
    expect(result.current.turns[0]?.kind).toBe("edit");
    expect(streamMock).toHaveBeenCalledWith("edit", expect.objectContaining({ board: expect.anything() }), expect.anything());
    expect(result.current.turns[0]?.candidate?.changes.length).toBeGreaterThan(0);
  });

  it.each(["stop", "unmount"] as const)("does not send a model request when %s occurs during asset preview", async (action) => {
    let resolvePreview!: (value: typeof data[string]["execution"]) => void;
    const previewAsset = vi.fn(() => new Promise<typeof data[string]["execution"]>((resolve) => { resolvePreview = resolve; }));
    const schema = createBlankDashboard({ title: "空板" });
    const listAssets = vi.fn(async () => assets);
    const { result, unmount } = renderHook(() => useSmartDashboardChat({
      getSchema: () => schema, applySchema: vi.fn(), listAssets,
      previewAsset, initialAssetIds: ["asset-total"]
    }));
    await waitFor(() => expect(result.current.assets.length).toBeGreaterThan(0));
    act(() => { result.current.send("营收总览"); });
    await waitFor(() => expect(previewAsset).toHaveBeenCalledOnce());
    if (action === "stop") {
      act(() => result.current.stop());
      expect(result.current.busy).toBe(false);
      expect(result.current.turns[0]?.status).toBe("cancelled");
    } else unmount();
    await act(async () => { resolvePreview(data["asset-total"]!.execution); });
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("marks a streaming turn cancelled when stopped", async () => {
    streamMock.mockImplementation(() => new AbortController());
    const { result } = setup();

    await waitFor(() => expect(result.current.assets).toHaveLength(4));
    act(() => {
      result.current.send("营收总览");
    });
    await waitFor(() => expect(streamMock).toHaveBeenCalled());
    act(() => {
      result.current.stop();
    });

    expect(result.current.turns[0]?.status).toBe("cancelled");
    expect(result.current.busy).toBe(false);
  });
});

describe("buildLocalDesignSpec", () => {
  it("shapes a kpi-led or trend-led board from output shapes", () => {
    const local = buildLocalDesignSpec(createBlankDashboard({ title: "空板" }), data, "经营例会营收总览。");
    expect(local.title).toBe("经营例会营收总览");
    expect(local.archetype).toBe("trend-led");
    expect(local.widgets.map((widget) => widget.role)).toEqual(
      expect.arrayContaining(["kpi", "trend", "comparison", "composition"])
    );
    expect(local.widgets.length).toBeLessThanOrEqual(12);
    expect(local.themeId).toBe("ice-light");
    // 主图 + 侧轨：构图器靠这两个标记排出主从结构
    expect(local.widgets.filter((widget) => widget.emphasis === "hero")).toHaveLength(1);
    expect(local.widgets.some((widget) => widget.placement === "rail")).toBe(true);
  });

  it("一句指令式需求不当标题，改用资产主题；组件标题不再是整段资产描述", () => {
    const contractData = contractDesignData();
    const brief = "帮我设计个企业级的大屏";
    const local = buildLocalDesignSpec(createBlankDashboard({ title: "空板" }), contractData, brief);

    expect(local.title).not.toBe(brief);
    expect(local.title).toBe("合同主数据总览");
    expect(local.title.length).toBeLessThanOrEqual(16);
    for (const widget of local.widgets) {
      expect(widget.title!.length).toBeLessThanOrEqual(widget.role === "kpi" ? 12 : 16);
    }
    expect(local.widgets.filter((widget) => widget.role === "kpi").length).toBeLessThanOrEqual(4);
  });

  it("八十行合同明细只出指标卡与明细表，不硬画一条重复年度的折线", () => {
    const contractData = contractDesignData();
    const local = buildLocalDesignSpec(createBlankDashboard({ title: "空板" }), contractData, "合同总览");
    const contractWidgets = local.widgets.filter((widget) => widget.assetId === "asset-contract");

    expect(contractWidgets.map((widget) => widget.role).sort()).toEqual(["detail", "kpi"]);
    const kpi = contractWidgets.find((widget) => widget.role === "kpi")!;
    expect(kpi.metricKey).toBe("contractAmount");
    expect(kpi.valueMode).toBe("sum");
    expect(kpi.title).toBe("合同金额合计");
  });

  it("兜底方案落板后指标取得到数、图表画得出来", () => {
    const contractData = contractDesignData();
    const schema = createBlankDashboard({ title: "空板" });
    const local = buildLocalDesignSpec(schema, contractData, "帮我设计个企业级的大屏");
    const applied = applyDashboardDesignSpec(schema, local, contractData);

    expect(applied.rejected).toEqual([]);
    const metrics = applied.schema.widgets.filter((widget) => widget.type === "metric");
    expect(metrics.length).toBeGreaterThan(0);
    for (const widget of metrics) {
      expect(resolveDashboardMetric(widget, applied.schema.dataBindings[widget.bindingId!])).not.toBeNull();
    }
    const charts = applied.schema.widgets.filter((widget) => ["line", "bar", "pie"].includes(widget.type));
    expect(charts.length).toBeGreaterThan(0);
    for (const widget of charts) {
      expect(
        buildDashboardChartOption(widget, applied.schema.dataBindings[widget.bindingId!], { animation: false })
      ).not.toBeNull();
    }
  });
});

describe("buildLocalDesignSpec · 收藏里的多次查询", () => {
  it("每份收藏只用答案那张表，全 0 行的单值问题留一张暂无数据的指标卡", () => {
    const feedback = feedbackDesignData();
    const local = buildLocalDesignSpec(createBlankDashboard({ title: "空板" }), feedback, "经营总览");
    const widgetsOf = (assetId: string) => local.widgets.filter((widget) => widget.assetId === assetId);

    expect(new Set(widgetsOf("asset-sales").map((widget) => widget.outputKey))).toEqual(new Set(["output_003"]));
    expect(widgetsOf("asset-sales").find((widget) => widget.role === "kpi")?.metricKey).toBe("ProjectSign.signAmount");
    expect(widgetsOf("asset-must-sign").map((widget) => [widget.role, widget.outputKey])).toEqual([["kpi", "output_002"]]);
    expect(new Set(widgetsOf("asset-monthly-income").map((widget) => widget.outputKey))).toEqual(new Set(["output_002"]));
    expect(widgetsOf("asset-monthly-income").map((widget) => widget.role)).toContain("trend");

    const applied = applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), local, feedback);
    expect(applied.rejected).toEqual([]);
    const columnTitles = Object.values(applied.schema.dataBindings).flatMap((binding) =>
      binding.table.columns.map((column) => column.title)
    );
    expect(columnTitles.length).toBeGreaterThan(0);
    for (const title of columnTitles) expect(title).not.toMatch(/台账，|清单，|明细，/);
    expect(applied.schema.widgets.some((widget) => widget.subtitle?.includes("0 个周期"))).toBe(false);
  });
});

describe("buildLocalDesignSpec · 收藏带着回答原文", () => {
  it("答案是明细列合计时只出一张按列求和的指标卡；排行落在包含这几家公司的表上", () => {
    const detail = withAnswer(salesDetailAsset, SALES_ANSWER);
    const ranking = withAnswer(customerRankingAsset, RANKING_ANSWER);
    const answered: DashboardDesignAssetData = {
      [detail.id]: { asset: detail, execution: favoriteExecution(detail) },
      [ranking.id]: { asset: ranking, execution: favoriteExecution(ranking) }
    };
    const local = buildLocalDesignSpec(createBlankDashboard({ title: "空板" }), answered, "经营总览");
    const widgetsOf = (assetId: string) => local.widgets.filter((widget) => widget.assetId === assetId);

    expect(widgetsOf(detail.id).map((widget) => [widget.role, widget.outputKey, widget.metricKey, widget.valueMode])).toEqual([
      ["kpi", "output_002", "ProjectSign.signAmount", "sum"]
    ]);
    expect(new Set(widgetsOf(ranking.id).map((widget) => widget.outputKey))).toEqual(new Set(["output_001"]));

    const applied = applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), local, answered);
    expect(applied.rejected).toEqual([]);
    const kpi = applied.schema.widgets.find((widget) => widget.type === "metric")!;
    expect(resolveDashboardMetric(kpi, applied.schema.dataBindings[kpi.bindingId!])).toBe(1286.5);
  });
});

/** 指标卡落板后显示的数：新增的那张（排除 before 里已有的组件）。 */
function metricValueOf(schema: DashboardSchema, before = new Set<string>()) {
  const kpi = schema.widgets.find((widget) => widget.type === "metric" && !before.has(widget.id))!;
  return resolveDashboardMetric(kpi, schema.dataBindings[kpi.bindingId!]);
}

function kpiSpecOf(widgets: DashboardDesignSpecWidget[]): DashboardDesignSpec {
  return { narrative: "", title: "销售总览", themeId: "ice-light", archetype: "kpi-led", widgets };
}

describe("useSmartDashboardChat · 收藏带着回答原文", () => {
  const recheck = withAnswer(salesRecheckAsset, SALES_ANSWER);
  const recheckData: DashboardDesignAssetData = { [recheck.id]: { asset: recheck, execution: favoriteExecution(recheck) } };
  /** 模型挑对了表，却没写指标列和口径：引擎默认取第一张金额列，会显示合同金额 3520。 */
  const bareKpi: DashboardDesignSpecWidget = {
    ref: "sales",
    role: "kpi",
    assetId: recheck.id,
    outputKey: "output_001",
    title: "今年销售额"
  };

  function answeredSetup(schema: DashboardSchema, selected: string[]) {
    const applySchema = vi.fn(async () => undefined);
    const listAssets = vi.fn(async () => [recheck]);
    const previewAsset = vi.fn(async () => favoriteExecution(recheck));
    return renderHook(() => useSmartDashboardChat({
      getSchema: () => schema,
      applySchema,
      listAssets,
      previewAsset,
      initialAssetIds: selected
    }));
  }

  beforeEach(() => {
    streamMock.mockReset();
  });

  it("请求带上回答摘要与证据；模型漏写指标列时指标卡取回答引用的签约金额", async () => {
    expect(metricValueOf(applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), kpiSpecOf([bareKpi]), recheckData).schema))
      .toBe(3520);
    scriptStream([{ type: "spec", spec: kpiSpecOf([bareKpi]) }, { type: "done" }]);
    const { result } = answeredSetup(createBlankDashboard({ title: "空板" }), [recheck.id]);

    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    act(() => {
      result.current.send("做一块销售大屏");
    });
    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));

    const request = streamMock.mock.calls[0]![1];
    expect(request.assets[0]).toMatchObject({ answer: "善治今年的销售额为 1,286.5 万元（含税）。" });
    expect(request.assets[0]!.outputs[0]).toMatchObject({ outputKey: "output_001", answerMetricKey: "ProjectSign.signAmount" });
    const candidate = result.current.turns[0]!.candidate!;
    expect(candidate.rejected).toEqual([]);
    expect(metricValueOf(candidate.schema)).toBe(1286.5);
  });

  it("改版时 add_widget 新增的指标卡同样按回答补齐", async () => {
    const seeded = applyDashboardDesignSpec(
      createBlankDashboard({ title: "空板" }),
      kpiSpecOf([{ ref: "probe", role: "detail", assetId: recheck.id, outputKey: "output_002", title: "项目明细" }]),
      recheckData
    ).schema;
    const before = new Set(seeded.widgets.map((widget) => widget.id));
    scriptStream([{ type: "ops", ops: { narrative: "", ops: [{ op: "add_widget", widget: bareKpi }] } }, { type: "done" }]);
    const { result } = answeredSetup(seeded, []);

    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    act(() => {
      result.current.send("加一张今年销售额的指标卡");
    });
    await waitFor(() => expect(result.current.turns[0]?.status).toBe("ready"));

    expect(result.current.turns[0]?.kind).toBe("edit");
    const candidate = result.current.turns[0]!.candidate!;
    expect(candidate.rejected).toEqual([]);
    expect(metricValueOf(candidate.schema, before)).toBe(1286.5);
  });
});

describe("fillAnswerMetricDefaults", () => {
  function executionOf(asset: QueryAsset, outputs: QueryExecutionOutput[]): QueryExecution {
    return {
      id: `${asset.id}-preview`,
      assetId: asset.id,
      versionId: asset.stableVersionId,
      status: "SUCCESS",
      triggerType: "PREVIEW",
      durationMs: 0,
      createdAt: "2026-09-23T10:20:00.000Z",
      outputs
    };
  }

  /** 「善治今年的收入」只按月查了一次，回答的 1,317 万元是六个月的合计：时间序列默认取最新一期会显示 252。 */
  const monthly = favoriteOutput("output_001", [
    favoriteColumn("ProjectSign.signMonth", "签约月份", "time"),
    favoriteColumn("ProjectSign.signAmount", "签约金额（万元）", "number")
  ], [180, 240, 150, 300, 195, 252].map((amount, index) => ({
    "ProjectSign.signMonth": `2026-0${index + 1}`,
    "ProjectSign.signAmount": amount
  })));
  const legacy = favoriteAsset("asset-yearly-income", "善治今年的收入", [monthly]);
  const yearly = withAnswer(legacy, "善治今年的收入合计 **1,317 万元**。");
  const yearlyData: DashboardDesignAssetData = { [yearly.id]: { asset: yearly, execution: executionOf(yearly, [monthly]) } };
  const kpiOf = (overrides: Partial<DashboardDesignSpecWidget> = {}): DashboardDesignSpecWidget => ({
    ref: "income",
    role: "kpi",
    assetId: yearly.id,
    outputKey: "output_001",
    title: "今年收入",
    ...overrides
  });

  it("漏了指标列与口径时按回答补上那一列和合计口径", () => {
    expect(fillAnswerMetricDefaults(kpiOf(), yearlyData)).toEqual(
      kpiOf({ metricKey: "ProjectSign.signAmount", valueMode: "sum" })
    );
  });

  it("指标列就是回答那一列、只漏了口径时补 sum，落板后的数与回答一致", () => {
    const named = kpiOf({ metricKey: "ProjectSign.signAmount" });
    const blank = createBlankDashboard({ title: "空板" });

    expect(metricValueOf(applyDashboardDesignSpec(blank, kpiSpecOf([named]), yearlyData).schema)).toBe(252);
    const filled = fillAnswerMetricDefaults(named, yearlyData);
    expect(filled).toEqual({ ...named, valueMode: "sum" });
    expect(metricValueOf(applyDashboardDesignSpec(blank, kpiSpecOf([filled]), yearlyData).schema)).toBe(1317);
  });

  it("模型写明的口径、别的列、非指标卡与老收藏一律不动", () => {
    const explicit = kpiOf({ metricKey: "ProjectSign.signAmount", valueMode: "latest" });
    expect(fillAnswerMetricDefaults(explicit, yearlyData)).toBe(explicit);
    expect(fillAnswerMetricDefaults(kpiOf({ metricKeys: ["ProjectSign.other"] }), yearlyData))
      .toEqual(kpiOf({ metricKeys: ["ProjectSign.other"] }));
    const trend = kpiOf({ role: "trend" });
    expect(fillAnswerMetricDefaults(trend, yearlyData)).toBe(trend);
    const legacyData: DashboardDesignAssetData = { [legacy.id]: { asset: legacy, execution: executionOf(legacy, [monthly]) } };
    expect(fillAnswerMetricDefaults(kpiOf(), legacyData)).toEqual(kpiOf());
  });
});

describe("boundAssetIds", () => {
  it("collects query-asset ids from modules and bindings", () => {
    const seeded = applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), spec, data).schema;
    expect(boundAssetIds(seeded).sort()).toEqual(["asset-region", "asset-revenue", "asset-total"]);
  });
});
