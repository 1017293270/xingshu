import type { DashboardRecord, DashboardSchema } from "./dashboardStudio";

export type QueryAssetVisibility = "PRIVATE" | "SPACE";
export type QueryVersionStatus = "BUILDING" | "CANDIDATE" | "VALIDATED" | "INVALID";
export type QueryParameterType = "TEXT" | "NUMBER" | "DATE" | "DATETIME" | "BOOLEAN";
export type RelativeTimePreset =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_30_DAYS"
  | "THIS_YEAR"
  | "LAST_YEAR";

export type RelativeTimeParameterValue = {
  mode: "RELATIVE";
  preset: RelativeTimePreset;
  boundary?: "START" | "END";
};

export type QueryParameterDefinition = {
  key: string;
  label: string;
  type: QueryParameterType;
  required: boolean;
  defaultMode?: "FIXED" | "RELATIVE";
  defaultValue?: unknown;
  relativePreset?: RelativeTimePreset;
  relativeBoundary?: "START" | "END";
};

export type QueryOutputDefinition = {
  outputKey: string;
  label: string;
  rowCount?: number;
  columns: QueryColumnDefinition[];
};

export type QueryColumnDefinition = {
  columnId: string;
  key: string;
  label: string;
  title?: string;
  type?: string;
};

export type QueryVersion = {
  id: string;
  versionNo: number;
  resolvedQuestion: string;
  engine: "CUBE" | "SQL" | "MIXED" | "LEGACY";
  sqlPreview?: string;
  parameters: QueryParameterDefinition[];
  outputs: QueryOutputDefinition[];
  schemaHash: string;
  status: QueryVersionStatus;
  createdAt: string;
};

export type QueryAsset = {
  id: string;
  name: string;
  originalQuestion: string;
  resolvedQuestion: string;
  datasourceId?: number;
  ownerUserId: number;
  visibility: QueryAssetVisibility;
  stableVersionId: string;
  status: "ACTIVE" | "ARCHIVED";
  stableVersion?: QueryVersion;
  versions?: QueryVersion[];
  createdAt: string;
  updatedAt: string;
};

export type QueryExecutionOutput = {
  outputKey: string;
  columns: QueryColumnDefinition[];
  rows: Record<string, unknown>[];
  totalRows: number;
  updatedAt?: string;
};

export type QueryExecution = {
  id: string;
  assetId: string;
  versionId: string;
  status: "WAITING" | "RUNNING" | "SUCCESS" | "FAILED" | "PERMISSION_REVOKED" | "SCHEMA_DRIFT";
  triggerType: string;
  errorCode?: string;
  errorMessage?: string;
  snapshotId?: string;
  durationMs: number;
  createdAt: string;
  outputs: QueryExecutionOutput[];
};

export type DashboardRuntime = {
  record: DashboardRecord;
  datasets: Record<string, QueryExecutionOutput>;
  moduleStatuses: Record<string, QueryExecution["status"] | "LEGACY_SNAPSHOT">;
};

export type DashboardRefreshResult = {
  executions: Record<string, QueryExecution>;
  moduleStatuses: DashboardRuntime["moduleStatuses"];
};

export type RefreshPolicy = "MANUAL" | "INTERVAL_15" | "HOURLY" | "DAILY" | "WEEKLY";

export type RefreshScheduleInput = {
  assetId: string;
  queryVersionId: string;
  policy: RefreshPolicy;
  intervalMinutes?: number;
  dailyTime?: string;
  dayOfWeek?: number;
  timezone?: string;
  parameters?: Record<string, unknown>;
};

export type RefreshSchedule = {
  id: string;
  dashboardId: string;
  moduleId: string;
  policy: RefreshPolicy;
  status: "ACTIVE" | "PAUSED";
  nextRunAt?: string;
  lastExecutionId?: string;
  lastError?: string;
};

export type LayoutWidgetInput = {
  id: string;
  moduleId?: string;
  type: string;
  semanticRole: "kpi" | "trend" | "comparison" | "detail" | "narrative";
  minWidth: number;
  minHeight: number;
  currentWidth: number;
  currentHeight: number;
  locked: boolean;
  importance: number;
};

export type LayoutIntent = {
  widgetId: string;
  section: string;
  rank: number;
  emphasis: "compact" | "normal" | "wide" | "hero";
  /** 高度意图：slim ≈ 216、short ≈ 280、tall ≈ 416；缺省按组件当前高度收敛。 */
  heightTier?: "slim" | "short" | "tall";
  /** 紧跟在某个 hero 组件之后时标记为侧轨；最多两个，垂直堆叠并与 hero 底缘精确对齐。 */
  placement?: "rail";
};

export type LayoutPlan = {
  source: "AI" | "LOCAL";
  intents: LayoutIntent[];
  message: string;
};

export type DashboardSaveInput = {
  id?: string;
  expectedRevision?: number;
  schema: DashboardSchema;
  visibility?: "PRIVATE" | "SPACE";
};
