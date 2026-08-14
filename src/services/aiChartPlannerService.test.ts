import { describe, expect, it, vi } from "vitest";
import type { DataHubTableResult } from "@/types/dataHub";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  createAiChartPlanRequestSummary,
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
