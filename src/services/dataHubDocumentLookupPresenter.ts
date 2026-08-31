import type {
  DataHubDocumentLookupResult,
  DataHubDoneData
} from "@/types/dataHub";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDocumentIdentifier(value: unknown): value is string | number {
  return (
    (typeof value === "string" && Boolean(value.trim())) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function optionalText(value: unknown, maxLength = 180) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}...`
    : normalized;
}

export function isDataHubDocumentLookupTurn(done?: DataHubDoneData) {
  return done?.documentLookup === true;
}

/**
 * The final `done.documentResults` contract is authoritative. Candidate lists,
 * RAG evidence and citations are deliberately not used as fallbacks.
 */
export function getDataHubDocumentLookupResults(
  done?: DataHubDoneData,
  limit = 5
): DataHubDocumentLookupResult[] {
  if (
    !isDataHubDocumentLookupTurn(done) ||
    done?.documentSelectionMode === "uncertain" ||
    done?.documentSelectionMode === "none" ||
    !Array.isArray(done?.documentResults) ||
    limit <= 0
  ) {
    return [];
  }

  const results: DataHubDocumentLookupResult[] = [];
  const seen = new Set<string>();

  for (const rawResult of done.documentResults) {
    if (!isRecord(rawResult)) {
      continue;
    }

    const { docId, kbId } = rawResult;
    const docKey = optionalText(rawResult.docKey);
    // PRD A-6 后 docKey 仅展示、可为空：缺 docKey 只影响原文打开，不能丢结果。
    if (!isDocumentIdentifier(docId) || !isDocumentIdentifier(kbId)) {
      continue;
    }

    const identity = JSON.stringify([docId, docKey ?? ""]);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    results.push({
      docId,
      docKey,
      kbId,
      kbName: optionalText(rawResult.kbName),
      title:
        optionalText(rawResult.docName) ||
        optionalText(rawResult.fileName) ||
        docKey ||
        String(docId),
      contentType: optionalText(rawResult.contentType, 80),
      excerpt: optionalText(rawResult.snippet) || optionalText(rawResult.matchReason),
      matchReason: optionalText(rawResult.matchReason),
      snippet: optionalText(rawResult.snippet, 240),
      score: typeof rawResult.score === "number" && Number.isFinite(rawResult.score)
        ? rawResult.score
        : undefined,
      docStatus: optionalText(rawResult.docStatus, 40),
      sourceAvailable: docKey
        ? typeof rawResult.sourceAvailable === "boolean"
          ? rawResult.sourceAvailable
          : undefined
        : false
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

/**
 * 编排轮次里各「找文档」子智能体最终结果的聚合。
 * 沿用 done.documentResults 权威契约（候选与引用不作回退），跨子会话按
 * docId+docKey 去重；入参用结构类型，避免与执行投影器互相引用。
 */
export function getDataHubChildDocumentResults(
  projection: { subagentSessions: ReadonlyArray<{ done?: DataHubDoneData }> },
  limit = 5
): DataHubDocumentLookupResult[] {
  const results: DataHubDocumentLookupResult[] = [];
  const seen = new Set<string>();

  for (const session of projection.subagentSessions) {
    if (!isDataHubDocumentLookupTurn(session.done)) {
      continue;
    }
    for (const result of getDataHubDocumentLookupResults(session.done, limit)) {
      const identity = JSON.stringify([result.docId, result.docKey ?? ""]);
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      results.push(result);
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}
