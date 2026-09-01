import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardDataBinding, DashboardSchema, DashboardWidget, DashboardWidgetType } from "@/types/dashboardStudio";
import {
  balancedRowSizes,
  composeAndBeautifyDashboard,
  composeDashboardLayout,
  composeDashboardLayoutPlan,
  fitDashboardCanvasHeight,
  kpiRowSizes
} from "./dashboardCompose";
import { getDashboardBoardTheme } from "./dashboardBoardThemes";

function widget(id: string, type: DashboardWidgetType, overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id,
    type,
    title: id,
    mapping: {},
    position: { x: 0, y: 0, w: 360, h: 240 },
    style: {},
    ...overrides
  };
}

function boardOf(widgets: DashboardWidget[], bindings: Record<string, DashboardDataBinding> = {}): DashboardSchema {
  const schema = createBlankDashboard();
  schema.widgets = widgets;
  schema.dataBindings = bindings;
  return schema;
}

function binding(id: string, rows: number): DashboardDataBinding {
  return {
    id,
    label: id,
    mode: "snapshot",
    table: { columns: [], rows: Array.from({ length: rows }, () => ({})), totalRows: rows }
  };
}

function positionOf(schema: DashboardSchema, id: string) {
  return schema.widgets.find((item) => item.id === id)!.position;
}

function overlaps(left: DashboardWidget, right: DashboardWidget) {
  return left.position.x < right.position.x + right.position.w
    && left.position.x + left.position.w > right.position.x
    && left.position.y < right.position.y + right.position.h
    && left.position.y + left.position.h > right.position.y;
}

function expectNoOverlap(schema: DashboardSchema) {
  for (let index = 0; index < schema.widgets.length; index += 1) {
    for (let other = index + 1; other < schema.widgets.length; other += 1) {
      expect(overlaps(schema.widgets[index]!, schema.widgets[other]!)).toBe(false);
    }
  }
}

describe("balancedRowSizes", () => {
  it("never leaves a single card stranded next to a full row", () => {
    expect(balancedRowSizes(0)).toEqual([]);
    expect(balancedRowSizes(1)).toEqual([1]);
    expect(balancedRowSizes(2)).toEqual([2]);
    expect(balancedRowSizes(3)).toEqual([3]);
    expect(balancedRowSizes(4)).toEqual([2, 2]);
    expect(balancedRowSizes(5)).toEqual([3, 2]);
    expect(balancedRowSizes(6)).toEqual([3, 3]);
    expect(balancedRowSizes(7)).toEqual([3, 2, 2]);
    expect(balancedRowSizes(9)).toEqual([3, 3, 3]);
    for (let count = 1; count <= 24; count += 1) {
      const sizes = balancedRowSizes(count);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(count);
      if (count > 1) expect(sizes).not.toContain(1);
    }
  });
});

describe("kpiRowSizes", () => {
  it("splits an overflowing KPI band evenly instead of stranding the last card", () => {
    expect(kpiRowSizes(0)).toEqual([]);
    expect(kpiRowSizes(4)).toEqual([4]);
    expect(kpiRowSizes(5)).toEqual([3, 2]);
    expect(kpiRowSizes(6)).toEqual([3, 3]);
    expect(kpiRowSizes(7)).toEqual([4, 3]);
    expect(kpiRowSizes(9)).toEqual([3, 3, 3]);
    expect(kpiRowSizes(11)).toEqual([4, 4, 3]);
    for (let count = 1; count <= 24; count += 1) {
      const sizes = kpiRowSizes(count);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(count);
      if (count > 4) expect(sizes.slice(0, -1).every((size) => size >= 3)).toBe(true);
    }
  });

  it("keeps every full KPI row edge to edge", () => {
    const next = composeDashboardLayout(
      boardOf(["k1", "k2", "k3", "k4", "k5"].map((id) => widget(id, "metric")))
    );
    const cards = ["k1", "k2", "k3", "k4", "k5"].map((id) => positionOf(next, id));
    const firstRow = cards.filter((card) => card.y === cards[0]!.y);
    const secondRow = cards.filter((card) => card.y !== cards[0]!.y);

    expect(firstRow).toHaveLength(3);
    expect(secondRow).toHaveLength(2);
    expect(firstRow[2]!.x + firstRow[2]!.w).toBe(next.canvas.width - 32);
    expect(secondRow[0]!.x).toBe(32);
    expectNoOverlap(next);
  });
});

