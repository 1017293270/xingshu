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

/**
 * 文档身份以 docId 为准（ai-service PRD A-6 起授权链路已 docKeys→docIds，
 * 制品也按 kb_<kbId>/<docId>/ 落 MinIO），docKey 只是仍被后端接受的旧参数。
 * docId 是雪花号字符串，超出 JS 安全整数范围，全程按字符串传、不要 Number()。
 */
function sourceDocumentId(citation: Pick<DataHubCitationDocument, "docId">) {
  const docId = citation.docId?.trim();
  // 后端把 doc_id 声明成 Long，非数字形态送过去会直接 400，交给 doc_key 兜底。
  return docId && /^\d+$/.test(docId) ? docId : undefined;
}

function requireSourceIdentity(citation: DataHubCitationDocument) {
  const session = readDataHubSession();
  const hasIdentity = Boolean(sourceDocumentId(citation) || citation.docKey?.trim());
  if (!session.spaceId || !citation.kbId || !hasIdentity) {
    throw new DataHubServiceError("原文链接信息不完整，暂无法打开");
  }

  return { session, spaceId: session.spaceId };
}

function sourceDocumentParams(spaceId: number, citation: DataHubCitationDocument) {
  const params = new URLSearchParams({
    space_id: String(spaceId),
    kb_id: citation.kbId
  });
  // 两个都带上：后端优先用 doc_id，没有时才走 doc_key 那条旧解析。
  const docId = sourceDocumentId(citation);
  if (docId) {
    params.set("doc_id", docId);
  }
  const docKey = citation.docKey?.trim();
  if (docKey) {
    params.set("doc_key", docKey);
  }
  return params;
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

function sniffInlineSourceType(bytes: Uint8Array<ArrayBuffer>) {
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

function makeSafeSourceBlob(bytes: Uint8Array<ArrayBuffer>, contentType: string) {
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

async function loadSourcePreviewTicket(citation: DataHubCitationDocument, spaceId: number) {
  const docId = sourceDocumentId(citation);
  const isPdf = [citation.fileName, citation.docName, citation.docKey].some((name) => /\.pdf$/i.test(name ?? ""));
  if (!docId || !/^\d+$/.test(citation.kbId) || !isPdf) return null;
  const result = await requestDataHub<{ ticket?: string }>("/api/ai/rag/kb/source_document_ticket", {
    method: "POST",
    spaceId,
    body: JSON.stringify({ kb_id: citation.kbId, doc_id: docId })
  });
  if (!result?.ticket?.trim()) return null;
  // 短期、单文档凭证支持浏览器原生 PDF 流式阅读；登录 Token 不进入 URL。
  const params = new URLSearchParams({ ticket: result.ticket });
  return { url: joinDataHubUrl(`/api/ai/rag/kb/source_document_direct?${params}`), contentType: "application/pdf" };
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
    const url = normalizePreviewUrl(preview.url.trim());
    const isPdf = [new URL(url).pathname, citation.fileName, citation.docName, citation.docKey]
      .some((name) => /\.pdf$/i.test(name ?? ""));
    return { url, contentType: isPdf ? "application/pdf" : undefined };
  }

  const ticket = await loadSourcePreviewTicket(citation, spaceId).catch(() => null);
  if (ticket) return ticket;

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
    { headers, signal: AbortSignal.timeout(120_000) }
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

/** 云盘/知识库那边的文档形状转成取原文用的引用身份。 */
function knowledgeDocumentCitation(
  kbId: string,
  document: DataHubKnowledgeDocument
): DataHubCitationDocument {
  return {
    docId: document.docId?.trim() || document.docKey?.trim() || "",
    docKey: document.docKey?.trim() || undefined,
    kbId,
    docName: document.title,
    sourceAvailable: true,
    fragments: []
  };
}

export async function loadDataHubKnowledgeSource(
  kbId: string,
  document: DataHubKnowledgeDocument
): Promise<DataHubSourceDocumentAccess> {
  const citation = knowledgeDocumentCitation(kbId, document);
  const { session, spaceId } = requireSourceIdentity(citation);

  const ticket = await loadSourcePreviewTicket(citation, spaceId).catch(() => null);
  if (ticket) return ticket;
  return loadDataHubSourceDocumentBlob(spaceId, citation, session.token);
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
  const citation = knowledgeDocumentCitation(kbId, document);
  const { spaceId } = requireSourceIdentity(citation);
  const params = sourceDocumentParams(spaceId, citation);
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

/** MinerU 的相对图片属于当前文档制品，不能相对 SPA 根路径解析。 */
export async function loadDataHubKnowledgeImage(
  kbId: string,
  document: DataHubKnowledgeDocument,
  src: string,
  signal: AbortSignal
): Promise<DataHubSourceDocumentAccess | null> {
  const value = src.trim();
  const gateway = new URL(joinDataHubUrl("/api/ai/rag/kb/document-artifact"), window.location.origin);
  const imageUrl = new URL(value, window.location.origin);
  const protectedArtifact = [window.location.origin, gateway.origin].includes(imageUrl.origin)
    && ["/api/ai/rag/kb/document-artifact", gateway.pathname].includes(imageUrl.pathname);
  let path: string;
  if (protectedArtifact) {
    // Runtime 已按实际解析目录重写地址，只使用路径；身份仍绑定当前预览文档。
    const params = imageUrl.searchParams;
    if ((params.has("kb_id") && params.get("kb_id") !== kbId)
      || (params.has("doc_id") && params.get("doc_id") !== document.docId)
      || (params.has("doc_key") && document.docKey && params.get("doc_key") !== document.docKey)) {
      throw new DataHubServiceError("图片不属于当前文档");
    }
    path = params.get("artifact_path") || "";
  } else {
    // 外部图片沿用 Markdown 的安全 URL 处理，绝不向外部地址发送空间凭据。
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return null;
    try {
      path = decodeURIComponent(value.split(/[?#]/, 1)[0]).replace(/^\.\//, "").replace(/^\//, "");
    } catch {
      throw new DataHubServiceError("图片路径无效");
    }
    if (!/(?:^|\/)images\//.test(path)) return null;
  }
  if (!path || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new DataHubServiceError("图片路径无效");
  }

  const citation = knowledgeDocumentCitation(kbId, document);
  const { session, spaceId } = requireSourceIdentity(citation);
  const params = sourceDocumentParams(spaceId, citation);
  params.set("artifact_path", path);
  const headers = new Headers({ "X-Space-Id": String(spaceId) });
  if (session.token) headers.set("Authorization", `Bearer ${session.token}`);
  const response = await fetch(joinDataHubUrl(`/api/ai/rag/kb/document-artifact?${params}`), {
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)])
  });
  if (!response.ok) {
    if (response.status === 401) expireDataHubSession(session.token);
    throw new DataHubServiceError(await readErrorMessage(response), { status: response.status });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  signal.throwIfAborted();
  const blob = makeSafeSourceBlob(bytes, response.headers.get("Content-Type") || "");
  if (!blob.type.startsWith("image/")) throw new DataHubServiceError("返回内容不是可显示的图片");
  const url = URL.createObjectURL(blob);
  return { url, contentType: blob.type, revoke: () => URL.revokeObjectURL(url) };
}

export type DataHubKnowledgeChunk = {
  id: string;
  /** 后端 chunk_order_index（0 基），缺省用数组下标；展示时才 +1。 */
  order: number;
  tokens?: number;
  content: string;
};

export type DataHubKnowledgeDocumentChunks = {
  docId: string;
  docName: string;
  chunks: DataHubKnowledgeChunk[];
};

function unwrapChunkRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["chunks", "items", "list", "records"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  // requestDataHub 只拆一层 {code,data} 信封，再嵌一层的形状在这里兜底。
  return isRecord(payload.data) || Array.isArray(payload.data) ? unwrapChunkRows(payload.data) : [];
}

function normalizeChunk(value: unknown, index: number): DataHubKnowledgeChunk {
  if (typeof value === "string") {
    return { id: `chunk-${index}`, order: index, content: value.trim() };
  }
  if (!isRecord(value)) {
    return { id: `chunk-${index}`, order: index, content: "" };
  }

  const order = asCount(value.chunk_order_index) ?? asCount(value.chunkOrderIndex) ?? index;
  const content = typeof value.content === "string"
    ? value.content
    : asText(value.text) || asText(value.chunk);
  return {
    id: asText(value.chunk_id) || asText(value.chunkId) || asText(value.id) || `chunk-${order}`,
    order,
    tokens: asCount(value.tokens) ?? asCount(value.token_count) ?? asCount(value.tokenCount),
    content: content.trim()
  };
}

function normalizeDocumentChunks(
  payload: unknown,
  citation: DataHubCitationDocument
): DataHubKnowledgeDocumentChunks {
  const record = isRecord(payload) ? payload : undefined;
  const seen = new Set<string>();
  const chunks = unwrapChunkRows(payload)
    .map((row, index) => ({ chunk: normalizeChunk(row, index), index }))
    // chunk_order_index 才是切块顺序；数组顺序只是它缺席时的兜底。
    .sort((left, right) => left.chunk.order - right.chunk.order || left.index - right.index)
    .map(({ chunk, index }) => {
      if (!seen.has(chunk.id)) {
        seen.add(chunk.id);
        return chunk;
      }
      // React key 不能撞；制品里 chunk_id 缺席时的兜底 id 可能重复。
      return { ...chunk, id: `${chunk.id}-${index}` };
    });

  return {
    docId: asText(record?.doc_id) || citation.docId,
    docName:
      asText(record?.doc_name) || citation.docName || citation.fileName || citation.docKey || "",
    chunks
  };
}

/**
 * PRD U-6 的切块制品（MinIO chunks.json）。响应是裸 JSON 不是 {code,data} 信封；
 * 没有制品时 chunks 为空数组，文档已删是 404、制品坏了是 500，都由 requestDataHub 抛。
 */
export async function loadDataHubKnowledgeDocumentChunks(
  citation: DataHubCitationDocument
): Promise<DataHubKnowledgeDocumentChunks> {
  const { spaceId } = requireSourceIdentity(citation);
  const params = sourceDocumentParams(spaceId, citation);
  const payload = await requestDataHub<unknown>(
    `/api/ai/rag/kb/document-chunks?${params.toString()}`,
    { method: "GET", spaceId, cache: "no-store" }
  );
  return normalizeDocumentChunks(payload, citation);
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

export type DataHubKnowledgeBaseScope = "SPACE" | "DEPARTMENT" | "PERSONAL";

/**
 * 知识库列表。scope 缺省时不传 scope_type，保持后端默认可见范围
 * （数据资产管理页等空间口径页面用）；云盘系页面显式传 PERSONAL。
 */
export async function listDataHubKnowledgeBases(
  scope?: DataHubKnowledgeBaseScope
): Promise<DataHubKnowledgeBase[]> {
  const spaceId = requireSpaceId();
  const path = scope
    ? `${DATA_HUB_KNOWLEDGE_BASE_LIST_PATH}?scope_type=${scope}`
    : DATA_HUB_KNOWLEDGE_BASE_LIST_PATH;
  const payload = await requestDataHub<unknown>(path, {
    method: "GET",
    spaceId
  });
  return normalizeDataHubKnowledgeBases(payload);
}

/**
 * 云盘（我的云盘 / 知识库详情）按空间角色分流口径：
 * 空间管理员不传 scope_type，看后端默认可见范围（与数据资产管理页同口径）；
 * 普通成员只看 scope_type=PERSONAL 的个人知识库。
 * RagController 的 scope_type 只是展示过滤器，不会放大已授权范围。
 *
 * 入参是**空间管理员**（见 useSpaceAdmin），不是 JWT 里的系统管理员 isAdmin。
 */
export function cloudKnowledgeScopeFor(isSpaceAdmin: boolean): DataHubKnowledgeBaseScope | undefined {
  return isSpaceAdmin ? undefined : "PERSONAL";
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
  const sourceAvailable = Boolean(docId || docKey);

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
