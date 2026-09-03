# 智享大屏：对话式 AI 大屏设计

- 状态：契约定稿，进入实施（2026-09-03）
- 原始诉求（用户原话）：「结合我们现在的大屏库和编辑器，让 AI 根据我们所选的数据去进行大屏设计，要充分发挥那些顶级线上 AI 的顶级审美……claude 的 api 太贵了，可能去用中国的便宜 ai 比如说 kimi 啥的比较有性价比，可以通过对话式的进行生成和编辑，有点类似于 claude design 和 pen cli」
- 已拍板（2026-09-03）：设计器面板与独立入口页一起做；首页加「智享大屏」应用卡；后端走 SSE（先叙事后 JSON）；只建一个场景 `xingshu_dashboard_design` 绑 Kimi，不建润色场景；审美包全部内置让用户选。

## 1. 目标

在现有「收藏问数 → 看板草稿 → 设计器 → 发布」链路之上，加一层对话式设计助手：

- 选好数据（收藏问数资产）后，一句话生成一整块可发布的大屏草稿。
- 在设计器里用自然语言继续改：换主题、换图种、突出某张图、增删 KPI、改文案。
- 每一轮 AI 产出都先以预览呈现，用户「应用」后落成一步可撤销的历史，随时回退。
- 运行时只用便宜模型（Kimi 一类），审美不靠模型即兴发挥，靠本地设计引擎兜底。

不做的事：不让模型直接产出像素坐标、颜色、ECharts option；不引入第二套画布；不绕过
查询资产/固定版本/`revision` 乐观锁这些既有契约；不在浏览器里塞 SQL 或全量结果行。

## 2. 侦察事实（2026-09-03 核实）

### 2.1 前端大屏栈已经是「本地确定性引擎」

| 能力 | 位置 | 结论 |
| --- | --- | --- |
| Schema | `src/types/dashboardStudio.ts` | widget（type/mapping/position/style）、dataBindings、modules、canvas、theme |
| 组件族 | `core/dashboardComponentRegistry.ts` | metric/line/area/bar/pie/radar/funnel/table/text/image/decoration |
| 图表变体 | `core/dashboardChartPresets.ts` | 18 个变体，自带 `dataRequirement`（time-series / category） |
| 整板主题 | `core/dashboardBoardThemes.ts` | ice-light / command-dark / mint-lake / executive-gold，卡面+色板+强调色一次决定 |
| 构图器 | `core/dashboardCompose.ts` | 五带纵向节奏（banner→summary→main→detail→footnote）、hero+侧轨、行平衡 |
| 求解器 | `core/dashboardLayoutSolver.ts` | `LayoutIntent` → 像素；锁定原位、不重叠、不越界、8px 网格 |
| 数据绑定 | `src/services/dashboardModuleService.ts` `appendQueryAssetChart` | 资产+执行输出 → binding + module + widget，推断图种 |
| 设计器 | `vue/DashboardDesignerApp.vue`（5366 行） | `applySchemaChange` 带 100 步 undo；抽屉只有 palette / property；「一键美化」对话框 = 主题选择 + 构图预览 |
| 岛接线 | `vue/mountDashboardDesigner.ts` | handle 只有 `unmount`；对外仅 `onChange(schema)` / `onDirtyChange` |

关键事实：`/layout-plan` 后端端点从未存在（`dashboardCompose.ts` 头注释与 analytics-service
源码均可证），线上「一键美化」100% 是本地构图。`LayoutIntent` 契约本来就是给 AI 留的口子，
至今没接过模型。

### 2.2 AI 后端（DataHub ai-service，分支 `feat/beta0.3-contracts`）

- `LlmGenerateService.generate / generateStream`：promptKey → `resources/prompts/*.txt`，
  变量 `{{payload}}` 渲染；同步与 Flux 流式都有。Spring MVC（`spring-boot-starter-web`），
  流式控制器返回 `Flux<?>` 并 `produces = TEXT_EVENT_STREAM_VALUE`（见 `AgentScoreChatController`）。
