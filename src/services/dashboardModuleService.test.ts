import { describe, expect, it } from "vitest";
import type {
  QueryAsset,
  QueryColumnDefinition,
  QueryExecution,
  QueryExecutionOutput
} from "@/types/analytics";
import type { DashboardSchema, DashboardWidgetType } from "@/types/dashboardStudio";
import { createBlankDashboard } from "./dashboardGenerationService";
import { appendQueryAssetChart, removeQueryAssetChart } from "./dashboardModuleService";

function createAsset(
  id: string,
  name: string,
  question: string,
  outputs: QueryExecutionOutput[] = []
): QueryAsset {
  const versionId = `${id}-v1`;
  return {
    id,
    name,
    originalQuestion: question,
    resolvedQuestion: question,
    datasourceId: 8,
    ownerUserId: 2,
    visibility: "PRIVATE",
    stableVersionId: versionId,
    status: "ACTIVE",
    stableVersion: {
      id: versionId,
      versionNo: 1,
      resolvedQuestion: question,
      engine: "CUBE",
      parameters: [],
      outputs: outputs.map((output) => ({
        outputKey: output.outputKey,
        label: output.outputKey,
        rowCount: output.totalRows,
        columns: output.columns
      })),
      schemaHash: `${id}-schema`,
      status: "VALIDATED",
      createdAt: "2026-07-23T00:00:00.000Z"
    },
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z"
  };
}

function column(
  columnId: string,
  key: string,
  label: string,
  type = "string"
): QueryColumnDefinition {
  return { columnId, key, label, type };
}

function output(
  outputKey: string,
  columns: QueryColumnDefinition[],
  rows: Record<string, unknown>[]
): QueryExecutionOutput {
  return {
    outputKey,
    columns,
    rows,
    totalRows: rows.length,
    updatedAt: "2026-07-23T08:00:00.000Z"
  };
}

function execution(asset: QueryAsset, outputs: QueryExecutionOutput[]): QueryExecution {
  return {
    id: `${asset.id}-execution`,
    assetId: asset.id,
    versionId: asset.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 24,
    createdAt: "2026-07-23T08:00:00.000Z",
    outputs
  };
}

function blankDashboard(title = "经营驾驶舱") {
  const blank = createBlankDashboard({ title, idFactory: (prefix) => `${prefix}-single-chart` });
  return { ...blank, description: "用户维护的看板描述" };
}

function expectNoOverlap(schema: DashboardSchema) {
  schema.widgets.forEach((left, leftIndex) => {
    schema.widgets.slice(leftIndex + 1).forEach((right) => {
      const separated = left.position.x + left.position.w <= right.position.x
        || right.position.x + right.position.w <= left.position.x
        || left.position.y + left.position.h <= right.position.y
        || right.position.y + right.position.h <= left.position.y;
      expect(separated).toBe(true);
    });
  });
}