describe("composeDashboardLayoutPlan", () => {
  it("lays a KPI-only board out as one even summary band", () => {
    const next = composeDashboardLayout(
      boardOf(["k1", "k2", "k3", "k4"].map((id) => widget(id, "metric")))
    );
    const cards = next.widgets.map((item) => item.position);

    expect(composeDashboardLayoutPlan(next).intents.every((intent) => intent.section === "summary")).toBe(true);
    for (const card of cards) {
      expect(card.y).toBe(cards[0]!.y);
      expect(card.h).toBe(cards[0]!.h);
      // 8px 网格上无法做到绝对等宽，但同一行的差距不得超过一格
      expect(Math.abs(card.w - cards[0]!.w)).toBeLessThanOrEqual(8);
    }
    expect(cards[0]!.x).toBe(32);
    expect(cards[3]!.x + cards[3]!.w).toBe(next.canvas.width - 32);
    expectNoOverlap(next);
  });

  it("gives a lone chart the whole board instead of leaving it in a corner", () => {
    const next = composeDashboardLayout(boardOf([widget("solo", "bar")]));
    const solo = positionOf(next, "solo");

    expect(composeDashboardLayoutPlan(next).intents[0]!.emphasis).toBe("hero");
    expect(solo.x).toBe(32);
    expect(solo.y).toBe(32);
    expect(solo.w).toBe(next.canvas.width - 64);
    expect(solo.h).toBeGreaterThanOrEqual(416);
  });

  it("splits two equal charts down the middle rather than faking a lopsided hero", () => {
    const next = composeDashboardLayout(boardOf([widget("left", "bar"), widget("right", "bar")]));
    const left = positionOf(next, "left");
    const right = positionOf(next, "right");

    expect(composeDashboardLayoutPlan(next).intents.some((intent) => intent.emphasis === "hero")).toBe(false);
    expect(left.y).toBe(right.y);
    expect(left.h).toBe(right.h);
    expect(Math.abs(left.w - right.w)).toBeLessThanOrEqual(8);
    expect(right.x + right.w).toBe(next.canvas.width - 32);
  });

  it("builds the canonical band stack: title, KPI, hero with rails, detail table", () => {
    const schema = boardOf([
      widget("title", "text", { position: { x: 0, y: 0, w: 360, h: 120 } }),
      widget("k1", "metric"),
      widget("k2", "metric"),
      widget("trend", "line"),
      widget("share", "pie"),
      widget("profile", "radar"),
      widget("queue", "table")
    ]);
    const plan = composeDashboardLayoutPlan(schema);
    const sectionOf = (id: string) => plan.intents.find((intent) => intent.widgetId === id)!;
    const next = composeDashboardLayout(schema);

    expect(sectionOf("title").section).toBe("banner");
    expect(sectionOf("k1").section).toBe("summary");
    expect(sectionOf("trend")).toMatchObject({ section: "main", emphasis: "hero" });
    expect(sectionOf("share")).toMatchObject({ placement: "rail" });
    expect(sectionOf("profile")).toMatchObject({ placement: "rail" });
    expect(sectionOf("queue")).toMatchObject({ section: "detail", emphasis: "wide" });

    const title = positionOf(next, "title");
    const kpi = positionOf(next, "k1");
    const hero = positionOf(next, "trend");
    const share = positionOf(next, "share");
    const profile = positionOf(next, "profile");
    const table = positionOf(next, "queue");

    // 纵向节奏：标题条 → KPI → 主体 → 明细
    expect(title.y).toBeLessThan(kpi.y);
    expect(kpi.y).toBeLessThan(hero.y);
    expect(hero.y).toBeLessThan(table.y);
    // 标题条与表格都通栏，标题条按自身高度收敛而不是被撑成图表档位
    expect(title.w).toBe(next.canvas.width - 64);
    expect(title.h).toBe(120);
    expect(table.w).toBe(next.canvas.width - 64);
    // 紧凑图进侧轨：贴在 hero 右侧竖排，底缘与 hero 对齐
    expect(share.x).toBe(hero.x + hero.w + 24);
    expect(profile.x).toBe(share.x);
    expect(share.y).toBe(hero.y);
    expect(profile.y + profile.h).toBe(hero.y + hero.h);
    expect(hero.w).toBeGreaterThan(share.w);
    expectNoOverlap(next);
  });

  it("falls back to a full-width hero plus a balanced row when rails would strand a card", () => {
    const plan = composeDashboardLayoutPlan(
      boardOf([widget("trend", "line"), widget("share", "pie"), widget("split", "bar")])
    );
    const intentOf = (id: string) => plan.intents.find((intent) => intent.widgetId === id)!;

    expect(intentOf("trend").emphasis).toBe("hero");
    expect(plan.intents.some((intent) => intent.placement === "rail")).toBe(false);
    expect(intentOf("share").emphasis).toBe("normal");
    expect(intentOf("split").emphasis).toBe("normal");
  });

  it("picks the hero by chart kind first and data richness second", () => {
    const rich = widget("rich", "bar", { bindingId: "rich-binding", mapping: { metricKeys: ["a", "b"] } });
    const plan = composeDashboardLayoutPlan(
      boardOf([widget("thin", "bar"), rich, widget("other", "bar")], { "rich-binding": binding("rich-binding", 30) })
    );

    expect(plan.intents.find((intent) => intent.emphasis === "hero")?.widgetId).toBe("rich");

    // 数据再多的饼图也抢不走趋势图的 hero
    const overPie = widget("pie", "pie", { bindingId: "rich-binding" });
    const trendPlan = composeDashboardLayoutPlan(
      boardOf([overPie, widget("trend", "line"), widget("extra", "bar")], { "rich-binding": binding("rich-binding", 60) })
    );
    expect(trendPlan.intents.find((intent) => intent.emphasis === "hero")?.widgetId).toBe("trend");
  });

  it("keeps widgets from the same module in one uninterrupted block", () => {
    const next = composeDashboardLayout(
      boardOf([
        widget("a1", "bar", { moduleId: "mod-a" }),
        widget("b1", "bar", { moduleId: "mod-b" }),
        widget("a2", "bar", { moduleId: "mod-a" }),
        widget("b2", "bar", { moduleId: "mod-b" })
      ])
    );
    const ordered = [...next.widgets].sort(
      (left, right) => left.position.y - right.position.y || left.position.x - right.position.x
    );
    const modules = ordered.map((item) => item.moduleId);

    expect(modules.indexOf("mod-a")).toBe(modules.lastIndexOf("mod-a") - 1);
    expect(modules.indexOf("mod-b")).toBe(modules.lastIndexOf("mod-b") - 1);
    expectNoOverlap(next);
  });

  it("routes trailing text to the footnote band and leaves locked widgets where they are", () => {
    const locked = widget("pinned", "bar", {
      position: { x: 1200, y: 24, w: 360, h: 240 },
      style: { locked: true }
    });
    const schema = boardOf([widget("chart", "bar"), widget("note", "text"), locked]);
    const plan = composeDashboardLayoutPlan(schema);
    const next = composeDashboardLayout(schema);

    expect(plan.intents.find((intent) => intent.widgetId === "note")!.section).toBe("footnote");
    expect(plan.intents).toHaveLength(3);
    expect(positionOf(next, "pinned")).toEqual({ x: 1200, y: 24, w: 360, h: 240 });
    expect(positionOf(next, "note").y).toBeGreaterThan(positionOf(next, "chart").y);
    expectNoOverlap(next);
  });

  it("balances leftover charts into rows of three and two", () => {
    const plan = composeDashboardLayoutPlan(
      boardOf(["hero", "c1", "c2", "c3", "c4"].map((id) => widget(id, "bar")))
    );
    const emphases = plan.intents.map((intent) => intent.emphasis);

    // hero + 剩下四张切成 2+2，而不是 3+1
    expect(emphases).toEqual(["hero", "normal", "normal", "normal", "normal"]);
  });
});

