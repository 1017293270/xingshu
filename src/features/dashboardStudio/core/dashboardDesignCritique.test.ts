import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { standardDesignData } from "@/test/dashboardDesignFixtures";
import type { DashboardDataBinding, DashboardSchema, DashboardWidget, DashboardWidgetPosition, DashboardWidgetType } from "@/types/dashboardStudio";
import { applyDashboardDesignSpec } from "./dashboardDesignApply";
import { critiqueDashboard } from "./dashboardDesignCritique";

function binding(id: string, rows: number): DashboardDataBinding {
  return {
    id,
    label: id,
    mode: "snapshot",
    table: {
      columns: [{ key: "name", title: "名称" }, { key: "value", title: "数值", type: "number" }],
      rows: Array.from({ length: rows }, (_, index) => ({ name: `项 ${index + 1}`, value: index + 1 })),
      totalRows: rows
    }
  };
}

function widget(
  id: string,
  type: DashboardWidgetType,
  position: DashboardWidgetPosition,
  extra: Partial<DashboardWidget> = {}
): DashboardWidget {
  return {
    id,
    type,
    title: extra.title ?? id,
    mapping: {},
    position,
    style: { background: "#FFFFFF", color: "#294469", ...extra.style },
    ...extra
  };
}

function board(widgets: DashboardWidget[], bindings: DashboardDataBinding[] = []): DashboardSchema {
  const schema = createBlankDashboard({ title: "经营总览" });
  schema.canvas = { ...schema.canvas, background: "#EFF4FB" };
  schema.widgets = widgets;
  schema.dataBindings = Object.fromEntries(bindings.map((item) => [item.id, item]));
  return schema;
}

const codes = (schema: DashboardSchema) => critiqueDashboard(schema).map((issue) => issue.code);

describe("critiqueDashboard", () => {
  it("没有指标卡与标题条时提示，并给出可一键落地的标题条", () => {
    const schema = board([widget("c1", "bar", { x: 32, y: 32, w: 1856, h: 400 })]);
    const issues = critiqueDashboard(schema);

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["no-kpi", "title-missing"]));
    const title = issues.find((issue) => issue.code === "title-missing")!;
    expect(title.fix).toEqual([
      { op: "add_widget", widget: { ref: "board-title", role: "narrative", title: "经营总览", content: "经营总览" } }
    ]);
  });

  it("指标卡超过四张时提醒主次", () => {
    const kpis = Array.from({ length: 5 }, (_, index) =>
      widget(`k${index}`, "metric", { x: 32 + index * 360, y: 32, w: 340, h: 160 })
    );
    expect(codes(board(kpis))).toContain("too-many-kpi");
    expect(codes(board(kpis.slice(0, 4)))).not.toContain("too-many-kpi");
  });

  it("三张一样大的图没有主图时，建议把数据最厚的那张放大", () => {
    const schema = board(
      [
        widget("c1", "line", { x: 32, y: 32, w: 600, h: 300 }, { bindingId: "b1" }),
        widget("c2", "bar", { x: 656, y: 32, w: 600, h: 300 }, { bindingId: "b2" }),
        widget("c3", "pie", { x: 1280, y: 32, w: 600, h: 300 }, { bindingId: "b3" })
      ],
      [binding("b1", 6), binding("b2", 12), binding("b3", 3)]
    );
    const issue = critiqueDashboard(schema).find((item) => item.code === "no-hero")!;

    expect(issue.widgetId).toBe("c2");
    expect(issue.fix).toEqual([{ op: "set_emphasis", widgetId: "c2", emphasis: "hero" }]);
  });

  it("独占一行的窄卡被判为落单，修法是加宽", () => {
    const schema = board([
      widget("k1", "metric", { x: 32, y: 32, w: 600, h: 160 }),
      widget("k2", "metric", { x: 656, y: 32, w: 600, h: 160 }),
      widget("c1", "bar", { x: 32, y: 240, w: 500, h: 300 })
    ]);
    const issue = critiqueDashboard(schema).find((item) => item.code === "orphan-row")!;

    expect(issue.widgetId).toBe("c1");
    expect(issue.fix).toEqual([{ op: "set_emphasis", widgetId: "c1", emphasis: "wide" }]);
  });

  it("类目太多的环形图建议换成横向排行", () => {
    const schema = board(
      [widget("p1", "pie", { x: 32, y: 32, w: 600, h: 400 }, { bindingId: "b1", title: "渠道占比" })],
      [binding("b1", 9)]
    );
    const issue = critiqueDashboard(schema).find((item) => item.code === "pie-too-many")!;

    expect(issue.message).toContain("9 个类目");
    expect(issue.fix).toEqual([{ op: "retype_widget", widgetId: "p1", variant: "bar-horizontal" }]);
    expect(codes(board(schema.widgets, [binding("b1", 6)]))).not.toContain("pie-too-many");
  });

  it("卡面底色不成套时建议统一回整板主题", () => {
    const schema = board([
      widget("k1", "metric", { x: 32, y: 32, w: 600, h: 160 }, { style: { background: "#FFFFFF" } }),
      widget("c1", "bar", { x: 32, y: 240, w: 1856, h: 300 }, { style: { background: "#123456" } })
    ]);
    schema.canvas.background = "#ABCDEF";
    const issue = critiqueDashboard(schema).find((item) => item.code === "mixed-theme")!;

    expect(issue.fix).toEqual([{ op: "set_theme", themeId: "ice-light" }]);
  });

  it("过长的标题只作提示，不给修法", () => {
    const schema = board([
      widget("c1", "bar", { x: 32, y: 32, w: 1856, h: 300 }, { title: "这是一个足足二十个字那么长的组件标题示例文本" })
    ]);
    const issue = critiqueDashboard(schema).find((item) => item.code === "title-too-long")!;

    expect(issue.severity).toBe("info");
    expect(issue.fix).toBeUndefined();
  });

  it("引擎自己落出来的板不会被自己的诊断打脸", () => {
    const schema = applyDashboardDesignSpec(
      createBlankDashboard(),
      {
        narrative: "",
        title: "经营总览",
        themeId: "command-dark",
        archetype: "trend-led",
        widgets: [
          { ref: "k1", role: "kpi", assetId: "asset-revenue", outputKey: "monthly", metricKey: "revenue", title: "总营收" },
          { ref: "k2", role: "kpi", assetId: "asset-total", outputKey: "total", metricKey: "total", title: "订单总数" },
          { ref: "trend", role: "trend", assetId: "asset-revenue", outputKey: "monthly", dimensionKey: "month", metricKeys: ["revenue"], title: "营收趋势" },
          { ref: "bar", role: "comparison", assetId: "asset-region", outputKey: "region", dimensionKey: "region", metricKeys: ["sales"], title: "区域排行" },
          { ref: "pie", role: "composition", assetId: "asset-region", outputKey: "region", dimensionKey: "region", metricKeys: ["sales"], title: "区域占比" },
          { ref: "note", role: "narrative", title: "经营总览", content: "经营总览" }
        ]
      },
      standardDesignData()
    ).schema;

    expect(critiqueDashboard(schema).filter((issue) => issue.severity === "warning")).toEqual([]);
  });
});
