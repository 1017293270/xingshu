import { describe, expect, it } from "vitest";
import { contractAssetName, contractAssetQuestion } from "@/test/dashboardDesignFixtures";
import { assetTopic, boardTitle, cleanQuestionText, shortWidgetTitle } from "./dashboardDesignTitles";

const contractAsset = { name: contractAssetName, question: contractAssetQuestion };

describe("cleanQuestionText", () => {
  it("剥掉问句外壳与句末标点", () => {
    expect(cleanQuestionText("请统计一下各区域销售额的情况？")).toBe("各区域销售额");
    expect(cleanQuestionText("今年每月收入趋势")).toBe("今年每月收入趋势");
  });
});

describe("assetTopic", () => {
  it("从一整段资产描述里取出主题词", () => {
    expect(assetTopic(contractAsset)).toBe("合同主数据");
  });

  it("资产名为空时退到问题", () => {
    expect(assetTopic({ question: "各区域销售额是多少" })).toBe("各区域销售额");
    expect(assetTopic({})).toBe("");
  });
});

describe("shortWidgetTitle", () => {
  it("指标卡用指标列名，去掉括号单位并封顶 12 字", () => {
    expect(shortWidgetTitle({ role: "kpi", metricLabel: "合同金额（万元）", asset: contractAsset })).toBe("合同金额");
    expect(shortWidgetTitle({ role: "kpi", metricLabel: "合同金额（万元）", qualifier: "合计" })).toBe("合同金额合计");
    expect(
      shortWidgetTitle({ role: "kpi", metricLabel: "本年度累计已开票不含税金额小计", qualifier: "合计" }).length
    ).toBeLessThanOrEqual(12);
  });

  it("趋势与占比拼在指标名后面", () => {
    expect(shortWidgetTitle({ role: "trend", metricLabel: "合同金额（万元）" })).toBe("合同金额趋势");
    expect(shortWidgetTitle({ role: "composition", metricLabel: "回款金额" })).toBe("回款金额占比");
  });

  it("对比图连写维度与指标，太长时改成「按X看Y」", () => {
    expect(
      shortWidgetTitle({ role: "comparison", metricLabel: "回款金额", dimensionLabel: "客户名称" })
    ).toBe("客户回款金额");
    const long = shortWidgetTitle({
      role: "comparison",
      metricLabel: "本年度累计已开票金额",
      dimensionLabel: "所属分公司管理机构"
    });
    expect(long).toBe("按所属分公司看本年度累计已");
    expect(long.length).toBeLessThanOrEqual(16);
  });

  it("明细表用资产名，资产名是一整段描述时退到主题词", () => {
    expect(shortWidgetTitle({ role: "detail", asset: contractAsset })).toBe("合同主数据明细");
    expect(shortWidgetTitle({ role: "detail", asset: { name: "区域销售" } })).toBe("区域销售");
  });
});

describe("boardTitle", () => {
  it("一句指令式需求不当标题，改用资产主题", () => {
    expect(boardTitle("帮我设计个企业级的大屏", contractAsset)).toBe("合同主数据总览");
    expect(boardTitle("做个看板", contractAsset)).toBe("合同主数据总览");
  });

  it("有主题的需求原样保留，只剥掉指令外壳", () => {
    expect(boardTitle("经营例会营收总览。", contractAsset)).toBe("经营例会营收总览");
    expect(boardTitle("做一块面向经营例会的营收总览", contractAsset)).toBe("面向经营例会的营收总览");
    expect(boardTitle("营收驾驶舱", contractAsset)).toBe("营收驾驶舱");
  });

  it("需求与资产都给不出主题时退回原标题", () => {
    expect(boardTitle("做个大屏", undefined, "未命名大屏")).toBe("未命名大屏");
  });
});
