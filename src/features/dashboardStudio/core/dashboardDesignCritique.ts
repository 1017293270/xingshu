import type { DashboardDesignIssue } from "@/types/dashboardDesign";
import type { DashboardSchema, DashboardWidget, DashboardWidgetType } from "@/types/dashboardStudio";
import { getMatchingDashboardBoardThemeId } from "./dashboardBoardThemes";
import { resolveDashboardBoardThemeId } from "./dashboardDesignApply";

/**
 * 设计诊断：全本地规则，跑一次不花钱也不等模型。
 * 每条能一键修的都直接带上要执行的 op，面板点一下就走 applyDashboardDesignOps。
 */

const CHART_TYPES = new Set<DashboardWidgetType>(["line", "area", "bar", "pie", "radar", "funnel"]);
/** 文本/图片/装饰天生就是独占一行的细条，不算落单卡。 */
const ROW_MEMBER_TYPES = new Set<DashboardWidgetType>(["metric", "line", "area", "bar", "pie", "radar", "funnel", "table"]);

const MAX_KPI = 4;
const MIN_CHARTS_FOR_HERO = 3;
const MAX_PIE_CATEGORIES = 8;
const MAX_TITLE_CHARS = 16;
/** 主图至少要比同屏其它图宽这么多倍，否则就是「几张一样大」。 */
const HERO_WIDTH_RATIO = 1.5;

function bindingRows(schema: DashboardSchema, widget: DashboardWidget) {
  const binding = widget.bindingId ? schema.dataBindings[widget.bindingId] : undefined;
  return binding?.table.rows.length ?? 0;
}

/** 按纵向重叠归行：求解器同一行的组件底缘对齐，纵向区间必然互相覆盖。 */
function groupRows(widgets: DashboardWidget[]) {
  const sorted = [...widgets].sort((left, right) => left.position.y - right.position.y);
  const rows: DashboardWidget[][] = [];
  for (const widget of sorted) {
    const row = rows.find((items) =>
      items.some((item) =>
        widget.position.y < item.position.y + item.position.h && widget.position.y + widget.position.h > item.position.y
      )
    );
    if (row) row.push(widget);
    else rows.push([widget]);
  }
  return rows;
}

export function critiqueDashboard(schema: DashboardSchema): DashboardDesignIssue[] {
  const issues: DashboardDesignIssue[] = [];
  const canvasWidth = schema.canvas.width;
  const kpis = schema.widgets.filter((widget) => widget.type === "metric");
  const charts = schema.widgets.filter((widget) => CHART_TYPES.has(widget.type));

  if (kpis.length === 0) {
    issues.push({ code: "no-kpi", severity: "warning", message: "整板没有指标卡，观众第一眼抓不到结论数字。" });
  } else if (kpis.length > MAX_KPI) {
    issues.push({
      code: "too-many-kpi",
      severity: "warning",
      message: `顶部有 ${kpis.length} 张指标卡，超过 ${MAX_KPI} 张就没有主次了，建议只留最关键的几张。`
    });
  }

  if (charts.length >= MIN_CHARTS_FOR_HERO) {
    // 通栏主图算主图；带侧轨的主图占不满三分之二画布，但只要明显宽过同屏其它图，视线一样有落点。
    const widest = charts.reduce((best, widget) => (widget.position.w > best.position.w ? widget : best));
    const hero = widest.position.w >= (canvasWidth * 2) / 3
      || charts.every((widget) => widget === widest || widest.position.w >= widget.position.w * HERO_WIDTH_RATIO);
    if (!hero) {
      const candidate = charts.reduce((best, widget) =>
        bindingRows(schema, widget) > bindingRows(schema, best) ? widget : best
      );
      issues.push({
        code: "no-hero",
        severity: "warning",
        message: `${charts.length} 张图一样大，没有主图，视线没有落点。`,
        widgetId: candidate.id,
        fix: [{ op: "set_emphasis", widgetId: candidate.id, emphasis: "hero" }]
      });
    }
  }

  for (const row of groupRows(schema.widgets.filter((widget) => ROW_MEMBER_TYPES.has(widget.type)))) {
    if (row.length !== 1) continue;
    const only = row[0];
    if (only.position.w >= canvasWidth / 2) continue;
    issues.push({
      code: "orphan-row",
      severity: "warning",
      message: `「${only.title}」独占一行却只有窄窄一条，右边空了一大片。`,
      widgetId: only.id,
      fix: [{ op: "set_emphasis", widgetId: only.id, emphasis: "wide" }]
    });
  }

  if (!schema.widgets.some((widget) => widget.type === "text")) {
    issues.push({
      code: "title-missing",
      severity: "warning",
      message: "整板没有标题条，投屏时观众不知道这屏在讲什么。",
      fix: [
        {
          op: "add_widget",
          widget: { ref: "board-title", role: "narrative", title: schema.title, content: schema.title }
        }
      ]
    });
  }

  for (const widget of schema.widgets) {
    if (widget.type !== "pie") continue;
    const rows = bindingRows(schema, widget);
    if (rows <= MAX_PIE_CATEGORIES) continue;
    issues.push({
      code: "pie-too-many",
      severity: "warning",
      message: `「${widget.title}」有 ${rows} 个类目，环形图分不清，换成横向排行更好读。`,
      widgetId: widget.id,
      fix: [{ op: "retype_widget", widgetId: widget.id, variant: "bar-horizontal" }]
    });
  }

  if (!getMatchingDashboardBoardThemeId(schema)) {
    const surfaces = new Set(
      schema.widgets
        .filter((widget) => widget.type !== "text")
        .map((widget) => widget.style.background)
        .filter((background): background is string => Boolean(background))
    );
    if (surfaces.size >= 2) {
      const themeId = resolveDashboardBoardThemeId(schema);
      issues.push({
        code: "mixed-theme",
        severity: "warning",
        message: `板上有 ${surfaces.size} 种卡面底色，配色已经不成一套了。`,
        fix: [{ op: "set_theme", themeId }]
      });
    }
  }

  for (const widget of schema.widgets) {
    if (widget.title.length <= MAX_TITLE_CHARS) continue;
    issues.push({
      code: "title-too-long",
      severity: "info",
      message: `「${widget.title}」标题 ${widget.title.length} 字，超过 ${MAX_TITLE_CHARS} 字在大屏上会被截断。`,
      widgetId: widget.id
    });
  }

  return issues;
}
