export type XsTone = "blue" | "cyan" | "green" | "orange" | "purple" | "red" | "gold" | "teal";

export type DataAssetKpiIconId =
  | "data-assets"
  | "data-volume"
  | "media-documents"
  | "data-tables"
  | "data-apis"
  | "service-calls";

export type DataAssetOverviewRange = "7D" | "30D" | "6M";

export type DataAssetOverview = {
  updatedAt: string;
  range: DataAssetOverviewRange;
  kpis: {
    assetCount: number;
    dataVolumeBytes: number;
    unstructuredCount: number;
    tableCount: number;
    dataSourceCount: number;
    serviceCallCount: number;
  };
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
