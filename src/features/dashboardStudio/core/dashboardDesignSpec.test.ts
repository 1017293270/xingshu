import { describe, expect, it } from "vitest";
import { parseDashboardDesignOps, parseDashboardDesignSpec } from "./dashboardDesignSpec";

describe("parseDashboardDesignSpec", () => {
  it("归一化合法设计稿", () => {
    const { spec, rejected } = parseDashboardDesignSpec({
      narrative: "先看总量再看趋势。",
      title: "  经营驾驶舱  ",
      insight: "华东领先",
      themeId: "command-dark",
      archetype: "trend-led",
      canvasPreset: "full-hd",
      widgets: [
        {
          ref: "w1",
          role: "kpi",
          assetId: "asset-1",
          outputKey: "monthly",
          metricKey: "revenue",
          valueMode: "sum",
          showTrend: true,
          title: "本年营收"
        },
        {
          ref: "w2",
          role: "trend",
          assetId: "asset-1",
          outputKey: "monthly",
          variant: "line-smooth",
          dimensionKey: "month",
          metricKeys: ["revenue", "cost"],
          title: "月度营收趋势",
          emphasis: "hero"
        }
      ]
    });

    expect(rejected).toEqual([]);
    expect(spec?.title).toBe("经营驾驶舱");
    expect(spec?.archetype).toBe("trend-led");
    expect(spec?.widgets).toHaveLength(2);
    expect(spec?.widgets[0].valueMode).toBe("sum");
    expect(spec?.widgets[1].emphasis).toBe("hero");
    expect(spec?.widgets[1].metricKeys).toEqual(["revenue", "cost"]);
  });

  it("widgets 不是数组时整份作废", () => {
    const { spec, rejected } = parseDashboardDesignSpec({ narrative: "…", widgets: "两张图" });
    expect(spec).toBeNull();
    expect(rejected[0].reason).toContain("没有组件清单");
  });

  it("widgets 为空时整份作废", () => {
    const { spec, rejected } = parseDashboardDesignSpec({ widgets: [] });
    expect(spec).toBeNull();
    expect(rejected[0].reason).toContain("没有组件清单");
  });

  it("非对象输入整份作废", () => {
    expect(parseDashboardDesignSpec("{}").spec).toBeNull();
    expect(parseDashboardDesignSpec(null).spec).toBeNull();
  });

  it("角色不在枚举里的组件被丢弃并给出中文理由", () => {
    const { spec, rejected } = parseDashboardDesignSpec({
      themeId: "ice-light",
      archetype: "kpi-led",
      widgets: [
        { ref: "w1", role: "gauge", title: "仪表盘" },
        { ref: "w2", role: "detail", assetId: "a", outputKey: "o", title: "明细" }
      ]
    });

    expect(spec?.widgets).toHaveLength(1);
    expect(rejected).toContainEqual({ target: "仪表盘", reason: "角色「gauge」不在支持范围，已忽略该组件" });
  });

  it("原型非法时回落指标总览并记一条", () => {
    const { spec, rejected } = parseDashboardDesignSpec({
      archetype: "waterfall",
      themeId: "ice-light",
      widgets: [{ ref: "w1", role: "detail", assetId: "a", outputKey: "o", title: "明细" }]
    });

    expect(spec?.archetype).toBe("kpi-led");
    expect(rejected[0].reason).toContain("已改用指标总览");
  });

  it("强调与取值方式非法时丢字段并记一条", () => {
    const { spec, rejected } = parseDashboardDesignSpec({
      themeId: "ice-light",
      widgets: [
        { ref: "w1", role: "kpi", assetId: "a", outputKey: "o", title: "营收", emphasis: "giant", valueMode: "median" }
      ]
    });

    expect(spec?.widgets[0].emphasis).toBeUndefined();
    expect(spec?.widgets[0].valueMode).toBeUndefined();
    expect(rejected.map((item) => item.reason)).toEqual([
      "强调级别「giant」不认识，已按默认排布",
      "取值方式「median」不认识，已按数据形状推断"
    ]);
  });

  it("全部组件非法时整份作废", () => {
    const { spec, rejected } = parseDashboardDesignSpec({ widgets: [{ role: "gauge" }] });
    expect(spec).toBeNull();
    expect(rejected.at(-1)?.reason).toContain("没有一条可用");
  });
});

describe("parseDashboardDesignOps", () => {
  it("归一化合法修改清单", () => {
    const { ops, rejected } = parseDashboardDesignOps({
      narrative: "换成深色并把趋势图放大。",
      ops: [
        { op: "set_theme", themeId: "command-dark" },
        { op: "set_archetype", archetype: "trend-led" },
        { op: "set_emphasis", widgetId: "w-1", emphasis: "hero" },
        { op: "retitle", widgetId: "w-2", title: "营收趋势", subtitle: "近 12 个月" },
        { op: "set_mapping", widgetId: "w-2", dimensionKey: "month", metricKeys: ["revenue"] },
        { op: "reorder", widgetIds: ["w-2", "w-1"] }
      ]
    });

    expect(rejected).toEqual([]);
    expect(ops?.ops).toHaveLength(6);
    expect(ops?.narrative).toBe("换成深色并把趋势图放大。");
  });

  it("未知 op 名被丢弃并记一条中文理由", () => {
    const { ops, rejected } = parseDashboardDesignOps({
      ops: [{ op: "set_gradient", value: "rainbow" }, { op: "remove_widget", widgetId: "w-9" }]
    });

    expect(ops?.ops).toEqual([{ op: "remove_widget", widgetId: "w-9" }]);
    expect(rejected[0].reason).toContain("不认识的操作「set_gradient」");
  });

  it("缺少组件 id 的修改被丢弃", () => {
    const { ops, rejected } = parseDashboardDesignOps({ ops: [{ op: "retype_widget", variant: "bar-horizontal" }] });
    expect(ops?.ops).toEqual([]);
    expect(rejected[0].reason).toContain("没有指明组件");
  });

  it("ops 不是数组时整份作废", () => {
    const { ops, rejected } = parseDashboardDesignOps({ narrative: "…", ops: "换主题" });
    expect(ops).toBeNull();
    expect(rejected[0].reason).toContain("不是数组");
  });

  it("add_widget 的组件同样走角色校验", () => {
    const { ops, rejected } = parseDashboardDesignOps({
      ops: [{ op: "add_widget", widget: { ref: "w1", role: "sunburst", title: "旭日图" } }]
    });

    expect(ops?.ops).toEqual([]);
    expect(rejected[0].reason).toContain("不在支持范围");
  });
});
