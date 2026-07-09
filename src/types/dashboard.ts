import type { EChartsOption } from "echarts";

export type AnalysisRow = [string, string, string, string, string];

export type DashboardChartOptions = {
  revenue: EChartsOption;
  channel: EChartsOption;
  salesLine: EChartsOption;
  customer: EChartsOption;
  region: EChartsOption;
  productRank: EChartsOption;
};

export type DataAssetChartOptions = {
  donut: EChartsOption;
  growth: EChartsOption;
  top: EChartsOption;
  source: EChartsOption;
};
