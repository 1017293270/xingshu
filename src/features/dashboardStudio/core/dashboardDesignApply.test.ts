import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { contractDesignData, standardDesignData } from "@/test/dashboardDesignFixtures";
import type { DashboardDesignSpec, DashboardDesignSpecWidget } from "@/types/dashboardDesign";
import type { DashboardSchema } from "@/types/dashboardStudio";
import { getDashboardBoardTheme } from "./dashboardBoardThemes";
import { applyDashboardDesignOps, applyDashboardDesignSpec, resolveDashboardBoardThemeId } from "./dashboardDesignApply";
import { buildDashboardChartOption, resolveDashboardMetric } from "./dashboardWidgetData";

const kpi = (ref: string, metricKey: string, title: string, extra: Partial<DashboardDesignSpecWidget> = {}): DashboardDesignSpecWidget => ({
  ref,
  role: "kpi",
  assetId: "asset-revenue",
  outputKey: "monthly",
  metricKey,
  title,
  ...extra
});

const trendHero: DashboardDesignSpecWidget = {
  ref: "trend",
  role: "trend",
  assetId: "asset-revenue",
  outputKey: "monthly",
  variant: "line-smooth",
  dimensionKey: "month",
  metricKeys: ["revenue"],
  title: "营收趋势",
  subtitle: "近 6 个月 · 按月",
  emphasis: "hero"
};

const regionBar: DashboardDesignSpecWidget = {
  ref: "bar",
  role: "comparison",
  assetId: "asset-region",
  outputKey: "region",
  variant: "bar-horizontal",
  dimensionKey: "region",
  metricKeys: ["sales"],
  title: "区域排行"
};

const regionPie: DashboardDesignSpecWidget = {
  ref: "pie",
  role: "composition",
  assetId: "asset-region",
  outputKey: "region",
  variant: "pie-donut",
  dimensionKey: "region",
  metricKeys: ["sales"],
  title: "区域占比"
};

const regionTable: DashboardDesignSpecWidget = {
  ref: "table",
  role: "detail",
  assetId: "asset-region",
  outputKey: "region",
  title: "区域明细"
};

const note: DashboardDesignSpecWidget = {
  ref: "note",
  role: "narrative",
  title: "口径说明",
  content: "含税口径，剔除内部结算。"
};

function spec(overrides: Partial<DashboardDesignSpec> = {}): DashboardDesignSpec {
  return {
    narrative: "三张指标卡打头，营收趋势做主图。",
    title: "营收驾驶舱",
    insight: "华东领先，营收连续六个月上行。",
    themeId: "command-dark",
    archetype: "trend-led",
    widgets: [kpi("k1", "revenue", "总营收", { valueMode: "sum" }), kpi("k2", "cost", "总成本"), trendHero, regionBar, regionPie, regionTable, note],
    ...overrides
  };
}

function findByTitle(schema: DashboardSchema, title: string) {
  const widget = schema.widgets.find((item) => item.title === title);
  if (!widget) throw new Error(`板上没有「${title}」`);
  return widget;
}

