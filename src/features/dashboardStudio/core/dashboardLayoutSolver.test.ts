import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardWidget } from "@/types/dashboardStudio";
import { createLayoutRequest, solveDashboardLayout } from "./dashboardLayoutSolver";

function widget(id: string, x: number, y: number, locked = false): DashboardWidget {
  return {
    id,
    type: id === "metric" ? "metric" : "bar",
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

    expect(solo.x).toBe(24);
    expect(solo.x + solo.w).toBeGreaterThanOrEqual(next.canvas.width - 24 - 8);
    expect(solo.x + solo.w).toBeLessThanOrEqual(next.canvas.width);
  });

  it("does not stretch a row into a locked widget", () => {
    const schema = createBlankDashboard();
    schema.widgets = [widget("locked", 1000, 24, true), widget("solo", 40, 40)];

    const next = solveDashboardLayout(schema, [
      { widgetId: "solo", section: "main", rank: 0, emphasis: "normal" },
      { widgetId: "locked", section: "main", rank: 1, emphasis: "wide" }
    ]);
    const solo = next.widgets.find((item) => item.id === "solo")!.position;
    const contentWidth = next.canvas.width - 48;

    expect(solo.y).toBe(24);
    expect(solo.w).toBeLessThan(contentWidth);
    expect(solo.x + solo.w).toBeLessThanOrEqual(1000);
  });
});
