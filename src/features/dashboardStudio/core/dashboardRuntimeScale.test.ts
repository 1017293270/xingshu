import { describe, expect, it } from "vitest";
import { calculateDashboardRuntimeScale, resolveDashboardRuntimeScaleMode } from "./dashboardRuntimeScale";

describe("calculateDashboardRuntimeScale", () => {
  it("uses the smaller ratio for fit-screen scaling", () => {
    expect(calculateDashboardRuntimeScale("fit-screen", 1920, 1080, 1440, 900)).toBe(0.75);
    expect(calculateDashboardRuntimeScale("fit-screen", 1920, 1080, 2560, 1440)).toBeCloseTo(4 / 3);
  });

  it("uses the width ratio for fit-width and preserves fixed size", () => {
    expect(calculateDashboardRuntimeScale("fit-width", 1920, 1080, 960, 1200)).toBe(0.5);
    expect(calculateDashboardRuntimeScale("fixed", 1920, 1080, 960, 540)).toBe(1);
    expect(calculateDashboardRuntimeScale("original", 1920, 1080, 960, 540)).toBe(1);
  });

  it("falls back safely for invalid dimensions", () => {
    expect(calculateDashboardRuntimeScale("fit-screen", 0, 1080, 1440, 900)).toBe(1);
    expect(calculateDashboardRuntimeScale("fit-width", 1920, 1080, Number.NaN, 900)).toBe(1);
  });
});

describe("resolveDashboardRuntimeScaleMode", () => {
  it("pins the inline stage to fit-width whatever the canvas asks for", () => {
    expect(resolveDashboardRuntimeScaleMode(false, "fit-screen")).toBe("fit-width");
    expect(resolveDashboardRuntimeScaleMode(false, "fixed")).toBe("fit-width");
    expect(resolveDashboardRuntimeScaleMode(false, undefined)).toBe("fit-width");
  });

  it("honours the canvas scale mode in fullscreen and defaults to fit-screen", () => {
    expect(resolveDashboardRuntimeScaleMode(true, "fit-width")).toBe("fit-width");
    expect(resolveDashboardRuntimeScaleMode(true, "original")).toBe("original");
    expect(resolveDashboardRuntimeScaleMode(true, undefined)).toBe("fit-screen");
  });

  it("keeps a tall canvas full width inline while fullscreen letterboxes it", () => {
    const inline = resolveDashboardRuntimeScaleMode(false, "fit-screen");
    const fullscreen = resolveDashboardRuntimeScaleMode(true, "fit-screen");
    expect(calculateDashboardRuntimeScale(inline, 1920, 1440, 1790, 900)).toBeCloseTo(1790 / 1920);
    expect(calculateDashboardRuntimeScale(fullscreen, 1920, 1440, 1790, 900)).toBeCloseTo(900 / 1440);
  });
});
