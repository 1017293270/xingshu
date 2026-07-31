import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardWidget } from "@/types/dashboardStudio";
import { createLayoutRequest, solveDashboardLayout } from "./dashboardLayoutSolver";

function widget(id: string, x: number, y: number, locked = false, type?: DashboardWidget["type"]): DashboardWidget {
  return {
    id,
    type: type ?? (id === "metric" ? "metric" : "bar"),
    title: `敏感业务标题-${id}`,
    mapping: {},
    position: { x, y, w: 360, h: 240 },
    style: { locked }
  };
}

function overlaps(left: DashboardWidget, right: DashboardWidget) {
  return left.position.x < right.position.x + right.position.w
    && left.position.x + left.position.w > right.position.x
    && left.position.y < right.position.y + right.position.h
    && left.position.y + left.position.h > right.position.y;
}

describe("dashboardLayoutSolver", () => {
  it("only sends structural metadata to the layout model", () => {
    const schema = createBlankDashboard({ title: "不可发送的看板名称" });
    schema.widgets = [widget("metric", 40, 40)];
    schema.source.question = "不可发送的完整问题";

    const serialized = JSON.stringify(createLayoutRequest(schema));

    expect(serialized).not.toContain("不可发送的看板名称");
    expect(serialized).not.toContain("不可发送的完整问题");
    expect(serialized).not.toContain("敏感业务标题");
    expect(serialized).toContain('"semanticRole":"kpi"');
  });

  it("keeps locked widgets fixed and produces an in-bounds non-overlapping layout", () => {
    const schema = createBlankDashboard();
    schema.canvas.width = 1200;
    schema.widgets = [widget("locked", 24, 24, true), widget("first", 24, 24), widget("second", 24, 24)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "first", section: "main", rank: 0, emphasis: "wide" },
      { widgetId: "second", section: "main", rank: 1, emphasis: "normal" },
      { widgetId: "locked", section: "main", rank: 2, emphasis: "hero" }
    ]);

    expect(next.widgets.find((item) => item.id === "locked")?.position).toEqual({ x: 24, y: 24, w: 360, h: 240 });
    for (let index = 0; index < next.widgets.length; index += 1) {
      const current = next.widgets[index]!;
      expect(current.position.x).toBeGreaterThanOrEqual(0);
      expect(current.position.x + current.position.w).toBeLessThanOrEqual(next.canvas.width);
      expect(current.position.y + current.position.h).toBeLessThanOrEqual(next.canvas.height);
      for (let other = index + 1; other < next.widgets.length; other += 1) {
        expect(overlaps(current, next.widgets[other]!)).toBe(false);
      }
    }
  });

  it("aligns widgets to shared columns and the 8px grid", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("a", 300, 500), widget("b", 20, 700), widget("c", 900, 100), widget("d", 40, 30)];
    const intents = schema.widgets.map((item, rank) => ({
      widgetId: item.id, section: "main", rank, emphasis: "normal" as const
    }));

    const next = solveDashboardLayout(schema, intents);
    const [a, b, c, d] = next.widgets.map((item) => item.position);

    expect(a.x).toBe(c.x);
    expect(b.x).toBe(d.x);
    expect(a.y).toBe(b.y);
    expect(c.y).toBe(d.y);
    for (const position of [a, b, c, d]) {
      expect(position.x % 8).toBe(0);
      expect(position.y % 8).toBe(0);
      expect(position.w % 8).toBe(0);
      expect(position.h % 8).toBe(0);
    }
  });

  it("stretches a partial row to the canvas right edge", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("solo", 400, 300)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "solo", section: "main", rank: 0, emphasis: "normal" }
    ]);
    const solo = next.widgets[0]!.position;

    // 默认画布 1920：外边距 32
    expect(solo.x).toBe(32);
    expect(solo.x + solo.w).toBe(next.canvas.width - 32);
  });

  it("does not stretch a row into a locked widget", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("locked", 1000, 24, true), widget("solo", 40, 40)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "solo", section: "main", rank: 0, emphasis: "normal" },
      { widgetId: "locked", section: "main", rank: 1, emphasis: "wide" }
    ]);
    const solo = next.widgets.find((item) => item.id === "solo")!.position;
    const contentWidth = next.canvas.width - 64;

    expect(solo.y).toBe(32);
    expect(solo.w).toBeLessThan(contentWidth);
    expect(solo.x + solo.w).toBeLessThanOrEqual(1000);
  });

  it("orders sections vertically with wider gaps between bands", () => {
    const schema = createBlankDashboard();
    schema.widgets = [
      widget("table", 500, 500, false, "table"),
      widget("chart", 100, 100),
      widget("kpi", 40, 40, false, "metric")
    ];

    const next = solveDashboardLayout(schema, [
      { widgetId: "table", section: "detail", rank: 0, emphasis: "wide" },
      { widgetId: "chart", section: "main", rank: 1, emphasis: "normal" },
      { widgetId: "kpi", section: "summary", rank: 2, emphasis: "compact" }
    ]);
    const positionOf = (id: string) => next.widgets.find((item) => item.id === id)!.position;
    const kpi = positionOf("kpi");
    const chart = positionOf("chart");
    const table = positionOf("table");

    expect(kpi.y).toBeLessThan(chart.y);
    expect(chart.y).toBeLessThan(table.y);
    // 默认画布 1920：分区带间距 40，大于带内行距 24
    expect(chart.y - (kpi.y + kpi.h)).toBe(40);
    expect(table.y - (chart.y + chart.h)).toBe(40);
  });

  it("unifies heights within the same row so bottom edges align", () => {
    const schema = createBlankDashboard();
    const tall = widget("tall", 0, 0);
    tall.position.h = 320;
    schema.widgets = [widget("short", 0, 0), tall];

    const next = solveDashboardLayout(schema, [
      { widgetId: "short", section: "main", rank: 0, emphasis: "normal" },
      { widgetId: "tall", section: "main", rank: 1, emphasis: "normal" }
    ]);
    const short = next.widgets.find((item) => item.id === "short")!.position;
    const tallNext = next.widgets.find((item) => item.id === "tall")!.position;

    expect(short.y).toBe(tallNext.y);
    expect(short.h).toBe(320);
    expect(short.h).toBe(tallNext.h);
  });

  it("caps metric cards at a third of the row instead of stretching them wide", () => {
    const schema = createBlankDashboard();
    schema.canvas.width = 1440;
    schema.widgets = [widget("m1", 0, 0, false, "metric"), widget("m2", 0, 0, false, "metric")];

    const next = solveDashboardLayout(schema, [
      { widgetId: "m1", section: "summary", rank: 0, emphasis: "compact" },
      { widgetId: "m2", section: "summary", rank: 1, emphasis: "compact" }
    ]);
    const m1 = next.widgets.find((item) => item.id === "m1")!.position;
    const m2 = next.widgets.find((item) => item.id === "m2")!.position;

    expect(m1.w).toBe(m2.w);
    expect(m1.h).toBe(m2.h);
    expect(m2.x + m2.w).toBeLessThan(next.canvas.width - 24);
  });

  it("stretches three metric cards to fill the row evenly", () => {
    const schema = createBlankDashboard();
    schema.canvas.width = 1440;
    schema.widgets = [
      widget("m1", 0, 0, false, "metric"),
      widget("m2", 0, 0, false, "metric"),
      widget("m3", 0, 0, false, "metric")
    ];

    const next = solveDashboardLayout(schema, [
      { widgetId: "m1", section: "summary", rank: 0, emphasis: "compact" },
      { widgetId: "m2", section: "summary", rank: 1, emphasis: "compact" },
      { widgetId: "m3", section: "summary", rank: 2, emphasis: "compact" }
    ]);
    const positions = next.widgets.map((item) => item.position);

    expect(positions[1]!.x - positions[0]!.x).toBe(positions[2]!.x - positions[1]!.x);
    expect(positions[2]!.x + positions[2]!.w).toBe(next.canvas.width - 24);
  });

  it("gives wide emphasis two thirds of the row and grows the narrow companion first", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("hero", 0, 0), widget("rail", 0, 0)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "hero", section: "main", rank: 0, emphasis: "wide" },
      { widgetId: "rail", section: "main", rank: 1, emphasis: "compact" }
    ]);
    const contentWidth = next.canvas.width - 64;
    const hero = next.widgets.find((item) => item.id === "hero")!.position;
    const rail = next.widgets.find((item) => item.id === "rail")!.position;

    expect(hero.w).toBeGreaterThan(contentWidth * 0.6);
    expect(hero.w).toBeLessThan(contentWidth * 0.75);
    expect(hero.w).toBeGreaterThan(rail.w);
    expect(rail.x + rail.w).toBe(next.canvas.width - 32);
  });

  it("composes a hero band with two stacked rails aligned to its bottom edge", () => {
    const schema = createBlankDashboard();
    schema.widgets = [
      widget("hero", 0, 0),
      widget("railA", 0, 0),
      widget("railB", 0, 0),
      widget("table", 0, 0, false, "table")
    ];

    const next = solveDashboardLayout(schema, [
      { widgetId: "hero", section: "main", rank: 0, emphasis: "hero" },
      { widgetId: "railA", section: "main", rank: 1, emphasis: "compact", placement: "rail" },
      { widgetId: "railB", section: "main", rank: 2, emphasis: "compact", placement: "rail" },
      { widgetId: "table", section: "detail", rank: 3, emphasis: "wide" }
    ]);
    const positionOf = (id: string) => next.widgets.find((item) => item.id === id)!.position;
    const hero = positionOf("hero");
    const railA = positionOf("railA");
    const railB = positionOf("railB");
    const table = positionOf("table");

    // 侧轨在 hero 右侧，顶对齐、底缘严格对齐
    expect(railA.x).toBe(hero.x + hero.w + 24);
    expect(railB.x).toBe(railA.x);
    expect(railA.y).toBe(hero.y);
    expect(railB.y + railB.h).toBe(hero.y + hero.h);
    // 两张侧轨高度之和 + 行距 = hero 高度
    expect(railA.h + railB.h + 24).toBe(hero.h);
    expect(railA.h % 8).toBe(0);
    expect(railB.h % 8).toBe(0);
    // hero 带之后才是明细区，带间留白 40
    expect(table.y - (hero.y + hero.h)).toBe(40);
    for (const current of next.widgets) {
      for (const other of next.widgets) {
        if (current !== other) expect(overlaps(current, other)).toBe(false);
      }
    }
  });

  it("spans a hero across the full row when no rail follows", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("hero", 0, 0), widget("chart", 0, 0)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "hero", section: "main", rank: 0, emphasis: "hero" },
      { widgetId: "chart", section: "main", rank: 1, emphasis: "normal" }
    ]);
    const hero = next.widgets.find((item) => item.id === "hero")!.position;
    const chart = next.widgets.find((item) => item.id === "chart")!.position;

    expect(hero.w).toBe(next.canvas.width - 64);
    expect(chart.y).toBeGreaterThan(hero.y);
    expect(overlaps(next.widgets[0]!, next.widgets[1]!)).toBe(false);
  });

  it("keeps widgets from the same module adjacent", () => {
    const schema = createBlankDashboard();
    const first = widget("first", 0, 0);
    first.moduleId = "mod-1";
    const middle = widget("middle", 0, 0);
    middle.moduleId = "mod-2";
    const sibling = widget("sibling", 0, 0);
    sibling.moduleId = "mod-1";
    schema.widgets = [first, middle, sibling];

    const next = solveDashboardLayout(schema, [
      { widgetId: "first", section: "main", rank: 0, emphasis: "normal" },
      { widgetId: "middle", section: "main", rank: 1, emphasis: "normal" },
      { widgetId: "sibling", section: "main", rank: 2, emphasis: "normal" }
    ]);
    const positionOf = (id: string) => next.widgets.find((item) => item.id === id)!.position;
    const firstPos = positionOf("first");
    const siblingPos = positionOf("sibling");
    const middlePos = positionOf("middle");

    // mod-1 的两个组件聚类到同一行，mod-2 的组件被挤到下一行
    expect(siblingPos.y).toBe(firstPos.y);
    expect(siblingPos.x).toBeGreaterThan(firstPos.x);
    expect(middlePos.y).toBeGreaterThan(firstPos.y);
  });

  it("honors explicit height tiers instead of unifying them away", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("slim", 0, 0), widget("tall", 0, 0)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "slim", section: "main", rank: 0, emphasis: "normal", heightTier: "slim" },
      { widgetId: "tall", section: "main", rank: 1, emphasis: "normal", heightTier: "tall" }
    ]);
    const slim = next.widgets.find((item) => item.id === "slim")!.position;
    const tall = next.widgets.find((item) => item.id === "tall")!.position;

    expect(slim.y).toBe(tall.y);
    expect(slim.h).toBe(216);
    expect(tall.h).toBe(416);
  });

  it("scales outer spacing with canvas width", () => {
    const wide = createBlankDashboard();
    wide.widgets = [widget("solo", 0, 0)];
    const wideSolo = solveDashboardLayout(wide, [
      { widgetId: "solo", section: "main", rank: 0, emphasis: "normal" }
    ]).widgets[0]!.position;

    const narrow = createBlankDashboard();
    narrow.canvas.width = 1440;
    narrow.widgets = [widget("solo", 0, 0)];
    const narrowSolo = solveDashboardLayout(narrow, [
      { widgetId: "solo", section: "main", rank: 0, emphasis: "normal" }
    ]).widgets[0]!.position;

    expect(wideSolo.x).toBe(32);
    expect(narrowSolo.x).toBe(24);
  });
});