describe("dashboardModuleService", () => {
  const inferenceCases: Array<{
    name: string;
    question: string;
    result: QueryExecutionOutput;
    expectedType: DashboardWidgetType;
  }> = [
    {
      name: "时间趋势",
      question: "今年每月收入趋势",
      result: output(
        "trend",
        [column("month-id", "month", "月份", "date"), column("revenue-id", "revenue", "收入", "number")],
        [{ month: "2026-01", revenue: 12 }, { month: "2026-02", revenue: 18 }]
      ),
      expectedType: "line"
    },
    {
      name: "分类对比",
      question: "各项目合同数量",
      result: output(
        "comparison",
        [column("project-id", "project", "项目"), column("count-id", "count", "合同数", "number")],
        [{ project: "甲", count: 12 }, { project: "乙", count: 8 }]
      ),
      expectedType: "bar"
    },
    {
      name: "结构占比",
      question: "各渠道收入占比",
      result: output(
        "composition",
        [column("channel-id", "channel", "渠道"), column("ratio-id", "ratio", "收入占比", "number")],
        [{ channel: "直销", ratio: 60 }, { channel: "代理", ratio: 40 }]
      ),
      expectedType: "pie"
    },
    {
      name: "单值指标",
      question: "本月销售额是多少",
      result: output(
        "metric",
        [column("amount-id", "amount", "销售额（万元）", "number")],
        [{ amount: 128 }]
      ),
      expectedType: "metric"
    },
    {
      name: "数量问答",
      question: "2023年有多少合同",
      result: output(
        "contract-count",
        [column("count-id", "count", "合同数量", "number")],
        [{ count: 24 }]
      ),
      expectedType: "metric"
    },
    {
      name: "明细表",
      question: "列出合同名称和客户",
      result: output(
        "detail",
        [column("contract-id", "contract", "合同名称"), column("customer-id", "customer", "客户")],
        [{ contract: "A 合同", customer: "甲公司" }, { contract: "B 合同", customer: "乙公司" }]
      ),
      expectedType: "table"
    },
    {
      name: "单行明细仍为表格",
      question: "列出合同金额明细",
      result: output(
        "single-detail",
        [
          column("contract-id", "contract", "合同名称"),
          column("amount-id", "amount", "合同金额", "number")
        ],
        [{ contract: "A 合同", amount: 120 }]
      ),
      expectedType: "table"
    },
    {
      name: "英文明细语义",
      question: "Contract details",
      result: output(
        "details",
        [
          column("contract-id", "contract", "Contract"),
          column("amount-id", "amount", "Amount", "number")
        ],
        [{ contract: "Contract A", amount: 120 }]
      ),
      expectedType: "table"
    },
    {
      name: "无语义且没有可绘制数值",
      question: "合同名称与客户",
      result: output(
        "contracts",
        [
          column("contract-id", "contract", "合同名称"),
          column("customer-id", "customer", "客户")
        ],
        [{ contract: "A 合同", customer: "甲公司" }]
      ),
      expectedType: "table"
    },
    {
      name: "包含数值列的合同明细",
      question: "2023年有哪些合同",
      result: output(
        "output_003",
        [
          column("count-id", "count", "记录数", "number"),
          column("contract-no-id", "contractNo", "合同编号"),
          column("contract-name-id", "contractName", "合同名称"),
          column("contract-year-id", "contractYear", "合同年份"),
          column("contract-amount-id", "contractAmount", "合同金额（万元）", "number")
        ],
        [
          {
            count: 1,
            contractNo: "XS-2023-001",
            contractName: "数据平台建设合同",
            contractYear: "2023年",
            contractAmount: 120
          },
          {
            count: 1,
            contractNo: "XS-2023-002",
            contractName: "智能分析服务合同",
            contractYear: "2023年",
            contractAmount: 86
          }
        ]
      ),
      expectedType: "table"
    }
  ];

  it.each(inferenceCases)("adds exactly one $expectedType widget for $name", ({ question, result, expectedType }) => {
    const asset = createAsset(`asset-${expectedType}`, `${question}收藏`, question, [result]);
    const added = appendQueryAssetChart(
      blankDashboard(),
      asset,
      execution(asset, [result]),
      result.outputKey
    );

    expect(added.schema.widgets).toHaveLength(1);
    expect(added.schema.widgets[0]?.type).toBe(expectedType);
    expect(added.schema.widgets[0]?.id).toBe(added.widgetId);
    expect(Object.values(added.schema.dataBindings)).toHaveLength(1);
    expect(Object.values(added.schema.modules ?? {})).toHaveLength(1);
    expect(added.schema.modules?.[added.moduleId]?.widgetIds).toEqual([added.widgetId]);
  });

  it("uses the selected aggregate output instead of forcing the parent detail question to a table", () => {
    const details = output(
      "contract-details",
      [
        column("contract-id", "contract", "合同名称"),
        column("amount-id", "amount", "合同金额", "number")
      ],
      [{ contract: "A 合同", amount: 120 }]
    );
    const yearlySummary = output(
      "yearly-summary",
      [
        column("year-id", "year", "年份", "date"),
        column("count-id", "count", "合同数量", "number")
      ],
      [{ year: "2022", count: 18 }, { year: "2023", count: 24 }]
    );
    const asset = createAsset(
      "asset-contract-outputs",
      "2023年有哪些合同",
      "查询 2023 年合同明细",
      [details, yearlySummary]
    );
    asset.stableVersion!.outputs[1]!.label = "年度汇总";

    const added = appendQueryAssetChart(
      blankDashboard(),
      asset,
      execution(asset, [details, yearlySummary]),
      yearlySummary.outputKey
    );

    expect(added.schema.widgets[0]?.type).toBe("line");
  });

  it("treats a selected TOP10 output as aggregate even when the parent question is detail-oriented", () => {
    const ranking = output(
      "top10",
      [
        column("project-id", "project", "项目"),
        column("count-id", "count", "合同数量", "number")
      ],
      [{ project: "甲项目", count: 18 }, { project: "乙项目", count: 12 }]
    );
    const asset = createAsset(
      "asset-contract-top10",
      "列出各项目合同",
      "有哪些项目合同",
      [ranking]
    );
    asset.stableVersion!.outputs[0]!.label = "TOP10";

    const added = appendQueryAssetChart(
      blankDashboard(),
      asset,
      execution(asset, [ranking]),
      ranking.outputKey
    );

    expect(added.schema.widgets[0]?.type).toBe("bar");
  });

  it("lets a selected detail output label win and preserves the complete table payload", () => {
    const rows = [
      {
        count: 1,
        contractNo: "XS-2023-001",
        contractName: "数据平台建设合同",
        contractAmount: 120
      },
      {
        count: 1,
        contractNo: "XS-2023-002",
        contractName: "智能分析服务合同",
        contractAmount: 86
      }
    ];
    const details = output(
      "output_003",
      [
        column("count-id", "count", "记录数", "number"),
        column("contract-no-id", "contractNo", "合同编号"),
        column("contract-name-id", "contractName", "合同名称"),
        column("contract-amount-id", "contractAmount", "合同金额（万元）", "number")
      ],
      rows
    );
    details.totalRows = 24;
    const asset = createAsset(
      "asset-contract-details",
      "合同查询结果",
      "查看合同结果",
      [details]
    );
    asset.stableVersion!.outputs[0]!.label = "合同明细汇总";

    const added = appendQueryAssetChart(
      blankDashboard(),
      asset,
      execution(asset, [details]),
      details.outputKey
    );

    const widget = added.schema.widgets[0];
    const binding = added.schema.dataBindings[added.bindingId];
    expect(widget).toMatchObject({
      type: "table",
      mapping: {},
      position: { w: 620, h: 340 }
    });
    expect(binding).toMatchObject({
      resultKind: "table",
      table: {
        rows,
        totalRows: 24
      },
      sourceRef: {
        assetId: asset.id,
        queryVersionId: asset.stableVersionId,
        outputKey: details.outputKey
      }
    });
    expect(binding?.table.columns.map((column) => column.title)).toEqual([
      "记录数",
      "合同编号",
      "合同名称",
      "合同金额（万元）"
    ]);
    expect(added.schema.modules?.[added.moduleId]?.source).toMatchObject({
      assetId: asset.id,
      queryVersionId: asset.stableVersionId,
      outputKey: details.outputKey
    });
  });

  it("uses only the selected output and preserves immutable source metadata", () => {
    const ignored = output(
      "ignored",
      [column("ignored-name-id", "name", "名称"), column("ignored-value-id", "value", "数量", "number")],
      [{ name: "不应使用", value: 999 }]
    );
    const selected = output(
      "contracts",
      [column("project-column-id", "project", "项目"), column("count-column-id", "count", "合同数", "number")],
      [{ project: "甲", count: 12 }, { project: "乙", count: 8 }]
    );
    const asset = createAsset("asset-contract", "合同执行情况", "各项目合同执行情况", [ignored, selected]);
    const original = blankDashboard();
    const parameters = { month: { mode: "RELATIVE", preset: "THIS_MONTH" } };
    const added = appendQueryAssetChart(
      original,
      asset,
      execution(asset, [ignored, selected]),
      "contracts",
      parameters
    );
    const binding = added.schema.dataBindings[added.bindingId];
    const widget = added.schema.widgets[0];

    expect(binding?.sourceRef).toEqual({
      kind: "query-asset",
      assetId: asset.id,
      queryVersionId: asset.stableVersionId,
      outputKey: "contracts",
      parameterValues: parameters
    });
    expect(binding?.table.rows).toEqual(selected.rows);
    expect(binding?.table.rows).not.toEqual(ignored.rows);
    expect(widget?.mapping.dimensionColumnId).toBe("project-column-id");
    expect(widget?.mapping.metricColumnIds).toEqual(["count-column-id"]);
    expect(widget?.mapping.dimensionKey).toBe("project");
    expect(widget?.mapping.metricKeys).toEqual(["count"]);
  });

  it("does not rewrite dashboard metadata when the first favorite chart is added", () => {
    const result = output(
      "revenue",
      [column("month-id", "month", "月份", "date"), column("amount-id", "amount", "收入", "number")],
      [{ month: "一月", amount: 20 }, { month: "二月", amount: 30 }]
    );
    const asset = createAsset("asset-revenue", "收入趋势", "今年每月收入趋势", [result]);
    const original = blankDashboard("管理层经营看板");
    const originalSource = structuredClone(original.source);

    const added = appendQueryAssetChart(original, asset, execution(asset, [result]), "revenue");

    expect(added.schema.title).toBe("管理层经营看板");
    expect(added.schema.description).toBe("用户维护的看板描述");
    expect(added.schema.source).toEqual(originalSource);
    expect(added.schema.widgets[0]?.title).toBe("今年每月收入趋势");
  });

  it("adds multiple and repeated favorites as independent non-overlapping charts", () => {
    const firstOutput = output(
      "contracts",
      [column("project-id", "project", "项目"), column("count-id", "count", "合同数", "number")],
      [{ project: "甲", count: 12 }, { project: "乙", count: 8 }]
    );
    const secondOutput = output(
      "revenue",
      [column("month-id", "month", "月份", "date"), column("amount-id", "amount", "收入", "number")],
      [{ month: "一月", amount: 20 }, { month: "二月", amount: 30 }]
    );
    const firstAsset = createAsset("asset-contract", "合同执行", "各项目合同执行情况", [firstOutput]);
    const secondAsset = createAsset("asset-revenue", "收入趋势", "今年每月收入趋势", [secondOutput]);

    const first = appendQueryAssetChart(
      blankDashboard(),
      firstAsset,
      execution(firstAsset, [firstOutput]),
      "contracts"
    );
    const second = appendQueryAssetChart(
      first.schema,
      secondAsset,
      execution(secondAsset, [secondOutput]),
      "revenue"
    );
    const repeated = appendQueryAssetChart(
      second.schema,
      firstAsset,
      execution(firstAsset, [firstOutput]),
      "contracts"
    );

    expect(repeated.schema.widgets).toHaveLength(3);
    expect(Object.values(repeated.schema.modules ?? {})).toHaveLength(3);
    expect(Object.values(repeated.schema.dataBindings)).toHaveLength(3);
    expect(new Set(repeated.schema.widgets.map((widget) => widget.id)).size).toBe(3);
    expectNoOverlap(repeated.schema);
  });

  it("removes one chart and its unused binding without affecting the others", () => {
    const firstOutput = output(
      "contracts",
      [column("project-id", "project", "项目"), column("count-id", "count", "合同数", "number")],
      [{ project: "甲", count: 12 }, { project: "乙", count: 8 }]
    );
    const secondOutput = output(
      "revenue",
      [column("month-id", "month", "月份", "date"), column("amount-id", "amount", "收入", "number")],
      [{ month: "一月", amount: 20 }, { month: "二月", amount: 30 }]
    );
    const firstAsset = createAsset("asset-contract", "合同执行", "各项目合同执行情况", [firstOutput]);
    const secondAsset = createAsset("asset-revenue", "收入趋势", "今年每月收入趋势", [secondOutput]);
    const first = appendQueryAssetChart(
      blankDashboard(),
      firstAsset,
      execution(firstAsset, [firstOutput]),
      "contracts"
    );
    const second = appendQueryAssetChart(
      first.schema,
      secondAsset,
      execution(secondAsset, [secondOutput]),
      "revenue"
    );

    const remaining = removeQueryAssetChart(second.schema, first.widgetId);

    expect(remaining.widgets.map((widget) => widget.id)).toEqual([second.widgetId]);
    expect(Object.values(remaining.modules ?? {})).toHaveLength(1);
    expect(Object.values(remaining.dataBindings)).toHaveLength(1);
    expect(Object.values(remaining.dataBindings)[0]?.sourceRef?.assetId).toBe(secondAsset.id);
  });

  it("keeps existing multi-widget modules unchanged when adding a new chart", () => {
    const oldOutput = output(
      "old",
      [column("category-id", "category", "分类"), column("value-id", "value", "数量", "number")],
      [{ category: "甲", value: 10 }, { category: "乙", value: 20 }]
    );
    const oldAsset = createAsset("asset-old", "旧收藏", "旧收藏问题", [oldOutput]);
    const old = appendQueryAssetChart(
      blankDashboard(),
      oldAsset,
      execution(oldAsset, [oldOutput]),
      "old"
    );
    const oldWidgetCopy = {
      ...structuredClone(old.schema.widgets[0]!),
      id: "legacy-extra-widget",
      title: "旧版明细组件",
      type: "table" as const,
      position: { x: 700, y: 24, w: 620, h: 340 }
    };
    const legacySchema: DashboardSchema = {
      ...old.schema,
      widgets: [...old.schema.widgets, oldWidgetCopy],
      modules: {
        ...old.schema.modules,
        [old.moduleId]: {
          ...old.schema.modules![old.moduleId]!,
          widgetIds: [old.widgetId, oldWidgetCopy.id]
        }
      }
    };
    const newOutput = output(
      "new",
      [column("month-id", "month", "月份", "date"), column("amount-id", "amount", "收入", "number")],
      [{ month: "一月", amount: 20 }, { month: "二月", amount: 30 }]
    );
    const newAsset = createAsset("asset-new", "新收藏", "最新收入趋势", [newOutput]);

    const added = appendQueryAssetChart(
      legacySchema,
      newAsset,
      execution(newAsset, [newOutput]),
      "new"
    );

    expect(added.schema.widgets.filter((widget) => widget.moduleId === old.moduleId).map((widget) => widget.id))
      .toEqual([old.widgetId, oldWidgetCopy.id]);
    expect(added.schema.modules?.[old.moduleId]?.widgetIds).toEqual([old.widgetId, oldWidgetCopy.id]);
    expect(added.schema.widgets).toHaveLength(3);
  });

  it("rejects missing outputs, empty structures and unsuccessful previews", () => {
    const emptyOutput = output("empty", [], []);
    const asset = createAsset("asset-invalid", "无效收藏", "无效问题", [emptyOutput]);
    const successfulExecution = execution(asset, [emptyOutput]);
    const failedExecution: QueryExecution = {
      ...successfulExecution,
      status: "FAILED",
      errorMessage: "执行失败"
    };

    expect(() => appendQueryAssetChart(blankDashboard(), asset, successfulExecution, "missing"))
      .toThrow("查询预览中没有选定的结果表");
    expect(() => appendQueryAssetChart(blankDashboard(), asset, successfulExecution, "empty"))
      .toThrow("该结果表没有可用字段");
    expect(() => appendQueryAssetChart(blankDashboard(), asset, failedExecution, "empty"))
      .toThrow("执行失败");
  });
});
