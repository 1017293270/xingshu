import type { QueryAsset, QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";
import type { DashboardDesignAssetData } from "@/types/dashboardDesign";

/**
 * 智享大屏引擎测试共用的收藏问数夹具。
 * 几份测试都要同一批「时间序列 / 分类 / 标量 / 类目过多」的结果表，集中在这里免得各写一遍还写歪。
 */

export function designColumn(columnId: string, key: string, label: string, type = "string"): QueryColumnDefinition {
  return { columnId, key, label, type };
}

export function designOutput(
  outputKey: string,
  columns: QueryColumnDefinition[],
  rows: Record<string, unknown>[]
): QueryExecutionOutput {
  return { outputKey, columns, rows, totalRows: rows.length, updatedAt: "2026-09-03T08:00:00.000Z" };
}

export function designAsset(id: string, name: string, outputs: QueryExecutionOutput[]): QueryAsset {
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

export function designExecution(asset: QueryAsset, outputs: QueryExecutionOutput[]): QueryExecution {
  return {
    id: `${asset.id}-exec`,
    assetId: asset.id,
    versionId: asset.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 12,
    createdAt: "2026-09-03T08:00:00.000Z",
    outputs
  };
}

export function designAssetData(
  entries: Array<{ id: string; name: string; outputs: QueryExecutionOutput[] }>
): DashboardDesignAssetData {
  return Object.fromEntries(
    entries.map((entry) => {
      const asset = designAsset(entry.id, entry.name, entry.outputs);
      return [entry.id, { asset, execution: designExecution(asset, entry.outputs) }];
    })
  );
}

/** 六个月的营收与成本：时间序列，两个数值列。 */
export const monthlyOutput = designOutput(
  "monthly",
  [
    designColumn("c-month", "month", "月份"),
    designColumn("c-revenue", "revenue", "营收（万元）", "number"),
    designColumn("c-cost", "cost", "成本（万元）", "number")
  ],
  Array.from({ length: 6 }, (_, index) => ({
    month: `2026-0${index + 1}`,
    revenue: 100 + index * 10,
    cost: 60 + index * 4
  }))
);

/** 五个区域的销售额：分类，一个数值列。 */
export const regionOutput = designOutput(
  "region",
  [designColumn("c-region", "region", "区域"), designColumn("c-sales", "sales", "销售额", "number")],
  ["华东", "华北", "华南", "西南", "东北"].map((region, index) => ({ region, sales: 500 - index * 60 }))
);

/** 单行合计：标量。 */
export const scalarOutput = designOutput(
  "total",
  [designColumn("c-total", "total", "订单总数", "number")],
  [{ total: 1280 }]
);

/** 十四个渠道：分类但类目过多，占比图该降级。 */
export const crowdedOutput = designOutput(
  "channel",
  [designColumn("c-channel", "channel", "渠道"), designColumn("c-orders", "orders", "订单数", "number")],
  Array.from({ length: 14 }, (_, index) => ({ channel: `渠道${index + 1}`, orders: 200 - index * 9 }))
);

export function standardDesignData(): DashboardDesignAssetData {
  return designAssetData([
    { id: "asset-revenue", name: "月度营收", outputs: [monthlyOutput] },
    { id: "asset-region", name: "区域销售", outputs: [regionOutput] },
    { id: "asset-total", name: "订单合计", outputs: [scalarOutput] },
    { id: "asset-channel", name: "渠道订单", outputs: [crowdedOutput] }
  ]);
}
