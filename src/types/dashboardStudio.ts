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
  mapping: DashboardWidgetMapping;
  position: DashboardWidgetPosition;
  style: DashboardWidgetStyle;
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
  tableIndex: number;
  table: DataHubTableResult;
};

export type DashboardSource = {
  kind: "ask-data" | "blank";
  question?: string;
  summary?: string;
  queryId?: string;
  spaceId?: number;
  generatedAt: string;
  plannerVersion: 1 | 2;
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
    scaleMode?: "fit-screen" | "fit-width" | "fixed" | "original";
  };
  source: DashboardSource;
  dataBindings: Record<string, DashboardDataBinding>;
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
