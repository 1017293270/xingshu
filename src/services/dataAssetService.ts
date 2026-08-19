import type { DataAssetOverview, DataAssetOverviewRange } from "@/types/dataAsset";
import { requestDataHub } from "./dataHubClient";

export async function getDataAssetOverview(range: DataAssetOverviewRange) {
  return requestDataHub<DataAssetOverview>(
    `/api/analytics/data-assets/overview?range=${encodeURIComponent(range)}`
  );
}
