import { describe, expect, it, vi } from "vitest";
import type { DataHubTableResult } from "@/types/dataHub";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  createAiChartPlanRequestSummary,
  planAiChart
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
    const fetcher = vi.fn(async () => new Response());
    const result = await planAiChart(
      {
        question: "咨询有多少条",
        tables: [
          table([{ key: "count", title: "咨询数", type: "number" }], [{ count: 716 }])
        ]
      },
      {
        providerConfig: {
          provider: "minimax",
          baseUrl: "https://api.minimaxi.com/v1",
          apiKey: "key",
          model: "MiniMax-M3",
          temperature: 0.2
        },
        fetcher: fetcher as unknown as typeof fetch
      }
    );

    expect(result).toMatchObject({
      chartable: false,
      reason: "结果只有一个具体数值，不适合生成图表。"
    });
    expect(fetcher).not.toHaveBeenCalled();
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
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  chartable: true,
                  reason: "包含分类维度和占比指标，适合饼图。",
                  chartType: "pie",
                  allowedTypes: ["pie", "bar"],
                  title: "收入人群占比",
                  dimensionKey: "income_group",
                  metricKeys: ["ratio"]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const plan = await planAiChart(
      { question: "每个收入人群占比多少", tables: [dataTable] },
      {
        providerConfig: {
          provider: "minimax",
          baseUrl: "https://api.minimaxi.com/v1",
          apiKey: "key",
          model: "MiniMax-M3",
          temperature: 0.2
        },
        fetcher: fetcher as unknown as typeof fetch
      }
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
});
