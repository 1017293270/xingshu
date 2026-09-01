import { describe, expect, it } from "vitest";
import type { DataAssetOverview } from "@/types/dataAsset";
import { buildKpis, formatComparisonBaselineLabel } from "./dataDashboardCharts";

function overviewWith(patch: Partial<DataAssetOverview>): DataAssetOverview {
  return {
    updatedAt: "2026-08-11T08:00:00Z",
    range: "30D",
    kpis: {
      assetCount: 6,
      dataVolumeBytes: 1024,
      unstructuredCount: 2,
      tableCount: 4,
      dataSourceCount: 1,
      serviceCallCount: 3
    },
    typeDistribution: [],
    growth: [],
    sourceDistribution: [],
    usageByScenario: [],
    hotAssets: [],
    ...patch
  };
}

describe("formatComparisonBaselineLabel", () => {
  it("renders the baseline snapshot date as 较 M月D日", () => {
    expect(formatComparisonBaselineLabel("2026-08-02", "2026-08-11T08:00:00Z")).toBe("较 8月2日");
    expect(formatComparisonBaselineLabel("2026-12-25", "2026-08-11T08:00:00Z")).toBe("较 12月25日");
  });

  it("keeps the year when the baseline falls in another year", () => {
    expect(formatComparisonBaselineLabel("2025-09-30", "2026-02-15T00:00:00Z")).toBe("较 2025年9月30日");
  });

  it("drops the year when there is no reference date to compare against", () => {
    expect(formatComparisonBaselineLabel("2025-09-30")).toBe("较 9月30日");
    expect(formatComparisonBaselineLabel("2025-09-30", "unknown")).toBe("较 9月30日");
  });

  it("falls back to the period wording for missing or unparsable dates", () => {
    expect(formatComparisonBaselineLabel(null)).toBe("较统计期起点");
    expect(formatComparisonBaselineLabel(undefined)).toBe("较统计期起点");
    expect(formatComparisonBaselineLabel("")).toBe("较统计期起点");
    expect(formatComparisonBaselineLabel("昨天")).toBe("较统计期起点");
    expect(formatComparisonBaselineLabel("2026-8-2")).toBe("较统计期起点");
    // 2 月没有 31 日：形状对但日期不存在，同样不展示
    expect(formatComparisonBaselineLabel("2026-02-31")).toBe("较统计期起点");
  });
});

describe("buildKpis comparison notes", () => {
  it("labels every KPI with the baseline date", () => {
    const kpis = buildKpis(overviewWith({
      comparisonBaselineKpis: {
        assetCount: 4,
        dataVolumeBytes: 768,
        unstructuredCount: 2,
        tableCount: 0,
        dataSourceCount: 2,
        serviceCallCount: 3
      },
      comparisonBaselineDate: "2026-08-02"
    }));

    expect(kpis.map((kpi) => kpi.note)).toEqual([
      "较 8月2日 ↑ 50.0%",
      "较 8月2日 ↑ 33.3%",
      "较 8月2日 持平",
      "较 8月2日 ↑ 新增 4",
      "较 8月2日 ↓ 50.0%",
      "较 8月2日 持平"
    ]);
  });

  it("keeps the no-snapshot note when the backend has no baseline", () => {
    const kpis = buildKpis(overviewWith({ comparisonBaselineKpis: null, comparisonBaselineDate: null }));

    expect(new Set(kpis.map((kpi) => kpi.note))).toEqual(new Set(["较统计期起点 暂无快照"]));
  });
});
