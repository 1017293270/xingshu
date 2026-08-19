import { expireDataHubSession, readDataHubSession } from "@/services/dataHubSession";
import { listQueryAssets } from "@/services/queryAssetService";
import type { QueryAsset } from "@/types/analytics";
import type {
  CreateDraftDataBindingInput,
  CreateOfficialDocumentDraftInput,
  DraftDataBinding,
  OfficialDocumentAnalysis,
  OfficialDocumentDraft,
  OfficialDocumentDraftContent,
  OfficialDocumentExportFormat,
  OfficialDocumentExportRecord,
  OfficialDocumentMappingProfile,
  OfficialDocumentRuntimeCapabilities,
  OfficialDocumentServiceState,
  OfficialDocumentTemplate,
  OfficialDocumentTemplateVersion,
  OfficialDocumentWorkspaceSnapshot,
  QueryBindingCandidate,
  UpdateOfficialDocumentMappingInput,
  UpdateOfficialDocumentDraftContentInput,
  UploadOfficialDocumentTemplateResult
} from "@/types/officialDocument";

const requestedApiBaseUrl = (import.meta.env.VITE_OFFICIAL_DOCUMENT_API_BASE_URL ?? "").trim();
const configuredApiMode = (import.meta.env.VITE_OFFICIAL_DOCUMENT_API_MODE ?? "gateway").trim();
const productionDirectAccessRejected = configuredApiMode === "direct-development" && !import.meta.env.DEV;
const configuredApiBaseUrl = productionDirectAccessRejected ? "" : requestedApiBaseUrl;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;

type OfficialDocumentServiceErrorOptions = {
  status?: number;
  code?: string;
  details?: unknown;
};

export class OfficialDocumentServiceError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: OfficialDocumentServiceErrorOptions = {}) {
    super(message);
    this.name = "OfficialDocumentServiceError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    Object.setPrototypeOf(this, OfficialDocumentServiceError.prototype);
  }
}

export type OfficialDocumentService = {
  state: OfficialDocumentServiceState;
  loadWorkspace(): Promise<OfficialDocumentWorkspaceSnapshot>;
  getTemplateAnalysis(templateId: string, versionId: string): Promise<OfficialDocumentAnalysis>;
  getTemplatePreview(templateId: string, versionId: string): Promise<Blob>;
  uploadTemplate(file: File): Promise<UploadOfficialDocumentTemplateResult>;
  updateTemplateMapping(input: UpdateOfficialDocumentMappingInput): Promise<OfficialDocumentMappingProfile>;
  publishTemplate(templateId: string, versionId: string): Promise<OfficialDocumentTemplateVersion>;
  createDraft(input: CreateOfficialDocumentDraftInput): Promise<OfficialDocumentDraft>;
  getDraftContent(draftId: string): Promise<OfficialDocumentDraftContent>;
  updateDraftContent(draftId: string, input: UpdateOfficialDocumentDraftContentInput): Promise<OfficialDocumentDraftContent>;
  getDraftPreview(draftId: string): Promise<Blob>;
  createBinding(draftId: string, input: CreateDraftDataBindingInput): Promise<DraftDataBinding>;
  refreshBindings(draftId: string): Promise<DraftDataBinding[]>;
  detachBinding(draftId: string, bindingId: string): Promise<DraftDataBinding>;
  exportDraft(draftId: string, format: OfficialDocumentExportFormat): Promise<OfficialDocumentExportRecord>;
  downloadExport(exportId: string): Promise<Blob>;
};

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  responseType?: "json" | "blob";
};

type ApiAnalysisJob = {
  status?: string;
  code?: string | null;
  message?: string | null;
  updatedAt?: string;
};

type ApiParagraphFact = {
  index: number;
  text?: string;
  format?: {
    styleName?: string;
    outlineLevel?: number;
    alignment?: number;
    firstLineIndentPoints?: number;
    lineSpacingPoints?: number;
    listItem?: boolean;
    listLevel?: number;
    listLabel?: string;
  };
  runs?: Array<{
    index: number;
    text?: string;
    format?: {
      fontName?: string;
      fontSizePoints?: number;
      bold?: boolean;
      italic?: boolean;
      color?: string;
    };
  }>;
};

type ApiTemplateAnalysis = {
  structureProfile?: {
    engineName?: string;
    engineVersion?: string;
    sections?: unknown[];
    paragraphs?: ApiParagraphFact[];
    tables?: Array<{ index: number; rowCount: number; columnCount: number; text?: string }>;
    featureCounts?: Record<string, number>;
    warnings?: string[];
  };
  engineCapabilityReport?: {
    engineName?: string;
    engineVersion?: string;
    available?: boolean;
    licensed?: boolean;
    evaluationMode?: boolean;
    capabilities?: string[];
    warnings?: string[];
    blockingReasons?: string[];
    checkedAt?: string;
  };
  ooxmlAuditReport?: {
    findings?: Array<{ code: string; severity: string; part?: string; message: string }>;
  };
  warnings?: string[];
};

