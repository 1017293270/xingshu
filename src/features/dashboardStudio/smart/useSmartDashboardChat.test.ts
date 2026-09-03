import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDashboardDesignSpec } from "@/features/dashboardStudio/core/dashboardDesignApply";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { streamDashboardDesign } from "@/services/dashboardDesignService";
import { standardDesignData } from "@/test/dashboardDesignFixtures";
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
    expect(turn.narrative).toContain("本地规则");
    expect(turn.candidate?.schema.widgets.length).toBeGreaterThan(1);
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
  });
});

describe("boundAssetIds", () => {
  it("collects query-asset ids from modules and bindings", () => {
    const seeded = applyDashboardDesignSpec(createBlankDashboard({ title: "空板" }), spec, data).schema;
    expect(boundAssetIds(seeded).sort()).toEqual(["asset-region", "asset-revenue", "asset-total"]);
  });
});
