export type XsTone = "blue" | "cyan" | "green" | "orange" | "purple" | "red" | "gold" | "teal";

export type DataAssetKpiIconId =
  | "data-assets"
  | "data-volume"
  | "media-documents"
  | "data-tables"
  | "data-apis"
  | "service-calls";

export type DataAssetOverviewRange = "7D" | "30D" | "6M";

export type DataAssetKpis = {
  assetCount: number;
  dataVolumeBytes: number;
  unstructuredCount: number;
  tableCount: number;
  dataSourceCount: number;
  serviceCallCount: number;
};

export type DataAssetOverview = {
  updatedAt: string;
  range: DataAssetOverviewRange;
  kpis: DataAssetKpis;
  /** 对比基线：统计期起点当天或之前最近一张空间快照，没有则回退期内最早一张，再没有为 null。 */
  comparisonBaselineKpis?: DataAssetKpis | null;
  /** 对比基线快照日期，ISO 日期串（如 "2026-08-02"）；没有基线时为 null。 */
  comparisonBaselineDate?: string | null;
  typeDistribution: Array<{ type: string; count: number }>;
  growth: Array<{ date: string; assetCount: number; dataVolumeBytes: number }>;
  sourceDistribution: Array<{ type: string; count: number }>;
  usageByScenario: Array<{ scenario: string; count: number }>;
  hotAssets: Array<{
    assetId: string;
    assetName: string;
    assetType: string;
    callCount: number;
  }>;
};
