import { requestDataHub } from "./dataHubClient";
import type { AskArtifactRef } from "@/types/dataHub";
import type { QueryAsset, QueryExecution } from "@/types/analytics";

export function ensureAskArtifact(
  sessionId: string,
  chatId: string,
  resultSessionId?: string
) {
  return requestDataHub<AskArtifactRef>("/api/v1/query-artifacts/ensure", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      chatId,
      ...(resultSessionId ? { resultSessionId } : {})
    })
  });
}

export function favoriteAskArtifact(artifact: AskArtifactRef, name?: string) {
  if (!artifact.canFavorite) throw new Error("问数查询尚未完成，暂时不能收藏");
  return requestDataHub<QueryAsset>("/api/analytics/query-assets/from-ask", {
    method: "POST",
    body: JSON.stringify({ askRunId: artifact.askRunId, name })
  });
}

export function listQueryAssets(input: { keyword?: string; scope?: "PRIVATE" | "SPACE" } = {}) {
  const search = new URLSearchParams();
  if (input.keyword?.trim()) search.set("keyword", input.keyword.trim());
  if (input.scope) search.set("scope", input.scope);
  const query = search.toString();
  return requestDataHub<QueryAsset[]>(`/api/analytics/query-assets${query ? `?${query}` : ""}`);
}

export function getQueryAsset(id: string) {
  return requestDataHub<QueryAsset>(`/api/analytics/query-assets/${encodeURIComponent(id)}`);
}

export function previewQueryAsset(
  id: string,
  input: { versionId?: string; parameters?: Record<string, unknown>; force?: boolean } = {}
) {
  return requestDataHub<QueryExecution>(`/api/analytics/query-assets/${encodeURIComponent(id)}/preview`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function reaskQueryAsset(
  id: string,
  input: { baseVersionId?: string; resolvedQuestion?: string; parameters?: Record<string, unknown> }
) {
  return requestDataHub<QueryAsset>(`/api/analytics/query-assets/${encodeURIComponent(id)}/reask`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function promoteQueryVersion(id: string, versionId: string) {
  return requestDataHub<QueryAsset>(`/api/analytics/query-assets/${encodeURIComponent(id)}/versions/promote`, {
    method: "POST",
    body: JSON.stringify({ versionId })
  });
}

export function changeQueryAssetVisibility(id: string, visibility: "PRIVATE" | "SPACE") {
  return requestDataHub<QueryAsset>(`/api/analytics/query-assets/${encodeURIComponent(id)}/visibility`, {
    method: "POST",
    body: JSON.stringify({ visibility })
  });
}
