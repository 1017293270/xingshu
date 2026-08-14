import {
  DataHubServiceError,
  joinDataHubUrl,
  requestDataHub
} from "@/services/dataHubClient";
import { expireDataHubSession, readDataHubSession } from "@/services/dataHubSession";
import type { DataHubCitationDocument, DataHubKnowledgeBase } from "@/types/dataHub";

export const DATA_HUB_KNOWLEDGE_BASE_LIST_PATH = "/api/ai/rag/kb/list";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function asCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

function unwrapKnowledgeBaseRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["items", "list", "kbs", "knowledgeBases", "records", "data"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function normalizeKnowledgeBase(value: unknown): DataHubKnowledgeBase | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = asText(value.id) || asText(value.kbId) || asText(value.kb_id);
  const title = asText(value.title) || asText(value.name) || asText(value.kbName) || asText(value.kb_name);
  if (!id || !title) {
    return undefined;
  }

  const documentCount =
    asCount(value.documentCount)
    ?? asCount(value.docCount)
    ?? asCount(value.doc_count)
    ?? asCount(value.document_count)
    ?? asCount(value.docs);
  const updatedAt =
    asText(value.updatedAt)
    || asText(value.updated_at)
    || asText(value.updateTime)
    || asText(value.update_time)
    || undefined;
  const description = asText(value.description) || asText(value.desc) || undefined;

  return {
    id,
    title,
    description: description || undefined,
    documentCount,
    updatedAt: updatedAt || undefined
  };
}

export function normalizeDataHubKnowledgeBases(payload: unknown): DataHubKnowledgeBase[] {
  const seen = new Set<string>();
  const knowledgeBases: DataHubKnowledgeBase[] = [];

  for (const row of unwrapKnowledgeBaseRows(payload)) {
    const knowledgeBase = normalizeKnowledgeBase(row);
    if (!knowledgeBase || seen.has(knowledgeBase.id)) {
      continue;
    }
    seen.add(knowledgeBase.id);
    knowledgeBases.push(knowledgeBase);
  }

  return knowledgeBases;
}

function requireSpaceId() {
  const session = readDataHubSession();
  if (!session.spaceId) {
    throw new DataHubServiceError("当前空间信息不完整，暂无法读取知识库");
  }
  return session.spaceId;
}

export async function listDataHubKnowledgeBases(): Promise<DataHubKnowledgeBase[]> {
  const spaceId = requireSpaceId();
  const params = new URLSearchParams({ space_id: String(spaceId) });
  const payload = await requestDataHub<unknown>(
    `${DATA_HUB_KNOWLEDGE_BASE_LIST_PATH}?${params.toString()}`,
    { method: "GET", spaceId }
  );
  return normalizeDataHubKnowledgeBases(payload);
}
