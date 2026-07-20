import type { DashboardWidgetPosition } from "@/types/dashboardStudio";
import { clampDashboardWidgetPosition } from "./dashboardFreeLayout";

type DashboardCanvasGeometry = {
  width: number;
  height: number;
  rows: number;
};

type PointerPoint = {
  clientX: number;
  clientY: number;
};

type CanvasOrigin = {
  left: number;
  top: number;
};

export function moveDashboardWidgetPosition(
  origin: DashboardWidgetPosition,
  visualDeltaX: number,
  visualDeltaY: number,
  scale: number,
  canvas: DashboardCanvasGeometry
): DashboardWidgetPosition {
  const safeScale = Math.max(0.01, scale);
  return clampDashboardWidgetPosition(
    {
      ...origin,
      x: origin.x + visualDeltaX / safeScale,
      y: origin.y + visualDeltaY / safeScale
    },
    canvas
  );
}

export function resizeDashboardWidgetPosition(
  origin: DashboardWidgetPosition,
  visualDeltaX: number,
  visualDeltaY: number,
  scale: number,
  canvas: DashboardCanvasGeometry
): DashboardWidgetPosition {
  const safeScale = Math.max(0.01, scale);
  return clampDashboardWidgetPosition(
    {
      ...origin,
      w: origin.w + visualDeltaX / safeScale,
      h: origin.h + visualDeltaY / safeScale
    },
    canvas
  );
}

export function getDashboardDropPosition(
  point: PointerPoint,
  canvasOrigin: CanvasOrigin,
  scale: number,
  size: Pick<DashboardWidgetPosition, "w" | "h">,
  canvas: DashboardCanvasGeometry
): DashboardWidgetPosition {
  const safeScale = Math.max(0.01, scale);
  return clampDashboardWidgetPosition(
    {
      x: (point.clientX - canvasOrigin.left) / safeScale,
      y: (point.clientY - canvasOrigin.top) / safeScale,
      ...size
    },
    canvas
  );
}
