import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { validateDashboardForPublish } from "./dashboardValidation";

describe("validateDashboardForPublish", () => {
  it("blocks missing titles and widgets outside the canvas", () => {
    const schema = createBlankDashboard({ title: "" });
    schema.title = "";
    schema.widgets.push({
      id: "outside",
      type: "text",
      title: "越界组件",
      content: "测试",
      mapping: {},
      position: { x: schema.canvas.width - 10, y: 0, w: 200, h: 80 },
      style: { color: "#102A4C", background: "#FFFFFF", visible: true }
    });

    const result = validateDashboardForPublish(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing-title", "widget-out-of-bounds"])
    );
  });

  it("warns about unreadable or unbound chart widgets", () => {
    const schema = createBlankDashboard({ title: "经营看板" });
    schema.widgets.push({
      id: "chart",
      type: "bar",
      title: "销售趋势",
      mapping: {},
      position: { x: 0, y: 0, w: 480, h: 300 },
      style: { color: "#FFFFFF", background: "#FFFFFF", accent: "#00FF00", visible: true }
    });

    const result = validateDashboardForPublish(schema);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["chart-without-data", "low-text-contrast", "neon-accent"])
    );
  });
});
