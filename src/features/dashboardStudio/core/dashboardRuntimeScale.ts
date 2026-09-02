export type DashboardRuntimeScaleMode = "fit-screen" | "fit-width" | "fixed" | "original";

/**
 * 内联舞台是宽度自适应、高度随画布比例撑开的容器：只有 fit-width 能保证画布左右贴边，
 * fit-screen 会以高度为准把画布缩窄成两侧留白，fixed / original 则直接溢出被裁掉。
 * 全屏态的视口是固定的一屏，才需要尊重画布自己的 scaleMode。
 */
export function resolveDashboardRuntimeScaleMode(
  fullscreen: boolean,
  canvasScaleMode?: DashboardRuntimeScaleMode
): DashboardRuntimeScaleMode {
  if (!fullscreen) return "fit-width";
  return canvasScaleMode ?? "fit-screen";
}

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
