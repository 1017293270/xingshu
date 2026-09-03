import type { LayoutIntent } from "@/types/analytics";
import type { DashboardDesignArchetype } from "@/types/dashboardDesign";
import type { DashboardSchema, DashboardWidget } from "@/types/dashboardStudio";
import { balancedRowSizes, composeDashboardLayoutPlan, fitDashboardCanvasHeight } from "./dashboardCompose";
import { solveDashboardLayout, widgetImportance } from "./dashboardLayoutSolver";

/**
 * 构图原型：同一批组件的四种排法。
 * 一键美化只有一种节奏（hero + 侧轨 + 行平衡），对话式设计需要「换个方向」，
 * 于是把主体带的排法抽成四档可命名的主张，模型只需要选 id，行宽与像素仍由求解器算。
 */
export type DashboardDesignFlowEmphasis = "compact" | "normal" | "wide";

export type DashboardDesignArchetypeOverrides = {
  heroWidgetId?: string;
  railWidgetIds?: string[];
  /**
   * 逐组件的宽度意图，只作用于主体带里流式排布的图（主图与侧轨另有出口）。
   * 用户说「把这张图加宽」，原型的等宽切行就得给这一张让路，否则指令等于没发。
   */
  emphasisById?: Record<string, DashboardDesignFlowEmphasis>;
};

export const dashboardDesignArchetypeCatalog: Array<{
  id: DashboardDesignArchetype;
  title: string;
  description: string;
}> = [
  {
    id: "kpi-led",
    title: "指标总览",
    description: "顶部 KPI 带挑大梁，主体图等宽切行、不设主图，适合日常经营看板。"
  },
  {
    id: "trend-led",
    title: "趋势主导",
    description: "把最重要的趋势图放大成通栏主图，占比类小图收进右侧侧轨。"
  },
  {
    id: "comparison-grid",
    title: "对比矩阵",
    description: "主体图两张一行、等高对齐，不设主图，适合多维度横向比较。"
  },
  {
    id: "ranking-detail",
    title: "排行明细",
    description: "排行柱状图当主图，底部明细表加高，适合榜单加台账的汇报场景。"
  }
];

const TREND_TYPES = new Set<DashboardWidget["type"]>(["line", "area"]);
const RAIL_TYPES = new Set<DashboardWidget["type"]>(["pie", "radar", "funnel"]);
const CHART_TYPES = new Set<DashboardWidget["type"]>(["line", "area", "bar", "pie", "radar", "funnel"]);
const MAX_RAILS = 2;

type MainEntry = {
  widget: DashboardWidget;
  intent: LayoutIntent;
};

/** 数据行数越多越撑得住大画面；与一键美化同口径，只是这里按原型限定候选图种。 */
function heroWeight(schema: DashboardSchema, widget: DashboardWidget) {
  const binding = widget.bindingId ? schema.dataBindings[widget.bindingId] : undefined;
  const rows = binding?.table?.rows?.length ?? 0;
  const metrics = widget.mapping.metricKeys?.length ?? widget.mapping.metricColumnIds?.length ?? 0;
  return Math.min(20, rows * 1.25) + Math.min(10, Math.max(0, metrics - 1) * 5) + widgetImportance(widget) / 100;
}

function pickHero(schema: DashboardSchema, entries: MainEntry[], preferred: Set<DashboardWidget["type"]>) {
  const candidates = entries.filter((entry) => preferred.has(entry.widget.type));
  const pool = candidates.length > 0 ? candidates : entries.filter((entry) => CHART_TYPES.has(entry.widget.type));
  if (pool.length === 0) return undefined;
  return pool.reduce((best, entry) =>
    heroWeight(schema, entry.widget) > heroWeight(schema, best.widget) ? entry : best
  );
}

/**
 * 侧轨只在「正好用光紧凑图且余下的还能凑成整行」时成立，
 * 否则会留下一张孤零零的通栏图，比不开侧轨更难看。
 */
function pickRails(followers: MainEntry[]) {
  const candidates: MainEntry[] = [];
  for (const entry of followers) {
    if (candidates.length >= MAX_RAILS || !RAIL_TYPES.has(entry.widget.type)) break;
    candidates.push(entry);
  }
  for (let count = candidates.length; count >= 1; count -= 1) {
    if (followers.length - count !== 1) return candidates.slice(0, count);
  }
  return [];
}

function resolveRailOverrides(entries: MainEntry[], hero: MainEntry | undefined, requested: string[]) {
  if (!hero) return [];
  const byId = new Map(entries.map((entry) => [entry.widget.id, entry]));
  const rails: MainEntry[] = [];
  for (const widgetId of requested) {
    const entry = byId.get(widgetId);
    if (!entry || entry === hero || rails.includes(entry) || rails.length >= MAX_RAILS) continue;
    rails.push(entry);
  }
  return rails;
}

