import { dataAssetKpis, knowledgeBases, knowledgeBaseStats } from "./mock/dataAssetMock";

export async function getDataAssetKpis() {
  return dataAssetKpis;
}

export async function getKnowledgeBaseStats() {
  return knowledgeBaseStats;
}

export async function listKnowledgeBases() {
  return knowledgeBases;
}