- 模型路由按场景：`ai_scene_config(scene_key → provider_id, model_id, temperature, max_tokens)`，
  未配置时回落到 priority 最小的启用供应商。DataHub 后台有场景配置 UI
  （`datahub-frontend/src/views/platform/settings/SceneConfigTab.vue`），SQL 幂等种子精读本
  在 `sql/20260811_insert_ai_scene_config_ask_table.sql`。
- 供应商协议只有 `OPENAI` 与 `DASHSCOPE`（`chat/ProtocolType.java`）。Kimi（Moonshot，OpenAI 兼容）
  可直接作为供应商接入；**Claude 原生协议不支持**，要用只能经 OpenAI 兼容中转。
- 现成范式：`ChartPlanService`（scene `orchestrator`，prompt `xingshu.chart-plan`，64k 载荷上限，
  剥思考块 → 取首尾花括号 → 反序列化 → 校验字段来自输入）。BFF 路由 `/api/v1/chat/**` →
  `/ai/chat/**`；`/api/v1/table-templates/**` → `/ai/table-templates/**`，新端点照抄。
  内部身份头由 BFF 注入，控制器读 `X-Internal-Space-Id`（`ChartPlanController`）。
- 部署侧：xingshu 自有后端改动通过 `~/Developer/work/xingshu-backends/datahub-addons` 覆盖包打包，
  本轮源码只落 DataHub 分支，覆盖包在部署前同步。

### 2.3 前端对话骨架可复用

- `src/components/xs/conversation/`：`XsChatTurn` / `XsChatUserBubble` / `XsChatAssistant` /
  `XsChatActions` / `XsComposerBox`（hero/chat 双态）/ `XsSidePanel` / `XsArtifactCard`。
- `src/features/officialDocument/useWritingChat.ts`：按草稿隔离的 SSE 轮次状态机，
  16ms 批量 flush，可作为 `useSmartDashboardChat` 的模板。
- `DashboardRuntimeIsland` 可渲染任意 `DashboardRecord`，能当预览缩略图。
- 现有 SSE 读取（`dataHubAskDataService.streamDataHubAgentEndpoint`）只认 `data:` 行 JSON；
  新端点沿用「data 行 JSON + `type` 判别」的形式，不用 `event:` 行。

## 3. 核心原则：审美在本地引擎，语义交给便宜模型

```
用户一句话 + 已选数据摘要 + 当前板摘要
        │
        ▼
  便宜模型（Kimi）──输出──▶ DesignSpec（首次生成） / DesignOps（增量修改）
        │                       严格 JSON，只含 id、图种、角色、强调、主题 id、文案
        ▼
  本地校验（id/列/图种兼容）──丢弃非法项并解释
        │
        ▼
  本地引擎：appendQueryAssetChart → applyDashboardBoardTheme → 构图原型 → 求解器
        │
        ▼
  预览卡（缩略图 + 变更清单）──「应用」──▶ applySchemaChange（一步 undo）
```

1. **模型永远不碰像素与颜色。** 颜色来自整板主题，几何来自求解器，图表来自变体目录。
2. **顶级审美花在设计期。** 主题包、构图原型、文案规则、诊断清单写死进代码，运行时零 Claude 调用。
3. **诊断是免费的。** 对比度、KPI 数量、有无 hero、有无落单行——本地规则跑，对话里给一键修复。

## 4. 契约（权威；改契约先改这里）

### 4.1 类型文件 `src/types/dashboardDesign.ts`（切片 A 逐字落码）

```ts
import type { QueryAsset, QueryExecution } from "./analytics";
import type { DashboardSchema } from "./dashboardStudio";

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

/** 入口页 → 编辑器交接（sessionStorage，读一次即清）。 */
export const DASHBOARD_SMART_HANDOFF_KEY = "xingshu.dashboard.smart-handoff.v1";
export type DashboardSmartHandoff = {
  version: 1;
  draftId: string;
  brief: string;
  assetIds: string[];
  createdAt: string;
};
```