/** 主体带的行切分：每档原型只在这里分歧，其余四条带沿用一键美化的节奏。 */
function flowIntents(archetype: DashboardDesignArchetype, flowed: MainEntry[]): Array<Omit<LayoutIntent, "widgetId" | "rank" | "section">> {
  if (archetype === "comparison-grid") {
    return flowed.map((_, index) => {
      const isLastOdd = index === flowed.length - 1 && flowed.length % 2 === 1;
      return { emphasis: isLastOdd ? "wide" : "normal", heightTier: "tall" };
    });
  }

  const attributes: Array<Omit<LayoutIntent, "widgetId" | "rank" | "section">> = [];
  for (const size of balancedRowSizes(flowed.length)) {
    const emphasis = size >= 3 ? "compact" : size === 2 ? "normal" : "wide";
    for (let offset = 0; offset < size; offset += 1) {
      attributes.push({ emphasis, heightTier: "short" });
    }
  }
  return attributes;
}

/**
 * 在一键美化产出的 intents 上改写主体带，再交给求解器算像素。
 *
 * 显式覆盖优先于原型规则：给了 heroWidgetId 就一定是它当主图（哪怕原型本身不设主图），
 * railWidgetIds 只在存在主图时生效——侧轨是贴着主图站的，没有主图就没有侧轨可言。
 */
export function composeDashboardWithArchetype(
  schema: DashboardSchema,
  archetype: DashboardDesignArchetype,
  overrides: DashboardDesignArchetypeOverrides = {}
): DashboardSchema {
  const plan = composeDashboardLayoutPlan(schema);
  const widgetById = new Map(schema.widgets.map((widget) => [widget.id, widget]));
  const movableIds = new Set(schema.widgets.filter((widget) => !widget.style.locked).map((widget) => widget.id));
  const mainEntries: MainEntry[] = [];
  const otherIntents: LayoutIntent[] = [];

  for (const intent of plan.intents) {
    const widget = widgetById.get(intent.widgetId);
    if (!widget) continue;
    if (intent.section === "main" && movableIds.has(widget.id)) mainEntries.push({ widget, intent });
    else otherIntents.push(intent);
  }

  const overrideHero = overrides.heroWidgetId
    ? mainEntries.find((entry) => entry.widget.id === overrides.heroWidgetId)
    : undefined;
  const archetypeHero = archetype === "trend-led"
    ? pickHero(schema, mainEntries, TREND_TYPES)
    : archetype === "ranking-detail"
      ? pickHero(schema, mainEntries, new Set<DashboardWidget["type"]>(["bar"]))
      : undefined;
  const hero = overrideHero ?? archetypeHero;

  const followers = mainEntries.filter((entry) => entry !== hero);
  const requestedRails = resolveRailOverrides(mainEntries, hero, overrides.railWidgetIds ?? []);
  const rails = hero
    ? (requestedRails.length > 0 ? requestedRails : pickRails(followers))
    : [];
  const flowed = followers.filter((entry) => !rails.includes(entry));

  const intents: LayoutIntent[] = [];
  const push = (widgetId: string, section: string, attributes: Omit<LayoutIntent, "widgetId" | "rank" | "section">) => {
    intents.push({ widgetId, section, rank: intents.length, ...attributes });
  };

  // 主体带先发号：求解器按「组内最小 rank」给同 moduleId 的组件聚类，
  // 主体拿到最小的 rank，主图与侧轨的相邻关系才不会被别的带插队打断。
  if (hero) {
    push(hero.widget.id, "main", { emphasis: "hero", heightTier: "tall" });
    for (const rail of rails) push(rail.widget.id, "main", { emphasis: "compact", placement: "rail" });
  }
  const flowAttributes = flowIntents(archetype, flowed);
  flowed.forEach((entry, index) => {
    const attributes = flowAttributes[index] ?? { emphasis: "normal", heightTier: "short" };
    const requested = overrides.emphasisById?.[entry.widget.id];
    push(entry.widget.id, "main", requested ? { ...attributes, emphasis: requested } : attributes);
  });

  for (const intent of otherIntents) {
    if (intent.section === "detail" && archetype === "ranking-detail") {
      push(intent.widgetId, "detail", { emphasis: "wide", heightTier: "tall" });
      continue;
    }
    const { widgetId, section, rank: _rank, ...attributes } = intent;
    push(widgetId, section, attributes);
  }

  return fitDashboardCanvasHeight(solveDashboardLayout(schema, intents));
}
