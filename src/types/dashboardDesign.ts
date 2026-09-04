import type { QueryAsset, QueryExecution } from "./analytics";
import type { DashboardSchema } from "./dashboardStudio";

/**
 * 智享大屏的模型契约：模型只输出语义（角色、图种变体、强调、主题 id、文案），
 * 坐标与配色一律由本地引擎决定，所以这里没有任何像素或颜色字段。
 */

export const dashboardDesignRoles = ["kpi", "trend", "comparison", "composition", "detail", "narrative"] as const;
export type DashboardDesignRole = (typeof dashboardDesignRoles)[number];

export const dashboardDesignArchetypes = ["kpi-led", "trend-led", "comparison-grid", "ranking-detail"] as const;
export type DashboardDesignArchetype = (typeof dashboardDesignArchetypes)[number];

export type DashboardDesignEmphasis = "compact" | "normal" | "wide" | "hero";
export type DashboardDesignValueMode = "first" | "latest" | "sum" | "max" | "average";
export type DashboardDesignColumnKind = "number" | "time" | "dimension";
export type DashboardDesignOutputShape = "time-series" | "category" | "scalar" | "table";

/** 发给模型的资产摘要：不带 SQL、不带全量行。 */
export type DashboardDesignColumnSummary = {
  columnId: string;
  key: string;
  label: string;
  kind: DashboardDesignColumnKind;
};

export type DashboardDesignOutputSummary = {
  outputKey: string;
  label: string;
  columns: DashboardDesignColumnSummary[];
  totalRows: number;
  /** ≤ 3 行，只含 columns 里的 key。 */
  sampleRows: Record<string, unknown>[];
  /** 有时间列 → time-series；有维度列 → category；只有数值且 1 行 → scalar；其余 table。 */
  shape: DashboardDesignOutputShape;
};

export type DashboardDesignAssetSummary = {
  assetId: string;
  name: string;
  question: string;
  outputs: DashboardDesignOutputSummary[];
};

export type DashboardDesignWidgetSummary = {
  id: string;
  type: string;
  title: string;
  role: DashboardDesignRole;
  locked: boolean;
  assetId?: string;
  outputKey?: string;
  variant?: string;
  dimensionKey?: string;
  metricKeys?: string[];
  valueMode?: DashboardDesignValueMode;
  /** 由当前宽度折算：≥ 画布 2/3 宽 → hero，≥ 1/2 → wide，≥ 1/3 → normal，否则 compact。 */
  emphasis: DashboardDesignEmphasis;
  /** text 组件正文，截 120 字。 */
  content?: string;
};

export type DashboardDesignBoardSummary = {
  title: string;
  subtitle?: string;
  themeId: string | null;
  archetype?: DashboardDesignArchetype;
  canvas: { width: number; height: number; preset?: string };
  widgets: DashboardDesignWidgetSummary[];
};

export type DashboardDesignCatalog = {
  themes: Array<{ id: string; title: string; mode: "light" | "dark"; description: string }>;
  variants: Array<{ id: string; type: string; title: string; dataRequirement: string }>;
  archetypes: Array<{ id: DashboardDesignArchetype; title: string; description: string }>;
  canvasPresets: Array<{ id: string; label: string; width: number; height: number }>;
};

export type DashboardDesignHistoryTurn = { role: "user" | "assistant"; content: string };

/** generate 与 edit 共用；edit 时 board 必填。 */
export type DashboardDesignRequest = {
  brief: string;
  assets: DashboardDesignAssetSummary[];
  board?: DashboardDesignBoardSummary;
  catalog: DashboardDesignCatalog;
  canvas: { width: number; height: number };
  history: DashboardDesignHistoryTurn[];
};

/** 模型输出：首次生成里的一个组件。 */
export type DashboardDesignSpecWidget = {
  ref: string;
  role: DashboardDesignRole;
  /** narrative 角色可不带资产。 */
  assetId?: string;
  outputKey?: string;
  /** 图表变体 id；缺省按 role 取默认。 */
  variant?: string;
  dimensionKey?: string;
  metricKeys?: string[];
  /** kpi 专用。 */
  metricKey?: string;
  valueMode?: DashboardDesignValueMode;
  showTrend?: boolean;
  title: string;
  subtitle?: string;
  /** narrative 正文。 */
  content?: string;
  emphasis?: DashboardDesignEmphasis;
  placement?: "rail";
};

export type DashboardDesignSpec = {
  narrative: string;
  title: string;
  subtitle?: string;
  insight?: string;
  themeId: string;
  archetype: DashboardDesignArchetype;
  canvasPreset?: string;
  widgets: DashboardDesignSpecWidget[];
};

/** 模型输出：增量修改。 */
export type DashboardDesignOp =
  | { op: "set_theme"; themeId: string }
  | { op: "set_archetype"; archetype: DashboardDesignArchetype }
  | { op: "set_canvas"; preset: string }
  | { op: "set_board_title"; title: string; subtitle?: string; insight?: string }
  | { op: "add_widget"; widget: DashboardDesignSpecWidget }
  | { op: "remove_widget"; widgetId: string }
  | { op: "retype_widget"; widgetId: string; variant: string }
  | { op: "set_emphasis"; widgetId: string; emphasis: DashboardDesignEmphasis; placement?: "rail" }
  | { op: "retitle"; widgetId: string; title: string; subtitle?: string }
  | { op: "set_text"; widgetId: string; content: string }
  | { op: "set_kpi"; widgetId: string; metricKey?: string; valueMode?: DashboardDesignValueMode; showTrend?: boolean }
  | { op: "set_mapping"; widgetId: string; dimensionKey?: string; metricKeys?: string[] }
  | { op: "reorder"; widgetIds: string[] };

export type DashboardDesignOps = { narrative: string; ops: DashboardDesignOp[] };

/** SSE：每个 `data:` 行一个 JSON，用 type 判别；`done` 后连接关闭。 */
export type DashboardDesignStreamEvent =
  | { type: "message"; delta: string }
  | { type: "spec"; spec: unknown }
  | { type: "ops"; ops: unknown }
  | { type: "error"; code: number; message: string }
  | { type: "done"; modelId?: string };

/** 执行 spec/ops 需要的资产数据，由 UI 层先 previewAsset 取回再交给纯函数。 */
export type DashboardDesignAssetData = Record<string, { asset: QueryAsset; execution: QueryExecution }>;

export type DashboardDesignChange = { kind: string; widgetId?: string; label: string };
export type DashboardDesignRejection = { target: string; reason: string };

export type DashboardDesignApplyResult = {
  schema: DashboardSchema;
  changes: DashboardDesignChange[];
  rejected: DashboardDesignRejection[];
};

export type DashboardDesignIssue = {
  code: string;
  severity: "warning" | "info";
  message: string;
  widgetId?: string;
  /** 一键修复对应的 op 列表；缺省表示只提示。 */
  fix?: DashboardDesignOp[];
};
