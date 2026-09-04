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

export function designAsset(
  id: string,
  name: string,
  outputs: QueryExecutionOutput[],
  question = `${name}是多少`
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
  entries: Array<{ id: string; name: string; outputs: QueryExecutionOutput[]; question?: string }>
): DashboardDesignAssetData {
  return Object.fromEntries(
    entries.map((entry) => {
      const asset = designAsset(entry.id, entry.name, entry.outputs, entry.question);
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

/* ------------------------------------------------------------------ *
 * 合同主数据：复刻线上那块「很丑、数据没对上」的大屏所用的真实形状。
 * 资产名与问题都是一整段描述/一整句问题，金额带千分位，年度是纯数字字符串，
 * 合同编号是高基数字符串——四个坑一次踩齐。
 * ------------------------------------------------------------------ */

export const contractAssetName =
  "最新合同主数据清单，记录合同编号、名称、年度、签约双方及合同金额（万元）。合同编号，合同的业务唯一标识；合同名称，合同的中文全称。";
export const contractAssetQuestion =
  "查询合同主数据清单中的合同名称、合同编号、合同签订或归属年度、合同甲方单位名称和合同金额，按合同金额降序";

const contractParties = ["星枢科技", "云图智能", "海诚建设", "金桥能源", "长风物流", "南岭医药"];
const contractYears = ["2024", "2023", "2022"];

/** 80 行合同明细：编号高基数、年度像数字、金额是带逗号的字符串。 */
export const contractOutput = designOutput(
  "contract",
  [
    designColumn("c-contract-no", "contractNo", "合同编号"),
    designColumn("c-contract-name", "contractName", "合同名称"),
    designColumn("c-contract-year", "contractYear", "合同签订或归属年度"),
    designColumn("c-contract-party", "partyA", "合同甲方单位名称"),
    designColumn("c-contract-amount", "contractAmount", "合同金额（万元）")
  ],
  Array.from({ length: 80 }, (_, index) => ({
    contractNo: `HT-2024-${String(index + 1).padStart(4, "0")}`,
    contractName: `${contractParties[index % contractParties.length]}第${index + 1}期数据服务合同`,
    contractYear: contractYears[index % contractYears.length],
    partyA: contractParties[index % contractParties.length],
    contractAmount: (2400 - index * 12.5).toLocaleString("en-US", { minimumFractionDigits: 2 })
  }))
);

/** 单行记录数：整块屏上那张只显示「1」的卡就是它。 */
export const invoiceCountOutput = designOutput(
  "invoice",
  [designColumn("c-invoice-count", "recordCount", "记录数", "number")],
  [{ recordCount: 1 }]
);

/** 两行设备台账：年度是时间列、数量才是指标，旧口径把年度当指标画成一条 y=1。 */
export const equipmentOutput = designOutput(
  "equipment",
  [
    designColumn("c-equipment-name", "equipmentName", "设备名称"),
    designColumn("c-equipment-year", "equipmentYear", "年度"),
    designColumn("c-equipment-count", "equipmentCount", "数量", "number")
  ],
  [
    { equipmentName: "环境监测终端", equipmentYear: "2023", equipmentCount: 46 },
    { equipmentName: "环境监测终端", equipmentYear: "2024", equipmentCount: 78 }
  ]
);

/** 带货币符号与「万」量级后缀的回款：解析不出来就会满屏「暂无指标数据」。 */
export const paymentOutput = designOutput(
  "payment",
  [
    designColumn("c-payment-party", "customer", "客户名称"),
    designColumn("c-payment-amount", "paidAmount", "回款金额"),
    designColumn("c-payment-credit", "creditLimit", "授信额度")
  ],
  [
    { customer: "星枢科技", paidAmount: "￥12,000.00", creditLimit: "3.5万" },
    { customer: "云图智能", paidAmount: "￥8,600.00", creditLimit: "2.8万" },
    { customer: "海诚建设", paidAmount: "￥21,400.00", creditLimit: "6.2万" },
    { customer: "金桥能源", paidAmount: "￥5,200.00", creditLimit: "1.4万" }
  ]
);

/** 合同场景的四份资产：预览壳 ?dataset=contract 与兜底测试都用这一份。 */
export function contractDesignData(): DashboardDesignAssetData {
  return designAssetData([
    {
      id: "asset-contract",
      name: contractAssetName,
      question: contractAssetQuestion,
      outputs: [contractOutput]
    },
    {
      id: "asset-invoice",
      name: "本年度发票主数据记录数统计结果",
      question: "统计本年度发票主数据的记录数",
      outputs: [invoiceCountOutput]
    },
    { id: "asset-equipment", name: "设备台账年度数量", question: "各年度设备数量是多少", outputs: [equipmentOutput] },
    { id: "asset-payment", name: "客户回款与授信", question: "各客户回款金额与授信额度", outputs: [paymentOutput] }
  ]);
}
