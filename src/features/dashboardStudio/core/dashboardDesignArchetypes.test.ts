import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { standardDesignData } from "@/test/dashboardDesignFixtures";
import { dashboardDesignArchetypes, type DashboardDesignArchetype, type DashboardDesignSpec } from "@/types/dashboardDesign";
import type { DashboardSchema } from "@/types/dashboardStudio";
import { applyDashboardDesignSpec } from "./dashboardDesignApply";
import { composeDashboardWithArchetype, dashboardDesignArchetypeCatalog } from "./dashboardDesignArchetypes";

const spec: DashboardDesignSpec = {
  narrative: "",
  title: "经营总览",
  themeId: "ice-light",
  archetype: "kpi-led",
  widgets: [
    { ref: "k1", role: "kpi", assetId: "asset-revenue", outputKey: "monthly", metricKey: "revenue", title: "总营收" },
    { ref: "k2", role: "kpi", assetId: "asset-revenue", outputKey: "monthly", metricKey: "cost", title: "总成本" },
    { ref: "k3", role: "kpi", assetId: "asset-total", outputKey: "total", metricKey: "total", title: "订单总数" },
    { ref: "trend", role: "trend", assetId: "asset-revenue", outputKey: "monthly", dimensionKey: "month", metricKeys: ["revenue"], title: "营收趋势" },
    { ref: "bar", role: "comparison", assetId: "asset-region", outputKey: "region", dimensionKey: "region", metricKeys: ["sales"], title: "区域排行" },
    { ref: "pie", role: "composition", assetId: "asset-region", outputKey: "region", dimensionKey: "region", metricKeys: ["sales"], title: "区域占比" },
    { ref: "table", role: "detail", assetId: "asset-region", outputKey: "region", title: "区域明细" },
    { ref: "note", role: "narrative", title: "经营总览", content: "经营总览" }
  ]
};

function board(archetype: DashboardDesignArchetype) {
  return applyDashboardDesignSpec(createBlankDashboard(), { ...spec, archetype }, standardDesignData()).schema;
}

function pick(schema: DashboardSchema, title: string) {
  const widget = schema.widgets.find((item) => item.title === title);
  if (!widget) throw new Error(`板上没有「${title}」`);
  return widget.position;
}

function isHero(schema: DashboardSchema, title: string) {
  return pick(schema, title).w >= (schema.canvas.width * 2) / 3;
}

describe("dashboardDesignArchetypeCatalog", () => {
  it("四档原型与契约枚举一一对应，且各有中文名与描述", () => {
    expect(dashboardDesignArchetypeCatalog.map((item) => item.id)).toEqual([...dashboardDesignArchetypes]);
    for (const item of dashboardDesignArchetypeCatalog) {
      expect(item.title.length).toBeGreaterThan(1);
      expect(item.description.length).toBeGreaterThan(8);
    }
  });
});

describe("composeDashboardWithArchetype", () => {
  it("指标总览不设主图，三张图等宽切成一行", () => {
    const schema = board("kpi-led");
    const charts = ["营收趋势", "区域排行", "区域占比"].map((title) => pick(schema, title));

    for (const chart of charts) expect(chart.w).toBeLessThan((schema.canvas.width * 2) / 3);
    // 求解器把余量按 8px 撒到列上，同行等宽卡最多差一个格
    const widths = charts.map((chart) => chart.w);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(16);
    expect(new Set(charts.map((chart) => chart.y)).size).toBe(1);
  });

  it("趋势主导把趋势图放大成通栏主图", () => {
    const schema = board("trend-led");
    expect(isHero(schema, "营收趋势")).toBe(true);
    expect(isHero(schema, "区域排行")).toBe(false);
    expect(pick(schema, "区域排行").y).toBeGreaterThanOrEqual(pick(schema, "营收趋势").y + pick(schema, "营收趋势").h);
  });

  it("对比矩阵两张一行、等高对齐，奇数的最后一张加宽", () => {
    const schema = board("comparison-grid");
    const charts = ["营收趋势", "区域排行", "区域占比"].map((title) => pick(schema, title));
    const top = Math.min(...charts.map((chart) => chart.y));
    const firstRow = charts.filter((chart) => chart.y === top);
    const [odd] = charts.filter((chart) => chart.y !== top);

    expect(firstRow).toHaveLength(2);
    expect(firstRow[0]!.h).toBe(firstRow[1]!.h);
    expect(Math.abs(firstRow[0]!.w - firstRow[1]!.w)).toBeLessThanOrEqual(16);
    for (const chart of firstRow) expect(chart.w).toBeLessThan((schema.canvas.width * 2) / 3);
    expect(odd!.y).toBeGreaterThanOrEqual(top + firstRow[0]!.h);
    expect(odd!.w).toBeGreaterThan(Math.max(firstRow[0]!.w, firstRow[1]!.w));
  });

  it("排行明细让柱状图当主图、明细表加高", () => {
    const schema = board("ranking-detail");
    expect(isHero(schema, "区域排行")).toBe(true);
    expect(isHero(schema, "营收趋势")).toBe(false);
    expect(pick(schema, "区域明细").h).toBeGreaterThanOrEqual(400);
    expect(pick(board("kpi-led"), "区域明细").h).toBeLessThan(pick(schema, "区域明细").h);
  });

  it("显式点名的主图优先于原型规则，侧轨贴着主图右侧站", () => {
    const base = board("kpi-led");
    const pieId = base.widgets.find((widget) => widget.title === "区域占比")!.id;
    const barId = base.widgets.find((widget) => widget.title === "区域排行")!.id;

    const composed = composeDashboardWithArchetype(base, "kpi-led", { heroWidgetId: pieId, railWidgetIds: [barId] });
    const hero = pick(composed, "区域占比");
    const rail = pick(composed, "区域排行");

    expect(hero.w).toBeGreaterThan(rail.w);
    expect(rail.x).toBeGreaterThanOrEqual(hero.x + hero.w);
    expect(rail.y + rail.h).toBe(hero.y + hero.h);
  });

  it("逐组件的宽度意图只改被点名的那一张", () => {
    const base = board("kpi-led");
    const barId = base.widgets.find((widget) => widget.title === "区域排行")!.id;

    const composed = composeDashboardWithArchetype(base, "kpi-led", { emphasisById: { [barId]: "wide" } });

    expect(pick(composed, "区域排行").w).toBeGreaterThan(pick(composed, "营收趋势").w);
    expect(Math.abs(pick(composed, "营收趋势").w - pick(composed, "区域占比").w)).toBeLessThanOrEqual(16);
  });

  it("锁定组件原位不动，其余组件避让", () => {
    const base = board("kpi-led");
    const locked = base.widgets.find((widget) => widget.title === "区域占比")!;
    locked.style.locked = true;
    const anchor = { ...locked.position };

    const composed = composeDashboardWithArchetype(base, "trend-led");

    expect(pick(composed, "区域占比")).toEqual(anchor);
    for (const widget of composed.widgets) {
      if (widget.id === locked.id) continue;
      const overlaps = widget.position.x < anchor.x + anchor.w && widget.position.x + widget.position.w > anchor.x
        && widget.position.y < anchor.y + anchor.h && widget.position.y + widget.position.h > anchor.y;
      expect(overlaps).toBe(false);
    }
  });
});
