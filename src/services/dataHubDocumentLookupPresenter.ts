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
  limit = 10
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
    if (!isDocumentIdentifier(docId) || !docKey || !isDocumentIdentifier(kbId)) {
      continue;
    }

    const identity = JSON.stringify([docId, docKey]);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);

    results.push({
      docId,
      docKey,
      kbId,
      title:
        optionalText(rawResult.docName) ||
        optionalText(rawResult.fileName) ||
        docKey,
      contentType: optionalText(rawResult.contentType, 80),
      excerpt: optionalText(rawResult.matchReason),
      docStatus: optionalText(rawResult.docStatus, 40),
      sourceAvailable:
        typeof rawResult.sourceAvailable === "boolean"
          ? rawResult.sourceAvailable
          : undefined
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