type ApiMappingProfile = {
  id?: string;
  templateVersionId?: string;
  versionNumber?: number;
  mappings?: Array<{
    slotId: string;
    nodeId: string;
    paragraphIndex: number;
    role: string;
    variantId?: string;
    dataBinding?: boolean;
    required?: boolean;
    slotType?: OfficialDocumentMappingProfile["mappings"][number]["slotType"];
    endParagraphIndex?: number;
    metadata?: Record<string, string>;
  }>;
  createdAt?: string;
};

type ApiTemplateVersion = {
  id: string;
  versionNumber: number;
  status: string;
  originalSha256?: string;
  originalFileName: string;
  originalSize: number;
  createdAt: string;
  analysisJob?: ApiAnalysisJob;
  analysis?: ApiTemplateAnalysis;
  mappingProfile?: ApiMappingProfile;
};

type ApiTemplateView = {
  id: string;
  name: string;
  createdAt: string;
  versions: ApiTemplateVersion[];
};

type ApiAnalysisView = {
  versionId: string;
  status: string;
  analysisJob?: ApiAnalysisJob;
  analysis?: ApiTemplateAnalysis;
  mappingProfile?: ApiMappingProfile;
};

type ApiDraftBinding = {
  id: string;
  slotId: string;
  kind: DraftDataBinding["rendering"];
  queryAssetId: string;
  queryVersionId: string;
  outputKey: string;
  executionId?: string;
  snapshotId?: string;
  dataAsOf?: string;
  status: DraftDataBinding["status"];
};

type ApiDraftSnapshot = {
  id: string;
  templateId: string;
  templateVersionId: string;
  title: string;
  createdAt: string;
  status: string;
  fileVersions?: Array<{ versionNumber: number; createdAt: string }>;
  bindings?: ApiDraftBinding[];
};

type ApiDraftContent = OfficialDocumentDraftContent;

type ApiFidelityReport = {
  passed: boolean;
  baselineSha256: string;
  candidateSha256: string;
  criticalDifferences?: string[];
  warnings?: string[];
  checkedAt: string;
};

type ApiExportRecord = {
  id: string;
  draftId: string;
  status: OfficialDocumentExportRecord["status"];
  format: OfficialDocumentExportFormat;
  sha256?: string;
  fidelityReport?: ApiFidelityReport;
  code?: string;
  message?: string;
  createdAt: string;
};

type ApiCapabilityState = {
  available?: boolean;
  code?: string;
  details?: unknown;
};

type ApiCapabilitiesView = {
  wordEngine?: ApiCapabilityState;
  queryAssets?: ApiCapabilityState;
  limits?: {
    acceptedFileTypes?: string[];
    bindingKinds?: string[];
    exportFormats?: string[];
    previewFormats?: string[];
    editingMode?: string;
  };
};

function joinOfficialDocumentUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function resolveOfficialDocumentErrorMessage(status: number, payload: unknown, statusText: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      const code = typeof record.code === "string" ? record.code : "";
      if (code === "OBJECT_NOT_FOUND" || record.message.includes("文档对象不存在")) {
        return "该模板的编译文件已丢失，无法创建草稿。请改用待校准模板，完成角色映射并发布后再试。";
      }
      if (code === "TEMPLATE_NOT_PUBLISHED") {
        return "只能使用已发布模板创建草稿。请先在校准页保存角色映射并发布。";
      }
      return record.message.trim();
    }
  }

  const raw = typeof payload === "string" ? payload.trim() : "";
  if (/invalid cors request/i.test(raw)) {
    return "当前页面地址未被公文服务允许。请通过星数同源代理访问，不要直连公文服务。";
  }
  if (raw && !/^(forbidden|unauthorized|bad request)$/i.test(raw)) {
    return raw;
  }
  if (status === 403) {
    return "没有完成该操作的权限";
  }
  if (status === 401) {
    return "登录状态无效或已过期";
  }
  return statusText || "公文服务请求失败";
}

async function requestOfficialDocument<T>(baseUrl: string, path: string, options: RequestOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, responseType = "json", headers: inputHeaders, ...init } = options;
  const headers = new Headers(inputHeaders);
  const session = readDataHubSession();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  headers.set("Accept", responseType === "blob" ? "*/*" : "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session.token) headers.set("Authorization", `Bearer ${session.token}`);
  if (session.spaceId !== null) headers.set("X-Space-Id", String(session.spaceId));

  let response: Response;
  try {
    response = await fetch(joinOfficialDocumentUrl(baseUrl, path), {
      ...init,
      headers,
      credentials: "omit",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OfficialDocumentServiceError("公文服务请求超时，请检查服务状态", {
        code: "REQUEST_TIMEOUT"
      });
    }
    throw new OfficialDocumentServiceError("无法连接公文服务，请检查服务地址和网络", {
      code: "SERVICE_UNREACHABLE",
      details: error
    });
  } finally {
    window.clearTimeout(timeoutId);
  }

  const payload = response.ok && responseType === "blob"
    ? await response.blob()
    : await parseResponseBody(response);
  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object" ? payload as Record<string, unknown> : undefined;
    const code = typeof errorPayload?.code === "string" ? errorPayload.code : undefined;
    const message = resolveOfficialDocumentErrorMessage(response.status, payload, response.statusText);

    if (response.status === 401) expireDataHubSession(session.token);
    throw new OfficialDocumentServiceError(
      code === "ENGINE_UNAVAILABLE" ? "Word 引擎未配置或不可用，当前操作已停止" : message,
      { status: response.status, code, details: payload }
    );
  }

  return payload as T;
}