### 4.2 语义规则（切片 A 实现，切片 C/D 只调用）

角色 → 组件：

| role | 组件 / 默认变体 | 数据要求 | mapping |
| --- | --- | --- | --- |
| kpi | metric | 至少一个数值列 | `metricKeys:[metricKey]`、`metricColumnIds`、`valueMode`（缺省：1 行取 first，时间序列取 latest，否则 sum）、`displayUnit` 从列标题括号提取；`style.showTrend` |
| trend | line / `line-smooth`（多指标可 `area-bold`） | 输出 shape 为 time-series | `dimensionKey` 为时间列 |
| comparison | bar / `bar-vertical`（排行可 `bar-horizontal`） | category 或 time-series | 维度 + 1–2 个数值列 |
| composition | pie / `pie-donut`（radar/funnel 亦属此族） | category 且行数 ≤ 12，超出降级为 comparison 并记 change | 维度 + 1 个数值列 |
| detail | table | 任意 | 空 mapping |
| narrative | text | 无 | `content` |

校验（非法项丢进 `rejected`，理由用中文短句）：

- role 不在枚举、非 narrative 缺 assetId/outputKey、资产或输出不在 `DashboardDesignAssetData` 里。
- `dimensionKey` / `metricKeys` / `metricKey` 不在该输出 columns 的 key 里。
- variant 不存在，或 `variant.type` 不属于该 role 的族（trend→line/area；comparison→bar；composition→pie/radar/funnel）。
- variant 的 `dataRequirement` 与输出 shape 不兼容（time-series 变体要有时间列）。
- 同一份 spec/ops 里 `emphasis: hero` 超过一个：第一个保留，其余降为 wide。
- 组件总数上限 12（含已有），超出的丢弃。
- `themeId` 不在 `dashboardBoardThemes`：改用当前主题或默认主题并记 rejected。
- `archetype` 不在枚举：用 `kpi-led`。
- 整份 JSON 解析失败：调用方走本地兜底 `composeAndBeautifyDashboard`。

执行语义：

- `applyDashboardDesignSpec(schema, spec, data)`：**替换**所有未锁定的 widget/binding/module，锁定组件原样保留；
  设置 `schema.title/description`（description = insight）、画布预设；按 spec 顺序新建组件（每个组件走
  `appendQueryAssetChart` 再按 role/variant 改写 type、`style.chartVariant`、mapping、title）；
  narrative 组件用 text（首条当标题条，随后作脚注）；最后 `applyDashboardBoardTheme(themeId, { includeLocked: false })`
  → 构图原型 → `fitDashboardCanvasHeight`。
- `applyDashboardDesignOps(schema, ops, data)`：按顺序逐条执行，逐条校验（针对执行中的 schema）；
  `retype_widget` 参照设计器 `selectChartVariant` 的语义（合并目标定义的默认样式，保留 mapping 可用部分）；
  `remove_widget` 顺带清理不再被引用的 binding/module（复用 `removeQueryAssetChart`）；
  执行完同样过一遍「主题（当前主题，`includeLocked: false`）→ 构图原型 → 收口」。
- 当前主题 id 用 `getMatchingDashboardBoardThemeId(schema)`，认不出时视为 `DEFAULT_DASHBOARD_BOARD_THEME_ID`。
- 每次执行返回 `changes`（中文标签，如「整板主题 → 深空指挥」「新增 折线图「月度营收趋势」」「营收趋势 → 主图」）。

构图原型（`composeDashboardWithArchetype(schema, archetype, overrides)`，在 `composeDashboardLayoutPlan`
产出的 intents 上改写，再 `solveDashboardLayout` + `fitDashboardCanvasHeight`）：

| archetype | 规则 |
| --- | --- |
| kpi-led 指标总览 | 去掉 hero/侧轨；主体图按 `balancedRowSizes` 切行（3 张 compact / 2 张 normal），`heightTier: short`；KPI 带照旧 |
| trend-led 趋势主导 | hero 必须是 line/area（按 heroScore 选最高者）；侧轨规则照旧；其余切行 |
| comparison-grid 对比矩阵 | 无 hero；主体图两张一行 `normal` + `tall`，奇数时最后一张 `wide` |
| ranking-detail 排行明细 | hero 为 bar（`tall`）；侧轨照旧；detail 带表格 `heightTier: tall` |

