import type { QueryAsset, QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";

/**
 * 复刻 beta0.4 反馈里那三张卡的收藏问数形状，只给测试用。
 * 收藏存下的是整轮问数的每一次 load_data：有探查查询、有 0 行结果，列名是「cube 描述 + 空格 + 字段名」。
 * - 「善治今年的销售额」：先查了一行带「4」的探查结果，最后一次才是销售额合计 → 旧口径挑中探查，指标卡显示 4；
 * - 「善治今年的必签项目金额」：几次查询全是 0 行 → 旧口径照样画成「0 个周期」的趋势卡；
 * - 「善治每月收入」：先联表拉了合同与流水明细，最后按月汇总 → 旧口径挑中明细，表头是一串表描述。
 * 带回答原文（answerText）的几份同样是推测的形状，用来验证「按回答认答案」：
 * - 合计在前、探查在后，或者答案只能由明细列求和得到 → 只看问题形状会挑中探查里的「4」；
 * - 问「最高的三家客户」，最后补了一行三家合计 → 只看问题形状会挑中那一行合计。
 */

export const PROJECT_CUBE = "项目签约台账，记录项目名称、客户与签约金额";
export const CONTRACT_CUBE = "合同主数据清单，记录合同编号、名称、年度、签约双方及合同金额";
export const FLOW_CUBE = "交通银行账户交易流水明细，记录与合同相关的收付款流水";

export function favoriteColumn(key: string, label: string, type = "string"): QueryColumnDefinition {
  return { columnId: `column-${key}`, key, label, title: label, type };
}

export function favoriteOutput(
  outputKey: string,
  columns: QueryColumnDefinition[],
  rows: Record<string, unknown>[]
): QueryExecutionOutput {
  return { outputKey, columns, rows, totalRows: rows.length, updatedAt: "2026-09-23T10:20:00.000Z" };
}

export function favoriteAsset(id: string, question: string, outputs: QueryExecutionOutput[]): QueryAsset {
  const versionId = `${id}-v1`;
  return {
    id,
    name: question,
    originalQuestion: question,
    resolvedQuestion: question,
    datasourceId: 2000001,
    ownerUserId: 7,
    visibility: "PRIVATE",
    stableVersionId: versionId,
    status: "ACTIVE",
    stableVersion: {
      id: versionId,
      versionNo: 1,
      resolvedQuestion: question,
      engine: "CUBE",
      parameters: [],
      // 后端的输出定义没有业务名，label 就是 outputKey。
      outputs: outputs.map((output) => ({
        outputKey: output.outputKey,
        label: output.outputKey,
        rowCount: output.totalRows,
        columns: output.columns
      })),
      schemaHash: `${id}-hash`,
      status: "VALIDATED",
      createdAt: "2026-09-20T06:30:00.000Z"
    },
    createdAt: "2026-09-20T06:30:00.000Z",
    updatedAt: "2026-09-20T06:30:00.000Z"
  };
}

export function favoriteExecution(asset: QueryAsset): QueryExecution {
  return {
    id: `${asset.id}-preview`,
    assetId: asset.id,
    versionId: asset.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 0,
    createdAt: "2026-09-23T10:20:00.000Z",
    outputs: asset.stableVersion!.outputs.map((definition) => favoriteOutputs[asset.id]!.find(
      (output) => output.outputKey === definition.outputKey
    )!)
  };
}

const salesOutputs = [
  favoriteOutput("output_001", [
    favoriteColumn("ProjectSign.projectName", `${PROJECT_CUBE} 项目名称，项目的中文全称`),
    favoriteColumn("ProjectSign.customerName", `${PROJECT_CUBE} 客户名称`),
    favoriteColumn("ProjectSign.projectCount", `${PROJECT_CUBE} 项目数量`, "number")
  ], [{
    "ProjectSign.projectName": "四川才子数字化运营服务项目",
    "ProjectSign.customerName": "善治科技",
    "ProjectSign.projectCount": 4
  }]),
  favoriteOutput("output_002", [
    favoriteColumn("ProjectSign.status", `${PROJECT_CUBE} 项目状态`)
  ], []),
  favoriteOutput("output_003", [
    favoriteColumn("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")
  ], [{ "ProjectSign.signAmount": 1286.5 }])
];

const mustSignOutputs = [
  favoriteOutput("output_001", [
    favoriteColumn("ContractList.signYear", `${CONTRACT_CUBE} 合同签订或归属年度`),
    favoriteColumn("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
  ], []),
  favoriteOutput("output_002", [
    favoriteColumn("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
  ], [])
];

const detailColumns = [
  favoriteColumn("ContractList.count", `${CONTRACT_CUBE} 记录数`, "number"),
  favoriteColumn("ContractList.contractName", `${CONTRACT_CUBE} 合同名称，合同的中文全称`),
  favoriteColumn("ContractList.contractNo", `${CONTRACT_CUBE} 合同编号，合同的业务唯一标识`),
  favoriteColumn("BankFlow.tradeDate", `${FLOW_CUBE} 交易日期`, "time"),
  favoriteColumn("BankFlow.counterparty", `${FLOW_CUBE} 对方户名`),
  favoriteColumn("BankFlow.amount", `${FLOW_CUBE} 交易金额（元）`, "number")
];

const monthlyIncomeOutputs = [
  favoriteOutput("output_001", detailColumns, Array.from({ length: 20 }, (_, index) => ({
    "ContractList.count": 1,
    "ContractList.contractName": `四川才子数字化运营服务合同第${index + 1}期`,
    "ContractList.contractNo": `SZ-2025-${String(index + 1).padStart(3, "0")}`,
    "BankFlow.tradeDate": `2025-${String((index % 9) + 1).padStart(2, "0")}-01 00:00:00`,
    "BankFlow.counterparty": "善治科技",
    "BankFlow.amount": 18_000 + index * 1_250
  }))),
  favoriteOutput("output_002", [
    favoriteColumn("BankFlow.tradeDate.month", `${FLOW_CUBE} 交易日期`, "time"),
    favoriteColumn("BankFlow.amount", `${FLOW_CUBE} 交易金额（元）`, "number")
  ], Array.from({ length: 9 }, (_, index) => ({
    "BankFlow.tradeDate.month": `2025-${String(index + 1).padStart(2, "0")}-01T00:00:00.000`,
    "BankFlow.amount": 120_000 + index * 8_600
  })))
];

const probeOutput = (outputKey: string) => favoriteOutput(outputKey, [
  favoriteColumn("ProjectSign.projectName", `${PROJECT_CUBE} 项目名称，项目的中文全称`),
  favoriteColumn("ProjectSign.customerName", `${PROJECT_CUBE} 客户名称`),
  favoriteColumn("ProjectSign.projectCount", `${PROJECT_CUBE} 项目数量`, "number")
], [{
  "ProjectSign.projectName": "四川才子数字化运营服务项目",
  "ProjectSign.customerName": "善治科技",
  "ProjectSign.projectCount": 4
}]);

/** 先查了合计（合同金额与签约金额同一行），又补了一次带「4」的探查：两张都是单行。 */
const salesRecheckOutputs = [
  favoriteOutput("output_001", [
    favoriteColumn("ProjectSign.contractAmount", `${PROJECT_CUBE} 合同金额（万元），含税合同总价`, "number"),
    favoriteColumn("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")
  ], [{ "ProjectSign.contractAmount": 3520, "ProjectSign.signAmount": 1286.5 }]),
  probeOutput("output_002")
];

/** 只查了项目明细，回答里的 1,286.5 万元是模型自己把签约金额加总出来的。 */
const salesDetailOutputs = [
  probeOutput("output_001"),
  favoriteOutput("output_002", [
    favoriteColumn("ProjectSign.projectName", `${PROJECT_CUBE} 项目名称，项目的中文全称`),
    favoriteColumn("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")
  ], [
    ["四川才子数字化运营服务项目", 520],
    ["成都蓉城数据治理项目", 386.5],
    ["绵阳智汇园区平台项目", 210],
    ["德阳政务云运维项目", 120],
    ["乐山文旅数据中台项目", 50]
  ].map(([name, amount]) => ({ "ProjectSign.projectName": name, "ProjectSign.signAmount": amount }))),
  favoriteOutput("output_003", [favoriteColumn("ProjectSign.status", `${PROJECT_CUBE} 项目状态`)], [])
];

/** 客户排行在前，后面又按月看了一次，最后补了一行三家合计。 */
const customerRankingOutputs = [
  favoriteOutput("output_001", [
    favoriteColumn("ProjectSign.customerName", `${PROJECT_CUBE} 客户名称`),
    favoriteColumn("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")
  ], [
    ["四川才子科技", 520],
    ["成都蓉城数据", 386.5],
    ["绵阳智汇科技", 210],
    ["德阳政务云", 120],
    ["乐山文旅集团", 50],
    ["宜宾临港实业", 30]
  ].map(([name, amount]) => ({ "ProjectSign.customerName": name, "ProjectSign.signAmount": amount }))),
  favoriteOutput("output_002", [
    favoriteColumn("ProjectSign.signMonth", `${PROJECT_CUBE} 签约月份`, "time"),
    favoriteColumn("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")
  ], [180, 240, 150, 300, 195, 252].map((amount, index) => ({
    "ProjectSign.signMonth": `2026-0${index + 1}`,
    "ProjectSign.signAmount": amount
  }))),
  favoriteOutput("output_003", [
    favoriteColumn("ProjectSign.signAmount", `${PROJECT_CUBE} 签约金额（万元），含税`, "number")
  ], [{ "ProjectSign.signAmount": 1116.5 }])
];

const favoriteOutputs: Record<string, QueryExecutionOutput[]> = {
  "asset-sales": salesOutputs,
  "asset-must-sign": mustSignOutputs,
  "asset-monthly-income": monthlyIncomeOutputs,
  "asset-sales-recheck": salesRecheckOutputs,
  "asset-sales-detail": salesDetailOutputs,
  "asset-customer-ranking": customerRankingOutputs
};

export const salesAsset = favoriteAsset("asset-sales", "善治今年的销售额", salesOutputs);
export const mustSignAsset = favoriteAsset("asset-must-sign", "善治今年的必签项目金额", mustSignOutputs);
export const monthlyIncomeAsset = favoriteAsset("asset-monthly-income", "善治每月收入", monthlyIncomeOutputs);

/** 带上收藏时的回答原文：老收藏与老后端没有这个字段。 */
export function withAnswer(asset: QueryAsset, answerText: string): QueryAsset {
  return { ...asset, answerText };
}

export const SALES_ANSWER = "善治今年的销售额为 **1,286.5 万元**（含税）。";
export const RANKING_ANSWER = [
  "善治今年签约金额最高的三家客户：",
  "",
  "1. **四川才子科技**：520 万元",
  "2. **成都蓉城数据**：386.5 万元",
  "3. **绵阳智汇科技**：210 万元",
  "",
  "三家合计 1,116.5 万元。"
].join("\n");

/** 「善治今年的销售额」：合计行在前、探查在后，合计行里合同金额排在签约金额前面。 */
export const salesRecheckAsset = favoriteAsset("asset-sales-recheck", "善治今年的销售额", salesRecheckOutputs);
/** 「善治今年的销售额」：只有明细，答案是签约金额列的合计。 */
export const salesDetailAsset = favoriteAsset("asset-sales-detail", "善治今年的销售额", salesDetailOutputs);
/** 「善治今年签约金额最高的三家客户」：看不出形状的问题，旧口径取最后那行三家合计。 */
export const customerRankingAsset = favoriteAsset(
  "asset-customer-ranking",
  "善治今年签约金额最高的三家客户",
  customerRankingOutputs
);