describe("applyDashboardDesignSpec", () => {
  it("把角色落成组件，主题、原型与画布写回 schema", () => {
    const result = applyDashboardDesignSpec(createBlankDashboard(), spec({ canvasPreset: "2k" }), standardDesignData());

    expect(result.rejected).toEqual([]);
    expect(result.schema.widgets.map((widget) => widget.type).sort()).toEqual(
      ["bar", "line", "metric", "metric", "pie", "table", "text", "text"]
    );
    // 标题条由引擎按 spec.title 生成并排在最前，运行态靠它当页头
    const banner = result.schema.widgets[0]!;
    expect(banner.type).toBe("text");
    expect(banner.props?.text).toBe("营收驾驶舱");
    expect(banner.subtitle).toBe("华东领先，营收连续六个月上行。");
    expect(result.schema.title).toBe("营收驾驶舱");
    expect(result.schema.description).toBe("华东领先，营收连续六个月上行。");
    expect(result.schema.canvas.width).toBe(2560);
    expect(result.schema.canvas.background).toBe(getDashboardBoardTheme("command-dark").canvasBackground);
    expect(result.schema.design).toEqual({ archetype: "trend-led", themeId: "command-dark" });

    const revenue = findByTitle(result.schema, "总营收");
    expect(revenue.mapping).toMatchObject({ metricKeys: ["revenue"], metricColumnIds: ["c-revenue"], valueMode: "sum" });
    // 时间序列上没点名取值方式时取最新一期，而不是把六个月加总
    expect(findByTitle(result.schema, "总成本").mapping.valueMode).toBe("latest");

    const trend = findByTitle(result.schema, "营收趋势");
    expect(trend.type).toBe("line");
    expect(trend.style.chartVariant).toBe("line-smooth");
    expect(trend.mapping).toMatchObject({ dimensionKey: "month", metricKeys: ["revenue"] });
    expect(trend.subtitle).toBe("近 6 个月 · 按月");
    expect(findByTitle(result.schema, "区域排行").style.chartVariant).toBe("bar-horizontal");
    expect(findByTitle(result.schema, "口径说明").content).toBe("含税口径，剔除内部结算。");

    expect(result.changes.map((change) => change.kind)).toEqual(
      expect.arrayContaining(["banner", "add", "emphasis", "theme", "archetype", "canvas"])
    );
  });

  it("主图独占通栏、指标卡压顶、明细表沉底", () => {
    const { schema } = applyDashboardDesignSpec(createBlankDashboard(), spec(), standardDesignData());
    const trend = findByTitle(schema, "营收趋势");
    const table = findByTitle(schema, "区域明细");
    const kpis = schema.widgets.filter((widget) => widget.type === "metric");

    expect(trend.position.w).toBeGreaterThanOrEqual((schema.canvas.width * 2) / 3);
    for (const card of kpis) {
      expect(card.position.y).toBeLessThan(trend.position.y);
      expect(schema.widgets[0]!.position.y).toBeLessThan(card.position.y);
    }
    expect(table.position.y).toBeGreaterThan(trend.position.y + trend.position.h - 1);
    expect(schema.canvas.height).toBeGreaterThanOrEqual(table.position.y + table.position.h);
  });

  it("不改输入 schema", () => {
    const blank = createBlankDashboard();
    const snapshot = structuredClone(blank);
    applyDashboardDesignSpec(blank, spec(), standardDesignData());
    expect(blank).toEqual(snapshot);
  });

  it("整稿替换时锁定组件原样保留，其余组件连同绑定一起清掉", () => {
    const first = applyDashboardDesignSpec(createBlankDashboard(), spec(), standardDesignData()).schema;
    const lockedTitle = "区域排行";
    first.widgets = first.widgets.map((widget) =>
      widget.title === lockedTitle ? { ...widget, style: { ...widget.style, locked: true } } : widget
    );

    const second = applyDashboardDesignSpec(
      first,
      spec({ widgets: [kpi("k1", "revenue", "总营收"), trendHero] }),
      standardDesignData()
    ).schema;

    expect(second.widgets.map((widget) => widget.title).sort()).toEqual(
      ["营收驾驶舱", "区域排行", "总营收", "营收趋势"].sort()
    );
    const locked = findByTitle(second, lockedTitle);
    expect(locked.style.locked).toBe(true);
    expect(second.dataBindings[locked.bindingId!]).toBeDefined();
    // 三张卡各自一份绑定，被换掉的那些不该留下孤儿
    expect(Object.keys(second.dataBindings)).toHaveLength(3);
  });

  it("引用不存在的资产、列或错误的图种族会被拒绝并给出中文理由", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      spec({
        widgets: [
          { ...kpi("ghost", "revenue", "幽灵指标"), assetId: "asset-none" },
          kpi("profit", "profit", "利润"),
          { ...trendHero, ref: "cat-trend", assetId: "asset-region", outputKey: "region", dimensionKey: "region", metricKeys: ["sales"], title: "区域趋势", emphasis: undefined },
          { ...regionBar, ref: "pie-bar", variant: "pie-donut", title: "错族对比" }
        ]
      }),
      standardDesignData()
    );

    const reasons = result.rejected.map((item) => `${item.target}:${item.reason}`);
    expect(reasons.some((reason) => reason.startsWith("幽灵指标:") && reason.includes("不在本次选中的数据里"))).toBe(true);
    expect(reasons.some((reason) => reason.startsWith("利润:") && reason.includes("不在该结果表里"))).toBe(true);
    expect(reasons.some((reason) => reason.startsWith("区域趋势:") && reason.includes("没有时间列"))).toBe(true);
    expect(reasons.some((reason) => reason.startsWith("错族对比:") && reason.includes("不属于对比图"))).toBe(true);

    expect(
      result.schema.widgets.filter((widget) => widget.type !== "text").map((widget) => widget.title).sort()
    ).toEqual(["利润", "错族对比"]);
    // 指标列对不上时退回第一列数值，卡还在
    expect(findByTitle(result.schema, "利润").mapping.metricKeys).toEqual(["revenue"]);
    const bar = findByTitle(result.schema, "错族对比");
    expect(bar.type).toBe("bar");
    expect(bar.style.chartVariant).toBe("bar-vertical");
  });

  it("同一稿只有一个主图，多余的降级并说明", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      spec({ widgets: [trendHero, { ...regionBar, emphasis: "hero" }] }),
      standardDesignData()
    );

    expect(result.rejected).toEqual([{ target: "区域排行", reason: "同一稿只能有一个主图，已降为加宽" }]);
    const trend = findByTitle(result.schema, "营收趋势");
    const bar = findByTitle(result.schema, "区域排行");
    // 先到先得：趋势图占住主图带，排行图只能排到主图之下
    expect(trend.position.w).toBeGreaterThanOrEqual((result.schema.canvas.width * 2) / 3);
    expect(bar.position.y).toBeGreaterThanOrEqual(trend.position.y + trend.position.h);
  });

  it("类目过多的占比图降级为对比图", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      spec({
        widgets: [
          {
            ref: "crowded",
            role: "composition",
            assetId: "asset-channel",
            outputKey: "channel",
            variant: "pie-donut",
            dimensionKey: "channel",
            metricKeys: ["orders"],
            title: "渠道占比"
          }
        ]
      }),
      standardDesignData()
    );

    expect(result.rejected).toEqual([]);
    expect(result.changes.some((change) => change.kind === "degrade" && change.label.includes("改为对比图"))).toBe(true);
    const widget = findByTitle(result.schema, "渠道占比");
    expect(widget.type).toBe("bar");
    expect(widget.style.chartVariant).toBe("bar-vertical");
  });

  it("组件总数封顶 12", () => {
    const widgets = Array.from({ length: 13 }, (_, index) => kpi(`k${index}`, "revenue", `指标 ${index + 1}`));
    const result = applyDashboardDesignSpec(createBlankDashboard(), spec({ widgets }), standardDesignData());

    // 标题条不占名额：12 张指标卡 + 1 条标题
    expect(result.schema.widgets.filter((widget) => widget.type === "metric")).toHaveLength(12);
    expect(result.schema.widgets).toHaveLength(13);
    expect(result.rejected).toEqual([{ target: "指标 13", reason: "一屏最多 12 个组件，已超出" }]);
  });

  it("未知主题与画布档位保持现状并记入 rejected", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      spec({ themeId: "neon-cyber", canvasPreset: "imax" }),
      standardDesignData()
    );

    expect(result.rejected).toEqual(
      expect.arrayContaining([
        { target: "整板主题", reason: "主题「neon-cyber」不在主题库里，已保持当前主题" },
        { target: "画布尺寸", reason: "尺寸档「imax」不认识，已保持当前画布" }
      ])
    );
    expect(result.schema.design?.themeId).toBe("ice-light");
    expect(result.schema.canvas.width).toBe(1920);
    expect(resolveDashboardBoardThemeId(result.schema)).toBe("ice-light");
  });
});

