import { expireDataHubSession, readDataHubSession } from "@/services/dataHubSession";
import { listQueryAssets } from "@/services/queryAssetService";
import type { QueryAsset } from "@/types/analytics";
import type {
  BindOfficialDocumentContentProfileInput,
  CreateDraftDataBindingInput,
  CreateOfficialDocumentDraftInput,
  DraftDataBinding,
  OfficialDocumentAnalysis,
  OfficialDocumentContentProfile,
  OfficialDocumentWritingLogicPlan,
  OfficialDocumentDraft,
  OfficialDocumentDraftContent,
  OfficialDocumentExportFormat,
  OfficialDocumentExportRecord,
  OfficialDocumentMappingProfile,
  OfficialDocumentRuntimeCapabilities,
  OfficialDocumentServiceState,
  OfficialDocumentStructureNode,
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
const EXPORT_TIMEOUT_MS = 90_000;
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

export type OfficialDocumentTransientArtifactInput = {
  templateId: string;
  templateVersionId: string;
  title: string;
  fixedValues: OfficialDocumentDraftContent["fixedValues"];
  blocks: OfficialDocumentDraftContent["blocks"];
};

export type OfficialDocumentService = {
  state: OfficialDocumentServiceState;
  loadWorkspace(): Promise<OfficialDocumentWorkspaceSnapshot>;
  getTemplateAnalysis(templateId: string, versionId: string): Promise<OfficialDocumentAnalysis>;
  getTemplatePreview(templateId: string, versionId: string): Promise<Blob>;
  uploadTemplate(file: File): Promise<UploadOfficialDocumentTemplateResult>;
  listContentProfiles(templateId: string, versionId: string): Promise<OfficialDocumentContentProfile[]>;
  getContentProfile(profileId: string): Promise<OfficialDocumentContentProfile>;
  uploadContentProfile(
    templateId: string,
    versionId: string,
    file: File,
    name?: string
  ): Promise<OfficialDocumentContentProfile>;
  createTextContentProfile(
    templateId: string,
    versionId: string,
    input: { name?: string; text: string }
  ): Promise<OfficialDocumentContentProfile>;
  saveContentProfileAnalysis(
    profileId: string,
    analysis: OfficialDocumentWritingLogicPlan
  ): Promise<OfficialDocumentContentProfile>;
  confirmContentProfile(
    profileId: string,
    analysis: OfficialDocumentWritingLogicPlan
  ): Promise<OfficialDocumentContentProfile>;
  updateTemplateMapping(input: UpdateOfficialDocumentMappingInput): Promise<OfficialDocumentMappingProfile>;
  publishTemplate(templateId: string, versionId: string): Promise<OfficialDocumentTemplateVersion>;
  createDraft(input: CreateOfficialDocumentDraftInput): Promise<OfficialDocumentDraft>;
  getDraftContent(draftId: string): Promise<OfficialDocumentDraftContent>;
  updateDraftContent(draftId: string, input: UpdateOfficialDocumentDraftContentInput): Promise<OfficialDocumentDraftContent>;
  bindContentProfile(draftId: string, input: BindOfficialDocumentContentProfileInput): Promise<OfficialDocumentDraftContent>;
  getDraftPreview(draftId: string): Promise<Blob>;
  getTransientPreview(input: OfficialDocumentTransientArtifactInput): Promise<Blob>;
  createBinding(draftId: string, input: CreateDraftDataBindingInput): Promise<DraftDataBinding>;
  refreshBindings(draftId: string): Promise<DraftDataBinding[]>;
  detachBinding(draftId: string, bindingId: string): Promise<DraftDataBinding>;
  exportDraft(draftId: string, format: OfficialDocumentExportFormat): Promise<OfficialDocumentExportRecord>;
  exportTransient(input: OfficialDocumentTransientArtifactInput, format: OfficialDocumentExportFormat): Promise<Blob>;
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
    tables?: Array<{
      index: number;
      rowCount: number;
      columnCount: number;
      text?: string;
      cells?: Array<{ rowIndex: number; columnIndex: number; text?: string }>;
    }>;
    headersAndFooters?: Array<{ sectionIndex: number; type: number; text?: string }>;
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
  content?: ApiDraftContent;
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
        return "该模板的编译文件已丢失，无法创建草稿。请重新上传模板后再试。";
      }
      if (code === "TEMPLATE_NOT_PUBLISHED") {
        return "模板还不能起草。请重新打开模板并点击“按模板新建草稿”。";
      }
      if (code === "DRAFT_NOT_READY" || record.message.includes("READY 状态")) {
        return "这篇草稿还不能导出。内容保存完成后即可导出 Word";
      }
      if (code === "LIBREOFFICE_UNAVAILABLE" || record.message.includes("LibreOffice")) {
        return "PDF 暂时不能生成，请先导出 Word";
      }
      if (code === "SYNCFUSION_GENERATE_FAILED") {
        return "按模板生成 Word 失败。请检查正文后重试";
      }
      if (code === "FIDELITY_CHECK_FAILED") {
        return "导出文件没有通过版式检查。请先导出 Word，或调整正文后再试";
      }
      if (code === "COMPILED_TEMPLATE_HASH_MISMATCH") {
        return "模板文件已变更，请重新打开模板并创建草稿后再导出";
      }
      return record.message.trim();
    }
  }

  const raw = typeof payload === "string" ? payload.trim() : "";
  const bareNotFound = status === 404 && (
    /^not found$/i.test(statusText.trim())
    || /^not found$/i.test(raw)
    || (payload && typeof payload === "object"
      && String((payload as Record<string, unknown>).error ?? "").toLocaleLowerCase() === "not found")
  );
  if (bareNotFound) {
    return "当前环境尚未启用这项报告能力，请更新报告服务后重试";
  }
  if (/invalid cors request/i.test(raw)) {
    return "当前页面地址未被报告服务允许。请通过星数同源代理访问，不要直连报告服务。";
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
  return statusText || "报告服务请求失败";
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
      throw new OfficialDocumentServiceError("报告服务请求超时，请检查服务状态", {
        code: "REQUEST_TIMEOUT"
      });
    }
    throw new OfficialDocumentServiceError("无法连接报告服务，请检查服务地址和网络", {
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

/**
 * 上传/创建接口返回的模板视图。网关有时会包一层信封（data / template / item），
 * 直接当 ApiTemplateView 用会在 mapTemplate 里抛出原生 TypeError，
 * 弹窗只能显示一句英文，看不出到底是解析失败还是服务报错。
 */
function asTemplateView(payload: unknown): ApiTemplateView {
  const unwrapped = (() => {
    let candidate = payload;
    for (const key of ["data", "template", "item", "result"]) {
      if (
        candidate
        && typeof candidate === "object"
        && !Array.isArray(candidate)
        && !("versions" in candidate)
        && key in (candidate as Record<string, unknown>)
      ) {
        candidate = (candidate as Record<string, unknown>)[key];
      }
    }
    return candidate;
  })();

  if (
    !unwrapped
    || typeof unwrapped !== "object"
    || typeof (unwrapped as ApiTemplateView).id !== "string"
    || !Array.isArray((unwrapped as ApiTemplateView).versions)
  ) {
    throw new OfficialDocumentServiceError("报告服务返回的模板结构无法识别，请把接口响应反馈给管理员", {
      code: "TEMPLATE_VIEW_MALFORMED",
      details: payload
    });
  }

  return unwrapped as ApiTemplateView;
}

function capabilityDetail(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = [record.blockingReasons, record.warnings]
      .filter((item): item is unknown[] => Array.isArray(item))
      .flat()
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (parts.length > 0) return parts.join("；");
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
    if (values === undefined) return fallback;
    return values.filter((value): value is T => allowed.includes(value as T));
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
  ISSUING_AUTHORITY: "发文机关（红头）",
  TABLE_TEXT: "表格文字",
  HEADER_FOOTER: "页眉页脚文字",
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

function looksLikeIssuingAuthority(value: string) {
  const text = value.replace(/[\s\t]+/g, "").trim();
  if (!text || text.length > 80) return false;
  return /(?:公司|集团|人民政府|委员会|办公室|中心|局|院|党组|党委)$/.test(text)
    || /^[XＸx×*＊＿_]{4,}(?:公司|集团|人民政府|委员会|办公室|中心|局|院)?$/.test(text);
}

function looksLikeDocumentNumberLine(value: string) {
  const text = value.replace(/[\s\t]+/g, "").trim();
  return /〔(?:\d{4}|[XＸx×*＊＿_]{4})〕/.test(text) || /签发人[：:]/.test(text);
}

function looksLikeDocumentTitle(value: string) {
  const text = value.replace(/[\s\t]+/g, "").trim();
  if (!text || text.length > 120) return false;
  return /^关于.+(?:的)?(?:报告|请示|通知|决定|通报|函|批复|公告)$/.test(text)
    || /(?:工作报告|工作汇报|情况报告)$/.test(text);
}

function isRedFormat(paragraph: ApiParagraphFact) {
  const run = paragraph.runs?.find((item) => Boolean(item.text?.trim())) ?? paragraph.runs?.[0];
  const color = run?.format?.color?.replace(/\s+/g, "").toLocaleLowerCase() ?? "";
  return (run?.format?.fontSizePoints ?? 0) >= 30
    && (color.includes("ff0000") || color.includes("r=255,g=0,b=0") || color.includes("255,0,0"));
}

function suggestParagraphRoles(paragraphs: ApiParagraphFact[]) {
  const roles = new Map<number, SuggestedOfficialDocumentRole>();
  const normalized = paragraphs.map((paragraph) => paragraph.text?.replace(/\s+/g, "").trim() ?? "");
  const nonEmptyIndexes = paragraphs
    .map((paragraph, index) => ({ paragraph, index }))
    .filter(({ index }) => Boolean(normalized[index]));
  const ordinalByIndex = new Map(nonEmptyIndexes.map(({ index }, ordinal) => [index, ordinal]));
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
    const ordinal = ordinalByIndex.get(index) ?? 0;
    const previousText = ordinal > 0 ? normalized[nonEmptyIndexes[ordinal - 1].index] : "";
    const nextText = ordinal + 1 < nonEmptyIndexes.length ? normalized[nonEmptyIndexes[ordinal + 1].index] : "";
    const framedAuthority = ordinal < 4
      && (looksLikeDocumentNumberLine(previousText) || looksLikeDocumentTitle(nextText));
    const style = paragraph.format?.styleName?.toLocaleLowerCase() ?? "";
    const outlineLevel = paragraph.format?.outlineLevel;
    const listLevel = paragraph.format?.listLevel;
    let role: SuggestedOfficialDocumentRole = "BODY";

    if (looksLikeDocumentNumberLine(text)) {
      role = "PRESERVE";
    } else if (looksLikeIssuingAuthority(text) && (isRedFormat(paragraph) || framedAuthority)) {
      role = "ISSUING_AUTHORITY";
    } else if (looksLikeDocumentTitle(text)) {
      role = "TITLE";
    } else if (style.includes("主标题") || style === "标题" || style.includes("document title")) {
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
  const mappings = mappingProfile?.mappings ?? [];
  const tableCellKey = (tableIndex: number, rowIndex: number, columnIndex: number) =>
    `${tableIndex}:${rowIndex}:${columnIndex}`;
  const mappingByParagraph = new Map(
    mappings
      .filter((mapping) => !["DATA_TABLE", "FIXED_TABLE_TEXT", "FIXED_HEADER_FOOTER_TEXT"].includes(mapping.slotType ?? ""))
      .map((mapping) => [mapping.paragraphIndex, mapping])
  );
  const dataTableMappingByIndex = new Map(
    mappings
      .filter((mapping) => mapping.slotType === "DATA_TABLE")
      .map((mapping) => [mapping.paragraphIndex, mapping])
  );
  const fixedTableMappingByCell = new Map(
    mappings
      .filter((mapping) => mapping.slotType === "FIXED_TABLE_TEXT")
      .map((mapping) => [tableCellKey(
        mapping.paragraphIndex,
        Number(mapping.metadata?.rowIndex ?? 0),
        Number(mapping.metadata?.columnIndex ?? 0)
      ), mapping])
  );
  const headerFooterMappingByIndex = new Map(
    mappings
      .filter((mapping) => mapping.slotType === "FIXED_HEADER_FOOTER_TEXT")
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
      roleLabel: role === "UNKNOWN" ? `段落 ${paragraph.index + 1}` : officialRoleLabels[role],
      preview: paragraph.text?.trim() || "空段落（保留格式）",
      empty: !paragraph.text?.trim(),
      editable: role !== "PRESERVE",
      dataBinding: Boolean(mapping?.dataBinding),
      required: Boolean(mapping?.required),
      styleSummary: styleSummary(paragraph)
    };
  });
  let supplementalOrder = structureNodes.length;
  const tableNodes = (profile?.tables ?? []).flatMap((table) => {
    const dataMapping = dataTableMappingByIndex.get(table.index);
    const nodes: OfficialDocumentStructureNode[] = [{
      id: dataMapping?.nodeId ?? `table:${table.index}:layout`,
      order: ++supplementalOrder,
      tableIndex: table.index,
      slotId: dataMapping?.slotId ?? stableUuid(`${versionId}:table:${table.index}`),
      variantId: dataMapping?.variantId ?? `table-${table.index + 1}`,
      slotType: dataMapping?.slotType,
      endParagraphIndex: dataMapping?.endParagraphIndex,
      role: dataMapping ? "BODY" : "UNKNOWN",
      roleLabel: dataMapping ? `表格 ${table.index + 1}（问数小表）` : `表格 ${table.index + 1}（版式）`,
      preview: table.text?.trim() || `${table.rowCount} 行 × ${table.columnCount} 列`,
      empty: false,
      editable: Boolean(dataMapping),
      dataBinding: Boolean(dataMapping?.dataBinding),
      required: false,
      styleSummary: [`${table.rowCount} 行`, `${table.columnCount} 列`]
    }];
    for (const cell of table.cells ?? []) {
      const preview = cell.text?.trim() ?? "";
      if (!preview) continue;
      const mapping = fixedTableMappingByCell.get(tableCellKey(table.index, cell.rowIndex, cell.columnIndex));
      const inferredEditable = !mapping && !dataMapping && status !== "PUBLISHED";
      const redHead = table.index === 0 && cell.rowIndex === 0 && cell.columnIndex === 0
        && looksLikeIssuingAuthority(preview);
      const role = mapping && officialRoleLabels[mapping.role]
        ? mapping.role as OfficialDocumentStructureNode["role"]
        : inferredEditable ? redHead ? "ISSUING_AUTHORITY" : "TABLE_TEXT" : "UNKNOWN";
      nodes.push({
        id: mapping?.nodeId ?? `table:${table.index}:cell:${cell.rowIndex}:${cell.columnIndex}`,
        order: ++supplementalOrder,
        tableIndex: table.index,
        tableRowIndex: cell.rowIndex,
        tableColumnIndex: cell.columnIndex,
        slotId: mapping?.slotId ?? stableUuid(`${versionId}:table:${table.index}:cell:${cell.rowIndex}:${cell.columnIndex}`),
        variantId: mapping?.variantId ?? `table-${table.index + 1}-cell-${cell.rowIndex + 1}-${cell.columnIndex + 1}`,
        slotType: mapping?.slotType ?? (inferredEditable ? "FIXED_TABLE_TEXT" : undefined),
        endParagraphIndex: mapping?.endParagraphIndex,
        role,
        roleLabel: role === "ISSUING_AUTHORITY"
          ? officialRoleLabels.ISSUING_AUTHORITY
          : `表格 ${table.index + 1} · 第 ${cell.rowIndex + 1} 行第 ${cell.columnIndex + 1} 列`,
        preview,
        empty: false,
        editable: role !== "UNKNOWN",
        dataBinding: false,
        required: false,
        styleSummary: [`表格 ${table.index + 1}`, `第 ${cell.rowIndex + 1} 行`, `第 ${cell.columnIndex + 1} 列`]
      });
    }
    return nodes;
  });
  const headerFooterNodes = (profile?.headersAndFooters ?? []).flatMap((fact, index) => {
    const preview = fact.text?.trim() ?? "";
    if (!preview) return [];
    const mapping = headerFooterMappingByIndex.get(index);
    const pageNumberOnly = /^[\s—–-]*\d+[\s—–-]*$/.test(preview);
    const inferredEditable = !mapping && !pageNumberOnly && status !== "PUBLISHED";
    const role = mapping ? "HEADER_FOOTER" : inferredEditable ? "HEADER_FOOTER" : "PRESERVE";
    return [{
      id: mapping?.nodeId ?? `header-footer:${index}`,
      order: ++supplementalOrder,
      headerFooterIndex: index,
      slotId: mapping?.slotId ?? stableUuid(`${versionId}:header-footer:${index}`),
      variantId: mapping?.variantId ?? `header-footer-${index + 1}`,
      slotType: mapping?.slotType ?? (inferredEditable ? "FIXED_HEADER_FOOTER_TEXT" as const : undefined),
      role,
      roleLabel: `第 ${fact.sectionIndex + 1} 节页眉页脚文字`,
      preview,
      empty: false,
      editable: role === "HEADER_FOOTER",
      dataBinding: false,
      required: false,
      styleSummary: [`第 ${fact.sectionIndex + 1} 节`, `页眉页脚 ${fact.type + 1}`]
    } satisfies OfficialDocumentStructureNode];
  });

  type RiskSeverity = OfficialDocumentAnalysis["risks"][number]["severity"];
  const severityWeight: Record<RiskSeverity, number> = { INFO: 0, WARNING: 1, BLOCKING: 2 };
  const risksByKey = new Map<string, OfficialDocumentAnalysis["risks"][number]>();
  const friendlyRisk = (code: string, detail: string, severity: RiskSeverity) => {
    const prefixedCode = detail.match(/^\s*([A-Z][A-Z0-9_]*(?:\[[^\]]+\])?)\s*:/)?.[1]
      ?.replace(/\[.*$/, "");
    const effectiveCode = (code === "ENGINE_WARNING" && prefixedCode ? prefixedCode : code).toUpperCase();

    if (["OLE_PRESENT", "OLE_EMBEDDING", "STATIC_COMPLEX_OBJECT"].includes(effectiveCode)) {
      return {
        key: "preserved-complex-content",
        severity: "INFO" as const,
        title: "复杂内容将原样保留",
        detail: "检测到 Excel 等嵌入对象、公式或图形。系统会保留原样，但暂不编辑其中内容。"
      };
    }
    if (effectiveCode === "MACRO_PRESENT" || effectiveCode === "MACRO") {
      return {
        key: "macro-content",
        severity,
        title: "文档包含宏",
        detail: "系统不会运行宏，只会保留原始内容。请确认文件来源可靠。"
      };
    }
    if (["EXTERNAL_RELATIONSHIP", "EXTERNAL_RESOURCE_BLOCKED"].includes(effectiveCode)) {
      return {
        key: "external-content",
        severity,
        title: "外部内容不会自动加载",
        detail: "为保证安全，文档引用的外部文件、图片或地址不会被系统主动访问。"
      };
    }
    if (effectiveCode === "RELATIONSHIP_TARGET_OUTSIDE_PACKAGE") {
      return {
        key: effectiveCode,
        severity: "BLOCKING" as const,
        title: "文档内部引用不完整",
        detail: "暂时无法安全处理这份文档，请使用 Word 重新另存为 DOCX 后上传。"
      };
    }
    if (effectiveCode === "STYLES_PART_MISSING") {
      return {
        key: effectiveCode,
        severity,
        title: "部分样式需要确认",
        detail: "文档没有完整保存样式信息，请通过原稿预览确认字体和段落效果。"
      };
    }
    if (effectiveCode === "FONT_SUBSTITUTION") {
      return {
        key: effectiveCode,
        severity,
        title: "部分字体可能有差异",
        detail: "当前环境缺少原稿中的部分字体，预览或导出时可能使用相近字体。"
      };
    }
    if (effectiveCode === "LIBREOFFICE_UNAVAILABLE") {
      return {
        key: effectiveCode,
        severity,
        title: "PDF 暂不可用",
        detail: "当前仍可编辑并导出 Word，PDF 预览和导出暂不可用。"
      };
    }
    if (severity === "BLOCKING") {
      return {
        key: `${effectiveCode}:${detail.trim()}`,
        severity,
        title: "文档暂时无法处理",
        detail: "检测到无法安全处理的文档结构，请重新保存为标准 DOCX 后上传。"
      };
    }
    return {
      key: `${effectiveCode}:${detail.trim()}`,
      severity,
      title: "请确认文档预览",
      detail: "检测到可能影响版式的内容，请通过原稿预览确认实际效果。"
    };
  };
  const addRisk = (
    id: string,
    code: string,
    severity: RiskSeverity,
    detail: string,
    scope?: string
  ) => {
    const copy = friendlyRisk(code, detail, severity);
    const existing = risksByKey.get(copy.key);
    if (existing && severityWeight[existing.severity] >= severityWeight[copy.severity]) return;
    risksByKey.set(copy.key, {
      id,
      code,
      severity: copy.severity,
      title: copy.title,
      detail: copy.detail,
      scope
    });
  };
  for (const [index, finding] of (source?.ooxmlAuditReport?.findings ?? []).entries()) {
    addRisk(
      `ooxml:${finding.code}:${index}`,
      finding.code,
      finding.severity === "BLOCKING" ? "BLOCKING" : finding.severity === "WARNING" ? "WARNING" : "INFO",
      finding.message,
      finding.part
    );
  }
  for (const [index, warning] of [...(source?.warnings ?? []), ...(profile?.warnings ?? []), ...(capability?.warnings ?? [])].entries()) {
    addRisk(`warning:${index}`, "ENGINE_WARNING", "WARNING", warning);
  }
  for (const [index, reason] of (capability?.blockingReasons ?? []).entries()) {
    addRisk(`engine-blocking:${index}`, "ENGINE_BLOCKING_REASON", "BLOCKING", reason);
  }
  if (["BLOCKED", "ENGINE_UNAVAILABLE", "FAILED"].includes(status) && analysisJob?.message) {
    addRisk(
      `analysis-job:${analysisJob.code ?? status}`,
      analysisJob.code ?? status,
      "BLOCKING",
      analysisJob.message
    );
  }
  const risks = [...risksByKey.values()];

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
    structureNodes: [...structureNodes, ...tableNodes, ...headerFooterNodes],
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
  const versions = Array.isArray(view.versions) ? view.versions : [];
  const version = [...versions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
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
    templateName: templateNames.get(snapshot.templateId) ?? "报告模板",
    contentProfileId: snapshot.content?.contentProfileId || undefined,
    currentFileVersionNo: currentFileVersion?.versionNumber ?? 1,
    updatedAt: currentFileVersion?.createdAt ?? snapshot.createdAt,
    bindings: (snapshot.bindings ?? []).map(mapBinding)
  };
}

function authenticatedActor() {
  const user = readDataHubSession().user;
  if (!user) {
    throw new OfficialDocumentServiceError("登录信息缺失，不能创建报告草稿或编辑会话", {
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
      label: "报告服务地址已配置",
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
      const payload = await requestOfficialDocument<unknown>(baseUrl, "/v1/templates", {
        method: "POST",
        body: formData,
        timeoutMs: 60_000
      });
      return {
        source: "LIVE",
        persisted: true,
        template: mapTemplate(asTemplateView(payload)),
        message: "模板已上传，正在执行安全检查和格式分析。"
      };
    },
    async listContentProfiles(templateId, versionId) {
      return requestOfficialDocument<OfficialDocumentContentProfile[]>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/content-profiles`
      );
    },
    async getContentProfile(profileId) {
      return requestOfficialDocument<OfficialDocumentContentProfile>(
        baseUrl,
        `/v1/content-profiles/${encodeURIComponent(profileId)}`
      );
    },
    async uploadContentProfile(templateId, versionId, file, name) {
      assertDocxTemplate(file);
      const formData = new FormData();
      formData.set("file", file);
      if (name?.trim()) formData.set("name", name.trim());
      return requestOfficialDocument<OfficialDocumentContentProfile>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/content-profiles`,
        { method: "POST", body: formData, timeoutMs: 60_000 }
      );
    },
    async createTextContentProfile(templateId, versionId, input) {
      return requestOfficialDocument<OfficialDocumentContentProfile>(
        baseUrl,
        `/v1/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/content-profiles`,
        {
          method: "POST",
          body: JSON.stringify({ name: input.name?.trim() || undefined, text: input.text.trim() }),
          timeoutMs: 60_000
        }
      );
    },
    async saveContentProfileAnalysis(profileId, analysis) {
      return requestOfficialDocument<OfficialDocumentContentProfile>(
        baseUrl,
        `/v1/content-profiles/${encodeURIComponent(profileId)}/analysis`,
        { method: "PUT", body: JSON.stringify(analysis) }
      );
    },
    async confirmContentProfile(profileId, analysis) {
      return requestOfficialDocument<OfficialDocumentContentProfile>(
        baseUrl,
        `/v1/content-profiles/${encodeURIComponent(profileId)}/analysis:confirm`,
        { method: "POST", body: JSON.stringify(analysis) }
      );
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
        throw new OfficialDocumentServiceError("报告服务没有返回映射版本", {
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
      return mapDraft(snapshot, new Map([[input.templateId, "报告模板"]]));
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
    async bindContentProfile(draftId, input) {
      return requestOfficialDocument<ApiDraftContent>(
        baseUrl,
        `/v1/drafts/${encodeURIComponent(draftId)}/content-profile`,
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
    async getTransientPreview(input) {
      return requestOfficialDocument<Blob>(
        baseUrl,
        "/v1/drafts/:preview",
        {
          method: "POST",
          body: JSON.stringify({
            templateId: input.templateId,
            templateVersionId: input.templateVersionId,
            title: input.title,
            content: {
              revision: 0,
              fixedValues: input.fixedValues,
              blocks: input.blocks,
              contentProfileId: "",
              researchResults: []
            }
          }),
          responseType: "blob",
          timeoutMs: EXPORT_TIMEOUT_MS
        }
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
          body: JSON.stringify({ format }),
          timeoutMs: EXPORT_TIMEOUT_MS
        }
      );
      return mapExportRecord(record);
    },
    async exportTransient(input, format) {
      return requestOfficialDocument<Blob>(
        baseUrl,
        "/v1/drafts/:export",
        {
          method: "POST",
          body: JSON.stringify({
            templateId: input.templateId,
            templateVersionId: input.templateVersionId,
            title: input.title,
            format,
            content: {
              revision: 0,
              fixedValues: input.fixedValues,
              blocks: input.blocks,
              contentProfileId: "",
              researchResults: []
            }
          }),
          responseType: "blob",
          timeoutMs: EXPORT_TIMEOUT_MS
        }
      );
    },
    async downloadExport(exportId) {
      return requestOfficialDocument<Blob>(
        baseUrl,
        `/v1/exports/${encodeURIComponent(exportId)}/download`,
        { responseType: "blob", timeoutMs: EXPORT_TIMEOUT_MS }
      );
    }
  };
}

function createUnconfiguredService(): OfficialDocumentService {
  const unavailable = async (): Promise<never> => {
    throw new OfficialDocumentServiceError("线上报告服务地址未配置，已停止请求且不会切换演示数据", {
      code: "OFFICIAL_DOCUMENT_API_NOT_CONFIGURED"
    });
  };
  return {
    state: {
      configured: false,
      mode: "live",
      label: "线上报告服务未配置",
      message: "请配置 VITE_OFFICIAL_DOCUMENT_API_BASE_URL；生产模式不会自动切换本地演示数据。"
    },
    loadWorkspace: unavailable,
    getTemplateAnalysis: unavailable,
    getTemplatePreview: unavailable,
    uploadTemplate: unavailable,
    listContentProfiles: unavailable,
    getContentProfile: unavailable,
    uploadContentProfile: unavailable,
    createTextContentProfile: unavailable,
    saveContentProfileAnalysis: unavailable,
    confirmContentProfile: unavailable,
    updateTemplateMapping: unavailable,
    publishTemplate: unavailable,
    createDraft: unavailable,
    getDraftContent: unavailable,
    updateDraftContent: unavailable,
    bindContentProfile: unavailable,
    getDraftPreview: unavailable,
    getTransientPreview: unavailable,
    createBinding: unavailable,
    refreshBindings: unavailable,
    detachBinding: unavailable,
    exportDraft: unavailable,
    exportTransient: unavailable,
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
export const listOfficialDocumentContentProfiles = (templateId: string, versionId: string) =>
  officialDocumentService.listContentProfiles(templateId, versionId);
export const getOfficialDocumentContentProfile = (profileId: string) =>
  officialDocumentService.getContentProfile(profileId);
export const uploadOfficialDocumentContentProfile = (
  templateId: string,
  versionId: string,
  file: File,
  name?: string
) => officialDocumentService.uploadContentProfile(templateId, versionId, file, name);
export const createOfficialDocumentTextContentProfile = (
  templateId: string,
  versionId: string,
  input: { name?: string; text: string }
) => officialDocumentService.createTextContentProfile(templateId, versionId, input);
export const saveOfficialDocumentContentProfileAnalysis = (
  profileId: string,
  analysis: OfficialDocumentWritingLogicPlan
) => officialDocumentService.saveContentProfileAnalysis(profileId, analysis);
export const confirmOfficialDocumentContentProfile = (
  profileId: string,
  analysis: OfficialDocumentWritingLogicPlan
) => officialDocumentService.confirmContentProfile(profileId, analysis);
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
export const bindOfficialDocumentContentProfile = (
  draftId: string,
  input: BindOfficialDocumentContentProfileInput
) => officialDocumentService.bindContentProfile(draftId, input);
export const getOfficialDocumentDraftPreview = (draftId: string) =>
  officialDocumentService.getDraftPreview(draftId);
export const getOfficialDocumentTransientPreview = (input: OfficialDocumentTransientArtifactInput) =>
  officialDocumentService.getTransientPreview(input);
export const createOfficialDocumentBinding = (draftId: string, input: CreateDraftDataBindingInput) =>
  officialDocumentService.createBinding(draftId, input);
export const refreshOfficialDocumentBindings = (draftId: string) =>
  officialDocumentService.refreshBindings(draftId);
export const detachOfficialDocumentBinding = (draftId: string, bindingId: string) =>
  officialDocumentService.detachBinding(draftId, bindingId);
export const exportOfficialDocumentDraft = (draftId: string, format: OfficialDocumentExportFormat) =>
  officialDocumentService.exportDraft(draftId, format);
export const exportOfficialDocumentTransient = (
  input: OfficialDocumentTransientArtifactInput,
  format: OfficialDocumentExportFormat
) => officialDocumentService.exportTransient(input, format);
export const downloadOfficialDocumentExport = (exportId: string) =>
  officialDocumentService.downloadExport(exportId);
