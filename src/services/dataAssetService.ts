import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey, type SessionQueryScope } from "@/app/sessionQuery";
import type { DataAssetOverview, DataAssetOverviewRange } from "@/types/dataAsset";
import { requestDataHub } from "./dataHubClient";

export async function getDataAssetOverview(range: DataAssetOverviewRange) {
  return requestDataHub<DataAssetOverview>(
    `/api/analytics/data-assets/overview?range=${encodeURIComponent(range)}`
  );
}

export function invalidateDataAssetOverview(queryClient: QueryClient, scope: SessionQueryScope) {
  return queryClient.invalidateQueries({
    queryKey: sessionQueryKey(scope, "dataAssetOverview")
  });
}
