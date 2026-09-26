import { describe, expect, it } from "vitest";
import type { QueryColumnDefinition } from "@/types/analytics";
import {
  cleanDashboardQueryColumns,
  cleanDashboardTableColumns,
  dashboardColumnDisplayLabels,
  dashboardTableColumnsFromQuery,
  shortenDashboardColumnLabel
} from "./dashboardColumnLabels";
import { classifyColumn, numericMetricColumns } from "./dashboardColumnSemantics";

/** 线上收藏问数存下的列名：Cube 全称 = cube 标题（一整段表描述）+ 空格 + 成员标题（也带说明）。 */
const CONTRACT_CUBE = "合同主数据清单，记录合同编号、名称、年度、签约双方及合同金额";
const FLOW_CUBE = "交通银行账户交易流水明细，记录与合同相关的收付款流水";

function column(key: string, label: string, type = "string"): QueryColumnDefinition {
  return { columnId: `column-${key}`, key, label, title: label, type };
}

describe("shortenDashboardColumnLabel", () => {
  it("与后端 BusinessColumnLabels.shorten 一样截到首个句读之前", () => {
    expect(shortenDashboardColumnLabel("合同编号，合同的业务唯一标识")).toBe("合同编号");
    expect(shortenDashboardColumnLabel("合同名称；中文全称")).toBe("合同名称");
    expect(shortenDashboardColumnLabel("区域")).toBe("区域");
    // 句读前为空就保留原文
    expect(shortenDashboardColumnLabel("，说明")).toBe("，说明");
  });

  it("截在括号里时补齐括号，单位留给指标卡用", () => {
    expect(shortenDashboardColumnLabel("合同金额（万元，含税）")).toBe("合同金额（万元）");
    expect(shortenDashboardColumnLabel("交易金额(元,含手续费)")).toBe("交易金额(元)");
  });

  it("原始成员键只留字段名，时间粒度后缀不当名字", () => {
    expect(shortenDashboardColumnLabel("ContractList.contractName")).toBe("contractName");
    expect(shortenDashboardColumnLabel("BankFlow.tradeDate.month")).toBe("tradeDate");
  });
});

describe("dashboardColumnDisplayLabels", () => {
  it("同一 cube 的多列按公共前缀剥掉表描述，再截掉字段说明", () => {
    const columns = [
      column("ContractList.contractNo", `${CONTRACT_CUBE} 合同编号，合同的业务唯一标识`),
      column("ContractList.contractName", `${CONTRACT_CUBE} 合同名称，合同的中文全称`),
      column("ContractList.signYear", `${CONTRACT_CUBE} 合同签订或归属年度`),
      column("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
    ];

    expect(dashboardColumnDisplayLabels(columns)).toEqual([
      { label: "合同编号", fullTitle: `${CONTRACT_CUBE} 合同编号，合同的业务唯一标识` },
      { label: "合同名称", fullTitle: `${CONTRACT_CUBE} 合同名称，合同的中文全称` },
      { label: "合同签订或归属年度", fullTitle: `${CONTRACT_CUBE} 合同签订或归属年度` },
      { label: "合同金额（万元）", fullTitle: `${CONTRACT_CUBE} 合同金额（万元），含税合同总价` }
    ]);
  });

  it("成员标题开头相同也只剥到 cube 标题为止", () => {
    const labels = dashboardColumnDisplayLabels([
      column("ContractList.contractNo", `${CONTRACT_CUBE} 合同编号`),
      column("ContractList.contractName", `${CONTRACT_CUBE} 合同名称`)
    ]);
    expect(labels.map((item) => item.label)).toEqual(["合同编号", "合同名称"]);
  });

  it("跨 cube 的联表结果各按各的前缀剥", () => {
    const labels = dashboardColumnDisplayLabels([
      column("ContractList.contractNo", `${CONTRACT_CUBE} 合同编号，合同的业务唯一标识`),
      column("ContractList.contractName", `${CONTRACT_CUBE} 合同名称`),
      column("BankFlow.tradeDate", `${FLOW_CUBE} 交易日期`),
      column("BankFlow.amount", `${FLOW_CUBE} 交易金额（元）`, "number")
    ]);
    expect(labels.map((item) => item.label)).toEqual(["合同编号", "合同名称", "交易日期", "交易金额（元）"]);
  });

  it("单列结果退到最后一个空格之后", () => {
    const [label] = dashboardColumnDisplayLabels([
      column("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
    ]);
    expect(label).toEqual({
      label: "合同金额（万元）",
      fullTitle: `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`
    });
  });

  it("空格后紧跟的括号是单位，不是分界", () => {
    const [label] = dashboardColumnDisplayLabels([
      column("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额 （万元）`, "number")
    ]);
    expect(label?.label).toBe("合同金额 （万元）");
  });

  it("本来就短的列名原样保留，也不乱剥短词或年份", () => {
    const labels = dashboardColumnDisplayLabels([
      column("region", "区域"),
      column("quarter", "Q1 收入", "number"),
      column("year", "2024 年合同额", "number"),
      column("Orders.count", "Orders.count", "number")
    ]);
    expect(labels).toEqual([
      { label: "区域" },
      { label: "Q1 收入" },
      { label: "2024 年合同额" },
      { label: "count", fullTitle: "Orders.count" }
    ]);
  });
});

describe("cleaned columns", () => {
  const raw = [
    column("ContractList.signYear", `${CONTRACT_CUBE} 合同签订或归属年度`),
    column("ContractList.contractAmount", `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`, "number")
  ];

  it("清洗必须在分类之前：表描述里的「年度」会把金额列也判成时间列", () => {
    const rows = [{ "ContractList.signYear": "2025", "ContractList.contractAmount": "1,280.50" }];
    expect(classifyColumn(raw[1]!, rows)).toBe("time");

    const cleaned = cleanDashboardQueryColumns(raw);
    expect(cleaned.map((item) => [item.label, item.title])).toEqual([
      ["合同签订或归属年度", "合同签订或归属年度"],
      ["合同金额（万元）", "合同金额（万元）"]
    ]);
    expect(classifyColumn(cleaned[0]!, rows)).toBe("time");
    expect(numericMetricColumns(cleaned, rows).map((item) => item.key)).toEqual(["ContractList.contractAmount"]);
  });

  it("反复清洗结果不变，完整原文一直留在 fullTitle", () => {
    const once = cleanDashboardQueryColumns(raw);
    const twice = cleanDashboardQueryColumns(once);
    expect(twice).toEqual(once);
    expect(twice[1]?.fullTitle).toBe(`${CONTRACT_CUBE} 合同金额（万元），含税合同总价`);
  });

  it("表格列带着短表头与悬浮提示，运行态回放后再清洗也一样", () => {
    const tableColumns = dashboardTableColumnsFromQuery(raw);
    expect(tableColumns).toEqual([
      {
        columnId: "column-ContractList.signYear",
        key: "ContractList.signYear",
        title: "合同签订或归属年度",
        type: "string",
        fullTitle: `${CONTRACT_CUBE} 合同签订或归属年度`
      },
      {
        columnId: "column-ContractList.contractAmount",
        key: "ContractList.contractAmount",
        title: "合同金额（万元）",
        type: "number",
        fullTitle: `${CONTRACT_CUBE} 合同金额（万元），含税合同总价`
      }
    ]);
    expect(cleanDashboardTableColumns(tableColumns)).toEqual(tableColumns);
    expect(cleanDashboardTableColumns([{ key: "amount", title: "金额" }])).toEqual([{ key: "amount", title: "金额" }]);
  });
});
