import type { LayoutIntent, LayoutWidgetInput } from "@/types/analytics";
import type { DashboardSchema, DashboardWidget, DashboardWidgetPosition } from "@/types/dashboardStudio";

const GRID_COLUMNS = 12;
const SNAP = 8;
/** KPI 卡最多占 1/3 行宽，指标卡过宽会显得空荡。 */
const METRIC_MAX_COLUMNS = 4;
/** 侧轨组件的最小高度，保证两张侧轨堆叠时 hero 有真实的主从对比。 */
const RAIL_MIN_HEIGHT = 216;

type LayoutSpacing = {
  padding: number;
  gap: number;
  sectionGap: number;
};

/** 间距随画布宽度缩放：宽屏需要更大的呼吸感，所有取值保持 8px 网格对齐。 */
function canvasSpacing(width: number): LayoutSpacing {
  return width >= 1680
    ? { padding: 32, gap: 24, sectionGap: 40 }
    : { padding: 24, gap: 16, sectionGap: 32 };
}

function overlaps(left: DashboardWidgetPosition, right: DashboardWidgetPosition) {
  return left.x < right.x + right.w && left.x + left.w > right.x
    && left.y < right.y + right.h && left.y + left.h > right.y;
}

export function widgetSemanticRole(widget: DashboardWidget): LayoutWidgetInput["semanticRole"] {
  if (widget.type === "metric") return "kpi";
  if (["line", "area"].includes(widget.type)) return "trend";
  if (widget.type === "table") return "detail";
  if (widget.type === "text") return "narrative";
  return "comparison";
}

export function widgetImportance(widget: DashboardWidget) {
  if (widget.type === "metric") return 90;
  if (["line", "area", "bar"].includes(widget.type)) return 75;
  if (widget.type === "table") return 45;
  return 55;
}

export function createLayoutRequest(schema: DashboardSchema) {
  return {
    canvas: { width: schema.canvas.width, height: schema.canvas.height, columns: 12 },
    widgets: schema.widgets.map((widget) => ({
      id: widget.id,
      moduleId: widget.moduleId,
      type: widget.type,
      semanticRole: widgetSemanticRole(widget),
      minWidth: widget.type === "metric" ? 220 : 320,
      minHeight: widget.type === "metric" ? 132 : 220,
      currentWidth: widget.position.w,
      currentHeight: widget.position.h,
      locked: widget.style.locked === true,
      importance: widgetImportance(widget)
    }))
  };
}

/**
 * emphasis 决定初始跨度：compact 3 列、normal 6 列、wide 8 列、hero 独占一个横向带。
 */
function emphasisColumns(emphasis: LayoutIntent["emphasis"]) {
  if (emphasis === "compact") return 3;
  if (emphasis === "normal") return 6;
  if (emphasis === "wide") return 8;
  return GRID_COLUMNS;
}

/** 语义分区的纵向顺序：总览在上、明细在下，未识别的分区按主体处理。 */
const SECTION_ORDER: Record<string, number> = { summary: 0, main: 1, detail: 2 };

function sectionOrder(section: string | undefined) {
  return SECTION_ORDER[section ?? "main"] ?? SECTION_ORDER.main;
}

/** KPI 封顶 4 列，其他组件可以拉满整行。 */
function maxColumns(widget: DashboardWidget) {
  return widget.type === "metric" ? METRIC_MAX_COLUMNS : GRID_COLUMNS;
}

function snapToGrid(value: number) {
  return Math.round(value / SNAP) * SNAP;
}

/** 非 KPI 组件的高度意图档位（px），让 AI 可以表达“细条 / 标准 / 加高”。 */
const HEIGHT_TIERS = { slim: 216, short: 280, tall: 416 } as const;

function desiredHeight(widget: DashboardWidget, intent: LayoutIntent) {
  if (widget.type === "metric") {
    return snapToGrid(Math.max(132, Math.min(220, widget.position.h)));
  }
  if (intent.emphasis === "hero") {
    return snapToGrid(Math.max(intent.heightTier === "tall" ? 440 : 360, widget.position.h));
  }
  if (intent.heightTier) return HEIGHT_TIERS[intent.heightTier];
  return snapToGrid(Math.max(240, Math.min(420, widget.position.h)));
}

/** 同行高度统一时的单卡上限；显式高度意图不被行高统一覆盖，否则 slim/tall 对比会被抹平。 */
function maxUnifiedHeight(widget: DashboardWidget, intent: LayoutIntent) {
  if (intent.emphasis === "hero") return Number.POSITIVE_INFINITY;
  if (widget.type === "metric") return 220;
  if (intent.heightTier) return HEIGHT_TIERS[intent.heightTier];
  return 420;
}

type LayoutGrid = {
  x: (column: number) => number;
  spanWidth: (column: number, span: number) => number;
};

