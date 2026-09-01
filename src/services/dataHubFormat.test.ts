import { describe, expect, it } from "vitest";
import {
  formatDataHubCitationFragment,
  formatDataHubColumnTitle,
  formatDataHubTableTitle
} from "./dataHubFormat";

describe("dataHubFormat", () => {
  it("turns citation artifact tables into GFM Markdown", () => {
    const formatted = formatDataHubCitationFragment(
      "合同货物： &lt;table&gt;&lt;tr&gt;&lt;td&gt;货物品名&lt;/td&gt;&lt;td&gt;规格型号&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;水位监测产品&lt;/td&gt;&lt;td&gt;DS-2DF3&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;"
    );

    expect(formatted).toContain("| 货物品名 | 规格型号 |");
    expect(formatted).toContain("| --- | --- |");
    expect(formatted).toContain("| 水位监测产品 | DS-2DF3 |");
    expect(formatted).not.toMatch(/<table>|<td>/);
  });

  it("resolves DataHub qualified field names to stable Chinese labels", () => {
    expect(formatDataHubColumnTitle("WechatyProjectInfo.projectName")).toBe("项目名称");
    expect(formatDataHubColumnTitle("WechatyEventRecord.count")).toBe("事件记录数");
    expect(formatDataHubColumnTitle("count", "WechatyEventRecord.count")).toBe("事件记录数");
  });

  it("keeps authoritative Chinese titles and removes redundant table wording", () => {
    expect(formatDataHubColumnTitle("微信机器人事件记录表 记录数")).toBe("记录数");
    expect(formatDataHubColumnTitle("微信机器人项目信息表 项目名称表")).toBe("项目名称");
  });

  it("keeps unknown field identifiers unchanged", () => {
    expect(formatDataHubColumnTitle("CustomCube.unmappedField")).toBe("CustomCube.unmappedField");
  });

  it("历史轮次「英文（中文）」双语表头只留中文业务名", () => {
    expect(formatDataHubColumnTitle("contractNo（合同编号）")).toBe("合同编号");
    expect(formatDataHubColumnTitle("ContractList.contractAmount(合同金额)")).toBe("合同金额");
    // 中文在前的括号是单位注记，不能被剥
    expect(formatDataHubColumnTitle("合同金额（元）")).toBe("合同金额（元）");
    expect(formatDataHubColumnTitle("占比（%）")).toBe("占比（%）");
  });

  it("appends a concrete table name after the numbered result-table title", () => {
    expect(
      formatDataHubTableTitle({
        columns: [
          { key: "RcbBankStatement.totalCreditAmount", title: "RcbBankStatement.totalCreditAmount" },
          { key: "RcbBankStatement.totalDebitAmount", title: "RcbBankStatement.totalDebitAmount" }
        ],
        rows: [],
        totalRows: 1,
        tableIndex: 1
      })
    ).toBe("结果表 2 - RcbBankStatement");

    expect(
      formatDataHubTableTitle({
        columns: [
          { key: "count", title: "记录数" },
          { key: "ContractList.totalContractAmount", title: "ContractList.totalContractAmount" },
          { key: "ContractList.avgContractAmount", title: "ContractList.avgContractAmount" }
        ],
        rows: [],
        totalRows: 1,
        tableIndex: 3
      })
    ).toBe("结果表 4 - ContractList");
  });

  it("prefers a Chinese table name from titles, comments, or known cube aliases", () => {
    expect(
      formatDataHubTableTitle({
        columns: [
          { key: "WechatyConsulationRecord.count", title: "微信机器人咨询记录表 记录数" },
          { key: "WechatyConsulationRecord.month", title: "月份" }
        ],
        rows: [],
        totalRows: 1,
        tableIndex: 0
      })
    ).toBe("结果表 1 - 微信机器人咨询记录表");

    expect(
      formatDataHubTableTitle({
        columns: [{ key: "WechatyProjectInfo.projectName", title: "项目名称" }],
        rows: [],
        totalRows: 1,
        tableIndex: 1
      })
    ).toBe("结果表 2 - 微信机器人项目信息表");

    expect(
      formatDataHubTableTitle({
        columns: [{ key: "InvoiceDetail.totalAmountWithTax", title: "发票明细表.含税金额" }],
        rows: [],
        totalRows: 1,
        tableIndex: 2
      })
    ).toBe("结果表 3 - 发票明细表");

    expect(
      formatDataHubTableTitle({
        columns: [{ key: "RcbBankStatement.totalCreditAmount", title: "贷方发生额" }],
        rows: [],
        totalRows: 1,
        groupLabel: "农商银行流水",
        tableIndex: 1
      })
    ).toBe("结果表 2 - 农商银行流水");
  });

  it("keeps a numbered title when the table name cannot be inferred", () => {
    expect(
      formatDataHubTableTitle({
        columns: [{ key: "projectName", title: "项目名称" }],
        rows: [],
        totalRows: 1,
        tableIndex: 0
      })
    ).toBe("结果表 1");

    expect(
      formatDataHubTableTitle({
        columns: [{ key: "InvoiceDetail.totalAmountWithTax", title: "含税金额" }],
        rows: [],
        totalRows: 1,
        groupLabel: "结果表 3",
        tableIndex: 2
      })
    ).toBe("结果表 3 - InvoiceDetail");
  });
});
