import { describe, expect, it } from "vitest";
import type { DataHubAskTurn, DataHubTableResult } from "@/types/dataHub";
import {
  createBlankDashboard,
  createDashboardDraftFromAskTurn,
  createDashboardDraftFromTables,
  replanLegacyDashboardDraft
} from "./dashboardGenerationService";

function createIdFactory() {
  let index = 0;
  return (prefix: string) => `${prefix}-${++index}`;
}

function table(
  columns: DataHubTableResult["columns"],
  rows: DataHubTableResult["rows"],
  groupLabel = "经营数据"
): DataHubTableResult {
  return {
    columns,
    rows,
    totalRows: rows.length,
    groupLabel,
    source: "cube",
    tableIndex: 0
  };
}

function expectNoOverlaps(
  widgets: Array<{ position: { x: number; y: number; w: number; h: number } }>
) {
  for (let leftIndex = 0; leftIndex < widgets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < widgets.length; rightIndex += 1) {
      const left = widgets[leftIndex].position;
      const right = widgets[rightIndex].position;
      const overlaps =
        left.x < right.x + right.w &&
        left.x + left.w > right.x &&
        left.y < right.y + right.h &&
        left.y + left.h > right.y;

      expect(overlaps).toBe(false);
    }
  }
}

describe("dashboardGenerationService", () => {
  it("builds a validated multi-widget dashboard from time-series ask data", () => {
    const schema = createDashboardDraftFromTables(
      {
        question: "今年每月销售收入和订单量如何？",
        summary: "销售收入整体增长，六月达到阶段峰值。",
        tables: [
          table(
            [
              { key: "month", title: "月份", type: "date" },
              { key: "revenue", title: "销售收入（万元）", type: "decimal" },
              { key: "orders", title: "订单量", type: "integer" }
            ],
            [
              { month: "2026-01", revenue: 320, orders: 42 },
              { month: "2026-02", revenue: 410, orders: 49 },
              { month: "2026-03", revenue: 480, orders: 58 },
              { month: "2026-04", revenue: 530, orders: 63 },
              { month: "2026-05", revenue: 590, orders: 71 },
              { month: "2026-06", revenue: 680, orders: 79 }
            ],
            "月度经营趋势"
          )
        ],
        sourceQueryId: "query-2026-sales",
        spaceId: 7,
        dataMode: "live"
      },
      {
        idFactory: createIdFactory(),
        now: new Date("2026-07-10T08:00:00.000Z")
      }
    );

    expect(schema.title).toBe("今年每月销售收入和订单量");
    expect(schema.source).toMatchObject({
      kind: "ask-data",
      question: "今年每月销售收入和订单量如何？",
      queryId: "query-2026-sales",
      spaceId: 7
    });
    expect(Object.values(schema.dataBindings)[0]).toMatchObject({
      mode: "live",
      sourceQueryId: "query-2026-sales"
    });
    expect(schema.widgets.map((widget) => widget.type)).toEqual(
      expect.arrayContaining(["text", "metric", "line", "table"])
    );
    expect(schema.widgets.find((widget) => widget.type === "line")?.mapping).toMatchObject({
      dimensionKey: "month",
      metricKeys: ["revenue", "orders"]
    });
    expect(schema.canvas.rows).toBe(8);
    expect(schema.canvas).toMatchObject({ width: 1920, height: 1080 });
    expectNoOverlaps(schema.widgets);
  });

  it("uses KPI cards for scalar results and a composition chart for ratio data", () => {
    const schema = createDashboardDraftFromTables(
      {
        question: "客户结构和关键指标",
        tables: [
          table(
            [
              { key: "customer_type", title: "客户类型" },
              { key: "share", title: "占比（%）", type: "number" }
            ],
            [
              { customer_type: "企业客户", share: 75 },
              { customer_type: "中小客户", share: 15 },
              { customer_type: "个人客户", share: 10 }
            ],
            "客户结构"
          ),
          {
            ...table(
              [
                { key: "revenue", title: "总收入", type: "number" },
                { key: "customer_count", title: "客户数", type: "number" }
              ],
              [{ revenue: 28400, customer_count: 1280 }],
              "经营指标"
            ),
            tableIndex: 1
          }
        ]
      },
      { idFactory: createIdFactory(), now: new Date("2026-07-10T08:00:00.000Z") }
    );

    expect(schema.widgets.some((widget) => widget.type === "pie")).toBe(true);
    expect(schema.widgets.filter((widget) => widget.type === "metric")).toHaveLength(4);
    expectNoOverlaps(schema.widgets);
  });

  it("adapts a completed DataHub ask turn without coupling to its page", () => {
    const turn: DataHubAskTurn = {
      question: "各区域销售额",
      status: "done",
      assistantContent: "华东区域销售额领先。",
      infoMessages: [],
      routingEvents: [],
      reactSteps: [],
      toolCalls: [],
      toolResults: [{ toolName: "query", sql: "select secret from revenue" }],
      chartResults: [],
      tableResults: [
        table(
          [
            { key: "region", title: "区域" },
            { key: "sales", title: "销售额", type: "number" }
          ],
          [
            { region: "华东", sales: 6820 },
            { region: "华南", sales: 6120 }
          ]
        )
      ]
    };

    const schema = createDashboardDraftFromAskTurn(turn, {
      sourceQueryId: "ask-run-1",
      idFactory: createIdFactory(),
      now: new Date("2026-07-10T08:00:00.000Z")
    });

    expect(schema.source.question).toBe(turn.question);
    expect(JSON.stringify(schema)).not.toContain("select secret");
    expect(schema.widgets.some((widget) => widget.type === "bar")).toBe(true);
  });

  it("creates an honest blank canvas when no question result is available", () => {
    const schema = createBlankDashboard({
      title: "未命名大屏",
      idFactory: createIdFactory(),
      now: new Date("2026-07-10T08:00:00.000Z")
    });

    expect(schema.source.kind).toBe("blank");
    expect(schema.widgets).toEqual([]);
    expect(schema.dataBindings).toEqual({});
    expect(schema.canvas).toMatchObject({ width: 1920, height: 1080 });
  });

  it("keeps every ask-data binding while limiting the first screen to eight readable widgets", () => {
    const tables = Array.from({ length: 6 }, (_, index) => ({
      ...table(
        [
          { key: "month", title: "月份", type: "date" },
          { key: "value", title: `指标 ${index + 1}`, type: "number" }
        ],
        [
          { month: "2026-01", value: 10 + index },
          { month: "2026-02", value: 20 + index }
        ],
        `结果表 ${index + 1}`
      ),
      tableIndex: index
    }));

    const schema = createDashboardDraftFromTables(
      { question: "生成经营全景大屏", tables },
      { idFactory: createIdFactory(), now: new Date("2026-07-10T08:00:00.000Z") }
    );

    expect(Object.values(schema.dataBindings)).toHaveLength(6);
    expect(schema.widgets.length).toBeLessThanOrEqual(8);
    expect(schema.canvas.height).toBe(1080);
    expectNoOverlaps(schema.widgets);
  });

  it("turns a technical ranked result into a concise executive dashboard", () => {
    const schema = createDashboardDraftFromTables(
      {
        question: "统计一下咨询数排名前五的社区",
        summary:
          "咨询数排名前五的项目分别为：演示账号（720 次）、大连甘小馨（322 次）、六角井社区（264 次）。**六角井社区**约 145 件/月，后面还有很长的原始问数说明。",
        tables: [
          table(
            [
              { key: "consultation_count", title: "微信机器人咨询记录表 记录数", type: "number" },
              { key: "project_name", title: "微信机器人项目表 项目名称表" }
            ],
            [
              { consultation_count: 720, project_name: "演示账号" },
              { consultation_count: 322, project_name: "大连甘小馨" },
              { consultation_count: 264, project_name: "六角井社区" },
              { consultation_count: 191, project_name: "司马阅公司" },
              { consultation_count: 180, project_name: "葡萄井社区" }
            ],
            "结果表 1"
          ),
          {
            ...table(
              [
                { key: "month", title: "月份", type: "date" },
                { key: "count", title: "记录数", type: "number" }
              ],
              [
                { month: "1月", count: 42 },
                { month: "2月", count: 56 }
              ],
              "结果表 2"
            ),
            tableIndex: 1
          }
        ]
      },
      { idFactory: createIdFactory(), now: new Date("2026-07-10T08:00:00.000Z") }
    );

    expect(schema.title).toBe("社区咨询数 TOP 5");
    expect(schema.source.plannerVersion).toBe(2);
    expect(Object.values(schema.dataBindings)).toHaveLength(2);
    expect(Object.values(schema.dataBindings)[0]?.table.columns.map((column) => column.title)).toEqual([
      "社区",
      "咨询数"
    ]);
    expect(schema.widgets.filter((widget) => widget.type === "metric").map((widget) => widget.title)).toEqual([
      "最高咨询数",
      "咨询数合计",
      "平均咨询数"
    ]);
    expect(schema.widgets.find((widget) => widget.type === "bar")?.title).toBe("社区咨询数排行");
    expect(schema.widgets.find((widget) => widget.type === "table")?.title).toBe("社区明细");
    const insight = schema.widgets.find((widget) => widget.type === "text");
    expect(insight?.content).not.toContain("**");
    expect(insight?.content?.length).toBeLessThanOrEqual(90);
    expect(insight?.style.color).toBe("#0F2B50");
    expect(
      schema.widgets
        .filter((widget) => widget.style.background === "#FFFFFF")
        .every((widget) => widget.style.color === "#294469")
    ).toBe(true);
    expect(schema.widgets).toHaveLength(6);
    expect(schema.canvas.rows).toBe(8);
    expectNoOverlaps(schema.widgets);
  });

  it("replans only untouched first-generation ask-data drafts", () => {
    const legacySchema = createDashboardDraftFromTables(
      {
        question: "各区域销售额排名",
        tables: [
          table(
            [
              { key: "region", title: "区域" },
              { key: "sales", title: "销售额", type: "number" }
            ],
            [
              { region: "华东", sales: 680 },
              { region: "华南", sales: 520 }
            ],
            "结果表 1"
          )
        ]
      },
      { idFactory: createIdFactory(), now: new Date("2026-07-10T08:00:00.000Z") }
    );
    legacySchema.source.plannerVersion = 1;
    legacySchema.widgets = legacySchema.widgets.slice(0, 1);
    const legacyRecord = {
      id: legacySchema.id,
      status: "draft" as const,
      revision: 1,
      schema: legacySchema,
      createdAt: legacySchema.createdAt,
      updatedAt: legacySchema.updatedAt
    };

    const replanned = replanLegacyDashboardDraft(legacyRecord);

    expect(replanned).toMatchObject({
      id: legacyRecord.id,
      source: { plannerVersion: 2 },
      canvas: { rows: 8 }
    });
    expect(replanned?.widgets.map((widget) => widget.title)).toEqual(
      expect.arrayContaining(["最高销售额", "销售额合计", "平均销售额", "区域销售额排行", "区域明细"])
    );
    expect(replanLegacyDashboardDraft({ ...legacyRecord, revision: 2 })).toBeNull();
    expect(replanLegacyDashboardDraft({ ...legacyRecord, status: "published" })).toBeNull();
  });
});
