import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { QueryAsset, QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";
import type { DashboardDesignAssetData } from "@/types/dashboardDesign";
import type { DashboardSchema, DashboardWidget, DashboardWidgetType } from "@/types/dashboardStudio";
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

  it("丢完样本行仍超预算时再丢历史", () => {
    const request = buildDashboardDesignRequest({
      brief: "试试",
      data: dataOf(8, 6, 24),
      history: [{ role: "user", content: "上一轮" }]
    });

    expect(request.assets[0].outputs[0].sampleRows).toEqual([]);
    expect(request.history).toEqual([]);
  });
});