describe("applyDashboardDesignOps", () => {
  function board() {
    return applyDashboardDesignSpec(createBlankDashboard(), spec(), standardDesignData()).schema;
  }

  it("换主题、改标题、改口径落到 schema 并记录变更", () => {
    const current = board();
    const trend = findByTitle(current, "营收趋势");
    const revenue = findByTitle(current, "总营收");

    const result = applyDashboardDesignOps(
      current,
      {
        narrative: "换成政务藏青。",
        ops: [
          { op: "set_theme", themeId: "gov-navy" },
          { op: "set_board_title", title: "经营月报", subtitle: "面向经营例会" },
          { op: "retitle", widgetId: trend.id, title: "月度营收走势", subtitle: "近半年" },
          { op: "set_kpi", widgetId: revenue.id, valueMode: "max", showTrend: true }
        ]
      },
      standardDesignData()
    );

    expect(result.rejected).toEqual([]);
    expect(result.changes.map((change) => change.label)).toEqual(
      expect.arrayContaining(["整板主题 → 政务藏青", "整板标题 → 经营月报", "组件标题 → 月度营收走势"])
    );
    expect(result.schema.design?.themeId).toBe("gov-navy");
    expect(result.schema.canvas.background).toBe(getDashboardBoardTheme("gov-navy").canvasBackground);
    expect(result.schema.title).toBe("经营月报");
    expect(result.schema.description).toBe("面向经营例会");
    const banner = result.schema.widgets.find((widget) => widget.props?.designRole === "banner")!;
    expect(banner.props?.text).toBe("经营月报");
    expect(banner.subtitle).toBe("面向经营例会");
    expect(findByTitle(result.schema, "月度营收走势").subtitle).toBe("近半年");
    const kpiCard = result.schema.widgets.find((widget) => widget.id === revenue.id)!;
    expect(kpiCard.mapping.valueMode).toBe("max");
    expect(kpiCard.style.showTrend).toBe(true);
  });

  it("加宽指令真的改变布局，并跟着 schema 持久化到下一轮", () => {
    const current = applyDashboardDesignSpec(
      createBlankDashboard(),
      spec({ archetype: "kpi-led", widgets: [kpi("k1", "revenue", "总营收"), { ...trendHero, emphasis: undefined }, regionBar, regionPie] }),
      standardDesignData()
    ).schema;
    const before = findByTitle(current, "区域排行").position.w;
    // 求解器把余量按 8px 撒到列上，同行卡宽最多差一个格
    expect(Math.abs(before - findByTitle(current, "营收趋势").position.w)).toBeLessThanOrEqual(16);

    const widened = applyDashboardDesignOps(
      current,
      { narrative: "把区域排行加宽。", ops: [{ op: "set_emphasis", widgetId: findByTitle(current, "区域排行").id, emphasis: "wide" }] },
      standardDesignData()
    );
    expect(widened.changes).toEqual([
      { kind: "emphasis", widgetId: findByTitle(current, "区域排行").id, label: "「区域排行」→ 加宽" }
    ]);
    expect(findByTitle(widened.schema, "区域排行").position.w).toBeGreaterThan(findByTitle(widened.schema, "营收趋势").position.w);
    expect(widened.schema.design?.emphasisById).toEqual({ [findByTitle(current, "区域排行").id]: "wide" });

    const retitled = applyDashboardDesignOps(
      widened.schema,
      { narrative: "改个标题。", ops: [{ op: "retitle", widgetId: findByTitle(current, "总营收").id, title: "营收合计" }] },
      standardDesignData()
    );
    expect(findByTitle(retitled.schema, "区域排行").position.w).toBeGreaterThan(findByTitle(retitled.schema, "营收趋势").position.w);
  });

  it("锁定组件、不存在的组件与类型不匹配的操作被拒绝", () => {
    const current = board();
    const bar = findByTitle(current, "区域排行");
    const revenue = findByTitle(current, "总营收");
    bar.style.locked = true;

    const result = applyDashboardDesignOps(
      current,
      {
        narrative: "乱改一通。",
        ops: [
          { op: "retitle", widgetId: bar.id, title: "改不动" },
          { op: "retitle", widgetId: "widget-missing", title: "没这张" },
          { op: "set_text", widgetId: revenue.id, content: "指标卡没有正文" },
          { op: "set_kpi", widgetId: findByTitle(current, "营收趋势").id, valueMode: "sum" },
          { op: "set_theme", themeId: "neon-cyber" }
        ]
      },
      standardDesignData()
    );

    expect(result.rejected).toEqual([
      { target: "区域排行", reason: "组件已锁定，不能改动" },
      { target: "widget-missing", reason: "板上找不到这个组件" },
      { target: "总营收", reason: "只有文本条能改正文" },
      { target: "营收趋势", reason: "只有指标卡能改取值方式" },
      { target: "整板主题", reason: "主题「neon-cyber」不在主题库里，已保持当前主题" }
    ]);
    expect(findByTitle(result.schema, "区域排行").style.locked).toBe(true);
    expect(result.schema.design?.themeId).toBe("command-dark");
  });

  it("换图种按数据形状与列校验", () => {
    const current = board();
    const pie = findByTitle(current, "区域占比");
    const bar = findByTitle(current, "区域排行");

    const result = applyDashboardDesignOps(
      current,
      {
        narrative: "占比改横向排行。",
        ops: [
          { op: "retype_widget", widgetId: pie.id, variant: "bar-horizontal" },
          { op: "retype_widget", widgetId: bar.id, variant: "line-smooth" },
          { op: "set_mapping", widgetId: bar.id, metricKeys: ["profit"] }
        ]
      },
      standardDesignData()
    );

    const retyped = result.schema.widgets.find((widget) => widget.id === pie.id)!;
    expect(retyped.type).toBe("bar");
    expect(retyped.style.chartVariant).toBe("bar-horizontal");
    expect(retyped.mapping).toMatchObject({ dimensionKey: "region", metricKeys: ["sales"] });
    expect(result.rejected).toEqual([
      { target: "区域排行", reason: "图种「平滑折线」要求的数据形状与该组件的数据不符" },
      { target: "区域排行", reason: "列「profit」不在该组件的数据里" }
    ]);
  });

  it("移除组件顺带清掉不再引用的绑定，新增组件可以直接当主图", () => {
    const current = board();
    const table = findByTitle(current, "区域明细");
    const bindingCount = Object.keys(current.dataBindings).length;

    const result = applyDashboardDesignOps(
      current,
      {
        narrative: "去掉明细，加一张渠道对比当主图。",
        ops: [
          { op: "remove_widget", widgetId: table.id },
          {
            op: "add_widget",
            widget: {
              ref: "channels",
              role: "comparison",
              assetId: "asset-channel",
              outputKey: "channel",
              dimensionKey: "channel",
              metricKeys: ["orders"],
              title: "渠道订单",
              emphasis: "hero"
            }
          }
        ]
      },
      standardDesignData()
    );

    expect(result.schema.widgets.some((widget) => widget.id === table.id)).toBe(false);
    expect(result.schema.dataBindings[table.bindingId!]).toBeUndefined();
    expect(Object.keys(result.schema.dataBindings)).toHaveLength(bindingCount);
    const channels = findByTitle(result.schema, "渠道订单");
    expect(channels.position.w).toBeGreaterThanOrEqual((result.schema.canvas.width * 2) / 3);
    expect(findByTitle(result.schema, "营收趋势").position.w).toBeLessThan(channels.position.w);
  });

  it("空的修改清单只重排不改内容", () => {
    const current = board();
    const result = applyDashboardDesignOps(current, { narrative: "无需改动。", ops: [] }, standardDesignData());
    expect(result.changes).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.schema.widgets.map((widget) => widget.title)).toEqual(current.widgets.map((widget) => widget.title));
  });
});

