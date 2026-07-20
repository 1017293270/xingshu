import type { DashboardSchema, DashboardWidgetPosition } from "@/types/dashboardStudio";

const LEGACY_COLUMNS = 12;
const LEGACY_GAP = 10;
const LEGACY_PADDING = 14;
export const DASHBOARD_MIN_COMPONENT_SIZE = 24;
export const DASHBOARD_LIGHT_CANVAS_HEADING_COLOR = "#0F2B50";
export const DASHBOARD_LIGHT_SURFACE_TEXT_COLOR = "#294469";

const LIGHT_SURFACE_BACKGROUNDS = new Set(["#fff", "#ffffff", "#f5f9ff", "#f8fbff"]);
const LEGACY_LIGHT_SURFACE_TEXT_COLORS = new Set(["#dbeafe", "#e2e8f0", "#e5e7eb", "#e5f0ff", "#f8fafc"]);
const LEGACY_LIGHT_CANVAS_TEXT_COLORS = new Map([
  ["#f8fafc", DASHBOARD_LIGHT_CANVAS_HEADING_COLOR],
  ["#94a3b8", "#5F7391"],
  ["#8fb4c7", "#5F7391"],
  ["#a6b7d4", "#5F7391"]
]);

type CanvasBounds = Pick<DashboardSchema["canvas"], "width" | "height">;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function rounded(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function normalizedColor(value?: string) {
  return value?.replace(/\s+/g, "").toLowerCase() ?? "";
}

function isLightSurface(value?: string) {
  return LIGHT_SURFACE_BACKGROUNDS.has(normalizedColor(value));
}

function isTransparentSurface(value?: string) {
  const normalized = normalizedColor(value);
  return !normalized || normalized === "transparent" || normalized === "rgba(0,0,0,0)";
}

function normalizeDashboardWidgetStyle(
  widget: DashboardSchema["widgets"][number],
  canvas: DashboardSchema["canvas"],
  index: number
) {
  const style = {
    ...widget.style,
    locked: widget.style.locked ?? false,
    visible: widget.style.visible ?? true,
    zIndex: widget.style.zIndex ?? index + 1
  };
  const color = normalizedColor(style.color);
  const isLightWidgetSurface = isLightSurface(style.background);
  const isTransparentTextOnLightCanvas =
    widget.type === "text" && isTransparentSurface(style.background) && isLightSurface(canvas.background);

  if (isLightWidgetSurface && !color) {
    return {
      ...style,
      color: widget.type === "text"
        ? DASHBOARD_LIGHT_CANVAS_HEADING_COLOR
        : DASHBOARD_LIGHT_SURFACE_TEXT_COLOR
    };
  }

  if (isLightWidgetSurface && LEGACY_LIGHT_SURFACE_TEXT_COLORS.has(color)) {
    return { ...style, color: DASHBOARD_LIGHT_SURFACE_TEXT_COLOR };
  }

  if (isTransparentTextOnLightCanvas) {
    const readableColor = color
      ? LEGACY_LIGHT_CANVAS_TEXT_COLORS.get(color)
      : DASHBOARD_LIGHT_CANVAS_HEADING_COLOR;
    return readableColor ? { ...style, color: readableColor } : style;
  }

  return style;
}

export function clampDashboardWidgetPosition(
  position: DashboardWidgetPosition,
  canvas: CanvasBounds
): DashboardWidgetPosition {
  const width = clamp(
    rounded(position.w),
    DASHBOARD_MIN_COMPONENT_SIZE,
    Math.max(DASHBOARD_MIN_COMPONENT_SIZE, rounded(canvas.width))
  );
  const height = clamp(
    rounded(position.h),
    DASHBOARD_MIN_COMPONENT_SIZE,
    Math.max(DASHBOARD_MIN_COMPONENT_SIZE, rounded(canvas.height))
  );
  const x = clamp(rounded(position.x), 0, Math.max(0, rounded(canvas.width) - width));
  const y = clamp(rounded(position.y), 0, Math.max(0, rounded(canvas.height) - height));

  return { x, y, w: width, h: height };
}

function migrateLegacyGridPosition(
  position: DashboardWidgetPosition,
  canvas: DashboardSchema["canvas"]
): DashboardWidgetPosition {
  const rows = Math.max(1, canvas.rows);
  const contentWidth = Math.max(
    1,
    canvas.width - LEGACY_PADDING * 2 - LEGACY_GAP * (LEGACY_COLUMNS - 1)
  );
  const contentHeight = Math.max(
    1,
    canvas.height - LEGACY_PADDING * 2 - LEGACY_GAP * Math.max(0, rows - 1)
  );
  const columnWidth = contentWidth / LEGACY_COLUMNS;
  const rowHeight = contentHeight / rows;

  return clampDashboardWidgetPosition(
    {
      x: LEGACY_PADDING + position.x * (columnWidth + LEGACY_GAP),
      y: LEGACY_PADDING + position.y * (rowHeight + LEGACY_GAP),
      w: position.w * columnWidth + Math.max(0, position.w - 1) * LEGACY_GAP,
      h: position.h * rowHeight + Math.max(0, position.h - 1) * LEGACY_GAP
    },
    canvas
  );
}

export function migrateDashboardSchemaToFreeLayout(schema: DashboardSchema): DashboardSchema {
  if (schema.schemaVersion === 2) {
    return {
      ...schema,
      canvas: { ...schema.canvas, scaleMode: schema.canvas.scaleMode ?? "fit-screen" },
      widgets: schema.widgets.map((widget, index) => ({
        ...widget,
        position: clampDashboardWidgetPosition(widget.position, schema.canvas),
        style: normalizeDashboardWidgetStyle(widget, schema.canvas, index)
      }))
    };
  }

  return {
    ...schema,
    schemaVersion: 2,
    canvas: { ...schema.canvas, scaleMode: schema.canvas.scaleMode ?? "fit-screen" },
    widgets: schema.widgets.map((widget, index) => ({
      ...widget,
      position: migrateLegacyGridPosition(widget.position, schema.canvas),
      style: normalizeDashboardWidgetStyle(widget, schema.canvas, index)
    }))
  };
}
