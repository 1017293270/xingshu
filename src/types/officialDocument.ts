export type OfficialDocumentDataSource = "LIVE" | "DEMO";

export type OfficialDocumentServiceState = {
  configured: boolean;
  mode: "live" | "demo";
  label: string;
  message: string;
};

export type OfficialDocumentTemplateStatus =
  | "ANALYZING"
  | "NEEDS_REVIEW"
  | "PUBLISHED"
  | "BLOCKED"
  | "FAILED"
  | "DEMO";

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
  slotId?: string;
  variantId?: string;
  slotType?: "FIXED_TEXT" | "BODY_REGION" | "DATA_TEXT" | "DATA_TABLE" | "PRESERVE";
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
  slotType?: "FIXED_TEXT" | "BODY_REGION" | "DATA_TEXT" | "DATA_TABLE" | "PRESERVE";
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
  persisted: boolean;
};

export type OfficialDocumentDraftStatus = "EDITING" | "VALIDATING" | "READY" | "BLOCKED" | "DEMO";

export type OfficialDocumentDraft = {
  id: string;
  title: string;
  status: OfficialDocumentDraftStatus;
  source: OfficialDocumentDataSource;
  templateId: string;
  templateVersionId: string;
  templateName: string;
  currentFileVersionNo: number;
  updatedAt: string;
  activeEditorLeaseExpiresAt?: string;
  bindings: DraftDataBinding[];
};

export type OfficialDocumentDraftBlockRole = "HEADING_1" | "HEADING_2" | "HEADING_3" | "BODY";

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
  }>;
};

export type UpdateOfficialDocumentDraftContentInput = {
  expectedRevision: number;
  fixedValues: OfficialDocumentDraftContent["fixedValues"];
  blocks: OfficialDocumentDraftContent["blocks"];
};

export type OfficialDocumentEditorSession = {
  id: string;
  draftId: string;
  mode: "EDIT" | "READ_ONLY" | "UNAVAILABLE";
  leaseExpiresAt?: string;
  documentServerApiUrl?: string;
  token?: string;
  editorConfig?: Record<string, unknown>;
  message: string;
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
  onlyOffice: OfficialDocumentCapabilityState;
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
  title: string;
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

export type DetachOfficialDocumentBindingInput = {
  draftId: string;
  bindingId: string;
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
