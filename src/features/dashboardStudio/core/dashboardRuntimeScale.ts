export type DashboardRuntimeScaleMode = "fit-screen" | "fit-width" | "fixed" | "original";

export function calculateDashboardRuntimeScale(
  mode: DashboardRuntimeScaleMode,
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number
) {
  if (
    !Number.isFinite(canvasWidth) || canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) || canvasHeight <= 0 ||
    !Number.isFinite(viewportWidth) || viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) || viewportHeight <= 0
  ) return 1;
  if (mode === "fixed" || mode === "original") return 1;
  if (mode === "fit-width") return viewportWidth / canvasWidth;
  return Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
}
