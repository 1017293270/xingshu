import type { DataHubTableResult } from "./dataHub";

export const dashboardWidgetTypes = [
  "metric",
  "line",
  "area",
  "bar",
  "pie",
  "radar",
  "funnel",
  "table",
  "text",
  "image",
  "decoration"
] as const;

export type DashboardWidgetType = (typeof dashboardWidgetTypes)[number];
export type DashboardDataMode = "snapshot" | "live";
export type DashboardRecordStatus = "draft" | "published";

export type DashboardVersion = {
  id: string;
  version: number;
  schema: DashboardSchema;
  publishedAt: string;
};

export type DashboardWidgetPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardWidgetMapping = {
  /** 持久化绑定使用不可变列 ID；key 仅供当前快照渲染。 */
  dimensionColumnId?: string;
  metricColumnIds?: string[];
  dimensionKey?: string;
  metricKeys?: string[];
  valueMode?: "first" | "latest" | "sum" | "max" | "average";
  displayUnit?: string;
};

export type DashboardWidgetStyle = {
  accent?: string;
  background?: string;
  color?: string;
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  padding?: number;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  imageFit?: "contain" | "cover" | "fill";
  decorationKind?: "line" | "frame" | "glow";
  chartTheme?: string;
  chartVariant?: string;
  seriesColors?: string[];
  backgroundBlur?: number;
  showLegend?: boolean;
  showTrend?: boolean;
  smooth?: boolean;
  locked?: boolean;
  visible?: boolean;
  zIndex?: number;
};

export type DashboardWidget = {
  id: string;
  name?: string;
  type: DashboardWidgetType;
  title: string;
  subtitle?: string;
  content?: string;
  props?: Record<string, unknown>;
  bindingId?: string;
  moduleId?: string;
  mapping: DashboardWidgetMapping;
  position: DashboardWidgetPosition;
  style: DashboardWidgetStyle;
};

export type DashboardDataSourceRef = {
  kind: "query-asset" | "legacy-snapshot";
  assetId: string;
  queryVersionId: string;
  outputKey: string;
  parameterValues: Record<string, unknown>;
};

export type DashboardRefreshPolicy = {
  mode: "manual" | "scheduled";
  policy?: "INTERVAL_15" | "HOURLY" | "DAILY" | "WEEKLY";
  timezone?: string;
};

export type DashboardDataBinding = {
  id: string;
  label: string;
  mode: DashboardDataMode;
  sourceQueryId?: string;
  sourceId?: string;
  dimensionId?: string;
  metricId?: string;
  resultKind?: "metric" | "time-series" | "category" | "table";
  metricLabel?: string;
  trend?: number;
  refreshSeconds?: number;
  status?: "idle" | "loading" | "success" | "empty" | "error";
  error?: string;
  sourceRef?: DashboardDataSourceRef;
  refreshPolicy?: DashboardRefreshPolicy;
  refreshable?: boolean;
  lastUpdatedAt?: string;
  tableIndex?: number;
  table: DataHubTableResult;
};

export type DashboardModule = {
  id: string;
  title: string;
  bindingId: string;
  widgetIds: string[];
  source: DashboardDataSourceRef;
};

export type DashboardSource = {
  kind: "ask-data" | "blank";
  question?: string;
  summary?: string;
  queryId?: string;
  spaceId?: number;
  generatedAt: string;
  plannerVersion: 1 | 2;
  legacyImported?: boolean;
  legacySourceId?: string;
};

export type DashboardSchema = {
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  description: string;
  canvas: {
    width: number;
    height: number;
    columns: 12;
    rows: number;
    background: string;
    backgroundImage?: {
      dataUrl: string;
      fit: "cover" | "contain" | "fill";
    };
    scaleMode?: "fit-screen" | "fit-width" | "fixed" | "original";
  };
  source: DashboardSource;
  dataBindings: Record<string, DashboardDataBinding>;
  modules?: Record<string, DashboardModule>;
  widgets: DashboardWidget[];
  theme?: {
    name: string;
    colors: string[];
    fontFamily: string;
  };
  refresh?: {
    mode: "manual" | "interval";
    intervalSeconds?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type DashboardRecord = {
  id: string;
  status: DashboardRecordStatus;
  revision: number;
  visibility?: "PRIVATE" | "SPACE";
  schema: DashboardSchema;
  publishedSchema?: DashboardSchema;
  publishedAt?: string;
  versions?: DashboardVersion[];
  shareToken?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardGenerationInput = {
  question: string;
  summary?: string;
  tables: DataHubTableResult[];
  sourceQueryId?: string;
  spaceId?: number;
  dataMode?: DashboardDataMode;
};

export type DashboardValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
  widgetId?: string;
};

export type DashboardValidationResult = {
  valid: boolean;
  errors: DashboardValidationIssue[];
  warnings: DashboardValidationIssue[];
};
