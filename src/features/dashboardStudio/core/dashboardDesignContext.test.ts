import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { QueryAsset, QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";
import type { DashboardDesignAssetData, DashboardDesignRequest } from "@/types/dashboardDesign";
import type { DashboardSchema, DashboardWidget, DashboardWidgetType } from "@/types/dashboardStudio";
import {
  PROJECT_CUBE,
  RANKING_ANSWER,
  SALES_ANSWER,
  customerRankingAsset,
  favoriteAsset,
  favoriteColumn,
  favoriteExecution,
  favoriteOutput,
  monthlyIncomeAsset,
  mustSignAsset,
  salesAsset,
  salesDetailAsset,
  salesRecheckAsset,
  withAnswer
} from "../testing/favoriteAnswerFixtures";
import {
  buildDashboardDesignCatalog,
  buildDashboardDesignRequest,
  inferDashboardDesignOutputShape,
  summarizeDashboardDesignAsset,
  summarizeDashboardDesignBoard
} from "./dashboardDesignContext";

function column(columnId: string, key: string, label: string, type = "string"): QueryColumnDefinition {
  return { columnId, key, label, type };
}

function output(
  outputKey: string,
  columns: QueryColumnDefinition[],
  rows: Record<string, unknown>[]
): QueryExecutionOutput {
  return { outputKey, columns, rows, totalRows: rows.length, updatedAt: "2026-09-03T08:00:00.000Z" };
}

function asset(id: string, name: string, outputs: QueryExecutionOutput[]): QueryAsset {
  const versionId = `${id}-v1`;
  return {
    id,
    name,
    originalQuestion: `${name}是多少`,
    resolvedQuestion: `${name}是多少`,
    datasourceId: 8,
    ownerUserId: 2,
    visibility: "PRIVATE",
    stableVersionId: versionId,
    status: "ACTIVE",
    stableVersion: {
      id: versionId,
      versionNo: 1,
      resolvedQuestion: `${name}是多少`,
      engine: "CUBE",
      parameters: [],
      outputs: outputs.map((item) => ({
        outputKey: item.outputKey,
        label: `${item.outputKey} 结果表`,
        rowCount: item.totalRows,
        columns: item.columns
      })),
      schemaHash: `${id}-hash`,
      status: "VALIDATED",
      createdAt: "2026-09-03T00:00:00.000Z"
    },
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z"
  };
}

function execution(item: QueryAsset, outputs: QueryExecutionOutput[]): QueryExecution {
  return {
    id: `${item.id}-exec`,
    assetId: item.id,
    versionId: item.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 12,
    createdAt: "2026-09-03T08:00:00.000Z",
    outputs
  };
}

const monthlyOutput = output(
  "monthly",
  [column("c-month", "month", "月份"), column("c-revenue", "revenue", "营收（万元）", "number")],
  Array.from({ length: 6 }, (_, index) => ({ month: `2026-0${index + 1}`, revenue: 100 + index * 10 }))
);

const regionOutput = output(
  "region",
  [column("c-region", "region", "区域"), column("c-sales", "sales", "销售额", "number")],
  [
    { region: "华东", sales: 620 },
    { region: "华南", sales: 480 },
    { region: "华北", sales: 310 }
  ]
);

function widget(id: string, type: DashboardWidgetType, overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id,
    type,
    title: id,
    mapping: {},
    position: { x: 0, y: 0, w: 480, h: 240 },
    style: {},
    ...overrides
  };
}

function boardOf(widgets: DashboardWidget[]): DashboardSchema {
  const schema = createBlankDashboard();
  schema.widgets = widgets;
  return schema;
}

