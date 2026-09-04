import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDashboardDesignSpec } from "@/features/dashboardStudio/core/dashboardDesignApply";
import {
  buildDashboardChartOption,
  resolveDashboardMetric
} from "@/features/dashboardStudio/core/dashboardWidgetData";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { streamDashboardDesign } from "@/services/dashboardDesignService";
import { contractDesignData, standardDesignData } from "@/test/dashboardDesignFixtures";
import type { DashboardDesignSpec, DashboardDesignStreamEvent } from "@/types/dashboardDesign";
import type { DashboardSchema } from "@/types/dashboardStudio";
import { boundAssetIds, buildLocalDesignSpec, useSmartDashboardChat } from "./useSmartDashboardChat";

vi.mock("@/services/dashboardDesignService", () => ({
  streamDashboardDesign: vi.fn()
}));

const streamMock = vi.mocked(streamDashboardDesign);
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

describe("boundAssetIds", () => {
  it("collects query-asset ids from modules and bindings", () => {
    const seeded = applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), spec, data).schema;
    expect(boundAssetIds(seeded).sort()).toEqual(["asset-region", "asset-revenue", "asset-total"]);
  });
});
