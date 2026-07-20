import { describe, expect, it } from "vitest";
import {
  createDashboardMockBinding,
  dashboardMockDataSources,
  getDashboardMockMapping,
  getDashboardMockSource,
  isDashboardMockMetricAllowed
} from "./dashboardMockData";

describe("dashboardMockData", () => {
  it("keeps the five original mock sources and all 24 original signals", () => {
    expect(dashboardMockDataSources).toHaveLength(5);
    expect(dashboardMockDataSources.map((source) => source.id)).toEqual([
      "mock-all",
      "mock-ai-operations",
      "mock-business-kpi",
      "mock-customer-service",
      "mock-data-quality"
    ]);
    expect(getDashboardMockSource("mock-all").metrics).toHaveLength(24);
  });

  it("returns the original autonomous-resolution metric payload", () => {
    const binding = createDashboardMockBinding({
      id: "autonomous",
      sourceId: "mock-all",
      dimensionId: "",
      metricId: "autonomous_resolutions"
    });

    expect(binding.resultKind).toBe("metric");
    expect(binding.table.rows).toEqual([{ value: 76240 }]);
    expect(binding.trend).toBe(9.4);
    expect(getDashboardMockMapping(binding)).toEqual({ metricKeys: ["value"], valueMode: "latest" });
  });

  it("enforces the original component-to-data compatibility rules", () => {
    const source = getDashboardMockSource("mock-all");
    expect(isDashboardMockMetricAllowed("line", source, "date", "resolved_questions")).toBe(true);
    expect(isDashboardMockMetricAllowed("line", source, "date", "requests")).toBe(false);
    expect(isDashboardMockMetricAllowed("pie", source, "category", "workload_mix")).toBe(true);
    expect(isDashboardMockMetricAllowed("metric", source, "", "workload_mix")).toBe(false);

    const binding = createDashboardMockBinding({
      id: "resolved",
      sourceId: "mock-all",
      dimensionId: "date",
      metricId: "resolved_questions"
    });
    expect(binding.resultKind).toBe("time-series");
    expect(getDashboardMockMapping(binding)).toEqual({ dimensionKey: "date", metricKeys: ["count"] });
  });
});