显式覆盖：spec/op 里给某组件 `emphasis: hero` 时它就是 hero，原 hero 降为 normal；`placement: rail`
只在紧随 hero 时生效，否则忽略并记 change。

设计诊断（`critiqueDashboard(schema)`，纯本地）：`no-kpi`、`too-many-kpi`（> 4）、`no-hero`（≥ 3 张图无 hero，
fix: set_emphasis）、`orphan-row`（某行只有一张窄卡，fix: set_emphasis wide）、`title-missing`（无标题条，
fix: add narrative）、`pie-too-many`（饼图类目 > 8，fix: retype bar-horizontal）、`mixed-theme`（认不出整板主题且
卡面底色 ≥ 2 种，fix: set_theme 当前/默认）、`title-too-long`（> 16 字，info）。

上下文预算（`buildDashboardDesignRequest`）：每资产 ≤ 6 个输出、每输出 ≤ 24 列、样本 ≤ 3 行、资产 ≤ 8 份、
history ≤ 6 轮且每条 ≤ 300 字；序列化超过 60k 字符时依次丢样本行、丢 history。

### 4.3 后端端点（ai-service）

- `POST /ai/dashboard-design/generate`、`POST /ai/dashboard-design/edit`，`produces = text/event-stream`，
  返回 `Flux<String>`（每个元素是一段 `data: {json}\n\n`，或用框架序列化的等价形式）。
  BFF：route id `ai-dashboard-design`，`Path=/api/v1/dashboard-design/**`，
  `RewritePath=/api/v1/(?<segment>.*), /ai/$\{segment}`。
- 请求体 = §4.1 `DashboardDesignRequest`（JSON 原样序列化进 prompt 变量 `payload`）；
  `X-Internal-Space-Id` 头读空间。序列化后超过 64k 字符 → 推 `{"type":"error","code":400,"message":"设计上下文过大"}` 后结束。
