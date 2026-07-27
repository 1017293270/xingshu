import type { LayoutIntent, LayoutWidgetInput } from "@/types/analytics";
import type { DashboardSchema, DashboardWidget, DashboardWidgetPosition } from "@/types/dashboardStudio";

const PADDING = 24;
const GAP = 16;
const GRID_COLUMNS = 12;
const SNAP = 8;

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

function emphasisColumns(emphasis: LayoutIntent["emphasis"]) {
  if (emphasis === "compact") return 3;
  if (emphasis === "normal") return 6;
  return GRID_COLUMNS;
}

function snapToGrid(value: number) {
  return Math.round(value / SNAP) * SNAP;
}

function desiredHeight(widget: DashboardWidget, intent: LayoutIntent) {
  const height = intent.emphasis === "hero"
    ? Math.max(360, widget.position.h)
    : widget.type === "metric"
      ? Math.max(132, Math.min(220, widget.position.h))
      : Math.max(240, Math.min(420, widget.position.h));
  return snapToGrid(height);
}

type LayoutGrid = {
  x: (column: number) => number;
  spanWidth: (column: number, span: number) => number;
};

/**
 * 12 列网格：列宽 8px 对齐，余量按列均分，保证同列 x 一致且行右缘贴近画布右边距。
 */
function createLayoutGrid(contentWidth: number): LayoutGrid {
  const base = Math.max(SNAP, Math.floor((contentWidth - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS / SNAP) * SNAP);
  const columnWidths = Array.from({ length: GRID_COLUMNS }, () => base);
  let remainder = contentWidth - GAP * (GRID_COLUMNS - 1) - base * GRID_COLUMNS;
  for (let column = 0; remainder >= SNAP; column = (column + 1) % GRID_COLUMNS) {
    columnWidths[column]! += SNAP;
    remainder -= SNAP;
  }
  const offsets: number[] = [];
  columnWidths.reduce((offset, width, column) => {
    offsets[column] = offset;
    return offset + width + GAP;
  }, PADDING);
  return {
    x: (column) => offsets[Math.min(column, GRID_COLUMNS - 1)] ?? PADDING,
    spanWidth: (column, span) => {
      const last = Math.min(column + span, GRID_COLUMNS);
      let width = 0;
      for (let index = column; index < last; index += 1) width += columnWidths[index]!;
      return width + GAP * (last - column - 1);
    }
  };
}

/**
 * AI 只决定顺序和强调级别；该求解器才决定像素位置，并强制锁定、边界和无重叠。
 * 组件按 12 列网格落位：同列左对齐、同行顶对齐、坐标 8px 对齐，不足一行的按列均分拉伸。
 */
export function solveDashboardLayout(schema: DashboardSchema, intents: LayoutIntent[]): DashboardSchema {
  const next = structuredClone(schema);
  const intentById = new Map(intents.map((intent) => [intent.widgetId, intent]));
  const locked = next.widgets.filter((widget) => widget.style.locked).map((widget) => widget.position);
  const movable = next.widgets
    .filter((widget) => !widget.style.locked)
    .sort((left, right) => (intentById.get(left.id)?.rank ?? 9999) - (intentById.get(right.id)?.rank ?? 9999));
  const contentWidth = Math.max(320, next.canvas.width - PADDING * 2);
  const grid = createLayoutGrid(contentWidth);
  const occupied = [...locked];
  type RowItem = { rect: DashboardWidgetPosition; column: number; span: number };
  let rowItems: RowItem[] = [];
  let cursorColumn = 0;
  let cursorY = PADDING;
  let rowHeight = 0;

  const stretchRow = () => {
    if (rowItems.length > 0 && cursorColumn < GRID_COLUMNS) {
      const extra = GRID_COLUMNS - cursorColumn;
      const share = Math.floor(extra / rowItems.length);
      let column = 0;
      const proposals = rowItems.map((item, index) => {
        const span = item.span + share + (index === rowItems.length - 1 ? extra - share * rowItems.length : 0);
        const proposal = { column, span };
        column += span;
        return proposal;
      });
      rowItems.forEach((item, index) => {
        const proposal = proposals[index]!;
        if (proposal.span === item.span) return;
        const stretched = {
          ...item.rect,
          x: grid.x(proposal.column),
          w: grid.spanWidth(proposal.column, proposal.span)
        };
        const blocked = occupied.some((other) => other !== item.rect && overlaps(stretched, other));
        if (!blocked) {
          item.rect.x = stretched.x;
          item.rect.w = stretched.w;
        }
      });
    }
    rowItems = [];
  };

  for (const widget of movable) {
    const intent = intentById.get(widget.id) ?? {
      widgetId: widget.id, section: "main", rank: 0, emphasis: "normal" as const
    };
    const span = emphasisColumns(intent.emphasis);
    const height = desiredHeight(widget, intent);
    if (cursorColumn + span > GRID_COLUMNS) {
      stretchRow();
      cursorColumn = 0;
      cursorY += rowHeight + GAP;
      rowHeight = 0;
    }
    let candidate = { x: grid.x(cursorColumn), y: cursorY, w: grid.spanWidth(cursorColumn, span), h: height };
    while (occupied.some((item) => overlaps(candidate, item))) {
      candidate = { ...candidate, y: candidate.y + GAP + PADDING };
    }
    widget.position = candidate;
    occupied.push(candidate);
    rowItems.push({ rect: candidate, column: cursorColumn, span });
    cursorColumn += span;
    rowHeight = Math.max(rowHeight, height);
  }
  stretchRow();

  const requiredHeight = occupied.reduce((maximum, item) => Math.max(maximum, item.y + item.h + PADDING), 0);
  next.canvas.height = Math.max(next.canvas.height, requiredHeight);
  next.canvas.rows = Math.max(next.canvas.rows, Math.ceil(next.canvas.height / 90));
  next.updatedAt = new Date().toISOString();
  return next;
}
