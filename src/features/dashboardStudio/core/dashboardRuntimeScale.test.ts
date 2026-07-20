import { describe, expect, it } from "vitest";
import { calculateDashboardRuntimeScale } from "./dashboardRuntimeScale";

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
