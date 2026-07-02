import { analysisRows, assetOptions, dashboardOptions, salesTrendOption } from "./mock/dashboardMock";

export function getDashboardChartOptions() {
  return dashboardOptions;
}

export function getDataAssetChartOptions() {
  return assetOptions;
}

export function getSalesAnalysisResult() {
  return {
    rows: analysisRows,
    salesTrendOption
  };
}
