import { describe, expect, it } from "vitest";
import { contractOutput, equipmentOutput, paymentOutput } from "@/test/dashboardDesignFixtures";
import {
  classifyColumn,
  metricColumnPriority,
  numericMetricColumns,
  parseNumericCell
} from "./dashboardColumnSemantics";

const contractColumn = (key: string) => contractOutput.columns.find((column) => column.key === key)!;

describe("parseNumericCell", () => {
  it("直接放行有限数字，拦下 NaN 与非字符串", () => {
    expect(parseNumericCell(1280)).toBe(1280);
    expect(parseNumericCell(0)).toBe(0);
    expect(parseNumericCell(Number.NaN)).toBeNull();
    expect(parseNumericCell(null)).toBeNull();
    expect(parseNumericCell(undefined)).toBeNull();
    expect(parseNumericCell(true)).toBeNull();
  });

  it("摘掉千分位、货币符号与单位后缀再取数", () => {
    expect(parseNumericCell("1,200.50")).toBe(1200.5);
    expect(parseNumericCell("１，２００")).toBe(1200);
    expect(parseNumericCell("￥12,000.00")).toBe(12000);
    expect(parseNumericCell("$1,999")).toBe(1999);
    expect(parseNumericCell(" 1200 元 ")).toBe(1200);
    expect(parseNumericCell("46 台")).toBe(46);
  });

  it("万与亿是量级后缀要还原，百分号只是单位", () => {
    expect(parseNumericCell("3.5万")).toBe(35000);
    expect(parseNumericCell("12.5万元")).toBe(125000);
    expect(parseNumericCell("1.2亿")).toBe(120000000);
    expect(parseNumericCell("2亿元")).toBe(200000000);
    expect(parseNumericCell("12.5%")).toBe(12.5);
  });

  it("解析不出来一律 null，绝不当 0 用", () => {
    expect(parseNumericCell("面议")).toBeNull();
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("￥")).toBeNull();
    expect(parseNumericCell("HT-2024-0001")).toBeNull();
  });
});

describe("classifyColumn", () => {
  const rows = contractOutput.rows;

  it("「合同签订或归属年度」是时间列，不是数值指标", () => {
    expect(classifyColumn(contractColumn("contractYear"), rows)).toBe("time");
  });

  it("「合同编号」是编号列，不会被当成维度或指标", () => {
    expect(classifyColumn(contractColumn("contractNo"), rows)).toBe("identifier");
  });

  it("带千分位的「合同金额（万元）」是数值列", () => {
    expect(classifyColumn(contractColumn("contractAmount"), rows)).toBe("number");
  });

  it("重复出现的甲方单位是分类维度，八十行各不相同的合同名称按编号处理", () => {
    expect(classifyColumn(contractColumn("partyA"), rows)).toBe("dimension");
    expect(classifyColumn(contractColumn("contractName"), rows)).toBe("identifier");
  });

  it("纯数字字符串的年份按时间判，行数不足时不轻易判成编号", () => {
    const yearRows = [{ y: "2024" }, { y: "2023" }, { y: "2022" }];
    expect(classifyColumn({ key: "y", label: "签订年" }, yearRows)).toBe("time");
    const regionRows = ["华东", "华北", "华南", "西南", "东北"].map((region) => ({ region }));
    expect(classifyColumn({ key: "region", label: "区域" }, regionRows)).toBe("dimension");
  });

  it("名字像指标但整列取不到数时退回分类，免得指标卡永远空着", () => {
    const rowsWithText = [{ amount: "面议" }, { amount: "另议" }];
    expect(classifyColumn({ key: "amount", label: "合同金额" }, rowsWithText)).toBe("dimension");
    expect(classifyColumn({ key: "amount", label: "合同金额" }, [])).toBe("number");
  });

  it("货币与「万」量级列都判成数值", () => {
    expect(classifyColumn(paymentOutput.columns[1]!, paymentOutput.rows)).toBe("number");
    expect(classifyColumn(paymentOutput.columns[2]!, paymentOutput.rows)).toBe("number");
    expect(classifyColumn(paymentOutput.columns[0]!, paymentOutput.rows)).toBe("dimension");
  });
});

describe("numericMetricColumns", () => {
  it("只留取得到数的列，金额排在最前", () => {
    const metrics = numericMetricColumns(contractOutput.columns, contractOutput.rows);
    expect(metrics.map((column) => column.key)).toEqual(["contractAmount"]);
  });

  it("设备台账里只有数量能当指标，年度不算", () => {
    const metrics = numericMetricColumns(equipmentOutput.columns, equipmentOutput.rows);
    expect(metrics.map((column) => column.key)).toEqual(["equipmentCount"]);
  });

  it("金额优先于数量，其余保持原列序", () => {
    const columns = [
      { key: "count", label: "记录数" },
      { key: "score", label: "得分" },
      { key: "amount", label: "合同金额" }
    ];
    const rows = [{ count: 3, score: 88, amount: "1,000.00" }];
    expect(numericMetricColumns(columns, rows).map((column) => column.key)).toEqual(["amount", "count", "score"]);
    expect(metricColumnPriority({ key: "amount", label: "合同金额" })).toBe(0);
    expect(metricColumnPriority({ key: "count", label: "记录数" })).toBe(1);
    expect(metricColumnPriority({ key: "score", label: "得分" })).toBe(2);
  });

  it("整列解析不出数值的列不算指标", () => {
    const columns = [{ key: "amount", label: "合同金额" }];
    expect(numericMetricColumns(columns, [{ amount: "面议" }, { amount: "另议" }])).toEqual([]);
  });
});
