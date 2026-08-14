import type { DataAssetOverview, DataAssetOverviewRange } from "@/types/dataAsset";
import { requestDataHub } from "./dataHubClient";
import { dataAssetKpis, knowledgeBases, knowledgeBaseStats } from "./mock/dataAssetMock";

/** @deprecated 仅保留给旧测试与未迁移页面；数据资产看板不再调用。 */
export async function getDataAssetKpis() {
  return dataAssetKpis;
}

export async function getDataAssetOverview(range: DataAssetOverviewRange) {
  return requestDataHub<DataAssetOverview>(
    `/api/analytics/data-assets/overview?range=${encodeURIComponent(range)}`
  );
}

export async function getKnowledgeBaseStats() {
  return knowledgeBaseStats;
}

export async function listKnowledgeBases() {
  return knowledgeBases;
}