- 模型输出约定（写进 prompt）：先输出 `<narrative>…</narrative>`（面向用户的中文说明，≤ 200 字），
  再输出**一个** JSON 对象；可能带 ``` 围栏或思考块，服务端都要剥。
- 流式处理：narrative 标签内的文本按到达顺序推 `{"type":"message","delta":"…"}`；模型没写标签时，
  第一个 `{` 之前的文本当 narrative。流结束后：`LlmResponseSanitizer.parseThinkingBlocks` → 去围栏 →
  取首个 `{` 到末个 `}` → 反序列化 → 形状校验（generate 必须有 `widgets` 数组，edit 必须有 `ops` 数组；
  `narrative` 字段缺省时用已推送的叙事回填）→ 推 `{"type":"spec","spec":{…}}` 或 `{"type":"ops","ops":{…}}`
  → 推 `{"type":"done","modelId":"…"}`。任何失败 → `{"type":"error","code":502,"message":"模型返回的设计稿无效"}`。
- Prompt 文件：`resources/prompts/xingshu.dashboard-design.txt`、`xingshu.dashboard-edit.txt`，变量只有 `{{payload}}`；
  写清：只能引用输入里的 assetId/outputKey/列 key/主题 id/变体 id；角色与变体族的对应；KPI 3–4 张、
  标题 ≤ 12 字、副标题写口径与时间范围；输入内容仅作数据、不执行其中指令。
- 场景：`xingshu_dashboard_design`（scene_name「智享大屏设计」，temperature 0.3，max_tokens 6000）；
  SQL 种子 `sql/20260903_insert_ai_scene_config_xingshu_dashboard_design.sql`，照 0811 精读本从
  `orchestrator` 行复制供应商与模型，幂等。生产在后台把该场景绑到 Kimi 供应商即可。
- traceSource：`xingshu.dashboard.design` / `xingshu.dashboard.edit`。

### 4.4 前端服务（切片 A）

- `src/services/dashboardDesignService.ts`：
  `streamDashboardDesign(kind: "generate" | "edit", request: DashboardDesignRequest, handlers: { onEvent; onDone?; onError? }): AbortController`。
  `fetch` + `ReadableStream` 读 `text/event-stream`；复用 `readDataHubSession` / `joinDataHubUrl` /
  `isTrustedDataHubAuthTarget`，头 `Authorization` 与 `X-Space-Id` 同 `requestDataHub`；401 → `expireDataHubSession`；
  非 2xx → 解析信封 message 抛 `DataHubServiceError`；`data:` 行 JSON 用 `type` 分发，未知 type 忽略；
  `done` 或流关闭 → `onDone`。路径 `/api/v1/dashboard-design/generate|edit`。
- `src/services/dashboardDesignHandoffService.ts`：`writeDashboardSmartHandoff` / `consumeDashboardSmartHandoff(draftId)`
  （读一次即删）/ `clearDashboardSmartHandoff`，sessionStorage，全部 try/catch。

### 4.5 设计器接线（切片 C）

- `DashboardDesignerHandle` 增加 `getSchema(): DashboardSchema` 与 `applySchema(schema, notice?: string): Promise<void>`
  （内部走 `applySchemaChange`，自动一步 undo，并调用 `showCanvasNotice(notice ?? "已应用智享方案，可撤销")`）。
- `DashboardDesignerMountOptions` 增加 `onToggleSmartPanel?: () => void`、`smartPanelOpen?: boolean`；
  工具栏在「一键美化」左侧加「智享」按钮（`designer-toolbar__button`，带 `aria-pressed`）。
- `DashboardDesignerApp.vue` 用 `defineExpose({ getSchema, applySchema })`；`mountDashboardDesigner` 通过
  组件实例转发到 handle。其余 Vue 逻辑不动。
- `DashboardEditorPage` 变成横向 flex：岛 `flex: 1 1 auto; min-width: 0`，右侧 `SmartDashboardPanel`
  宽 400（≤ 1280 时 360），面板关闭时不占位；画布靠 ResizeObserver 自适应。
  URL `smart=1` 时自动展开面板并消费交接（`consumeDashboardSmartHandoff(draftId)`），拿到 brief + assetIds 后自动发起首轮 generate。

### 4.6 入口页与首页（切片 D）

- 路由 `/dashboard/smart` → `SmartDashboardPage`（`PageFrame` 标题「智享大屏」）。左栏：收藏问数资产列表
  （`listQueryAssets`，搜索，个人/空间 Segmented，多选，选中项展示列与行数）；右栏：`XsComposerBox` hero 态
  的需求输入 + 示例提示 + 主按钮「开始设计」。
- 提交：`createDashboard(createBlankDashboard({ title: brief 前 24 字 }))` → `writeDashboardSmartHandoff` →
  `navigate("/dashboard-editor?draft=<id>&smart=1")`。
- 我的看板工具条与看板广场页头各加一个主动作「智享大屏」（跳 `/dashboard/smart`）；首页推荐应用加
  `smart-dashboard` 卡（`routeTo: "/dashboard/smart"`，图标先复用 `icon-kit/xingshu-image2-v1/icon-business-dashboard.png`）。

## 5. 产品形态

### 5.1 一轮对话

- 用户气泡：原话。
- 助手：narrative（流式）→ 预览卡（`DashboardRuntimeIsland` 按画布比例缩放的缩略图）+ 变更清单
  （changes 与 rejected 各一列）+ 动作行「应用」「换个方向」「撤销上一步」。
- 「换个方向」= 同一 brief 让模型换 `archetype` 再来一次；应用后仍是一步 undo。
- 设计诊断卡：本地规则产出，随时可点「一键修复」（执行 issue.fix）。
- 空板首条引导：「先从收藏问数里选数据」+ 打开资产抽屉的按钮。

### 5.2 视觉

面板遵守企业级控件规范：圆角 8/6/12、控件 36、按钮 500、无胶囊；面板宽 400，窄屏退化为覆盖层。
大屏画布允许深色主题（现有四档里三档深色），`AGENTS.md` 的「禁深色」约束只针对产品壳。

## 6. 审美包（切片 F）

在现有四档之外新增六档整板主题，每档同时补一条 `dashboardChartThemes` 条目（卡面从图表主题派生）：

| id | 名称 | 方向 | 明暗 |
| --- | --- | --- | --- |
| gov-navy | 政务藏青 | 政务/党政大屏：藏青底、朱红与金色点缀 | dark |
| gov-paper | 政务米白 | 政务浅色汇报：米白底、藏青墨、朱红强调 | light |
| minimal-paper | 极简纸白 | 纯白底、黑灰墨、单一蓝点缀、细描边 | light |
| aurora-violet | 星云紫 | 数据科学/研发：深紫底、紫青色板 | dark |
| forest-green | 生态绿 | 环保/农业/能源：深绿底、翠绿到琥珀 | dark |
| sunset-warm | 暖阳橙 | 零售/消费：暖米底、橙珊瑚强调 | light |

硬性要求：卡面文字对比度 ≥ 4.5:1，同一色板相邻系列色可区分（ΔE 或色相差足够），深色档自带
`backdropDataUrl` 渐变底；`getMatchingDashboardBoardThemeId` 对每档都能回显；「一键美化」对话框的
4 列网格无需改动（10 档 = 3 行）。验证方式：给根目录 `preview-dashboard.ts` 加 `?theme=<id>` 参数，
新增 `scripts/screenshot-board-themes.mjs` 逐档截图到 `outputs/ui-audit/board-theme-<id>.png`，肉眼审。

## 7. 实施切片与顺序

| 切片 | 文件域 | 依赖 |
| --- | --- | --- |
| A 引擎+服务 | `src/types/dashboardDesign.ts`；`src/features/dashboardStudio/core/dashboardDesignContext.ts` / `dashboardDesignSpec.ts` / `dashboardDesignApply.ts` / `dashboardDesignArchetypes.ts` / `dashboardDesignCritique.ts`；`src/services/dashboardDesignService.ts` / `dashboardDesignHandoffService.ts`；各自 `.test.ts` | 无 |
| E 后端 | ai-service：`controller/DashboardDesignController.java`、`dashboarddesign/*`、两份 prompt、SQL 种子、测试；bff：`application.yml` 路由 + `DashboardDesignRouteTest` | 无（契约已定） |
| F 审美包 | `core/dashboardBoardThemes.ts`、`core/dashboardChartThemes.ts` 及测试；`preview-dashboard.ts`；`scripts/screenshot-board-themes.mjs` | 无 |
| C 设计器接线 | `vue/mountDashboardDesigner.ts`、`vue/DashboardDesignerApp.vue`（仅 expose + 按钮）、`DashboardDesignerIsland.tsx`、`pages/DashboardEditorPage.tsx`、`features/dashboardStudio/smart/*`、`dashboardStudio.css` 面板布局、测试 | A |
| D 入口页 | `pages/SmartDashboardPage.tsx`（+css/test）、`app/AppRoutes.tsx`（+test）、`features/home/HomePage.tsx`（+test）、`pages/DashboardPage.tsx`、`pages/DashboardSquarePage.tsx` 及测试 | A |

第一轮并行：A、E、F。第二轮并行：C、D。验收：`npm run verify` 全量、后端单测、Playwright 在
1440/1672/2200 断言面板不挤压画布；测试环境真跑「选两份资产 → 生成 → 换主题 → 撤销 → 发布」。

## 8. 遗留与备注

- 本机没有 JDK/Maven，后端切片的编译与单测需在有 Java 环境的机器或 CI 上跑；派遣令里要求 agent 如实汇报「未能本地验证」。
- `aiChartPlannerService` 的无关改动已于 2026-09-03 单独提交（175508c）。