describe("inferDashboardDesignOutputShape", () => {
  it("有时间列判为时间序列", () => {
    expect(inferDashboardDesignOutputShape(monthlyOutput)).toBe("time-series");
  });

  it("有维度列判为分类", () => {
    expect(inferDashboardDesignOutputShape(regionOutput)).toBe("category");
  });

  it("只有数值且一行判为标量", () => {
    const single = output("total", [column("c-total", "total", "总额", "number")], [{ total: 8123 }]);
    expect(inferDashboardDesignOutputShape(single)).toBe("scalar");
  });

  it("0 行结果判为明细表，不给模型画空趋势的机会", () => {
    expect(inferDashboardDesignOutputShape({ ...monthlyOutput, rows: [], totalRows: 0 })).toBe("table");
  });

  it("多行纯数值判为明细表", () => {
    const numeric = output(
      "raw",
      [column("c-a", "a", "指标一", "number"), column("c-b", "b", "指标二", "number")],
      [{ a: 1, b: 2 }, { a: 3, b: 4 }]
    );
    expect(inferDashboardDesignOutputShape(numeric)).toBe("table");
  });
});

describe("summarizeDashboardDesignAsset", () => {
  it("给出列种类、样本行与形状，样本最多三行", () => {
    const item = asset("asset-1", "月度营收", [monthlyOutput]);
    const summary = summarizeDashboardDesignAsset(item, execution(item, [monthlyOutput]));

    expect(summary.assetId).toBe("asset-1");
    expect(summary.outputs).toHaveLength(1);
    expect(summary.outputs[0].label).toBe("monthly 结果表");
    expect(summary.outputs[0].columns.map((c) => c.kind)).toEqual(["time", "number"]);
    expect(summary.outputs[0].shape).toBe("time-series");
    expect(summary.outputs[0].totalRows).toBe(6);
    expect(summary.outputs[0].sampleRows).toHaveLength(3);
    expect(Object.keys(summary.outputs[0].sampleRows[0])).toEqual(["month", "revenue"]);
  });
});

describe("summarizeDashboardDesignAsset · 收藏里的多次查询", () => {
  it("答案排第一并点明，0 行结果不给模型，列名是短业务名", () => {
    const summary = summarizeDashboardDesignAsset(salesAsset, favoriteExecution(salesAsset));

    expect(summary.outputs.map((item) => item.outputKey)).toEqual(["output_003", "output_001"]);
    expect(summary.outputs[0]?.label).toBe("结果表 3 · 签约金额（万元） · 最可能是问题的答案");
    expect(summary.outputs[0]?.shape).toBe("scalar");
    expect(summary.outputs[1]?.label).toBe("结果表 1 · 项目名称、客户名称");
    const labels = summary.outputs.flatMap((item) => item.columns.map((column) => column.label));
    expect(labels).toEqual(["签约金额（万元）", "项目名称", "客户名称", "项目数量"]);
    expect(JSON.stringify(summary)).not.toContain(PROJECT_CUBE);
  });

  it("整份都是 0 行时只交一张明细形状的表", () => {
    const summary = summarizeDashboardDesignAsset(mustSignAsset, favoriteExecution(mustSignAsset));

    expect(summary.outputs).toHaveLength(1);
    expect(summary.outputs[0]).toMatchObject({ outputKey: "output_002", shape: "table", totalRows: 0 });
    expect(summary.outputs[0]?.label).toBe("结果表 2 · 合同金额（万元）");
  });
});