/**
 * 12 列网格：列宽 8px 对齐，余量按列均分，保证同列 x 一致且行右缘贴近画布右边距。
 */
function createLayoutGrid(contentWidth: number, spacing: LayoutSpacing): LayoutGrid {
  const base = Math.max(SNAP, Math.floor((contentWidth - spacing.gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS / SNAP) * SNAP);
  const columnWidths = Array.from({ length: GRID_COLUMNS }, () => base);
  let remainder = contentWidth - spacing.gap * (GRID_COLUMNS - 1) - base * GRID_COLUMNS;
  for (let column = 0; remainder >= SNAP; column = (column + 1) % GRID_COLUMNS) {
    columnWidths[column]! += SNAP;
    remainder -= SNAP;
  }
  const offsets: number[] = [];
  columnWidths.reduce((offset, width, column) => {
    offsets[column] = offset;
    return offset + width + spacing.gap;
  }, spacing.padding);
  return {
    x: (column) => offsets[Math.min(column, GRID_COLUMNS - 1)] ?? spacing.padding,
    spanWidth: (column, span) => {
      const last = Math.min(column + span, GRID_COLUMNS);
      let width = 0;
      for (let index = column; index < last; index += 1) width += columnWidths[index]!;
      return width + spacing.gap * (last - column - 1);
    }
  };
}

/**
 * AI 只决定顺序、分区、强调级别和高度意图；该求解器才决定像素位置，并强制锁定、边界和无重叠。
 * 组件按 12 列网格落位：同列左对齐、坐标 8px 对齐；语义分区纵向成带、带间留白大于行距；
 * 同一行内的组件高度统一、底缘对齐，不足一行的窄卡优先拉伸，KPI 卡最多占 1/3 行宽；
 * 同 moduleId 的组件聚类相邻；hero 独占一个横向带，可携带最多两个侧轨组件垂直堆叠、底缘对齐。
 */
export function solveDashboardLayout(schema: DashboardSchema, intents: LayoutIntent[]): DashboardSchema {
  const next = structuredClone(schema);
  const intentById = new Map(intents.map((intent) => [intent.widgetId, intent]));
  const spacing = canvasSpacing(next.canvas.width);
  const locked = next.widgets.filter((widget) => widget.style.locked).map((widget) => widget.position);
  const movable = next.widgets.filter((widget) => !widget.style.locked);
  const rankOf = (widget: DashboardWidget) => intentById.get(widget.id)?.rank ?? 9999;
  const moduleMinRank = new Map<string, number>();
  for (const widget of movable) {
    if (!widget.moduleId) continue;
    moduleMinRank.set(widget.moduleId, Math.min(moduleMinRank.get(widget.moduleId) ?? Number.POSITIVE_INFINITY, rankOf(widget)));
  }
  // 同一次问数产出的组件（同 moduleId）聚类到组内最佳 rank 的位置，保证相邻不落单。
  const groupRank = (widget: DashboardWidget) => (widget.moduleId ? moduleMinRank.get(widget.moduleId) : undefined) ?? rankOf(widget);
  movable.sort((left, right) => {
    const sectionDiff = sectionOrder(intentById.get(left.id)?.section) - sectionOrder(intentById.get(right.id)?.section);
    if (sectionDiff !== 0) return sectionDiff;
    const groupDiff = groupRank(left) - groupRank(right);
    return groupDiff !== 0 ? groupDiff : rankOf(left) - rankOf(right);
  });
  const contentWidth = Math.max(320, next.canvas.width - spacing.padding * 2);
  const grid = createLayoutGrid(contentWidth, spacing);
  const occupied = [...locked];
  type RowItem = {
    rect: DashboardWidgetPosition;
    span: number;
    maxSpan: number;
    maxHeight: number;
  };
  let rowItems: RowItem[] = [];
  let cursorColumn = 0;
  let cursorY = spacing.padding;
  let rowHeight = 0;
  let currentSection: number | null = null;

  const finalizeRow = () => {
    if (rowItems.length === 0) return;
    // 不足一行的按列拉伸：窄卡优先、单卡不超过自身跨度上限（KPI 封顶 4 列）。
    let extra = GRID_COLUMNS - cursorColumn;
    while (extra > 0) {
      const target = rowItems
        .filter((item) => item.span < item.maxSpan)
        .sort((left, right) => left.span - right.span)[0];
      if (!target) break;
      target.span += 1;
      extra -= 1;
    }
    // 同行组件的新位置按列区间互斥，只需校验锁定组件与前几行；逐个校验旧位置会把同伴的旧宽度当成障碍。
    const rowRects = new Set(rowItems.map((item) => item.rect));
    let column = 0;
    for (const item of rowItems) {
      const stretched = {
        ...item.rect,
        x: grid.x(column),
        w: grid.spanWidth(column, item.span)
      };
      column += item.span;
      const blocked = occupied.some((other) => !rowRects.has(other) && overlaps(stretched, other));
      if (!blocked) {
        item.rect.x = stretched.x;
        item.rect.w = stretched.w;
      }
    }
    // 同一行内的组件高度统一（单卡有自己的上限），底缘对齐。
    for (const item of rowItems) {
      const unified = Math.min(rowHeight, item.maxHeight);
      if (unified <= item.rect.h) continue;
      const grown = { ...item.rect, h: unified };
      const blocked = occupied.some((other) => other !== item.rect && overlaps(grown, other));
      if (!blocked) item.rect.h = unified;
    }
    rowItems = [];
  };

  const advanceRow = (gap: number) => {
    finalizeRow();
    cursorColumn = 0;
    cursorY += rowHeight + gap;
    rowHeight = 0;
  };

  let index = 0;
  while (index < movable.length) {
    const widget = movable[index]!;
    const intent = intentById.get(widget.id) ?? {
      widgetId: widget.id, section: "main", rank: 0, emphasis: "normal" as const
    };
    const section = sectionOrder(intent.section);
    if (currentSection !== null && section !== currentSection && (rowItems.length > 0 || cursorColumn > 0)) {
      advanceRow(spacing.sectionGap);
    }
    currentSection = section;

    if (intent.emphasis === "hero") {
      // hero 独占一个横向带：行内有未完成的组件时先收尾。
      if (rowItems.length > 0 || cursorColumn > 0) advanceRow(spacing.gap);
      // 紧跟其后、被 AI 标记为 rail 的同分区组件进入侧轨，最多两个。
      const rails: DashboardWidget[] = [];
      for (let peek = index + 1; peek < movable.length && rails.length < 2; peek += 1) {
        const railIntent = intentById.get(movable[peek]!.id);
        if (railIntent?.placement !== "rail" || sectionOrder(railIntent.section) !== section) break;
        rails.push(movable[peek]!);
      }
      const heroSpan = rails.length > 0 ? 8 : GRID_COLUMNS;
      let heroHeight = desiredHeight(widget, intent);
      if (rails.length === 2) {
        heroHeight = Math.max(heroHeight, snapToGrid(RAIL_MIN_HEIGHT * 2 + spacing.gap));
      }
      // 整条带（hero + 侧轨）按通栏足迹做碰撞下推，带内不再与其他组件重叠。
      const band = { x: grid.x(0), y: cursorY, w: grid.spanWidth(0, GRID_COLUMNS), h: heroHeight };
      while (occupied.some((item) => overlaps(band, item))) {
        band.y += spacing.gap + spacing.padding;
      }
      widget.position = { ...band, w: grid.spanWidth(0, heroSpan) };
      occupied.push(widget.position);
      // 侧轨垂直堆叠：两张时高度之和精确等于 hero 高度减去行距，底缘严格对齐。
      const firstRailHeight = rails.length === 2 ? snapToGrid((heroHeight - spacing.gap) / 2) : heroHeight;
      let railY = band.y;
      rails.forEach((rail, railIndex) => {
        const railHeight = railIndex === 0 ? firstRailHeight : heroHeight - spacing.gap - firstRailHeight;
        rail.position = {
          x: grid.x(heroSpan),
          y: railY,
          w: grid.spanWidth(heroSpan, GRID_COLUMNS - heroSpan),
          h: railHeight
        };
        railY += railHeight + spacing.gap;
        occupied.push(rail.position);
      });
      // 留一个“虚拟行”状态，后续组件或分区切换从这里继续推进。
      cursorY = band.y;
      rowHeight = heroHeight;
      cursorColumn = GRID_COLUMNS;
      index += 1 + rails.length;
      continue;
    }

    const span = Math.min(emphasisColumns(intent.emphasis), maxColumns(widget));
    const height = desiredHeight(widget, intent);
    if (cursorColumn + span > GRID_COLUMNS) {
      advanceRow(spacing.gap);
    }
    const candidate = { x: grid.x(cursorColumn), y: cursorY, w: grid.spanWidth(cursorColumn, span), h: height };
    while (occupied.some((item) => overlaps(candidate, item))) {
      candidate.y += spacing.gap + spacing.padding;
    }
    widget.position = candidate;
    occupied.push(candidate);
    rowItems.push({
      rect: candidate,
      span,
      maxSpan: maxColumns(widget),
      maxHeight: maxUnifiedHeight(widget, intent)
    });
    cursorColumn += span;
    rowHeight = Math.max(rowHeight, height);
    index += 1;
  }
  finalizeRow();

  const requiredHeight = occupied.reduce((maximum, item) => Math.max(maximum, item.y + item.h + spacing.padding), 0);
  next.canvas.height = Math.max(next.canvas.height, requiredHeight);
  next.canvas.rows = Math.max(next.canvas.rows, Math.ceil(next.canvas.height / 90));
  next.updatedAt = new Date().toISOString();
  return next;
}
