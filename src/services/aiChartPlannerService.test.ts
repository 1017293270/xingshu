import { describe, expect, it, vi } from "vitest";
import type { DataHubTableResult } from "@/types/dataHub";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  createAiChartPlanRequestSummary,
  extractAnswerRankingList,
  planAiChart,
  resolveAiChartTables
} from "./aiChartPlannerService";

function table(columns: DataHubTableResult["columns"], rows: Record<string, unknown>[]): DataHubTableResult {
  return {
    columns,
    rows,
    totalRows: rows.length,
    source: "cube",
    tableIndex: 0
  };
}

describe("aiChartPlannerService", () => {
  it("rejects single scalar results before calling AI", async () => {
    const dataHubPlanner = vi.fn();
    const result = await planAiChart(
      {
        question: "咨询有多少条",
        tables: [
          table([{ key: "count", title: "咨询数", type: "number" }], [{ count: 716 }])
        ]
      },
      { dataHubPlanner }
    );

    expect(result).toMatchObject({
      chartable: false,
      reason: "结果只有一个具体数值，不适合生成图表。"
    });
    expect(dataHubPlanner).not.toHaveBeenCalled();
  });

  it("asks AI to chart a single-bucket categorical distribution", async () => {
    const dataHubPlanner = vi.fn(async () => ({
      chartable: true,
      reason: "单一记录类型仍可展示分布。",
      chartType: "bar" as const,
      allowedTypes: ["bar" as const],
      title: "事件记录类型分布",
      tableIndex: 0,
      dimensionKey: "recordType",
      metricKeys: ["count"]
    }));

    const result = await planAiChart(
      {
        question: "昨天的事件分布",
        tables: [
          table(
            [
              { key: "recordType", title: "事件记录类型" },
              { key: "count", title: "记录数", type: "number" }
            ],
            [{ recordType: "ISSUE", count: 6 }]
          )
        ]
      },
      { dataHubPlanner }
    );

    expect(dataHubPlanner).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ chartable: true, dimensionKey: "recordType" });
  });

  it("summarizes only schema, samples and counts for AI", () => {
    const summary = createAiChartPlanRequestSummary({
      question: "每个收入人群占比多少",
      tables: [
        table(
          [
            { key: "income_group", title: "收入人群" },
            { key: "ratio", title: "占比", type: "number" }
          ],
          [
            { income_group: "低收入", ratio: 0.25 },
            { income_group: "中收入", ratio: 0.5 },
            { income_group: "高收入", ratio: 0.25 },
            { income_group: "超高收入", ratio: 0.01 }
          ]
        )
      ]
    });

    expect(summary.tables[0].sampleRows).toHaveLength(3);
    expect(summary.tables[0]).toMatchObject({ totalRows: 4 });
    expect(summary.tables[0].columns).toEqual([
      { key: "income_group", title: "收入人群", type: "dimension" },
      { key: "ratio", title: "占比", type: "number" }
    ]);
  });

  it("limits AI chart planning to eight tables while retaining a chartable result", () => {
    const scalarTables = Array.from({ length: 8 }, (_, index) => ({
      ...table([{ key: "count", title: "记录数", type: "number" }], [{ count: index + 1 }]),
      tableIndex: index
    }));
    const chartableTable = {
      ...table(
        [
          { key: "hour", title: "小时" },
          { key: "count", title: "记录数", type: "number" }
        ],
        [
          { hour: "10:00", count: 2 },
          { hour: "11:00", count: 1 }
        ]
      ),
      tableIndex: 8
    };

    const summary = createAiChartPlanRequestSummary({
      question: "昨天的事件分布",
      tables: [...scalarTables, chartableTable]
    });

    expect(summary.tables).toHaveLength(8);
    expect(summary.tables.some((candidate) => candidate.tableIndex === 8)).toBe(true);
  });

  it("uses AI judgment to build pie chart options for category ratios", async () => {
    const dataTable = table(
      [
        { key: "income_group", title: "收入人群" },
        { key: "ratio", title: "占比", type: "number" }
      ],
      [
        { income_group: "低收入", ratio: 25 },
        { income_group: "中收入", ratio: 50 },
        { income_group: "高收入", ratio: 25 }
      ]
    );
    const dataHubPlanner = vi.fn(async () => ({
      chartable: true,
      reason: "包含分类维度和占比指标，适合饼图。",
      chartType: "pie" as const,
      allowedTypes: ["pie" as const, "bar" as const],
      title: "收入人群占比",
      tableIndex: 0,
      dimensionKey: "income_group",
      metricKeys: ["ratio"]
    }));

    const plan = await planAiChart(
      { question: "每个收入人群占比多少", tables: [dataTable] },
      { dataHubPlanner }
    );
    const spec = buildGeneratedChartSpec(plan, [dataTable]);
    const option = buildGeneratedChartOption(spec!, "pie");

    expect(plan).toMatchObject({ chartable: true, chartType: "pie" });
    expect(spec).toMatchObject({ title: "收入人群占比", allowedTypes: ["pie", "bar"] });
    expect(option.series).toEqual([
      expect.objectContaining({
        type: "pie",
        data: [
          { name: "低收入", value: 25 },
          { name: "中收入", value: 50 },
          { name: "高收入", value: 25 }
        ]
      })
    ]);
  });

  it("uses the AI-selected table index when multiple tables share field names", async () => {
    const firstTable = table(
      [
        { key: "name", title: "项目名称" },
        { key: "count", title: "记录数", type: "number" }
      ],
      [
        { name: "演示账号", count: 718 },
        { name: "六角井社区", count: 264 }
      ]
    );
    const secondTable = {
      ...table(
        [
          { key: "name", title: "咨询类型" },
          { key: "count", title: "记录数", type: "number" }
        ],
        [
          { name: "物业咨询", count: 18 },
          { name: "民生咨询", count: 12 }
        ]
      ),
      tableIndex: 1
    };

    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "第二张表包含咨询类型分布。",
        chartType: "bar",
        allowedTypes: ["bar"],
        title: "咨询类型分布",
        tableIndex: 1,
        dimensionKey: "name",
        metricKeys: ["count"]
      },
      [firstTable, secondTable]
    );

    expect(spec).toMatchObject({
      title: "咨询类型分布",
      tableIndex: 1,
      tableTitle: "结果表 2"
    });
    expect(buildGeneratedChartOption(spec!).series).toEqual([
      expect.objectContaining({
        data: [18, 12]
      })
    ]);
  });

  it("uses a Chinese legend label for qualified DataHub metric fields", () => {
    const dataTable = table(
      [
        { key: "WechatyProjectInfo.projectName", title: "WechatyProjectInfo.projectName" },
        { key: "WechatyEventRecord.count", title: "WechatyEventRecord.count", type: "number" }
      ],
      [
        { "WechatyProjectInfo.projectName": "红星社区", "WechatyEventRecord.count": 1192 },
        { "WechatyProjectInfo.projectName": "六角井社区", "WechatyEventRecord.count": 816 }
      ]
    );
    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "包含社区和事件记录数量",
        chartType: "bar",
        allowedTypes: ["bar"],
        title: "社区事件数",
        dimensionKey: "WechatyProjectInfo.projectName",
        metricKeys: ["WechatyEventRecord.count"]
      },
      [dataTable]
    );
    const series = buildGeneratedChartOption(spec!).series as Array<{ name?: string }>;

    expect(series[0]?.name).toBe("事件记录数");
  });

  it("preserves missing metrics instead of inventing zero values", () => {
    const dataTable = table(
      [
        { key: "category", title: "分类" },
        { key: "value", title: "金额", type: "number" }
      ],
      [
        { category: "A", value: null },
        { category: "B", value: "not-a-number" },
        { category: "C", value: 12 }
      ]
    );
    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "包含分类和金额",
        chartType: "bar",
        allowedTypes: ["bar", "pie"],
        title: "分类金额",
        dimensionKey: "category",
        metricKeys: ["value"]
      },
      [dataTable]
    );

    const barSeries = buildGeneratedChartOption(spec!, "bar").series as Array<{ data?: unknown[] }>;
    const pieSeries = buildGeneratedChartOption(spec!, "pie").series as Array<{
      data?: Array<{ name: string; value: number }>;
    }>;

    expect(barSeries[0]?.data).toEqual([null, null, 12]);
    expect(pieSeries[0]?.data).toEqual([{ name: "C", value: 12 }]);
  });

  it.each([
    [
      "missing",
      [
        { category: "A", value: null },
        { category: "B", value: undefined },
        { category: "C", value: "" }
      ]
    ],
    [
      "invalid",
      [
        { category: "A", value: "not-a-number" },
        { category: "B", value: Number.NaN },
        { category: "C", value: Number.POSITIVE_INFINITY }
      ]
    ]
  ])("rejects chart specs when every selected metric value is %s", (_case, rows) => {
    const dataTable = table(
      [
        { key: "category", title: "分类" },
        { key: "value", title: "金额", type: "number" }
      ],
      rows
    );

    expect(
      buildGeneratedChartSpec(
        {
          chartable: true,
          reason: "包含分类和金额",
          chartType: "bar",
          allowedTypes: ["bar", "pie"],
          title: "分类金额",
          dimensionKey: "category",
          metricKeys: ["value"]
        },
        [dataTable]
      )
    ).toBeNull();
  });

  it("falls back to a local chart plan when AI returns truncated JSON for multiple tables", async () => {
    const firstTable = table(
      [
        { key: "count", title: "记录数", type: "number" },
        { key: "project_name", title: "项目名称表" }
      ],
      [
        { count: 718, project_name: "演示账号" },
        { count: 321, project_name: "大连甘小警" },
        { count: 264, project_name: "六角井社区" }
      ]
    );
    const secondTable = {
      ...table(
        [
          { key: "count", title: "记录数", type: "number" },
          { key: "created_at", title: "创建日期", type: "time" }
        ],
        [
          { count: 10, created_at: "2025-04-01T00:00:00.000" },
          { count: 14, created_at: "2025-05-01T00:00:00.000" }
        ]
      ),
      tableIndex: 1
    };
    const dataHubPlanner = vi.fn(async () => {
      throw new Error("DataHub 模型返回的图表规划无效");
    });

    const plan = await planAiChart(
      { question: "这里有两个结果表，生成图表", tables: [firstTable, secondTable] },
      { dataHubPlanner }
    );
    const spec = buildGeneratedChartSpec(plan, [firstTable, secondTable]);

    expect(plan).toMatchObject({
      chartable: true,
      chartType: "bar",
      tableIndex: 0,
      dimensionKey: "project_name",
      metricKeys: ["count"]
    });
    expect(plan.reason).toContain("本地规则");
    expect(spec).toMatchObject({ title: "项目名称分布", tableTitle: "结果表 1" });
  });

  it("falls back to not chartable when AI references missing fields", async () => {
    const dataTable = table(
      [
        { key: "community", title: "社区" },
        { key: "count", title: "咨询数", type: "number" }
      ],
      [{ community: "六角井社区", count: 262 }]
    );

    expect(
      buildGeneratedChartSpec(
        {
          chartable: true,
          reason: "AI 返回了不存在的字段。",
          chartType: "bar",
          allowedTypes: ["bar"],
          title: "错误字段",
          dimensionKey: "missing",
          metricKeys: ["count"]
        },
        [dataTable]
      )
    ).toEqual(null);
  });

  it("drops empty and total buckets so the chart matches the ranking rows", () => {
    const rankingTable = table(
      [
        { key: "problem_type", title: "问题类型" },
        { key: "count", title: "咨询数量", type: "number" }
      ],
      [
        { problem_type: "", count: 3642 },
        { problem_type: "合计", count: 3766 },
        { problem_type: "身份证办理/补办/换领", count: 493 },
        { problem_type: "居住证办理/续签/立等可取", count: 492 },
        { problem_type: "医保参保/缴费/报销/异地备案", count: 174 }
      ]
    );

    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "问题类型咨询量排行",
        chartType: "bar",
        allowedTypes: ["bar"],
        title: "问题类型咨询数量排行",
        tableIndex: 0,
        dimensionKey: "problem_type",
        metricKeys: ["count"]
      },
      [rankingTable]
    );
    const option = buildGeneratedChartOption(spec!, "bar");
    const series = option.series as Array<{ data?: unknown[] }>;
    const xAxis = option.xAxis as { data?: unknown[] };

    expect(xAxis.data).toEqual([
      "身份证办理/补办/换领",
      "居住证办理/续签/立等可取",
      "医保参保/缴费/报销/异地备案"
    ]);
    expect(series[0]?.data).toEqual([493, 492, 174]);
  });

  it("prefers a compact ranking table over an empty-dominated raw category table", async () => {
    const rawTypeTable = table(
      [
        { key: "consult_type", title: "咨询类型" },
        { key: "count", title: "咨询记录数", type: "number" }
      ],
      [
        { consult_type: "", count: 3642 },
        ...Array.from({ length: 26 }, (_, index) => ({
          consult_type: `类型${index + 1}`,
          count: index === 0 ? 48 : 3
        }))
      ]
    );
    const rankingTable = {
      ...table(
        [
          { key: "rank", title: "排名", type: "number" },
          { key: "problem_type", title: "问题类型" },
          { key: "count", title: "咨询数量", type: "number" },
          { key: "ratio", title: "占比", type: "number" }
        ],
        [
          { rank: 1, problem_type: "身份证办理/补办/换领", count: 493, ratio: 13.09 },
          { rank: 2, problem_type: "居住证办理/续签/立等可取", count: 492, ratio: 13.06 },
          { rank: 3, problem_type: "医保参保/缴费/报销/异地备案", count: 174, ratio: 4.62 }
        ]
      ),
      tableIndex: 1
    };
    const dataHubPlanner = vi.fn(async () => {
      throw new Error("DataHub 模型返回的图表规划无效");
    });

    const plan = await planAiChart(
      {
        question: "咨询量最高的问题类型 TOP3",
        tables: [rawTypeTable, rankingTable]
      },
      { dataHubPlanner }
    );
    const spec = buildGeneratedChartSpec(plan, [rawTypeTable, rankingTable]);
    const option = buildGeneratedChartOption(spec!, "bar");
    const series = option.series as Array<{ data?: unknown[] }>;

    expect(plan.tableIndex).toBe(1);
    expect(plan.dimensionKey).toBe("problem_type");
    expect(plan.metricKeys).toEqual(["count"]);
    expect(series[0]?.data).toEqual([493, 492, 174]);
  });

  it("overrides an AI plan that charts the empty-dominated raw table", () => {
    const rawTypeTable = table(
      [
        { key: "consult_type", title: "咨询类型" },
        { key: "count", title: "咨询记录数", type: "number" }
      ],
      [
        { consult_type: "", count: 3642 },
        { consult_type: "窗口咨询", count: 48 },
        { consult_type: "电话咨询", count: 21 }
      ]
    );
    const rankingTable = {
      ...table(
        [
          { key: "problem_type", title: "问题类型" },
          { key: "count", title: "咨询数量", type: "number" }
        ],
        [
          { problem_type: "身份证办理/补办/换领", count: 493 },
          { problem_type: "居住证办理/续签/立等可取", count: 492 },
          { problem_type: "医保参保/缴费/报销/异地备案", count: 174 }
        ]
      ),
      tableIndex: 1
    };

    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "结果表 1 包含 27 个咨询类型及其记录数，适合用柱状图对比各类型的咨询量。",
        chartType: "bar",
        allowedTypes: ["bar"],
        title: "咨询类型咨询记录数排行",
        tableIndex: 0,
        dimensionKey: "consult_type",
        metricKeys: ["count"]
      },
      [rawTypeTable, rankingTable]
    );
    const option = buildGeneratedChartOption(spec!, "bar");
    const series = option.series as Array<{ data?: unknown[] }>;

    expect(spec).toMatchObject({
      tableIndex: 1,
      dimensionKey: "problem_type",
      metricKeys: ["count"]
    });
    expect(series[0]?.data).toEqual([493, 492, 174]);
  });

  it("charts the answer ranking when the only SQL table is empty-dominated", async () => {
    const rawTypeTable = table(
      [
        { key: "consult_type", title: "咨询类型" },
        { key: "count", title: "咨询记录数", type: "number" }
      ],
      [
        { consult_type: "", count: 3642 },
        ...Array.from({ length: 26 }, (_, index) => ({
          consult_type: `类型${index + 1}`,
          count: 4
        }))
      ]
    );
    const dataHubPlanner = vi.fn(async () => {
      throw new Error("DataHub 模型返回的图表规划无效");
    });

    const plan = await planAiChart(
      {
        question: "咨询量最高的问题类型 TOP3",
        tables: [rawTypeTable],
        answer: [
          "#### TOP3 问题类型（按大类分类 + 答案内容归类）",
          "",
          "| 排名 | 问题类型 | 咨询数量 | 占比 |",
          "| --- | --- | --- | --- |",
          "| 1 | 身份证办理/补办/换领 | 493 | 13.09% |",
          "| 2 | 居住证办理/续签/立等可取 | 492 | 13.06% |",
          "| 3 | 医保参保/缴费/报销/异地备案 | 174 | 4.62% |",
          "",
          "口径说明：咨询类型字段空值率约 96.7%。"
        ].join("\n")
      },
      { dataHubPlanner }
    );
    const spec = buildGeneratedChartSpec(plan, resolveAiChartTables({
      question: "咨询量最高的问题类型 TOP3",
      tables: [rawTypeTable],
      answer: [
        "#### TOP3 问题类型（按大类分类 + 答案内容归类）",
        "",
        "| 排名 | 问题类型 | 咨询数量 | 占比 |",
        "| --- | --- | --- | --- |",
        "| 1 | 身份证办理/补办/换领 | 493 | 13.09% |",
        "| 2 | 居住证办理/续签/立等可取 | 492 | 13.06% |",
        "| 3 | 医保参保/缴费/报销/异地备案 | 174 | 4.62% |"
      ].join("\n")
    }));
    const option = buildGeneratedChartOption(spec!, "bar");
    const series = option.series as Array<{ data?: unknown[] }>;

    expect(plan.dimensionKey).toBe("问题类型");
    expect(series[0]?.data).toEqual([493, 492, 174]);
  });

  it("charts the answer ranking when no result table reproduces the answer numbers", () => {
    const question = "与善治签合同数量 Top3 公司";
    const answer = [
      "与善治签合同数量 Top3 公司",
      "",
      "- **广州思迈特软件有限公司（13 份）**：其中善治作为甲方的有 6 份，作为乙方的有 7 份。",
      "- **杭州海康威视科技有限公司（5 份）**：5 份合同中善治均为甲方。",
      "- **成都卓一信息技术有限公司（4 份）**：4 份合同中善治均为乙方。"
    ].join("\n");
    const partyBTable = table(
      [
        { key: "party_b", title: "乙方单位名称" },
        { key: "count", title: "记录数", type: "number" }
      ],
      [
        { party_b: "广州思迈特软件有限公司", count: 6 },
        { party_b: "杭州海康威视科技有限公司", count: 5 },
        { party_b: "云南蚁象网络科技有限公司", count: 3 }
      ]
    );
    const partyATable = {
      ...table(
        [
          { key: "party_a", title: "甲方单位名称" },
          { key: "count", title: "记录数", type: "number" }
        ],
        [
          { party_a: "广州思迈特软件有限公司", count: 7 },
          { party_a: "成都卓一信息技术有限公司", count: 4 }
        ]
      ),
      tableIndex: 1
    };
    const chartTables = resolveAiChartTables({ question, tables: [partyBTable, partyATable], answer });

    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "Table 0 包含 3 行数据，每行有维度（乙方单位名称）和数值（记录数）。",
        chartType: "bar",
        allowedTypes: ["bar"],
        title: "与善治签合同数量 Top3 公司",
        tableIndex: 0,
        dimensionKey: "party_b",
        metricKeys: ["count"]
      },
      chartTables
    );
    const option = buildGeneratedChartOption(spec!, "bar");
    const series = option.series as Array<{ data?: unknown[] }>;
    const xAxis = option.xAxis as { data?: unknown[] };

    expect(spec).toMatchObject({
      title: "与善治签合同数量 Top3 公司",
      reason: "图表按回答中的数值绘制，与正文口径一致。",
      tableTitle: "回答中的排名",
      dimensionKey: "name",
      metricKeys: ["value"],
      allowedTypes: ["bar", "pie"]
    });
    expect(xAxis.data).toEqual([
      "广州思迈特软件有限公司",
      "杭州海康威视科技有限公司",
      "成都卓一信息技术有限公司"
    ]);
    expect(series[0]?.data).toEqual([13, 5, 4]);
    expect(spec?.table.columns).toEqual([
      { key: "name", title: "公司", type: "dimension" },
      { key: "value", title: "数量（份）", type: "number" }
    ]);
  });

  it("keeps the result table when the answer ranking reproduces its values", () => {
    const question = "咨询类型分布";
    const answer = [
      "咨询类型分布",
      "",
      "- 物业咨询：18 条",
      "- 民生咨询：12 条"
    ].join("\n");
    const consultTable = table(
      [
        { key: "consult_type", title: "咨询类型" },
        { key: "count", title: "记录数", type: "number" }
      ],
      [
        { consult_type: "物业咨询", count: 18 },
        { consult_type: "民生咨询", count: 12 }
      ]
    );
    const chartTables = resolveAiChartTables({ question, tables: [consultTable], answer });

    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "包含咨询类型和记录数，适合柱状图。",
        chartType: "bar",
        allowedTypes: ["bar"],
        title: "咨询类型分布",
        tableIndex: 0,
        dimensionKey: "consult_type",
        metricKeys: ["count"]
      },
      chartTables
    );

    expect(spec).toMatchObject({
      reason: "包含咨询类型和记录数，适合柱状图。",
      tableIndex: 0,
      tableTitle: "结果表 1",
      dimensionKey: "consult_type",
      metricKeys: ["count"]
    });
  });

  it("charts the result table that reproduces the answer ranking instead of the answer copy", () => {
    const question = "问题类型咨询量 Top2";
    const answer = ["- 身份证办理：493 条", "- 居住证办理：492 条"].join("\n");
    const monthlyTable = table(
      [
        { key: "month", title: "月份", type: "time" },
        { key: "count", title: "记录数", type: "number" }
      ],
      [
        { month: "2025-04", count: 10 },
        { month: "2025-05", count: 14 }
      ]
    );
    const rankingTable = {
      ...table(
        [
          { key: "problem_type", title: "问题类型" },
          { key: "count", title: "咨询数量", type: "number" }
        ],
        [
          { problem_type: "身份证办理/补办/换领", count: 493 },
          { problem_type: "居住证办理/续签/立等可取", count: 492 }
        ]
      ),
      tableIndex: 1
    };
    const chartTables = resolveAiChartTables({ question, tables: [monthlyTable, rankingTable], answer });

    const spec = buildGeneratedChartSpec(
      {
        chartable: true,
        reason: "按月份展示趋势。",
        chartType: "line",
        allowedTypes: ["line"],
        title: "问题类型咨询量 Top2",
        tableIndex: 0,
        dimensionKey: "month",
        metricKeys: ["count"]
      },
      chartTables
    );
    const series = buildGeneratedChartOption(spec!, "bar").series as Array<{ data?: unknown[] }>;

    expect(spec).toMatchObject({
      chartType: "bar",
      reason: "图表按回答中的数值绘制，与正文口径一致。",
      tableIndex: 1,
      tableTitle: "结果表 2",
      dimensionKey: "problem_type",
      metricKeys: ["count"]
    });
    expect(series[0]?.data).toEqual([493, 492]);
  });

  it.each([
    [
      "numbered amounts",
      ["合同金额 Top2 单位", "1. 甲单位：1,200.5 万元", "2. 乙单位：980 万元"],
      {
        columns: [
          { key: "name", title: "单位", type: "dimension" },
          { key: "value", title: "金额（万元）", type: "number" }
        ],
        rows: [
          { name: "甲单位", value: 1200.5 },
          { name: "乙单位", value: 980 }
        ],
        groupLabel: "合同金额 Top2 单位"
      }
    ],
    [
      "bold percentages",
      ["区域分布", "- **华东（45.5%）**", "- **华南（30%）**"],
      {
        columns: [
          { key: "name", title: "地区", type: "dimension" },
          { key: "value", title: "占比（%）", type: "number" }
        ],
        rows: [
          { name: "华东", value: 45.5 },
          { name: "华南", value: 30 }
        ],
        groupLabel: "区域分布"
      }
    ],
    [
      "bare lines",
      ["重点客户", "**小治科技**（12 家）", "Senrun 9 家"],
      {
        columns: [
          { key: "name", title: "名称", type: "dimension" },
          { key: "value", title: "数量（家）", type: "number" }
        ],
        rows: [
          { name: "小治科技", value: 12 },
          { name: "Senrun", value: 9 }
        ],
        groupLabel: "重点客户"
      }
    ]
  ])("parses answer rankings written as %s", (_case, lines, expected) => {
    expect(extractAnswerRankingList(lines.join("\n"))).toEqual([
      { ...expected, totalRows: expected.rows.length, source: "answer" }
    ]);
  });

  it("ignores answer lists that mix units, repeat names or only state one item", () => {
    expect(extractAnswerRankingList("- 甲公司：13 份\n- 乙公司：5 家")).toEqual([]);
    expect(extractAnswerRankingList("- 甲公司：13 份\n- 甲公司：5 份")).toEqual([]);
    expect(extractAnswerRankingList("- **广州思迈特软件有限公司（13 份）**：其中 6 份为甲方。")).toEqual([]);
    expect(extractAnswerRankingList("- 统计口径：按签署日期\n- 样本量：716 条")).toEqual([]);
  });

  it("keeps the answer ranking when the answer restates a single company", () => {
    const question = "与善治签合同最多的公司";
    const answer = "- **广州思迈特软件有限公司（13 份）**：其中善治作为甲方的有 6 份。";
    const contractTable = table(
      [
        { key: "party_b", title: "乙方单位名称" },
        { key: "count", title: "记录数", type: "number" }
      ],
      [
        { party_b: "广州思迈特软件有限公司", count: 6 },
        { party_b: "杭州海康威视科技有限公司", count: 5 }
      ]
    );

    expect(resolveAiChartTables({ question, tables: [contractTable], answer })).toEqual([contractTable]);
  });

  it("keeps one answer ranking table when the result tables exceed the AI planning limit", () => {
    const sqlTables = Array.from({ length: 9 }, (_, index) => ({
      ...table(
        [
          { key: "name", title: "项目名称" },
          { key: "count", title: "记录数", type: "number" }
        ],
        [
          { name: `项目${index + 1}`, count: index + 2 },
          { name: `项目${index + 1}-B`, count: index + 1 }
        ]
      ),
      tableIndex: index
    }));

    const summary = createAiChartPlanRequestSummary({
      question: "各口径统计",
      tables: sqlTables,
      answer: "- 甲公司：13 份\n- 乙公司：5 份"
    });

    expect(summary.tables).toHaveLength(8);
    expect(summary.tables.filter((candidate) => candidate.title.includes("回答中的排名"))).toHaveLength(1);
  });

  it("includes the dominant metric row in the AI sample instead of only the first three rows", () => {
    const summary = createAiChartPlanRequestSummary({
      question: "咨询类型分布",
      tables: [
        table(
          [
            { key: "consult_type", title: "咨询类型" },
            { key: "count", title: "咨询记录数", type: "number" }
          ],
          [
            { consult_type: "窗口咨询", count: 18 },
            { consult_type: "电话咨询", count: 12 },
            { consult_type: "网上咨询", count: 9 },
            { consult_type: "", count: 3642 }
          ]
        )
      ]
    });

    expect(summary.tables[0].sampleRows).toEqual(expect.arrayContaining([
      { consult_type: "", count: 3642 }
    ]));
  });
});