describe("summarizeDashboardDesignAsset · 收藏带着回答原文", () => {
  const answerKeys = /"answer(?:MetricKey|ValueMode)?":/;

  it("回答转纯文本压成一行；排第一的表标上回答引用的列，单元格直接引用时不带口径", () => {
    const recheck = withAnswer(salesRecheckAsset, SALES_ANSWER);
    const summary = summarizeDashboardDesignAsset(recheck, favoriteExecution(recheck));

    expect(summary.answer).toBe("善治今年的销售额为 1,286.5 万元（含税）。");
    expect(Object.keys(summary)).toEqual(["assetId", "name", "question", "answer", "outputs"]);
    expect(summary.outputs.map((item) => item.outputKey)).toEqual(["output_001", "output_002"]);
    expect(summary.outputs[0]).toMatchObject({ answerMetricKey: "ProjectSign.signAmount" });
    expect(summary.outputs[0]).not.toHaveProperty("answerValueMode");
    expect(summary.outputs[0]!.columns.map((item) => item.key)).toContain(summary.outputs[0]!.answerMetricKey);
    expect(JSON.stringify(summary.outputs[1])).not.toMatch(answerKeys);
  });

  it("回答的数是明细列合计时带上 answerValueMode: sum", () => {
    const detail = withAnswer(salesDetailAsset, SALES_ANSWER);
    const summary = summarizeDashboardDesignAsset(detail, favoriteExecution(detail));

    expect(summary.outputs[0]).toMatchObject({
      outputKey: "output_002",
      answerMetricKey: "ProjectSign.signAmount",
      answerValueMode: "sum"
    });
  });

  it("排行回答的列表合成一行，证据只标在排第一的那张表上", () => {
    const ranking = withAnswer(customerRankingAsset, RANKING_ANSWER);
    const summary = summarizeDashboardDesignAsset(ranking, favoriteExecution(ranking));

    expect(summary.answer).toBe(
      "善治今年签约金额最高的三家客户： 1. 四川才子科技：520 万元 2. 成都蓉城数据：386.5 万元 3. 绵阳智汇科技：210 万元 三家合计 1,116.5 万元。"
    );
    expect(summary.outputs[0]).toMatchObject({ outputKey: "output_001", answerMetricKey: "ProjectSign.signAmount" });
    for (const item of summary.outputs.slice(1)) expect(JSON.stringify(item)).not.toMatch(answerKeys);
  });

  it("没有回答（老收藏）时与改动前的摘要逐字节一致", () => {
    // 改动前 summarizeDashboardDesignAsset(salesRecheckAsset, …) 的原样输出，键序也要一致。
    const before = {
      assetId: "asset-sales-recheck",
      name: "善治今年的销售额",
      question: "善治今年的销售额",
      outputs: [
        {
          outputKey: "output_002",
          label: "结果表 2 · 项目名称、客户名称 · 最可能是问题的答案",
          columns: [
            { columnId: "column-ProjectSign.projectName", key: "ProjectSign.projectName", label: "项目名称", kind: "dimension" },
            { columnId: "column-ProjectSign.customerName", key: "ProjectSign.customerName", label: "客户名称", kind: "dimension" },
            { columnId: "column-ProjectSign.projectCount", key: "ProjectSign.projectCount", label: "项目数量", kind: "number" }
          ],
          totalRows: 1,
          sampleRows: [{
            "ProjectSign.projectName": "四川才子数字化运营服务项目",
            "ProjectSign.customerName": "善治科技",
            "ProjectSign.projectCount": 4
          }],
          shape: "scalar"
        },
        {
          outputKey: "output_001",
          label: "结果表 1 · 合同金额（万元）、签约金额（万元）",
          columns: [
            { columnId: "column-ProjectSign.contractAmount", key: "ProjectSign.contractAmount", label: "合同金额（万元）", kind: "number" },
            { columnId: "column-ProjectSign.signAmount", key: "ProjectSign.signAmount", label: "签约金额（万元）", kind: "number" }
          ],
          totalRows: 1,
          sampleRows: [{ "ProjectSign.contractAmount": 3520, "ProjectSign.signAmount": 1286.5 }],
          shape: "scalar"
        }
      ]
    };

    expect(JSON.stringify(summarizeDashboardDesignAsset(salesRecheckAsset, favoriteExecution(salesRecheckAsset))))
      .toBe(JSON.stringify(before));
  });

  it("没有回答、回答为空白时整个请求体与老收藏逐字节一致", () => {
    const fixtures = [salesAsset, mustSignAsset, monthlyIncomeAsset, salesRecheckAsset, salesDetailAsset, customerRankingAsset];
    const requestOf = (assets: QueryAsset[]) => JSON.stringify(buildDashboardDesignRequest({
      brief: "经营总览",
      schema: boardOf([widget("bar-1", "bar")]),
      data: Object.fromEntries(assets.map((item) => [item.id, { asset: item, execution: favoriteExecution(item) }])),
      history: [{ role: "user", content: "上一轮" }]
    }));
    const legacy = requestOf(fixtures);

    expect(legacy).not.toMatch(answerKeys);
    expect(requestOf(fixtures.map((item) => withAnswer(item, "")))).toBe(legacy);
    expect(requestOf(fixtures.map((item) => withAnswer(item, "  \n\t ")))).toBe(legacy);
  });

  it("超长回答截到三百字并以省略号收尾，不劈开代理对", () => {
    const long = withAnswer(salesRecheckAsset, `${SALES_ANSWER}\n\n${"详".repeat(1_000)}`);
    expect(summarizeDashboardDesignAsset(long, favoriteExecution(long)).answer).toMatch(/^善治今年的销售额为 1,286\.5 万元（含税）。 详+…$/);
    expect(summarizeDashboardDesignAsset(long, favoriteExecution(long)).answer).toHaveLength(300);

    // 第 299 个码元正好是「𠀀」的高位代理：整字退出去，宁可短一位也不留半个字。
    const astral = withAnswer(salesRecheckAsset, `${"详".repeat(298)}${"𠀀".repeat(10)}`);
    const answer = summarizeDashboardDesignAsset(astral, favoriteExecution(astral)).answer!;
    expect(answer).toBe(`${"详".repeat(298)}…`);
    expect(answer).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("summarizeDashboardDesignBoard", () => {
  it("角色按图种映射，饼图归入占比族", () => {
    const schema = boardOf([
      widget("kpi-1", "metric"),
      widget("trend-1", "line"),
      widget("bar-1", "bar"),
      widget("pie-1", "pie"),
      widget("table-1", "table"),
      widget("text-1", "text", { content: "运营驾驶舱" })
    ]);
    const summary = summarizeDashboardDesignBoard(schema);

    expect(summary.widgets.map((item) => item.role)).toEqual([
      "kpi",
      "trend",
      "comparison",
      "composition",
      "detail",
      "narrative"
    ]);
    expect(summary.widgets[5].content).toBe("运营驾驶舱");
  });

  it("强调级别按宽度折算", () => {
    const schema = boardOf([
      widget("hero", "line", { position: { x: 0, y: 0, w: 1400, h: 400 } }),
      widget("wide", "bar", { position: { x: 0, y: 0, w: 1000, h: 300 } }),
      widget("normal", "bar", { position: { x: 0, y: 0, w: 700, h: 300 } }),
      widget("compact", "bar", { position: { x: 0, y: 0, w: 400, h: 300 } })
    ]);
    schema.canvas.width = 1920;

    expect(summarizeDashboardDesignBoard(schema).widgets.map((item) => item.emphasis)).toEqual([
      "hero",
      "wide",
      "normal",
      "compact"
    ]);
  });

  it("认不出整板主题时 themeId 为 null", () => {
    const schema = boardOf([widget("bar-1", "bar")]);
    schema.canvas.background = "#123456";
    expect(summarizeDashboardDesignBoard(schema).themeId).toBeNull();
  });

  it("优先回显 schema.design 里记下的主题与原型", () => {
    const schema = boardOf([widget("bar-1", "bar")]);
    schema.design = { themeId: "command-dark", archetype: "trend-led" };
    const summary = summarizeDashboardDesignBoard(schema);
    expect(summary.themeId).toBe("command-dark");
    expect(summary.archetype).toBe("trend-led");
  });
});

describe("buildDashboardDesignCatalog", () => {
  it("目录带上主题、变体、原型与画布档", () => {
    const catalog = buildDashboardDesignCatalog();
    expect(catalog.themes.length).toBeGreaterThanOrEqual(4);
    expect(catalog.themes.every((theme) => theme.id && theme.title && theme.description)).toBe(true);
    expect(catalog.variants).toHaveLength(18);
    expect(catalog.archetypes.map((item) => item.id)).toEqual([
      "kpi-led",
      "trend-led",
      "comparison-grid",
      "ranking-detail"
    ]);
    expect(catalog.canvasPresets.map((item) => item.id)).toContain("full-hd");
  });
});

describe("buildDashboardDesignRequest", () => {
  function dataOf(count: number, outputsPerAsset = 1, columnsPerOutput = 2): DashboardDesignAssetData {
    const data: DashboardDesignAssetData = {};
    for (let index = 0; index < count; index += 1) {
      const outputs = Array.from({ length: outputsPerAsset }, (_, outputIndex) =>
        output(
          `out-${outputIndex}`,
          Array.from({ length: columnsPerOutput }, (_, columnIndex) =>
            column(`c-${outputIndex}-${columnIndex}`, `k${outputIndex}_${columnIndex}`, `列 ${columnIndex}`)
          ),
          [{ [`k${outputIndex}_0`]: "华东" }]
        )
      );
      const item = asset(`asset-${index}`, `资产 ${index}`, outputs);
      data[item.id] = { asset: item, execution: execution(item, outputs) };
    }
    return data;
  }

  it("资产最多八份、每份最多六个输出、每个输出最多二十四列", () => {
    const request = buildDashboardDesignRequest({
      brief: "做一屏经营总览",
      data: dataOf(10, 9, 30),
      history: []
    });

    expect(request.assets).toHaveLength(8);
    expect(request.assets[0].outputs).toHaveLength(6);
    expect(request.assets[0].outputs[0].columns).toHaveLength(24);
  });

  it("历史最多六轮且每条截断到三百字", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: "字".repeat(500)
    }));
    const request = buildDashboardDesignRequest({ brief: "换个主题", data: dataOf(1), history });

    expect(request.history).toHaveLength(6);
    expect(request.history.every((turn) => turn.content.length === 300)).toBe(true);
  });

  it("没有当前板时画布回落到 Full HD 且不带 board", () => {
    const request = buildDashboardDesignRequest({ brief: "新建", data: dataOf(1), history: [] });
    expect(request.canvas).toEqual({ width: 1920, height: 1080 });
    expect(request.board).toBeUndefined();
  });

  it("带上当前板时画布取当前画布", () => {
    const schema = boardOf([widget("bar-1", "bar")]);
    schema.canvas.width = 2560;
    schema.canvas.height = 1440;
    const request = buildDashboardDesignRequest({ brief: "改一下", schema, data: dataOf(1), history: [] });

    expect(request.canvas).toEqual({ width: 2560, height: 1440 });
    expect(request.board?.widgets).toHaveLength(1);
  });

  it("序列化超预算时先丢样本行", () => {
    const bulky = output(
      "bulky",
      [column("c-note", "note", "备注")],
      [{ note: "詳".repeat(80_000) }]
    );
    const item = asset("asset-bulky", "长文本资产", [bulky]);
    const request = buildDashboardDesignRequest({
      brief: "试试",
      data: { [item.id]: { asset: item, execution: execution(item, [bulky]) } },
      history: [{ role: "user", content: "上一轮" }]
    });

    expect(request.assets[0].outputs[0].sampleRows).toEqual([]);
    expect(request.history).toHaveLength(1);
    expect(JSON.stringify(request).length).toBeLessThanOrEqual(60_000);
  });

  it("回答引用的列在第二十四列之外时顶替最后一列留下", () => {
    const columns = Array.from({ length: 30 }, (_, index) => favoriteColumn(`Wide.metric${index}`, `指标${index}`, "number"));
    const wide = favoriteOutput("output_001", columns, [
      Object.fromEntries(columns.map((item, index) => [item.key, 1_000 + index + 0.25]))
    ]);
    const item = withAnswer(favoriteAsset("asset-wide", "善治第二十九项指标", [wide]), "第二十九项指标为 1,029.25。");
    const request = buildDashboardDesignRequest({
      brief: "试试",
      data: { [item.id]: { asset: item, execution: execution(item, [wide]) } },
      history: []
    });
    const summary = request.assets[0]!.outputs[0]!;

    expect(summary.answerMetricKey).toBe("Wide.metric29");
    expect(summary.columns).toHaveLength(24);
    expect(summary.columns.map((column) => column.key)).toEqual([
      ...columns.slice(0, 23).map((column) => column.key),
      "Wide.metric29"
    ]);
    expect(Object.keys(summary.sampleRows[0]!)).toContain("Wide.metric29");
  });

  it("丢完样本行仍超预算时再丢历史", () => {
    const request = buildDashboardDesignRequest({
      brief: "试试",
      data: dataOf(8, 6, 24),
      history: [{ role: "user", content: "上一轮" }]
    });

    expect(request.assets[0].outputs[0].sampleRows).toEqual([]);
    expect(request.history).toEqual([]);
  });

  describe("带回答原文时的裁剪顺序：样本行 → 历史 → 回答", () => {
    const answered = [
      withAnswer(salesRecheckAsset, SALES_ANSWER),
      withAnswer(salesDetailAsset, SALES_ANSWER),
      withAnswer(customerRankingAsset, RANKING_ANSWER)
    ];
    const answeredData: DashboardDesignAssetData = Object.fromEntries(
      answered.map((item) => [item.id, { asset: item, execution: favoriteExecution(item) }])
    );
    const history = [{ role: "user" as const, content: "上一轮" }, { role: "assistant" as const, content: "已按区域对比编排" }];
    const sizeOf = (request: DashboardDesignRequest) => JSON.stringify(request).length;
    const withoutSamples = (request: DashboardDesignRequest): DashboardDesignRequest => ({
      ...request,
      assets: request.assets.map((item) => ({
        ...item,
        outputs: item.outputs.map((summary) => ({ ...summary, sampleRows: [] }))
      }))
    });
    // brief 不参与裁剪、也不需要转义：用它把请求体垫到预算线上下，逐级验证每一档刚好够用时就停手。
    const base = buildDashboardDesignRequest({ brief: "", data: answeredData, history });
    const build = (padding: number) => buildDashboardDesignRequest({
      brief: "垫".repeat(padding),
      data: answeredData,
      history
    });
    const answersOf = (request: DashboardDesignRequest) => request.assets.map((item) => item.answer);
    const evidenceOf = (request: DashboardDesignRequest) =>
      request.assets.map((item) => [item.outputs[0]?.answerMetricKey, item.outputs[0]?.answerValueMode]);

    it("丢了样本行就够时，历史与回答都留着", () => {
      const request = build(60_000 - sizeOf(withoutSamples(base)));

      expect(sizeOf(request)).toBe(60_000);
      expect(request.assets.every((item) => item.outputs.every((summary) => summary.sampleRows.length === 0))).toBe(true);
      expect(request.history).toEqual(history);
      expect(answersOf(request).every(Boolean)).toBe(true);
    });

    it("再丢历史就够时，回答仍然留着", () => {
      const request = build(60_000 - sizeOf({ ...withoutSamples(base), history: [] }));

      expect(sizeOf(request)).toBe(60_000);
      expect(request.history).toEqual([]);
      expect(answersOf(request)).toEqual(answersOf(base));
    });

    it("丢完样本行和历史仍超预算时最后丢回答，结构化证据保留", () => {
      const request = build(60_000 - sizeOf({ ...withoutSamples(base), history: [] }) + 1);

      expect(sizeOf(request)).toBeLessThanOrEqual(60_000);
      expect(request.history).toEqual([]);
      expect(answersOf(request)).toEqual([undefined, undefined, undefined]);
      expect(request.assets.map((item) => Object.keys(item))).toEqual(
        Array(3).fill(["assetId", "name", "question", "outputs"])
      );
      expect(evidenceOf(request)).toEqual(evidenceOf(base));
      expect(evidenceOf(base)).toEqual([
        ["ProjectSign.signAmount", undefined],
        ["ProjectSign.signAmount", "sum"],
        ["ProjectSign.signAmount", undefined]
      ]);
    });
  });
});