/**
 * 合同主数据这一组回归钉死线上那块「数据没对上」的板：
 * 金额是带千分位的字符串、年度是纯数字、编号是高基数字符串，
 * 三者以前都会被当成指标，于是指标卡「暂无指标数据」、图表「还没选到可绘制的数值指标」。
 */
describe("合同主数据落板", () => {
  const data = contractDesignData();

  function contractSpec(widgets: DashboardDesignSpecWidget[]): DashboardDesignSpec {
    return { narrative: "", title: "合同主数据总览", themeId: "ice-light", archetype: "kpi-led", widgets };
  }

  function bindingOf(schema: DashboardSchema, title: string) {
    const widget = findByTitle(schema, title);
    return { widget, binding: schema.dataBindings[widget.bindingId!] };
  }

  it("带千分位与货币符号的金额取得到数，图表画得出来", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      contractSpec([
        {
          ref: "k1",
          role: "kpi",
          assetId: "asset-contract",
          outputKey: "contract",
          metricKey: "contractAmount",
          valueMode: "sum",
          title: "合同金额合计"
        },
        {
          ref: "b1",
          role: "comparison",
          assetId: "asset-payment",
          outputKey: "payment",
          variant: "bar-vertical",
          dimensionKey: "customer",
          metricKeys: ["paidAmount"],
          title: "客户回款金额"
        }
      ]),
      data
    );

    expect(result.rejected).toEqual([]);
    const kpi = bindingOf(result.schema, "合同金额合计");
    expect(resolveDashboardMetric(kpi.widget, kpi.binding)).toBe(152500);
    expect(kpi.widget.mapping.displayUnit).toBe("万元");

    const bar = bindingOf(result.schema, "客户回款金额");
    const option = buildDashboardChartOption(bar.widget, bar.binding, { animation: false });
    expect(option).not.toBeNull();
    expect((option?.series as Array<{ data?: Array<{ value: number | null }> }>)[0]?.data).toEqual([
      expect.objectContaining({ value: 12000 }),
      expect.objectContaining({ value: 8600 }),
      expect.objectContaining({ value: 21400 }),
      expect.objectContaining({ value: 5200 })
    ]);
  });

  it("年度与合同编号当不了指标，改用真正的数值列并给出中文理由", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      contractSpec([
        {
          ref: "k1",
          role: "kpi",
          assetId: "asset-contract",
          outputKey: "contract",
          metricKey: "contractYear",
          title: "年度指标"
        },
        {
          ref: "t1",
          role: "trend",
          assetId: "asset-contract",
          outputKey: "contract",
          variant: "line-smooth",
          dimensionKey: "contractYear",
          metricKeys: ["contractNo"],
          title: "编号趋势"
        }
      ]),
      data
    );

    expect(result.rejected.map((item) => item.reason)).toEqual([
      "「合同签订或归属年度」没有可解析的数值，已改用「合同金额（万元）」",
      "「合同编号」没有可解析的数值，已按推断取列"
    ]);
    const kpi = bindingOf(result.schema, "年度指标");
    expect(kpi.widget.mapping.metricKeys).toEqual(["contractAmount"]);
    expect(resolveDashboardMetric(kpi.widget, kpi.binding)).not.toBeNull();

    const trend = bindingOf(result.schema, "编号趋势");
    expect(trend.widget.mapping.metricKeys).toEqual(["contractAmount"]);
    expect(trend.widget.mapping.dimensionKey).toBe("contractYear");
    expect(buildDashboardChartOption(trend.widget, trend.binding, { animation: false })).not.toBeNull();
  });

  it("数值指标不能当维度，引擎换一列并说明", () => {
    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      contractSpec([
        {
          ref: "b1",
          role: "comparison",
          assetId: "asset-payment",
          outputKey: "payment",
          variant: "bar-vertical",
          dimensionKey: "paidAmount",
          metricKeys: ["creditLimit"],
          title: "回款对比"
        }
      ]),
      data
    );

    expect(result.rejected.map((item) => item.reason)).toEqual([
      "维度列「paidAmount」是数值指标，画不出分类，已改用「客户名称」"
    ]);
    const bar = bindingOf(result.schema, "回款对比");
    expect(bar.widget.mapping.dimensionKey).toBe("customer");
    expect(bar.widget.mapping.metricKeys).toEqual(["creditLimit"]);
    expect(buildDashboardChartOption(bar.widget, bar.binding, { animation: false })).not.toBeNull();
  });

  it("整列取不到数的结果表不落图，也不落指标卡", () => {
    const noMetricData = contractDesignData();
    const output = noMetricData["asset-payment"]!.execution.outputs[0]!;
    output.rows = output.rows.map((row) => ({ ...row, paidAmount: "面议", creditLimit: "另议" }));

    const result = applyDashboardDesignSpec(
      createBlankDashboard(),
      contractSpec([
        { ref: "k1", role: "kpi", assetId: "asset-payment", outputKey: "payment", title: "回款金额" },
        {
          ref: "b1",
          role: "comparison",
          assetId: "asset-payment",
          outputKey: "payment",
          dimensionKey: "customer",
          title: "回款对比"
        }
      ]),
      noMetricData
    );

    expect(result.rejected).toEqual([
      { target: "回款金额", reason: "该结果表没有数值列，做不了指标卡" },
      { target: "回款对比", reason: "该结果表没有可解析的数值列，画不了图" }
    ]);
    expect(result.schema.widgets.filter((widget) => widget.type !== "text")).toEqual([]);
  });
});
