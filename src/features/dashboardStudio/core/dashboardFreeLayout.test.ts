import { describe, expect, it } from "vitest";
import type { DashboardSchema } from "@/types/dashboardStudio";
import {
  clampDashboardWidgetPosition,
  migrateDashboardSchemaToFreeLayout
} from "./dashboardFreeLayout";

function createLegacySchema(): DashboardSchema {
  return {
    schemaVersion: 1,
    id: "legacy-dashboard",
    title: "旧网格草稿",
    description: "",
    canvas: {
      width: 1920,
      height: 1080,
      columns: 12,
      rows: 10,
      background: "#F5F9FF"
    },
    source: {
      kind: "blank",
      generatedAt: "2026-07-15T00:00:00.000Z",
      plannerVersion: 2
    },
    dataBindings: {},
    widgets: [
      {
        id: "metric-1",
        type: "metric",
        title: "关键指标",
        mapping: {},
        position: { x: 1, y: 2, w: 3, h: 2 },
        style: { background: "#FFFFFF" }
      }
    ],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}

describe("dashboard free-layout migration", () => {
  it("converts legacy grid cells into the same pixel rectangle", () => {
    const migrated = migrateDashboardSchemaToFreeLayout(createLegacySchema());

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.widgets[0].position).toEqual({ x: 173, y: 226, w: 466, h: 202 });
  });

  it("clamps arbitrary pixel rectangles to the canvas without snapping", () => {
    expect(
      clampDashboardWidgetPosition(
        { x: 101.4, y: 78.6, w: 319.8, h: 179.6 },
        { width: 1920, height: 1080 }
      )
    ).toEqual({ x: 101, y: 79, w: 320, h: 180 });
  });

  it("restores readable defaults on the light canvas without changing dark cards", () => {
    const legacy = createLegacySchema();
    const migrated = migrateDashboardSchemaToFreeLayout({
      ...legacy,
      schemaVersion: 2,
      widgets: [
        {
          id: "title-1",
          type: "text",
          title: "大屏标题",
          content: "经营分析",
          mapping: {},
          position: { x: 48, y: 28, w: 920, h: 72 },
          style: { background: "transparent", color: "#f8fafc" }
        },
        {
          id: "metric-light",
          type: "metric",
          title: "咨询数",
          mapping: {},
          position: { x: 48, y: 164, w: 360, h: 180 },
          style: { background: "#FFFFFF" }
        },
        {
          id: "metric-dark",
          type: "metric",
          title: "解决量",
          mapping: {},
          position: { x: 432, y: 164, w: 360, h: 180 },
          style: { background: "rgba(15, 23, 42, 0.92)", color: "#e2e8f0" }
        }
      ]
    });

    expect(migrated.widgets[0]?.style.color).toBe("#0F2B50");
    expect(migrated.widgets[1]?.style.color).toBe("#294469");
    expect(migrated.widgets[2]?.style.color).toBe("#e2e8f0");
  });
});
