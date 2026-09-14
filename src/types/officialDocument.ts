export type OfficialDocumentDataSource = "LIVE";

export type OfficialDocumentServiceState = {
  configured: boolean;
  mode: "live";
  label: string;
  message: string;
};

export type OfficialDocumentTemplateStatus =
  | "ANALYZING"
  | "NEEDS_REVIEW"
  | "PUBLISHED"
  | "BLOCKED"
  | "FAILED";

export type OfficialDocumentRiskSeverity = "INFO" | "WARNING" | "BLOCKING";

export type OfficialDocumentRisk = {
  id: string;
  code: string;
  severity: OfficialDocumentRiskSeverity;
  title: string;
  detail: string;
  scope?: string;
};

export type OfficialDocumentRole =
  | "ISSUING_AUTHORITY"
  | "TABLE_TEXT"
  | "HEADER_FOOTER"
  | "TITLE"
  | "RECIPIENT"
  | "BODY"
  | "HEADING_1"
  | "HEADING_2"
  | "HEADING_3"
  | "ATTACHMENT_NOTE"
  | "SIGNATURE"
  | "DATE"
  | "IMPRINT"
  | "PRESERVE"
  | "UNKNOWN";

export type OfficialDocumentStructureNode = {
  id: string;
  order: number;
  paragraphIndex?: number;
  tableIndex?: number;
  tableRowIndex?: number;
  tableColumnIndex?: number;
  headerFooterIndex?: number;
  slotId?: string;
  variantId?: string;
  slotType?: "FIXED_TEXT" | "FIXED_TABLE_TEXT" | "FIXED_HEADER_FOOTER_TEXT" | "BODY_REGION" | "DATA_TEXT" | "DATA_TABLE" | "PRESERVE";
  endParagraphIndex?: number;
  role: OfficialDocumentRole;
  roleLabel: string;
  preview: string;
  empty?: boolean;
  confidence?: number;
  editable: boolean;
  dataBinding: boolean;
  required: boolean;
  styleSummary: string[];
};

export type OfficialDocumentMappingRole = Exclude<OfficialDocumentRole, "UNKNOWN">;

export type OfficialDocumentMappingDefinition = {
  slotId: string;
  nodeId: string;
  paragraphIndex: number;
  role: OfficialDocumentMappingRole;
  variantId?: string;
  dataBinding: boolean;
  required: boolean;
  slotType?: "FIXED_TEXT" | "FIXED_TABLE_TEXT" | "FIXED_HEADER_FOOTER_TEXT" | "BODY_REGION" | "DATA_TEXT" | "DATA_TABLE" | "PRESERVE";
  endParagraphIndex?: number;
  metadata?: Record<string, string>;
};

export type OfficialDocumentMappingProfile = {
  id: string;
  templateVersionId: string;
  versionNo: number;
  mappings: OfficialDocumentMappingDefinition[];
  createdAt: string;
};

export type EngineCapabilityReport = {
  engineName: string;
  engineVersion: string;
  licenseMode: "FILE" | "TEMPORARY" | "EVALUATION" | "UNAVAILABLE";
  onlineEditorCompatible: boolean | null;
  extractedFeatureCount: number;
  fontSubstitutions: string[];
  unsupportedWarnings: string[];
  blockingReasons: string[];
};

export type OfficialDocumentAnalysis = {
  templateVersionId: string;
  pageCount?: number;
  sectionCount: number;
  structureNodes: OfficialDocumentStructureNode[];
  mappingProfile?: OfficialDocumentMappingProfile;
  risks: OfficialDocumentRisk[];
  capability: EngineCapabilityReport;
  analyzedAt?: string;
};

export type OfficialDocumentTemplateVersion = {
  id: string;
  versionNo: number;
  fileName: string;
  fileSize: number;
  sha256?: string;
  createdAt: string;
  /** 编译文件是否还在服务器上。false 表示文件已丢失，这一版生成不出成稿；缺省表示后端没给这项信息。 */
  compiledAvailable?: boolean;
  analysis?: OfficialDocumentAnalysis;
};

export type OfficialDocumentTemplate = {
  id: string;
  name: string;
  status: OfficialDocumentTemplateStatus;
  source: OfficialDocumentDataSource;
  currentVersion: OfficialDocumentTemplateVersion;
  updatedAt: string;
};