describe("fitDashboardCanvasHeight", () => {
  it("shrinks a stale canvas back onto its content but never below 16:9", () => {
    const schema = boardOf([widget("solo", "bar")]);
    schema.canvas.height = 3200;
    const next = composeDashboardLayout(schema);

    expect(next.canvas.height).toBe(1080);
    expect(next.canvas.rows).toBe(12);
  });

  it("grows to the content bottom plus the canvas padding", () => {
    const schema = boardOf([widget("solo", "bar", { position: { x: 40, y: 40, w: 400, h: 400 } })]);
    schema.widgets[0]!.position = { x: 40, y: 1400, w: 400, h: 400 };
    const next = fitDashboardCanvasHeight(schema);

    expect(next.canvas.height).toBe(1832);
  });
});

describe("composeAndBeautifyDashboard", () => {
  it("applies the board theme and the composition in one pass", () => {
    const theme = getDashboardBoardTheme("command-dark");
    const schema = boardOf([widget("k1", "metric"), widget("trend", "line"), widget("queue", "table")]);
    const next = composeAndBeautifyDashboard(schema, "command-dark");

    expect(next.canvas.background).toBe(theme.canvasBackground);
    expect(next.theme?.name).toBe(theme.title);
    for (const item of next.widgets) {
      expect(item.style.background).toBe(theme.surface.background);
      expect(item.style.borderRadius).toBe(theme.surface.borderRadius);
    }
    expect(positionOf(next, "k1").y).toBeLessThan(positionOf(next, "trend").y);
    expect(positionOf(next, "trend").y).toBeLessThan(positionOf(next, "queue").y);
    expectNoOverlap(next);
  });

  it("defaults to the light enterprise preset", () => {
    const next = composeAndBeautifyDashboard(boardOf([widget("trend", "line")]));

    expect(next.theme?.name).toBe("星数冰蓝");
    expect(next.canvas.background).toBe("#EFF4FB");
  });
});
