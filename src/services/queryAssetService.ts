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

/** 收藏时随资产保存的回答文本上限，按 UTF-16 长度（string.length）计，与 analytics 服务端同一规则。 */
export const QUERY_ASSET_ANSWER_MAX_CHARS = 20_000;

/** 去掉首尾空白后截到上限；截断点落在代理对中间时再退一位，不留孤立的高代理字符。 */
function normalizeQueryAssetAnswerText(answerText: string) {
  const text = answerText.trim();
  if (text.length <= QUERY_ASSET_ANSWER_MAX_CHARS) return text;
  const lastCode = text.charCodeAt(QUERY_ASSET_ANSWER_MAX_CHARS - 1);
  const end = lastCode >= 0xd800 && lastCode <= 0xdbff
    ? QUERY_ASSET_ANSWER_MAX_CHARS - 1
    : QUERY_ASSET_ANSWER_MAX_CHARS;
  return text.slice(0, end);
}

/** 把这条收藏对应的回答文本存到资产上；去掉首尾空白后为空时不发请求，返回 undefined。 */
export async function saveQueryAssetAnswer(id: string, answerText: string) {
  const text = normalizeQueryAssetAnswerText(answerText);
  if (!text) return undefined;
  return requestDataHub<QueryAsset>(`/api/analytics/query-assets/${encodeURIComponent(id)}/answer`, {
    method: "POST",
    body: JSON.stringify({ answerText: text })
  });
}

function isSameQueryAsset(value: unknown, id: string): value is QueryAsset {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const valueId = (value as { id?: unknown }).id;
  return (typeof valueId === "string" || typeof valueId === "number") && String(valueId) === String(id);
}

/**
 * 收藏成功后补存回答。答案只是收藏的附带信息：接口不存在（老后端 404）或任何失败都返回原资产，
 * 收藏照常成功；响应不是同一个资产（缺 id 或 id 不符）时也沿用 from-ask 返回的资产。
 */
export async function attachQueryAssetAnswer(asset: QueryAsset, answerText: string | undefined): Promise<QueryAsset> {
  if (!answerText?.trim()) return asset;
  try {
    const updated: unknown = await saveQueryAssetAnswer(asset.id, answerText);
    return isSameQueryAsset(updated, asset.id) ? updated : asset;
  } catch {
    return asset;
  }
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