export type OfficialDocumentContentProfileStatus =
  | "EXTRACTING"
  | "EXTRACTED"
  | "READY_FOR_REVIEW"
  | "CONFIRMED"
  | "FAILED";

export type OfficialDocumentContentSourceBlock = {
  id: string;
  order: number;
  kind: "PARAGRAPH" | "TABLE";
  text: string;
  headingHint: string;
  columns: string[];
  rows: string[][];
};

export type OfficialDocumentWritingLogicPlan = {
  summary: string;
  sections: Array<{
    id: string;
    order: number;
    headingRole: "HEADING_1" | "HEADING_2" | "HEADING_3";
    title: string;
    purpose: string;
    keyPoints: string[];
    sourceBlockIds: string[];
  }>;
  researchNeeds: Array<{
    id: string;
    sectionId: string;
    kind: "ASK_DATA" | "ASK_KNOWLEDGE";
    question: string;
    reason: string;
    required: boolean;
    preferredOutput: "" | "FACT" | "SCALAR" | "TABLE";
  }>;
  unassignedSourceBlockIds: string[];
  warnings: string[];
};

export type OfficialDocumentContentProfile = {
  id: string;
  templateId: string;
  templateVersionId: string;
  name: string;
  originalSha256?: string;
  originalFileName: string;
  originalSize: number;
  status: OfficialDocumentContentProfileStatus;
  profile: {
    source?: {
      sourceSha256: string;
      blocks: OfficialDocumentContentSourceBlock[];
      warnings: string[];
    };
    analysis?: OfficialDocumentWritingLogicPlan;
    confirmedPlan?: OfficialDocumentWritingLogicPlan;
    confirmedAt?: string;
    confirmedSummarySha256?: string;
    failureCode?: string;
    failureMessage?: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DraftBindingStatus =
  | "ACTIVE"
  | "STALE"
  | "SCHEMA_DRIFT"
  | "PERMISSION_REVOKED"
  | "MANUAL";

export type DraftDataBinding = {
  id: string;
  queryAssetId: string;
  queryAssetName?: string;
  queryVersionId: string;
  outputKey: string;
  targetSlotTag: string;
  rendering: "SCALAR" | "TABLE" | "FACT_SUMMARY";
  status: DraftBindingStatus;
  snapshotId?: string;
  executionId?: string;
  cutoffAt?: string;
  resolvedValue?: unknown;
  persisted: boolean;
};

export type OfficialDocumentDraftStatus = "EDITING" | "VALIDATING" | "READY" | "BLOCKED";

export type OfficialDocumentDraft = {
  id: string;
  title: string;
  status: OfficialDocumentDraftStatus;
  source: OfficialDocumentDataSource;
  templateId: string;
  templateVersionId: string;
  templateName: string;
  contentProfileId?: string;
  contentProfileName?: string;
  currentFileVersionNo: number;
  updatedAt: string;
  bindings: DraftDataBinding[];
};

export type OfficialDocumentDraftBlockRole =
  | "HEADING_1"
  | "HEADING_2"
  | "HEADING_3"
  | "BODY"
  | "TABLE"
  | "CHART_IMAGE";

export type OfficialDocumentDraftSourceReference = {
  kind: "CONTENT_PROFILE" | "QUERY_ASSET";
  contentProfileId?: string;
  sourceBlockIds?: string[];
  queryAssetId?: string;
  queryVersionId?: string;
  outputKey?: string;
  executionId?: string;
  snapshotId?: string;
  dataAsOf?: string;
};

export type OfficialDocumentResearchResult = {
  taskId: string;
  sectionId: string;
  kind: "ASK_DATA" | "ASK_KNOWLEDGE";
  question: string;
  required: boolean;
  preferredOutput: "" | "FACT" | "SCALAR" | "TABLE";
  status: "PENDING" | "RUNNING" | "SUCCESS" | "NO_RESULT" | "FAILED" | "SKIPPED";
  summary: string;
  table?: { columns: string[]; rows: string[][]; totalRows: number };
  chart?: {
    mimeType: "image/png";
    base64: string;
    widthPx: number;
    heightPx: number;
    altText: string;
  };
  querySource?: OfficialDocumentDraftSourceReference;
  citations: Array<{
    kbId: string;
    kbName: string;
    docId: string;
    docName: string;
    fragments: string[];
    sourceAvailable: boolean;
  }>;
};

export type OfficialDocumentFactReview = {
  reviewedAt: string;
  issues: Array<{ sentence: string; additions: string[] }>;
  confirmedAt?: string;
  textSnapshot?: string;
};

export type OfficialDocumentDraftContentVersion = {
  revision: number;
  savedAt: string;
  content: OfficialDocumentDraftContent;
};

export type OfficialDocumentDraftContent = {
  revision: number;
  fixedValues: Array<{
    slotId: string;
    value: string;
  }>;
  blocks: Array<{
    id: string;
    order: number;
    role: OfficialDocumentDraftBlockRole;
    variantId: string;
    text: string;
    sectionId?: string;
    sourceTaskIds?: string[];
    table?: { columns: string[]; rows: string[][]; totalRows: number };
    chart?: {
      mimeType: "image/png";
      base64: string;
      widthPx: number;
      heightPx: number;
      altText: string;
    };
    source?: OfficialDocumentDraftSourceReference;
  }>;
  contentProfileId?: string;
  researchResults?: OfficialDocumentResearchResult[];
  factReview?: OfficialDocumentFactReview;
};

export type UpdateOfficialDocumentDraftContentInput = {
  restoreRevision?: number;
  expectedRevision: number;
  fixedValues: OfficialDocumentDraftContent["fixedValues"];
  blocks: OfficialDocumentDraftContent["blocks"];
  researchResults?: OfficialDocumentResearchResult[];
  factReview?: OfficialDocumentFactReview;
};

export type QueryBindingCandidate = {
  assetId: string;
  assetName: string;
  versionId: string;
  versionLabel: string;
  outputs: Array<{
    outputKey: string;
    label: string;
    supportedRenderings: DraftDataBinding["rendering"][];
    columns: Array<{
      columnId: string;
      label: string;
    }>;
  }>;
  source: OfficialDocumentDataSource;
};

export type OfficialDocumentCapabilityState = {
  available: boolean;
  code?: string;
  detail?: string;
};

export type OfficialDocumentRuntimeCapabilities = {
  wordEngine: OfficialDocumentCapabilityState;
  queryAssets: OfficialDocumentCapabilityState;
  acceptedFileTypes: string[];
  bindingKinds: Array<"SCALAR" | "FACT_SUMMARY" | "TABLE">;
  exportFormats: Array<"DOCX" | "PDF">;
  previewFormats: Array<"PDF">;
  editingMode: "STRUCTURED" | "WORD";
};

export type OfficialDocumentWorkspaceSnapshot = {
  source: OfficialDocumentDataSource;
  capabilities: OfficialDocumentRuntimeCapabilities;
  templates: OfficialDocumentTemplate[];
  drafts: OfficialDocumentDraft[];
  queryBindingCandidates: QueryBindingCandidate[];
};

export type UploadOfficialDocumentTemplateResult = {
  source: OfficialDocumentDataSource;
  persisted: boolean;
  taskId?: string;
  template: OfficialDocumentTemplate;
  message: string;
};

export type UpdateOfficialDocumentMappingInput = {
  templateId: string;
  templateVersionId: string;
  mappings: OfficialDocumentMappingDefinition[];
};

export type CreateOfficialDocumentDraftInput = {
  templateId: string;
  templateVersionId: string;
  contentProfileId?: string;
  title: string;
};

export type BindOfficialDocumentContentProfileInput = {
  expectedRevision: number;
  contentProfileId: string;
};

export type CreateDraftDataBindingInput = {
  queryAssetId: string;
  queryAssetName?: string;
  queryVersionId: string;
  outputKey: string;
  targetSlotTag: string;
  rendering: DraftDataBinding["rendering"];
  selector?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  formatter?: string;
};

export type RefreshOfficialDocumentBindingsResult = {
  bindings: DraftDataBinding[];
  message: string;
};

export type OfficialDocumentExportFormat = "DOCX" | "PDF";

export type OfficialDocumentFidelityReport = {
  passed: boolean;
  baselineSha256: string;
  candidateSha256: string;
  criticalDifferences: string[];
  warnings: string[];
  checkedAt: string;
};

export type OfficialDocumentExportRecord = {
  contentRevision?: number | null;
  id: string;
  draftId: string;
  status: "GENERATED" | "BLOCKED" | "ENGINE_UNAVAILABLE";
  format: OfficialDocumentExportFormat;
  sha256?: string;
  fidelityReport?: OfficialDocumentFidelityReport;
  code?: string;
  message?: string;
  createdAt: string;
};
