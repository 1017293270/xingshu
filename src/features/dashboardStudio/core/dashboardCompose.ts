import type { LayoutIntent, LayoutPlan } from "@/types/analytics";
import type { DashboardSchema, DashboardWidget, DashboardWidgetType } from "@/types/dashboardStudio";
import { DEFAULT_DASHBOARD_BOARD_THEME_ID, applyDashboardBoardTheme } from "./dashboardBoardThemes";
import { dashboardChartWidgetTypes } from "./dashboardComponentRegistry";
import { dashboardLayoutSpacing, solveDashboardLayout, widgetImportance } from "./dashboardLayoutSolver";

/**
 * 一键成屏的构图器：把「组件按什么顺序、落在哪个带、占多宽多高」这套审美主张写成纯函数，
 * 再交给 solveDashboardLayout 算像素。原来这套启发式藏在设计器的 AI 排版兜底分支里，
 * 后端 /layout-plan 端点从未存在过，所以线上一直走的就是它——现在把它升格成一等公民并补齐审美规则。
 *
 * 纵向节奏固定为五带：标题条 → KPI 总览 → 主体 → 明细 → 脚注。
 */

const CHART_TYPES = new Set<DashboardWidgetType>(dashboardChartWidgetTypes);
/** 方形/紧凑型图：占比、画像、漏斗放在 hero 边上的窄侧轨最好看，拉通栏反而空。 */
const RAIL_FRIENDLY_TYPES = new Set<DashboardWidgetType>(["pie", "radar", "funnel"]);
/** hero 竞选的基础分：时间趋势 > 分类对比 > 占比类。 */
const HERO_TYPE_SCORE: Record<string, number> = { line: 100, area: 96, bar: 88, funnel: 62, radar: 58, pie: 54 };
const MAX_RAILS = 2;
/** 画布收敛时的最低高度：不低于 16:9，避免只有两三个组件时整板被压成一条。 */
const MIN_CANVAS_ASPECT = 16 / 9;

type ComposeBand = "banner" | "summary" | "main" | "detail" | "footnote";

type ComposeEntry = {
  widget: DashboardWidget;
  band: ComposeBand;
  clusterKey: string;
  isChart: boolean;
  railFriendly: boolean;
  heroScore: number;
};

/**
 * 数据充实度：行数越多、指标越多的图越撑得起大画面。
 * 上限 30 分，刚好不足以让一张饼图（54+30）翻过柱状图的底分（88），
 * 也就是说“占比图不会因为数据多就抢走 hero”，但同类型里数据更实的那张会赢。
 */
function dataRichness(schema: DashboardSchema, widget: DashboardWidget) {
  const binding = widget.bindingId ? schema.dataBindings[widget.bindingId] : undefined;
  if (!binding) return 0;
  const rows = binding.table?.rows?.length ?? 0;
  const metrics = widget.mapping.metricKeys?.length ?? widget.mapping.metricColumnIds?.length ?? 0;
  return Math.min(20, rows * 1.25) + Math.min(10, Math.max(0, metrics - 1) * 5);
}

/** 图种基础分 + 数据充实度，末位再拿求解器那套 importance 做同分兜底。 */
function heroScore(schema: DashboardSchema, widget: DashboardWidget) {
  const base = HERO_TYPE_SCORE[widget.type];
  if (base === undefined) return 0;
  return base + dataRichness(schema, widget) + widgetImportance(widget) / 100;
}

/**
 * 文本条不进主体流：开头那几条当标题（banner 带，压在最上面），
 * 其余当脚注（footnote 带，沉到最底）。两种都独占整行，不会被图表挤成半行。
 */
function bandOf(widget: DashboardWidget, leadingTextIds: Set<string>): ComposeBand {
  if (widget.type === "text") return leadingTextIds.has(widget.id) ? "banner" : "footnote";
  if (widget.type === "metric") return "summary";
  if (widget.type === "table") return "detail";
  return "main";
}

function leadingTextWidgetIds(widgets: DashboardWidget[]) {
  const ids = new Set<string>();
  for (const widget of widgets) {
    if (widget.type !== "text") break;
    ids.add(widget.id);
  }
  return ids;
}

/**
 * 行平衡：把剩下的组件切成每行 3 张或 2 张，绝不留“落单一张”跟一排宽卡并列的跛脚行。
 * 4 → 2+2 而不是 3+1，7 → 3+2+2 而不是 3+3+1。
 */
export function balancedRowSizes(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return [count];
  const remainder = count % 3;
  if (remainder === 0) return Array.from({ length: count / 3 }, () => 3);
  if (remainder === 2) return [...Array.from({ length: (count - 2) / 3 }, () => 3), 2];
  return [...Array.from({ length: (count - 4) / 3 }, () => 3), 2, 2];
}

