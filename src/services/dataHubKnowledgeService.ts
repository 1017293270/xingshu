import {
  DataHubServiceError,
  joinDataHubUrl,
  requestDataHub
} from "@/services/dataHubClient";
import { expireDataHubSession, readDataHubSession } from "@/services/dataHubSession";
import type {
  DataHubCitationDocument,
  DataHubKnowledgeBase,
  DataHubKnowledgeDocument,
  DataHubKnowledgeDocumentStatus
} from "@/types/dataHub";

export const DATA_HUB_KNOWLEDGE_BASE_LIST_PATH = "/api/ai/rag/kbs";

type SourceDocumentPreview = {
  mode: "direct" | "proxy";
  url?: string;
  expiresAt?: number;
};

export type DataHubSourceDocumentAccess = {
  url: string;
  contentType?: string;
  revoke?: () => void;
};

function requireSourceIdentity(citation: DataHubCitationDocument) {
  const session = readDataHubSession();
  if (!session.spaceId || !citation.docKey || !citation.kbId) {
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

function sniffInlineSourceType(bytes: Uint8Array) {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    if (head.startsWith("%PDF")) {
      return "application/pdf";
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return "image/png";
  }
  return undefined;
}

function makeSafeSourceBlob(bytes: Uint8Array, contentType: string) {
  const sniffed = sniffInlineSourceType(bytes);
  const normalizedType = (sniffed || contentType.split(";", 1)[0].trim()).toLowerCase();
  if (safeInlineSourceTypes.has(normalizedType)) {
    return new Blob([bytes], { type: normalizedType });
  }

  // Unknown and active document types must not execute in a same-origin blob
  // document. Keep the bytes available as a download-only payload.
  return new Blob([bytes], { type: "application/octet-stream" });
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

  return loadDataHubSourceDocumentBlob(spaceId, citation, session.token);
}

async function loadDataHubSourceDocumentBlob(
  spaceId: number,
  citation: DataHubCitationDocument,
  token: string | null
): Promise<DataHubSourceDocumentAccess> {
  const params = sourceDocumentParams(spaceId, citation);
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("X-Space-Id", String(spaceId));

  const response = await fetch(
    joinDataHubUrl(`/api/ai/rag/kb/source_document?${params.toString()}`),
    { headers }
  );

  if (!response.ok) {
    if (response.status === 401) {
      expireDataHubSession(token);
    }
    throw new DataHubServiceError(await readErrorMessage(response), {
      status: response.status
    });
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    throw new DataHubServiceError(await readErrorMessage(response));
  }

  const payload = new Uint8Array(await response.arrayBuffer());
  const sourceBlob = makeSafeSourceBlob(payload, contentType);
  const objectUrl = URL.createObjectURL(sourceBlob);
  return {
    url: objectUrl,
    contentType: sourceBlob.type || undefined,
    revoke: () => URL.revokeObjectURL(objectUrl)
  };
}

export async function loadDataHubKnowledgeSource(
  kbId: string,
  document: DataHubKnowledgeDocument
): Promise<DataHubSourceDocumentAccess> {
  const docKey = document.docKey?.trim();
  if (!docKey) {
    throw new DataHubServiceError("原文链接信息不完整，暂无法打开");
  }

  const { session, spaceId } = requireSourceIdentity({
    docId: document.docId || docKey,
    docKey,
    kbId,
    docName: document.title,
    sourceAvailable: true,
    fragments: []
  });

  return loadDataHubSourceDocumentBlob(spaceId, {
    docId: document.docId || docKey,
    docKey,
    kbId,
    docName: document.title,
    sourceAvailable: true,
    fragments: []
  }, session.token);
}

function unwrapMarkdownContent(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.trim();
  }
  if (!isRecord(payload)) {
    return "";
  }

  const nested = isRecord(payload.data) ? payload.data : undefined;
  const candidates = [
    payload.content,
    payload.markdown,
    payload.text,
    payload.md,
    typeof payload.data === "string" ? payload.data : undefined,
    nested?.content,
    nested?.markdown,
    nested?.text
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

export async function loadDataHubKnowledgeMarkdown(
  kbId: string,
  document: DataHubKnowledgeDocument
): Promise<{ markdown: string }> {
  const docKey = document.docKey?.trim();
  if (!docKey) {
    throw new DataHubServiceError("原文链接信息不完整，暂无法打开");
  }

  const { spaceId } = requireSourceIdentity({
    docId: document.docId || docKey,
    docKey,
    kbId,
    docName: document.title,
    sourceAvailable: true,
    fragments: []
  });
  const params = sourceDocumentParams(spaceId, {
    docId: document.docId || docKey,
    docKey,
    kbId,
    docName: document.title,
    sourceAvailable: true,
    fragments: []
  });
  const markdown = unwrapMarkdownContent(
    await requestDataHub<unknown>(`/api/ai/rag/kb/file_content?${params.toString()}`, {
      method: "GET",
      spaceId,
      cache: "no-store"
    })
  );
  if (!markdown) {
    throw new DataHubServiceError("当前文档还没有可浏览的 Markdown");
  }

  return { markdown };
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
  const title = asText(value.title)
    || asText(value.name)
    || asText(value.kbName)
    || asText(value.kb_name)
    || (id ? `知识库 ${id}` : "");
  if (!id || !title) {
    return undefined;
  }

  const documentCount =
    asCount(value.documentCount)
    ?? asCount(value.docCount)
    ?? asCount(value.doc_count)
    ?? asCount(value.document_count)
    ?? asCount(value.file_count)
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
  const payload = await requestDataHub<unknown>(DATA_HUB_KNOWLEDGE_BASE_LIST_PATH, {
    method: "GET",
    spaceId
  });
  return normalizeDataHubKnowledgeBases(payload);
}

const knownDocumentStatuses = new Set<DataHubKnowledgeDocumentStatus>([
  "uploading",
  "uploaded",
  "parsing",
  "indexed",
  "failed"
]);

function asDocumentStatus(value: unknown): DataHubKnowledgeDocumentStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const status = value.trim().toLowerCase();
  return knownDocumentStatuses.has(status as DataHubKnowledgeDocumentStatus)
    ? status as DataHubKnowledgeDocumentStatus
    : undefined;
}

function inferDocumentStatus(value: Record<string, unknown>): DataHubKnowledgeDocumentStatus {
  const explicit = asDocumentStatus(value.doc_status) ?? asDocumentStatus(value.docStatus);
  if (explicit) {
    return explicit;
  }

  const markdownAvailable = value.markdown_available === true || value.markdownAvailable === true;
  const artifactJob = isRecord(value.artifact_job) ? value.artifact_job : isRecord(value.artifactJob) ? value.artifactJob : undefined;
  if (asDocumentStatus(artifactJob?.status) === "failed" && !markdownAvailable) {
    return "failed";
  }
  if (asDocumentStatus(value.status) === "indexed" || markdownAvailable) {
    return "indexed";
  }
  if (asDocumentStatus(value.status) === "failed") {
    return "failed";
  }
  return "parsing";
}

function unwrapKnowledgeDocumentRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["files", "documents", "items", "list", "records", "data"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function sourceArtifact(value: Record<string, unknown>) {
  const job = isRecord(value.artifact_job)
    ? value.artifact_job
    : isRecord(value.artifactJob)
      ? value.artifactJob
      : undefined;
  const items = job && isRecord(job.items) ? job.items : undefined;
  return items && isRecord(items.sourceDocument) ? items.sourceDocument : undefined;
}

function normalizeKnowledgeDocument(value: unknown, index: number): DataHubKnowledgeDocument | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const source = sourceArtifact(value);
  const title = asText(value.doc_name)
    || asText(value.docName)
    || asText(value.file_name)
    || asText(value.fileName)
    || asText(value.name)
    || asText(value.title);
  const docId = asText(value.doc_id) || asText(value.docId) || undefined;
  const docKey = asText(value.doc_key)
    || asText(value.docKey)
    || (isRecord(value.artifact_job) ? asText(value.artifact_job.doc_key) : "")
    || (isRecord(value.artifactJob) ? asText(value.artifactJob.doc_key) : "")
    || asText(source?.doc_key)
    || asText(value.name)
    || asText(value.file_name)
    || asText(value.fileName)
    || asText(value.doc_name)
    || undefined;
  const id = docId || docKey || (title ? `${title}:${index}` : "");
  if (!id || !title) {
    return undefined;
  }

  const sourceStatus = asText(source?.status).toLowerCase();
  const sourceUrl = sourceStatus === "completed" ? (asText(source?.url) || undefined) : undefined;
  // MinIO archive status is not the same as "can fetch the original". Contract
  // libraries often report source_available=false / sourceDocument.status=failed
  // while GET /kb/source_document still returns the PDF.
  const sourceAvailable = Boolean(docKey);

  return {
    id,
    title,
    docId,
    docKey,
    status: inferDocumentStatus(value),
    sizeBytes: asCount(value.size) ?? asCount(value.size_bytes) ?? asCount(value.file_size),
    sourceAvailable,
    sourceUrl,
    markdownAvailable: value.markdown_available === true || value.markdownAvailable === true,
    chunkCount: asCount(value.chunk_count) ?? asCount(value.chunkCount),
    message: asText(value.message) || undefined
  };
}

export function normalizeDataHubKnowledgeDocuments(payload: unknown): DataHubKnowledgeDocument[] {
  const seen = new Set<string>();
  const documents: DataHubKnowledgeDocument[] = [];

  unwrapKnowledgeDocumentRows(payload).forEach((row, index) => {
    const document = normalizeKnowledgeDocument(row, index);
    if (!document || seen.has(document.id)) {
      return;
    }
    seen.add(document.id);
    documents.push(document);
  });

  return documents;
}

function knowledgeDocumentQuery(spaceId: number, kbId: string) {
  return new URLSearchParams({
    space_id: String(spaceId),
    kb_id: kbId
  }).toString();
}

export async function listDataHubKnowledgeDocuments(kbId: string): Promise<DataHubKnowledgeDocument[]> {
  const trimmedId = kbId.trim();
  if (!trimmedId) {
    throw new DataHubServiceError("知识库信息不完整，暂无法读取文档");
  }

  const spaceId = requireSpaceId();
  const query = knowledgeDocumentQuery(spaceId, trimmedId);
  const request = (path: string) => requestDataHub<unknown>(`${path}?${query}`, {
    method: "GET",
    spaceId,
    cache: "no-store"
  });

  try {
    return normalizeDataHubKnowledgeDocuments(await request("/api/ai/rag/kb/documents"));
  } catch (error) {
    if (error instanceof DataHubServiceError && error.status === 401) {
      throw error;
    }
    return normalizeDataHubKnowledgeDocuments(await request("/api/ai/rag/kb/files"));
  }
}
