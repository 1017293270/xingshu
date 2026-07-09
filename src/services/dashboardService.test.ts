import { describe, expect, it } from "vitest";
import { getDataAssetKpis } from "./dataAssetService";
import { getDashboardChartInsights, getDataAssetChartInsights } from "./dashboardService";
import { assetTypeValues } from "./mock/dashboardMock";

function numericValue(value: string) {
  return Number(value.replace(/[^\d.]/g, ""));
}

describe("dashboardService chart insights", () => {
  it("keeps dashboard summaries and source tables aligned", () => {
    const insights = getDashboardChartInsights();

    expect(insights.revenue.summary).toContain("12 月营收指数回升至 94");
    expect(insights.revenue.table.totalRows).toBe(12);
    expect(insights.revenue.table.rows.at(-1)).toEqual({ period: "12月", value: 94 });
    expect(insights.customer.table.rows).toContainEqual({ segment: "企业客户", share: 75 });
  });

  it("keeps the current asset snapshot aligned across KPIs, type totals, and growth insights", async () => {
    const kpis = await getDataAssetKpis();
    const insights = getDataAssetChartInsights();
    const assetCount = numericValue(kpis.find((kpi) => kpi.id === "data-assets")?.value ?? "");
    const dataVolumeTb = numericValue(kpis.find((kpi) => kpi.id === "data-volume")?.value ?? "");
    const latestGrowth = insights.growth.table.rows.at(-1);

    expect(insights.growth.table.columns.map((column) => column.title)).toEqual([
      "日期",
      "资产总量（个）",
      "数据总量（TB）"
    ]);
    expect(assetTypeValues.reduce((total, value) => total + value, 0)).toBe(assetCount);
    expect(latestGrowth).toEqual({
      date: "06-04",
      assetCount,
      dataVolumeTb
    });
    expect(insights.growth.summary).toContain(assetCount.toLocaleString("zh-CN"));
    expect(insights.growth.summary).toContain(`${dataVolumeTb} TB`);
  });
});