function stableUuid(value: string) {
  const words = [0, 1, 2, 3].map((salt) => {
    let hash = 2166136261 ^ salt;
    for (const character of `${salt}:${value}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  });
  const characters = words.join("").split("");
  characters[12] = "5";
  characters[16] = ((Number.parseInt(characters[16], 16) & 0x3) | 0x8).toString(16);
  const hex = characters.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function assertDocxTemplate(file: File) {
  if (!file.name.toLocaleLowerCase().endsWith(".docx")) {
    throw new OfficialDocumentServiceError("第一版只支持上传 .docx 文件", {
      code: "UNSUPPORTED_FILE_TYPE"
    });
  }
  if (file.size <= 0) {
    throw new OfficialDocumentServiceError("不能上传空文件", { code: "EMPTY_FILE" });
  }
  if (file.size > MAX_TEMPLATE_BYTES) {
    throw new OfficialDocumentServiceError("DOCX 文件不能超过 25 MB", { code: "FILE_TOO_LARGE" });
  }
}

function asArray<T>(payload: unknown, field: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>)[field];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function capabilityDetail(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const reasons = (value as Record<string, unknown>).blockingReasons;
    if (Array.isArray(reasons) && reasons.length > 0 && reasons.every((reason) => typeof reason === "string")) {
      return reasons.join("；");
    }
  }
  return undefined;
}

function mapRuntimeCapabilities(payload: unknown): OfficialDocumentRuntimeCapabilities {
  const source = payload && typeof payload === "object" ? payload as ApiCapabilitiesView : {};
  const limits = source.limits ?? {};
  const state = (value: ApiCapabilityState | undefined, fallbackCode: string) => ({
    available: value?.available === true,
    code: value?.code ?? fallbackCode,
    detail: capabilityDetail(value?.details)
  });
  const supported = <T extends string>(values: string[] | undefined, allowed: readonly T[], fallback: T[]) => {
    const result = (values ?? []).filter((value): value is T => allowed.includes(value as T));
    return result.length > 0 ? result : fallback;
  };
  return {
    wordEngine: state(source.wordEngine, "ENGINE_CAPABILITY_UNKNOWN"),
    queryAssets: state(source.queryAssets, "QUERY_ASSET_CAPABILITY_UNKNOWN"),
    acceptedFileTypes: supported(limits.acceptedFileTypes, [".docx"] as const, [".docx"]),
    bindingKinds: supported(limits.bindingKinds, ["SCALAR", "FACT_SUMMARY", "TABLE"] as const, ["SCALAR", "FACT_SUMMARY", "TABLE"]),
    exportFormats: supported(limits.exportFormats, ["DOCX", "PDF"] as const, ["DOCX"]),
    previewFormats: supported(limits.previewFormats, ["PDF"] as const, ["PDF"]),
    editingMode: limits.editingMode === "WORD" ? "WORD" : "STRUCTURED"
  };
}

const officialRoleLabels: Record<string, string> = {
  TITLE: "标题",
  RECIPIENT: "主送机关",
  BODY: "正文",
  HEADING_1: "一级标题",
  HEADING_2: "二级标题",
  HEADING_3: "三级标题",
  ATTACHMENT_NOTE: "附件说明",
  SIGNATURE: "落款",
  DATE: "日期",
  IMPRINT: "版记",
  PRESERVE: "原样保留"
};

function mapMappingProfile(profile: ApiMappingProfile | undefined, versionId: string): OfficialDocumentMappingProfile | undefined {
  if (!profile) return undefined;
  return {
    id: profile.id ?? stableUuid(`${versionId}:mapping:${profile.versionNumber ?? 0}`),
    templateVersionId: profile.templateVersionId ?? versionId,
    versionNo: profile.versionNumber ?? 0,
    mappings: (profile.mappings ?? []).map((mapping) => ({
      slotId: mapping.slotId,
      nodeId: mapping.nodeId,
      paragraphIndex: mapping.paragraphIndex,
      role: (officialRoleLabels[mapping.role] ? mapping.role : "PRESERVE") as OfficialDocumentMappingProfile["mappings"][number]["role"],
      variantId: mapping.variantId,
      dataBinding: Boolean(mapping.dataBinding),
      required: Boolean(mapping.required),
      slotType: mapping.slotType,
      endParagraphIndex: mapping.endParagraphIndex,
      metadata: mapping.metadata
    })),
    createdAt: profile.createdAt ?? ""
  };
}

function mapTemplateStatus(status: string): OfficialDocumentTemplate["status"] {
  if (status === "PUBLISHED") return "PUBLISHED";
  if (status === "READY_FOR_MAPPING") return "NEEDS_REVIEW";
  if (status === "BLOCKED" || status === "ENGINE_UNAVAILABLE") return "BLOCKED";
  if (status === "FAILED") return "FAILED";
  return "ANALYZING";
}

function mapDraftStatus(status: string): OfficialDocumentDraft["status"] {
  if (status === "READY" || status === "EDITING" || status === "VALIDATING" || status === "BLOCKED") {
    return status;
  }
  return status === "ENGINE_UNAVAILABLE" ? "BLOCKED" : "EDITING";
}

function styleSummary(paragraph: ApiParagraphFact) {
  const summary: string[] = [];
  const paragraphFormat = paragraph.format;
  const firstRun = paragraph.runs?.find((run) => Boolean(run.text?.trim())) ?? paragraph.runs?.[0];
  const runFormat = firstRun?.format;
  if (paragraphFormat?.styleName) summary.push(`样式 ${paragraphFormat.styleName}`);
  if (runFormat?.fontName) summary.push(runFormat.fontName);
  if (runFormat?.fontSizePoints) summary.push(`${runFormat.fontSizePoints}pt`);
  if (runFormat?.bold) summary.push("加粗");
  if (runFormat?.italic) summary.push("斜体");
  if (runFormat?.color) summary.push(`颜色 ${runFormat.color}`);
  if (paragraphFormat?.listItem) {
    summary.push(`列表 ${paragraphFormat.listLabel || `层级 ${paragraphFormat.listLevel ?? 0}`}`);
  }
  if (paragraphFormat?.firstLineIndentPoints) summary.push(`首行缩进 ${paragraphFormat.firstLineIndentPoints}pt`);
  if (paragraphFormat?.lineSpacingPoints) summary.push(`行距 ${paragraphFormat.lineSpacingPoints}pt`);
  return summary;
}

type SuggestedOfficialDocumentRole = OfficialDocumentAnalysis["structureNodes"][number]["role"];

function suggestParagraphRoles(paragraphs: ApiParagraphFact[]) {
  const roles = new Map<number, SuggestedOfficialDocumentRole>();
  const normalized = paragraphs.map((paragraph) => paragraph.text?.replace(/\s+/g, "").trim() ?? "");
  const nonEmptyIndexes = paragraphs
    .map((paragraph, index) => ({ paragraph, index }))
    .filter(({ index }) => Boolean(normalized[index]));
  let dateIndex: number | undefined;
  for (let cursor = nonEmptyIndexes.length - 1; cursor >= 0; cursor -= 1) {
    const candidate = nonEmptyIndexes[cursor].index;
    if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(normalized[candidate])) {
      dateIndex = candidate;
      break;
    }
  }

  for (const { paragraph, index } of nonEmptyIndexes) {
    const text = normalized[index];
    const style = paragraph.format?.styleName?.toLocaleLowerCase() ?? "";
    const outlineLevel = paragraph.format?.outlineLevel;
    const listLevel = paragraph.format?.listLevel;
    let role: SuggestedOfficialDocumentRole = "BODY";

    if (style.includes("主标题") || style === "标题" || style.includes("document title")) {
      role = "TITLE";
    } else if (/^(抄送|印发|发至)[：:]/.test(text) || /印发$/.test(text)) {
      role = "IMPRINT";
    } else if (/^附件(?:\d+|[一二三四五六七八九十]+)?[：:、.．]/.test(text)) {
      role = "ATTACHMENT_NOTE";
    } else if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(text)) {
      role = "DATE";
    } else if (text.length <= 100 && /[：:]$/.test(text)
      && /(各|有关|单位|部门|人民政府|委员会|办公室)/.test(text)) {
      role = "RECIPIENT";
    } else if (/^[一二三四五六七八九十]+、/.test(text)
      || /(?:标题|heading)\s*1\b/i.test(style)
      || outlineLevel === 0
      || (paragraph.format?.listItem && listLevel === 0 && text.length <= 100)) {
      role = "HEADING_1";
    } else if (/^[（(][一二三四五六七八九十]+[）)]/.test(text)
      || /(?:标题|heading)\s*2\b/i.test(style)
      || outlineLevel === 1
      || (paragraph.format?.listItem && listLevel === 1 && text.length <= 100)) {
      role = "HEADING_2";
    } else if (/^\d+[.．、]/.test(text)
      || /(?:标题|heading)\s*3\b/i.test(style)
      || outlineLevel === 2
      || (paragraph.format?.listItem && listLevel === 2 && text.length <= 100)) {
      role = "HEADING_3";
    }
    roles.set(paragraph.index, role);
  }

  const firstNonEmpty = nonEmptyIndexes[0]?.index;
  if (firstNonEmpty !== undefined && roles.get(paragraphs[firstNonEmpty].index) === "BODY") {
    roles.set(paragraphs[firstNonEmpty].index, "TITLE");
  }
  if (dateIndex !== undefined) {
    let previous: number | undefined;
    for (let cursor = nonEmptyIndexes.length - 1; cursor >= 0; cursor -= 1) {
      if (nonEmptyIndexes[cursor].index < dateIndex) {
        previous = nonEmptyIndexes[cursor].index;
        break;
      }
    }
    if (previous !== undefined && roles.get(paragraphs[previous].index) === "BODY"
      && normalized[previous].length <= 80
      && /(局|委员会|人民政府|公司|办公室|中心|集团)$/.test(normalized[previous])) {
      roles.set(paragraphs[previous].index, "SIGNATURE");
    }
  }
  paragraphs.forEach((paragraph, index) => {
    if (!normalized[index]) roles.set(paragraph.index, "PRESERVE");
  });
  return roles;
}

function mapAnalysis(
  versionId: string,
  status: string,
  analysisJob?: ApiAnalysisJob,
  source?: ApiTemplateAnalysis,
  mappingProfile?: ApiMappingProfile
): OfficialDocumentAnalysis {
  const profile = source?.structureProfile;
  const capability = source?.engineCapabilityReport;
  const mappingByParagraph = new Map(
    (mappingProfile?.mappings ?? [])
      .filter((mapping) => mapping.slotType !== "DATA_TABLE")
      .map((mapping) => [mapping.paragraphIndex, mapping])
  );
  const mappingByTable = new Map(
    (mappingProfile?.mappings ?? [])
      .filter((mapping) => mapping.slotType === "DATA_TABLE")
      .map((mapping) => [mapping.paragraphIndex, mapping])
  );
  const suggestedRoles = suggestParagraphRoles(profile?.paragraphs ?? []);
  const structureNodes = (profile?.paragraphs ?? []).map((paragraph, index) => {
    const mapping = mappingByParagraph.get(paragraph.index);
    const suggestedRole = suggestedRoles.get(paragraph.index) ?? "UNKNOWN";
    const role = mapping && officialRoleLabels[mapping.role] ? mapping.role : suggestedRole;
    return {
      id: mapping?.nodeId || `paragraph:${paragraph.index}`,
      order: index + 1,
      paragraphIndex: paragraph.index,
      slotId: mapping?.slotId ?? stableUuid(`${versionId}:paragraph:${paragraph.index}`),
      variantId: mapping?.variantId,
      slotType: mapping?.slotType,
      endParagraphIndex: mapping?.endParagraphIndex,
      role: role as OfficialDocumentAnalysis["structureNodes"][number]["role"],
      roleLabel: role === "UNKNOWN" ? `段落 ${paragraph.index + 1}（待校准）` : officialRoleLabels[role],
      preview: paragraph.text?.trim() || "空段落（保留格式）",
      empty: !paragraph.text?.trim(),
      editable: role !== "PRESERVE",
      dataBinding: Boolean(mapping?.dataBinding),
      required: Boolean(mapping?.required),
      styleSummary: styleSummary(paragraph)
    };
  });
  const tableNodes = (profile?.tables ?? []).map((table, index) => {
    const mapping = mappingByTable.get(table.index);
    return {
      id: mapping?.nodeId ?? `table:${table.index}`,
      order: structureNodes.length + index + 1,
      tableIndex: table.index,
      slotId: mapping?.slotId ?? stableUuid(`${versionId}:table:${table.index}`),
      variantId: mapping?.variantId ?? `table-${table.index + 1}`,
      slotType: mapping?.slotType,
      endParagraphIndex: mapping?.endParagraphIndex,
      role: mapping ? "BODY" as const : "UNKNOWN" as const,
      roleLabel: mapping ? `表格 ${table.index + 1}（问数小表）` : `表格 ${table.index + 1}（静态保留）`,
      preview: table.text?.trim() || `${table.rowCount} 行 × ${table.columnCount} 列`,
      empty: false,
      editable: Boolean(mapping),
      dataBinding: Boolean(mapping?.dataBinding),
      required: false,
      styleSummary: [`${table.rowCount} 行`, `${table.columnCount} 列`]
    };
  });

  const risks: OfficialDocumentAnalysis["risks"] = [];
  for (const [index, finding] of (source?.ooxmlAuditReport?.findings ?? []).entries()) {
    risks.push({
      id: `ooxml:${finding.code}:${index}`,
      code: finding.code,
      severity: finding.severity === "BLOCKING" ? "BLOCKING" : finding.severity === "WARNING" ? "WARNING" : "INFO",
      title: finding.code,
      detail: finding.message,
      scope: finding.part
    });
  }
  for (const [index, warning] of [...(source?.warnings ?? []), ...(profile?.warnings ?? []), ...(capability?.warnings ?? [])].entries()) {
    risks.push({
      id: `warning:${index}`,
      code: "ENGINE_WARNING",
      severity: "WARNING",
      title: "格式能力警告",
      detail: warning
    });
  }
  for (const [index, reason] of (capability?.blockingReasons ?? []).entries()) {
    risks.push({
      id: `engine-blocking:${index}`,
      code: "ENGINE_BLOCKING_REASON",
      severity: "BLOCKING",
      title: "Word 引擎阻断",
      detail: reason
    });
  }
  if (["BLOCKED", "ENGINE_UNAVAILABLE", "FAILED"].includes(status) && analysisJob?.message) {
    risks.push({
      id: `analysis-job:${analysisJob.code ?? status}`,
      code: analysisJob.code ?? status,
      severity: "BLOCKING",
      title: status === "ENGINE_UNAVAILABLE" ? "Word 引擎不可用" : "模板分析未通过",
      detail: analysisJob.message
    });
  }

  const extractedFeatureCount = Object.values(profile?.featureCounts ?? {}).reduce(
    (sum, count) => sum + (Number.isFinite(count) ? count : 0),
    0
  );
  const licenseMode = status === "ENGINE_UNAVAILABLE" || capability?.available === false
    ? "UNAVAILABLE"
    : capability?.evaluationMode
      ? "EVALUATION"
      : capability?.available && capability.licensed
        ? "FILE"
        : "UNAVAILABLE";

  return {
    templateVersionId: versionId,
    sectionCount: profile?.sections?.length ?? 0,
    structureNodes: [...structureNodes, ...tableNodes],
    mappingProfile: mapMappingProfile(mappingProfile, versionId),
    risks,
    capability: {
      engineName: capability?.engineName ?? profile?.engineName ?? "Syncfusion DocIO",
      engineVersion: capability?.engineVersion ?? profile?.engineVersion ?? "unknown",
      licenseMode,
      onlineEditorCompatible: null,
      extractedFeatureCount,
      fontSubstitutions: [],
      unsupportedWarnings: [...(profile?.warnings ?? []), ...(capability?.warnings ?? [])],
      blockingReasons: capability?.blockingReasons ?? []
    },
    analyzedAt: analysisJob?.updatedAt
  };
}

function mapTemplateVersion(version: ApiTemplateVersion): OfficialDocumentTemplateVersion {
  return {
    id: version.id,
    versionNo: version.versionNumber,
    fileName: version.originalFileName,
    fileSize: version.originalSize,
    sha256: version.originalSha256,
    createdAt: version.createdAt,
    analysis: version.analysis
      ? mapAnalysis(version.id, version.status, version.analysisJob, version.analysis, version.mappingProfile)
      : undefined
  };
}

function mapTemplate(view: ApiTemplateView): OfficialDocumentTemplate {
  const version = [...view.versions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
  if (!version) {
    throw new OfficialDocumentServiceError("模板没有可用版本", { code: "TEMPLATE_VERSION_MISSING" });
  }
  return {
    id: view.id,
    name: view.name,
    status: mapTemplateStatus(version.status),
    source: "LIVE",
    currentVersion: mapTemplateVersion(version),
    updatedAt: version.createdAt || view.createdAt
  };
}

function mapExportRecord(record: ApiExportRecord): OfficialDocumentExportRecord {
  return {
    id: record.id,
    draftId: record.draftId,
    status: record.status,
    format: record.format,
    sha256: record.sha256,
    fidelityReport: record.fidelityReport
      ? {
          ...record.fidelityReport,
          criticalDifferences: record.fidelityReport.criticalDifferences ?? [],
          warnings: record.fidelityReport.warnings ?? []
        }
      : undefined,
    code: record.code,
    message: record.message,
    createdAt: record.createdAt
  };
}

function mapBinding(binding: ApiDraftBinding): DraftDataBinding {
  return {
    id: binding.id,
    queryAssetId: binding.queryAssetId,
    queryVersionId: binding.queryVersionId,
    outputKey: binding.outputKey,
    targetSlotTag: binding.slotId.startsWith("xs:") ? binding.slotId : `xs:binding:${binding.slotId}`,
    rendering: binding.kind,
    status: binding.status,
    snapshotId: binding.snapshotId,
    executionId: binding.executionId,
    cutoffAt: binding.dataAsOf,
    persisted: true
  };
}

function mapDraft(snapshot: ApiDraftSnapshot, templateNames: Map<string, string>): OfficialDocumentDraft {
  const fileVersions = snapshot.fileVersions ?? [];
  const currentFileVersion = [...fileVersions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
  return {
    id: snapshot.id,
    title: snapshot.title,
    status: mapDraftStatus(snapshot.status),
    source: "LIVE",
    templateId: snapshot.templateId,
    templateVersionId: snapshot.templateVersionId,
    templateName: templateNames.get(snapshot.templateId) ?? "公文模板",
    currentFileVersionNo: currentFileVersion?.versionNumber ?? 1,
    updatedAt: currentFileVersion?.createdAt ?? snapshot.createdAt,
    bindings: (snapshot.bindings ?? []).map(mapBinding)
  };
}

function authenticatedActor() {
  const user = readDataHubSession().user;
  if (!user) {
    throw new OfficialDocumentServiceError("登录信息缺失，不能创建公文草稿或编辑会话", {
      status: 401,
      code: "ACTOR_REQUIRED"
    });
  }
  return { actorName: user.username };
}

function toBackendSlotId(targetSlotTag: string) {
  return targetSlotTag.trim().replace(/^xs:binding:/i, "");
}

function mapQueryAsset(asset: QueryAsset): QueryBindingCandidate | null {
  const version = asset.stableVersion ?? asset.versions?.find((candidate) => candidate.id === asset.stableVersionId);
  if (!version) return null;

  return {
    assetId: asset.id,
    assetName: asset.name,
    versionId: version.id,
    versionLabel: `稳定版本 v${version.versionNo}`,
    source: "LIVE",
    outputs: version.outputs.map((output) => ({
      outputKey: output.outputKey,
      label: output.label || output.outputKey,
      supportedRenderings: ["SCALAR", "FACT_SUMMARY", "TABLE"],
      columns: output.columns.map((column) => ({
        columnId: column.columnId || column.key,
        label: column.title || column.label || column.key
      }))
    }))
  };
}

function createHttpService(baseUrl: string): OfficialDocumentService {
  return {
    state: {
      configured: true,
      mode: "live",
      label: "公文服务地址已配置",
      message: "正在以 /v1/capabilities 的实际结果判断 Syncfusion、PDF 和问数能力。"
    },
    async loadWorkspace() {
      const [capabilitiesPayload, templatesPayload, draftsPayload, assets] = await Promise.all([
        requestOfficialDocument<unknown>(baseUrl, "/v1/capabilities"),
        requestOfficialDocument<unknown>(baseUrl, "/v1/templates"),
        requestOfficialDocument<unknown>(baseUrl, "/v1/drafts"),
        listQueryAssets().catch(() => [] as QueryAsset[])
      ]);
      const templates = asArray<ApiTemplateView>(templatesPayload, "items").map(mapTemplate);
      const templateNames = new Map(templates.map((template) => [template.id, template.name]));
      const currentUserId = readDataHubSession().user?.userId;
      const queryBindingCandidates = assets
        .filter((asset) => currentUserId !== undefined && asset.ownerUserId === currentUserId)
        .map(mapQueryAsset)
        .filter((candidate): candidate is QueryBindingCandidate => Boolean(candidate));
      const queryAssetNames = new Map(queryBindingCandidates.map((candidate) => [candidate.assetId, candidate.assetName]));
      const drafts = asArray<ApiDraftSnapshot>(draftsPayload, "items").map((draft) => {
        const mapped = mapDraft(draft, templateNames);
        return {
          ...mapped,
          bindings: mapped.bindings.map((binding) => ({
            ...binding,
            queryAssetName: queryAssetNames.get(binding.queryAssetId)
          }))
        };
      });
      return {
        source: "LIVE",
        capabilities: mapRuntimeCapabilities(capabilitiesPayload),
        templates,
        drafts,
        queryBindingCandidates
      };
    },
    async getTemplateAnalysis(templateId, versionId) {
      const view = await requestOfficialDocument<ApiAnalysisView>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/analysis`
      );
      return mapAnalysis(view.versionId, view.status, view.analysisJob, view.analysis, view.mappingProfile);
    },
    async getTemplatePreview(templateId, versionId) {
      return requestOfficialDocument<Blob>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/preview.pdf`,
        { responseType: "blob", timeoutMs: 60_000 }
      );
    },
    async uploadTemplate(file) {
      assertDocxTemplate(file);
      const formData = new FormData();
      formData.set("file", file);
      const view = await requestOfficialDocument<ApiTemplateView>(baseUrl, "/v1/templates", {
        method: "POST",
        body: formData,
        timeoutMs: 60_000
      });
      return {
        source: "LIVE",
        persisted: true,
        template: mapTemplate(view),
        message: "模板已上传，正在执行安全检查和格式分析。"
      };
    },
    async updateTemplateMapping(input) {
      const profile = await requestOfficialDocument<ApiMappingProfile>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(input.templateId)}/versions/${encodeURIComponent(input.templateVersionId)}/mapping`,
        {
          method: "PUT",
          body: JSON.stringify({
            mappings: input.mappings.map((mapping) => ({
              ...mapping,
              metadata: mapping.metadata ?? {}
            }))
          })
        }
      );
      const mapped = mapMappingProfile(profile, input.templateVersionId);
      if (!mapped) {
        throw new OfficialDocumentServiceError("公文服务没有返回映射版本", {
          code: "MAPPING_PROFILE_MISSING"
        });
      }
      return mapped;
    },
    async publishTemplate(templateId, versionId) {
      const version = await requestOfficialDocument<ApiTemplateVersion>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}:publish`,
        { method: "POST" }
      );
      return mapTemplateVersion(version);
    },
    async createDraft(input) {
      authenticatedActor();
      const snapshot = await requestOfficialDocument<ApiDraftSnapshot>(baseUrl, "/v1/drafts", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return mapDraft(snapshot, new Map([[input.templateId, "公文模板"]]));
    },
    async getDraftContent(draftId) {
      return requestOfficialDocument<ApiDraftContent>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/content`
      );
    },
    async updateDraftContent(draftId, input) {
      return requestOfficialDocument<ApiDraftContent>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/content`,
        { method: "PUT", body: JSON.stringify(input) }
      );
    },
    async getDraftPreview(draftId) {
      return requestOfficialDocument<Blob>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/preview`,
        { method: "POST", responseType: "blob", timeoutMs: 90_000 }
      );
    },
    async createBinding(draftId, input) {
      const bindingId = crypto.randomUUID();
      const binding = await requestOfficialDocument<ApiDraftBinding>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/bindings/${encodeURIComponent(bindingId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            slotId: toBackendSlotId(input.targetSlotTag),
            kind: input.rendering,
            queryAssetId: input.queryAssetId,
            queryVersionId: input.queryVersionId,
            outputKey: input.outputKey,
            selector: input.selector ?? {},
            parameters: input.parameters ?? {},
            formatter: input.formatter
          })
        }
      );
      return { ...mapBinding(binding), queryAssetName: input.queryAssetName };
    },
    async refreshBindings(draftId) {
      const bindings = await requestOfficialDocument<ApiDraftBinding[]>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/bindings:refresh`,
        { method: "POST" }
      );
      return bindings.map(mapBinding);
    },
    async detachBinding(draftId, bindingId) {
      const binding = await requestOfficialDocument<ApiDraftBinding>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/bindings/${encodeURIComponent(bindingId)}:detach`,
        { method: "POST" }
      );
      return mapBinding(binding);
    },
    async exportDraft(draftId, format) {
      const record = await requestOfficialDocument<ApiExportRecord>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/exports`,
        {
          method: "POST",
          body: JSON.stringify({ format })
        }
      );
      return mapExportRecord(record);
    },
    async downloadExport(exportId) {
      return requestOfficialDocument<Blob>(
        baseUrl,
        `/v1/exports/${encodeURIComponent(exportId)}/download`,
        { responseType: "blob" }
      );
    }
  };
}

function createUnconfiguredService(): OfficialDocumentService {
  const unavailable = async (): Promise<never> => {
    throw new OfficialDocumentServiceError("线上公文服务地址未配置，已停止请求且不会切换演示数据", {
      code: "OFFICIAL_DOCUMENT_API_NOT_CONFIGURED"
    });
  };
  return {
    state: {
      configured: false,
      mode: "live",
      label: "线上公文服务未配置",
      message: "请配置 VITE_OFFICIAL_DOCUMENT_API_BASE_URL；生产模式不会自动切换本地演示数据。"
    },
    loadWorkspace: unavailable,
    getTemplateAnalysis: unavailable,
    getTemplatePreview: unavailable,
    uploadTemplate: unavailable,
    updateTemplateMapping: unavailable,
    publishTemplate: unavailable,
    createDraft: unavailable,
    getDraftContent: unavailable,
    updateDraftContent: unavailable,
    getDraftPreview: unavailable,
    createBinding: unavailable,
    refreshBindings: unavailable,
    detachBinding: unavailable,
    exportDraft: unavailable,
    downloadExport: unavailable
  };
}

export function createOfficialDocumentService(baseUrl = configuredApiBaseUrl): OfficialDocumentService {
  if (baseUrl.trim()) return createHttpService(baseUrl.trim());
  return createUnconfiguredService();
}

export const officialDocumentService = createOfficialDocumentService();
export const officialDocumentServiceState = officialDocumentService.state;

export const loadOfficialDocumentWorkspace = () => officialDocumentService.loadWorkspace();
export const getOfficialDocumentTemplateAnalysis = (templateId: string, versionId: string) =>
  officialDocumentService.getTemplateAnalysis(templateId, versionId);
export const getOfficialDocumentTemplatePreview = (templateId: string, versionId: string) =>
  officialDocumentService.getTemplatePreview(templateId, versionId);
export const uploadOfficialDocumentTemplate = (file: File) => officialDocumentService.uploadTemplate(file);
export const updateOfficialDocumentTemplateMapping = (input: UpdateOfficialDocumentMappingInput) =>
  officialDocumentService.updateTemplateMapping(input);
export const publishOfficialDocumentTemplate = (templateId: string, versionId: string) =>
  officialDocumentService.publishTemplate(templateId, versionId);
export const createOfficialDocumentDraft = (input: CreateOfficialDocumentDraftInput) =>
  officialDocumentService.createDraft(input);
export const getOfficialDocumentDraftContent = (draftId: string) =>
  officialDocumentService.getDraftContent(draftId);
export const updateOfficialDocumentDraftContent = (draftId: string, input: UpdateOfficialDocumentDraftContentInput) =>
  officialDocumentService.updateDraftContent(draftId, input);
export const getOfficialDocumentDraftPreview = (draftId: string) =>
  officialDocumentService.getDraftPreview(draftId);
export const createOfficialDocumentBinding = (draftId: string, input: CreateDraftDataBindingInput) =>
  officialDocumentService.createBinding(draftId, input);
export const refreshOfficialDocumentBindings = (draftId: string) =>
  officialDocumentService.refreshBindings(draftId);
export const detachOfficialDocumentBinding = (draftId: string, bindingId: string) =>
  officialDocumentService.detachBinding(draftId, bindingId);
export const exportOfficialDocumentDraft = (draftId: string, format: OfficialDocumentExportFormat) =>
  officialDocumentService.exportDraft(draftId, format);
export const downloadOfficialDocumentExport = (exportId: string) =>
  officialDocumentService.downloadExport(exportId);
