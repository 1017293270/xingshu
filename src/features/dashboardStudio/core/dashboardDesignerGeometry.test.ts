import { describe, expect, it } from "vitest";
import {
  getDashboardDropPosition,
  moveDashboardWidgetPosition,
  resizeDashboardWidgetPosition
} from "./dashboardDesignerGeometry";

const canvas = { width: 1920, height: 1080, rows: 10 };

describe("dashboard designer geometry", () => {
  it("moves by exact pixel distance instead of snapping to a grid", () => {
    const origin = { x: 100, y: 80, w: 320, h: 180 };

    expect(moveDashboardWidgetPosition(origin, 37, 23, 1, canvas)).toEqual({
      x: 137,
      y: 103,
      w: 320,
      h: 180
    });

    expect(moveDashboardWidgetPosition(origin, 1000, -1000, 0.5, canvas)).toEqual({
      x: 1600,
      y: 0,
      w: 320,
      h: 180
    });
  });

  it("resizes by exact pixels without crossing the canvas edge or 24px minimum", () => {
    expect(
      resizeDashboardWidgetPosition({ x: 100, y: 80, w: 320, h: 180 }, 73, 41, 0.5, canvas)
    ).toEqual({ x: 100, y: 80, w: 466, h: 262 });

    expect(
      resizeDashboardWidgetPosition({ x: 100, y: 80, w: 320, h: 180 }, -2000, -2000, 1, canvas)
    ).toEqual({ x: 100, y: 80, w: 24, h: 24 });
  });

  it("places a palette drop at the pointer instead of appending it below every widget", () => {
    expect(
      getDashboardDropPosition(
        { clientX: 580, clientY: 330 },
        { left: 100, top: 60 },
        0.5,
        { w: 320, h: 180 },
        canvas
      )
    ).toEqual({ x: 960, y: 540, w: 320, h: 180 });
  });
});