/**
 * KPI 行平衡：一排最多四张（求解器把指标卡封顶在 1/3 行宽），超过就按行均分。
 * 5 张走 3+2 而不是 4+1，9 张走 3+3+3 而不是 4+4+1，末行永远不会只剩孤零零一张。
 * 每行 4 张时给 compact（3 列 ×4=12），3 张时给 normal（封顶 4 列 ×3=12），正好整行不串行。
 */
export function kpiRowSizes(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 4) return [count];
  const rows = Math.ceil(count / 4);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

/** 同 moduleId 的组件聚成连续块，块内 hero 站首位；hero 是独苗时把紧凑图簇拉到它后面当侧轨。 */
function orderMainEntries(entries: ComposeEntry[]) {
  const clusters = new Map<string, ComposeEntry[]>();
  for (const entry of entries) {
    const bucket = clusters.get(entry.clusterKey);
    if (bucket) bucket.push(entry);
    else clusters.set(entry.clusterKey, [entry]);
  }

  const charts = entries.filter((entry) => entry.isChart);
  const hero = charts.length > 0
    ? charts.reduce((best, entry) => (entry.heroScore > best.heroScore ? entry : best))
    : undefined;

  const keys = [...clusters.keys()];
  const orderedKeys: string[] = [];
  if (hero) orderedKeys.push(hero.clusterKey);
  if (hero && clusters.get(hero.clusterKey)?.length === 1) {
    for (const key of keys) {
      if (orderedKeys.length >= 1 + MAX_RAILS) break;
      if (orderedKeys.includes(key)) continue;
      const bucket = clusters.get(key) ?? [];
      if (bucket.length === 1 && bucket[0]!.railFriendly) orderedKeys.push(key);
    }
  }
  for (const key of keys) if (!orderedKeys.includes(key)) orderedKeys.push(key);

  const order = orderedKeys.flatMap((key) => {
    const bucket = clusters.get(key) ?? [];
    if (!hero || key !== hero.clusterKey) return bucket;
    return [hero, ...bucket.filter((entry) => entry !== hero)];
  });
  return { order, hero };
}

/**
 * 侧轨只在“正好用光紧凑图且余下的还能凑成整行”时才成立。
 * 例：hero + 2 饼 + 1 图会退成 hero + 1 侧轨 + 一行两张，绝不留一张孤零零的通栏。
 */
function pickRails(order: ComposeEntry[], hero?: ComposeEntry) {
  if (!hero || order[0] !== hero) return [];
  const followers = order.slice(1);
  const candidates: ComposeEntry[] = [];
  for (const entry of followers) {
    if (candidates.length >= MAX_RAILS || !entry.railFriendly) break;
    candidates.push(entry);
  }
  for (let count = candidates.length; count >= 1; count -= 1) {
    if (followers.length - count !== 1) return candidates.slice(0, count);
  }
  return [];
}

/**
 * 构图规则（接线方按这份写 UI 文案）：
 * 1. KPI 全部收进顶部总览带，一排最多四张、等宽等高；超过四张按行均分（5 张走 3+2，不留 4+1）。
 * 2. 最重要的图表做 hero：按图种基础分 + 数据充实度（行数/指标数）选，趋势图优先。
 * 3. 饼图/雷达/漏斗优先进 hero 右侧的窄侧轨，最多两张竖排、底缘与 hero 对齐。
 * 4. 剩下的图按每行 3 张或 2 张切行，不留落单的跛脚行。
 * 5. 只有两张图且第二张不是紧凑图时，放弃 hero 改成对半平铺，比一宽一窄好看。
 * 6. 表格一律沉到明细带、通栏铺满。
 * 7. 开头的文本当标题条压在最上，其余文本当脚注沉到最底，都是独占整行的细条。
 * 8. 同 moduleId 的组件聚成连续块，不会被拆到两处。
 * 9. 锁定组件不参与构图，只作为障碍被避让。
 */
