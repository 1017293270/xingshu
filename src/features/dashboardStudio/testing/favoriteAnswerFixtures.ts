import type { QueryAsset, QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";

/**
 * 复刻 beta0.4 反馈里那三张卡的收藏问数形状，只给测试用。
 * 收藏存下的是整轮问数的每一次 load_data：有探查查询、有 0 行结果，列名是「cube 描述 + 空格 + 字段名」。
 * - 「善治今年的销售额」：先查了一行带「4」的探查结果，最后一次才是销售额合计 → 旧口径挑中探查，指标卡显示 4；
 * - 「善治今年的必签项目金额」：几次查询全是 0 行 → 旧口径照样画成「0 个周期」的趋势卡；
 * - 「善治每月收入」：先联表拉了合同与流水明细，最后按月汇总 → 旧口径挑中明细，表头是一串表描述。
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

const favoriteOutputs: Record<string, QueryExecutionOutput[]> = {
  "asset-sales": salesOutputs,
  "asset-must-sign": mustSignOutputs,
  "asset-monthly-income": monthlyIncomeOutputs
};

export const salesAsset = favoriteAsset("asset-sales", "善治今年的销售额", salesOutputs);
export const mustSignAsset = favoriteAsset("asset-must-sign", "善治今年的必签项目金额", mustSignOutputs);
export const monthlyIncomeAsset = favoriteAsset("asset-monthly-income", "善治每月收入", monthlyIncomeOutputs);
