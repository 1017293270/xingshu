import { describe, expect, it } from "vitest";
import type { DashboardDataBinding, DashboardWidget } from "@/types/dashboardStudio";
import {
  buildDashboardChartOption,
  formatDashboardMetric,
  resolveDashboardMetric
} from "./dashboardWidgetData";

const binding: DashboardDataBinding = {
  id: "binding-1",
  label: "月度销售",
  mode: "snapshot",
  tableIndex: 0,
  table: {
    columns: [
      { key: "month", title: "月份", type: "date" },
      { key: "revenue", title: "营收（万元）", type: "number" }
    ],
    rows: [
      { month: "一月", revenue: 120 },
      { month: "二月", revenue: 180 }
    ],
    totalRows: 2
  }
};

function widget(type: DashboardWidget["type"]): DashboardWidget {
  return {
    id: "widget-1",
    type,
    title: "月度营收",
    bindingId: binding.id,
    mapping: { dimensionKey: "month", metricKeys: ["revenue"], valueMode: "latest" },
    position: { x: 0, y: 0, w: 6, h: 4 },
    style: { accent: "#38bdf8", background: "rgba(15,23,42,.82)", smooth: true }
  };
}

describe("dashboardWidgetData", () => {
  it("resolves first, latest, sum, maximum, and average metrics without inventing values", () => {
    const metric = widget("metric");

    expect(resolveDashboardMetric({ ...metric, mapping: { metricKeys: ["revenue"], valueMode: "first" } }, binding)).toBe(120);
    expect(resolveDashboardMetric(metric, binding)).toBe(180);
    expect(resolveDashboardMetric({ ...metric, mapping: { metricKeys: ["revenue"], valueMode: "sum" } }, binding)).toBe(300);
    expect(resolveDashboardMetric({ ...metric, mapping: { metricKeys: ["revenue"], valueMode: "max" } }, binding)).toBe(180);
    expect(resolveDashboardMetric({ ...metric, mapping: { metricKeys: ["revenue"], valueMode: "average" } }, binding)).toBe(150);
    expect(resolveDashboardMetric({ ...metric, mapping: { metricKeys: ["missing"], valueMode: "sum" } }, binding)).toBeNull();
  });

  it("builds the original command-dashboard ECharts palette from schema mappings", () => {
    const option = buildDashboardChartOption(widget("line"), binding, { animation: false });
    const series = option?.series as Array<{ type?: string; data?: unknown[]; smooth?: boolean }>;

    expect(option?.color).toEqual(["#38bdf8"]);
    expect(option?.animation).toBe(false);
    expect(series).toEqual([
      expect.objectContaining({ type: "line", data: [120, 180], smooth: true })
    ]);
  });

  it("supports the original area, radar and funnel component families", () => {
    const area = buildDashboardChartOption(widget("area"), binding);
    const radar = buildDashboardChartOption(widget("radar"), binding);
    const funnel = buildDashboardChartOption(widget("funnel"), binding);

    expect((area?.series as Array<{ type?: string; areaStyle?: unknown }>)[0]).toMatchObject({
      type: "line",
      areaStyle: expect.any(Object)
    });
    expect((radar?.series as Array<{ type?: string }>)[0]?.type).toBe("radar");
    expect((funnel?.series as Array<{ type?: string }>)[0]?.type).toBe("funnel");
  });

  it("formats business values with restrained units", () => {
    expect(formatDashboardMetric(128000000)).toEqual({ value: "1.28", unit: "亿" });
    expect(formatDashboardMetric(28400)).toEqual({ value: "2.84", unit: "万" });
    expect(formatDashboardMetric(null)).toEqual({ value: "—", unit: "" });
  });
});
