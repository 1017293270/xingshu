import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { applyDashboardStudioPreset, dashboardStudioPresets } from "./dashboardPresets";

describe("dashboardPresets", () => {
  it("keeps the original four templates and their exact component counts", () => {
    expect(dashboardStudioPresets.map((preset) => preset.id)).toEqual([
      "ai-operations",
      "business-kpi",
      "customer-service",
      "data-quality-health"
    ]);
    expect(dashboardStudioPresets.map((preset) => preset.seeds.length)).toEqual([8, 9, 9, 9]);
  });

  it("applies the original AI operations layout while keeping only the canvas light", () => {
    const base = createBlankDashboard({ idFactory: (prefix) => `${prefix}-preset` });
    const schema = applyDashboardStudioPreset(base, dashboardStudioPresets[0]!);

    expect(schema.description).toBe("");
    expect(schema.canvas).toMatchObject({ width: 1920, height: 1080, background: "#F5F9FF", scaleMode: "fit-screen" });
    expect(schema.widgets[0]).toMatchObject({
      id: "ai-ops-title",
      position: { x: 48, y: 28, w: 920, h: 72 },
      style: { color: "#f8fafc", fontSize: 40, fontWeight: 800, locked: true, zIndex: 1 }
    });
    expect(schema.widgets.find((widget) => widget.id === "ai-ops-metric-requests")).toMatchObject({
      position: { x: 48, y: 164, w: 360, h: 180 },
      style: { background: "rgba(15, 23, 42, 0.92)", accent: "#38bdf8" }
    });
    expect(schema.widgets.find((widget) => widget.id === "ai-ops-queue-table")?.name).toBe("运营队列");
    expect(schema.dataBindings["ai-ops-workload-mix"]).toMatchObject({
      sourceId: "mock-all",
      dimensionId: "category",
      metricId: "workload_mix",
      refreshSeconds: 45
    });
  });

  it("preserves each preset refresh interval and original business binding cadence", () => {
    const base = createBlankDashboard({ idFactory: (prefix) => `${prefix}-business` });
    const schema = applyDashboardStudioPreset(base, dashboardStudioPresets[1]!);

    expect(schema.refresh).toEqual({ mode: "interval", intervalSeconds: 45 });
    expect(schema.dataBindings["business-revenue"]).toMatchObject({ sourceId: "mock-all", refreshSeconds: 45 });
    expect(schema.dataBindings["business-channel-mix"]).toMatchObject({ sourceId: "mock-all", refreshSeconds: 60 });
    expect(schema.widgets.find((widget) => widget.id === "business-account-table")?.name).toBe("客户健康");
  });
});