export function composeDashboardLayoutPlan(schema: DashboardSchema): LayoutPlan {
  const leadingTextIds = leadingTextWidgetIds(schema.widgets);
  const movable = schema.widgets.filter((widget) => !widget.style.locked);
  const locked = schema.widgets.filter((widget) => widget.style.locked);
  const entries: ComposeEntry[] = movable.map((widget) => ({
    widget,
    band: bandOf(widget, leadingTextIds),
    clusterKey: widget.moduleId ?? `widget:${widget.id}`,
    isChart: CHART_TYPES.has(widget.type),
    railFriendly: RAIL_FRIENDLY_TYPES.has(widget.type),
    heroScore: heroScore(schema, widget)
  }));

  const intents: LayoutIntent[] = [];
  const push = (entry: ComposeEntry, section: ComposeBand, extra: Omit<LayoutIntent, "widgetId" | "section" | "rank">) => {
    intents.push({ widgetId: entry.widget.id, section, rank: intents.length, ...extra });
  };

  // 主体带先发号：求解器的 moduleId 聚类按“组内最小 rank”排序，主体先拿到最小的 rank，
  // hero → 侧轨的相邻关系才不会被别的带里的同 module 组件插队打断。
  const { order, hero } = orderMainEntries(entries.filter((entry) => entry.band === "main"));
  const rails = pickRails(order, hero);
  const useHeroBand = Boolean(hero) && !(rails.length === 0 && order.length === 2);
  const flowed = useHeroBand ? order.slice(1 + rails.length) : order;

  if (hero && useHeroBand) {
    push(hero, "main", { emphasis: "hero", heightTier: "tall" });
    for (const rail of rails) push(rail, "main", { emphasis: "compact", placement: "rail" });
  }
  let cursor = 0;
  for (const size of balancedRowSizes(flowed.length)) {
    const emphasis = size >= 3 ? "compact" : size === 2 ? "normal" : "wide";
    // 没有 hero 时这排就是主角，给足高度；hero 已经占了大画面就用标准高度收住整板。
    const heightTier = size === 2 && !useHeroBand ? "tall" : "short";
    for (let offset = 0; offset < size; offset += 1) {
      const entry = flowed[cursor];
      cursor += 1;
      if (entry) push(entry, "main", { emphasis, heightTier });
    }
  }

  for (const entry of entries.filter((item) => item.band === "banner")) push(entry, "banner", { emphasis: "wide" });
  const kpis = entries.filter((item) => item.band === "summary");
  let kpiCursor = 0;
  for (const size of kpiRowSizes(kpis.length)) {
    for (let offset = 0; offset < size; offset += 1) {
      const entry = kpis[kpiCursor];
      kpiCursor += 1;
      if (entry) push(entry, "summary", { emphasis: size >= 4 ? "compact" : "normal" });
    }
  }
  for (const entry of entries.filter((item) => item.band === "detail")) {
    push(entry, "detail", { emphasis: "wide", heightTier: "short" });
  }
  for (const entry of entries.filter((item) => item.band === "footnote")) push(entry, "footnote", { emphasis: "wide" });
  for (const widget of locked) {
    intents.push({
      widgetId: widget.id,
      section: bandOf(widget, leadingTextIds),
      rank: intents.length,
      emphasis: "normal"
    });
  }

  return { source: "LOCAL", intents, message: composeMessage(entries, hero, rails.length, useHeroBand, locked.length) };
}

function composeMessage(
  entries: ComposeEntry[],
  hero: ComposeEntry | undefined,
  railCount: number,
  useHeroBand: boolean,
  lockedCount: number
) {
  const parts: string[] = [];
  const kpis = entries.filter((entry) => entry.band === "summary").length;
  const details = entries.filter((entry) => entry.band === "detail").length;
  if (kpis > 0) parts.push(`${kpis} 张 KPI 收进顶部总览带`);
  if (hero && useHeroBand) {
    parts.push(railCount > 0 ? `主图放大成 hero，右侧配 ${railCount} 张侧轨` : "主图放大成通栏 hero");
  }
  if (details > 0) parts.push(`${details} 张表格通栏沉底`);
  if (lockedCount > 0) parts.push(`${lockedCount} 个锁定组件原位避让`);
  return parts.length > 0 ? `已重新构图：${parts.join("，")}。` : "已按整齐网格重新构图。";
}

/**
 * 整板高度收敛到「内容 + 下边距」，最低不低于 16:9。
 * 求解器只会把画布撑高不会收回，反复排版后底部会留一大片空白，这里补上收口。
 */
export function fitDashboardCanvasHeight(schema: DashboardSchema): DashboardSchema {
  const { padding } = dashboardLayoutSpacing(schema.canvas.width);
  const content = schema.widgets.reduce(
    (bottom, widget) => Math.max(bottom, widget.position.y + widget.position.h),
    0
  );
  const floor = Math.round(schema.canvas.width / MIN_CANVAS_ASPECT);
  const height = Math.max(floor, content > 0 ? content + padding : 0);
  return {
    ...schema,
    canvas: { ...schema.canvas, height, rows: Math.max(1, Math.ceil(height / 90)) }
  };
}

/** 构图 + 求解一步到位的纯函数：只动位置，不动配色。 */
export function composeDashboardLayout(schema: DashboardSchema): DashboardSchema {
  const plan = composeDashboardLayoutPlan(schema);
  return fitDashboardCanvasHeight(solveDashboardLayout(schema, plan.intents));
}

/** 一键美化：先统一整板主题，再重新构图。预设缺省走浅色企业档。 */
export function composeAndBeautifyDashboard(
  schema: DashboardSchema,
  presetId: string = DEFAULT_DASHBOARD_BOARD_THEME_ID
): DashboardSchema {
  return composeDashboardLayout(applyDashboardBoardTheme(schema, presetId));
}
