import {
  DataHubServiceError,
  joinDataHubUrl,
  requestDataHub
} from "@/services/dataHubClient";
import { expireDataHubSession, readDataHubSession } from "@/services/dataHubSession";
import type { DataHubCitationDocument } from "@/types/dataHub";

type SourceDocumentPreview = {
  mode: "direct" | "proxy";
  url?: string;
  expiresAt?: number;
};

export type DataHubSourceDocumentAccess = {
  url: string;
  revoke?: () => void;
};

function requireSourceIdentity(citation: DataHubCitationDocument) {
  const session = readDataHubSession();
  if (!session.spaceId || !citation.docId || !citation.docKey || !citation.kbId) {
    throw new DataHubServiceError("原文链接信息不完整，暂无法打开");
  }

  return { session, spaceId: session.spaceId };
}

function sourceDocumentParams(spaceId: number, citation: DataHubCitationDocument) {
  return new URLSearchParams({
    space_id: String(spaceId),
    kb_id: citation.kbId,
    doc_key: citation.docKey
  });
}

function normalizePreviewUrl(value: string) {
  const url = new URL(value, window.location.origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DataHubServiceError("原文预览地址不安全");
  }
  return url.href;
}

const safeInlineSourceTypes = new Set([
  "application/pdf",
  "text/plain",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function makeSafeSourceBlob(blob: Blob, contentType: string) {
  const normalizedType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (safeInlineSourceTypes.has(normalizedType)) {
    return blob;
  }

  // Unknown and active document types must not execute in a same-origin blob
  // document. Keep the bytes available as a download-only payload.
  return new Blob([blob], { type: "application/octet-stream" });
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) {
    return `源文档读取失败 (${response.status})`;
  }

  try {
    const payload = JSON.parse(text) as { detail?: unknown; message?: unknown };
    return String(payload.detail || payload.message || `源文档读取失败 (${response.status})`);
  } catch {
    return text.slice(0, 200);
  }
}

export async function loadDataHubCitationDocument(
  citation: DataHubCitationDocument
): Promise<DataHubSourceDocumentAccess> {
  const { session, spaceId } = requireSourceIdentity(citation);
  if (citation.sourceAvailable === false) {
    throw new DataHubServiceError("当前文档未保留可读取的原文");
  }

  const params = sourceDocumentParams(spaceId, citation);
  const preview = await requestDataHub<SourceDocumentPreview>(
    `/api/ai/rag/kb/source_document_preview?${params.toString()}`,
    { method: "GET", spaceId }
  ).catch(() => ({ mode: "proxy" as const }));

  if (preview.mode === "direct" && typeof preview.url === "string" && preview.url.trim()) {
    return { url: normalizePreviewUrl(preview.url.trim()) };
  }

  const headers = new Headers();
  if (session.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  headers.set("X-Space-Id", String(spaceId));

  const response = await fetch(
    joinDataHubUrl(`/api/ai/rag/kb/source_document?${params.toString()}`),
    { headers }
  );

  if (!response.ok) {
    if (response.status === 401) {
      expireDataHubSession(session.token);
    }
    throw new DataHubServiceError(await readErrorMessage(response), {
      status: response.status
    });
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    throw new DataHubServiceError(await readErrorMessage(response));
  }

  const sourceBlob = makeSafeSourceBlob(await response.blob(), contentType);
  const objectUrl = URL.createObjectURL(sourceBlob);
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl)
  };
}
