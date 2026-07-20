export type DashboardCanvasPreset = {
  id: "laptop" | "full-hd" | "2k" | "4k";
  label: string;
  description: string;
  width: number;
  height: number;
};

export const dashboardCanvasPresets: DashboardCanvasPreset[] = [
  { id: "laptop", label: "笔记本", description: "16:10", width: 1440, height: 900 },
  { id: "full-hd", label: "Full HD", description: "推荐", width: 1920, height: 1080 },
  { id: "2k", label: "2K", description: "16:9", width: 2560, height: 1440 },
  { id: "4k", label: "4K", description: "16:9", width: 3840, height: 2160 }
];

export const dashboardZoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function getNextDashboardZoom(current: number, direction: -1 | 1) {
  if (direction > 0) {
    return dashboardZoomLevels.find((level) => level > current + 0.001) ?? dashboardZoomLevels.at(-1)!;
  }

  return [...dashboardZoomLevels].reverse().find((level) => level < current - 0.001) ?? dashboardZoomLevels[0];
}

const canvasBounds = {
  width: { minimum: 960, maximum: 7680, fallback: 1920 },
  height: { minimum: 540, maximum: 4320, fallback: 1080 }
} as const;

export function resolveDashboardCanvasPreset(width: number, height: number) {
  return dashboardCanvasPresets.find((preset) => preset.width === width && preset.height === height) ?? null;
}

export function normalizeDashboardCanvasDimension(value: number, dimension: "width" | "height") {
  const bounds = canvasBounds[dimension];
  if (!Number.isFinite(value)) {
    return bounds.fallback;
  }
  return Math.round(Math.max(bounds.minimum, Math.min(bounds.maximum, value)));
}

export function getDashboardCanvasFitScale(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number
) {
  if (canvasWidth <= 0 || canvasHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }

  return Math.min(1, viewportWidth / canvasWidth, viewportHeight / canvasHeight);
}
