import { describe, expect, it } from "vitest";
import {
  dashboardCanvasPresets,
  dashboardZoomLevels,
  getDashboardCanvasFitScale,
  getNextDashboardZoom,
  normalizeDashboardCanvasDimension,
  resolveDashboardCanvasPreset
} from "./dashboardCanvas";

describe("dashboardCanvas", () => {
  it("offers laptop, full-hd, 2k and 4k canvas presets", () => {
    expect(dashboardCanvasPresets.map((preset) => preset.id)).toEqual([
      "laptop",
      "full-hd",
      "2k",
      "4k"
    ]);
    expect(resolveDashboardCanvasPreset(1920, 1080)?.id).toBe("full-hd");
    expect(resolveDashboardCanvasPreset(1800, 1000)).toBeNull();
  });

  it("fits a fixed-resolution canvas inside a laptop editor viewport without enlarging it", () => {
    expect(getDashboardCanvasFitScale(1920, 1080, 920, 680)).toBeCloseTo(0.479, 2);
    expect(getDashboardCanvasFitScale(1440, 900, 2200, 1200)).toBe(1);
  });

  it("normalizes custom dimensions to the supported range", () => {
    expect(normalizeDashboardCanvasDimension(100, "width")).toBe(960);
    expect(normalizeDashboardCanvasDimension(9000, "width")).toBe(7680);
    expect(normalizeDashboardCanvasDimension(Number.NaN, "height")).toBe(1080);
  });

  it("steps through readable editor zoom levels", () => {
    expect(dashboardZoomLevels).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]);
    expect(getNextDashboardZoom(0.75, 1)).toBe(1);
    expect(getNextDashboardZoom(0.75, -1)).toBe(0.5);
    expect(getNextDashboardZoom(1.5, 1)).toBe(2);
  });
});
