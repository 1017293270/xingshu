import { describe, expect, it } from "vitest";
import { favoriteColumn, favoriteOutput } from "../testing/favoriteAnswerFixtures";
import {
  dashboardAnswerEvidence,
  dashboardAnswerPlainText,
  extractDashboardAnswerNumbers
} from "./dashboardAnswerEvidence";

function valuesOf(text: string, questions: string[] = []) {
  return extractDashboardAnswerNumbers(text, questions).map(({ value, tolerance, percent }) => ({ value, tolerance, percent }));
}

describe("extractDashboardAnswerNumbers", () => {
  it("换到基本单位，容差是显示精度的半个单位", () => {
    expect(valuesOf("善治今年的销售额为 **1,286.5 万元**，约 1.2 亿元，同比下降 -3.5%。")).toEqual([
      { value: 12_865_000, tolerance: 500, percent: false },
      { value: 120_000_000, tolerance: 5_000_000, percent: false },
      { value: -3.5, tolerance: 0.05, percent: true }
    ]);
  });

  it("全角数字、全角千分位与全角百分号折成半角；中文逗号不是千分位", () => {
    expect(valuesOf("销售额为１，２８６．５万元，占比３５．２％")).toEqual([
      { value: 12_865_000, tolerance: 500, percent: false },
      { value: 35.2, tolerance: 0.05, percent: true }
    ]);
    expect(valuesOf("A 公司 120，B 公司 340").map((item) => item.value)).toEqual([120, 340]);
  });

  it("年份、日期时间、列表序号、名次、引用角标与问题里的「前 10」都不算答案数", () => {
    const answer = [
      "2025 年善治前 10 大客户中，第 1 名为四川才子科技，签约金额 1,286.5 万元，占比 35.2%[1]。",
      "1. 四川才子科技",
      "2、成都蓉城数据",
      "数据截至 2025-09-23 10:20，1-9 月累计，3 月新增 2 个项目（2）。",
      "TOP10 客户里还有 10 家在谈，目前 3 家已签约。"
    ].join("\n");
    expect(valuesOf(answer, ["善治 2025 年前 10 大客户"]).map((item) => item.value)).toEqual([
      12_865_000,
      35.2,
      2,
      3
    ]);
  });

  it("markdown 表格里排名列的数是名次，其余单元格照常取", () => {
    const answer = [
      "| 排名 | 客户 | 金额（万元） |",
      "| --- | --- | ---: |",
      "| 1 | 四川才子科技 | 520 |",
      "| 2 | 成都蓉城数据 | 386.5 |"
    ].join("\n");
    expect(valuesOf(answer).map((item) => item.value)).toEqual([520, 386.5]);
  });

  it("0 与重复出现的数只留一份有效值", () => {
    expect(valuesOf("合计 1,286.5 万元，其中 0 个逾期；再说一遍：1,286.5 万元。").map((item) => item.value)).toEqual([
      12_865_000
    ]);
  });
});

describe("dashboardAnswerEvidence", () => {
  const amount = (key = "amount", label = "签约金额（万元）") => favoriteColumn(key, label, "number");

  it("单元格按 ×1 / ×1e4 / ×1e8 量级比较，百分数同时比较 v 与 v×100", () => {
    const outputs = [
      favoriteOutput("yuan", [amount("amount", "签约金额（元）")], [{ amount: 12_865_000 }]),
      favoriteOutput("wan", [amount()], [{ amount: 1286.5 }]),
      favoriteOutput("yi", [amount("amount", "签约金额（亿元）")], [{ amount: 0.128_65 }]),
      favoriteOutput("ratio", [favoriteColumn("share", "占比", "number")], [{ share: 0.352 }]),
      favoriteOutput("miss", [amount()], [{ amount: 1287.1 }])
    ];
    const evidence = dashboardAnswerEvidence("销售额 1,286.5 万元，占比 35.2%", outputs);
    expect(evidence.map((item) => [item.outputKey, item.hasEvidence])).toEqual([
      ["yuan", true],
      ["wan", true],
      ["yi", true],
      ["ratio", true],
      ["miss", false]
    ]);
    expect(evidence[1]!.columns).toEqual([{ key: "amount", match: "cell", score: expect.any(Number) }]);
  });

  it("没有单元格等于回答的数时，多行表某列的合计对得上就记为该列求和", () => {
    const detail = favoriteOutput("detail", [favoriteColumn("name", "项目名称"), amount()], [
      { name: "A 项目", amount: 520 },
      { name: "B 项目", amount: 766.5 }
    ]);
    const [sum] = dashboardAnswerEvidence("销售额为 1,286.5 万元", [detail]);
    expect(sum).toMatchObject({ hasEvidence: true, columns: [{ key: "amount", match: "sum" }] });

    // 另一张表的单元格直接等于这个数：凑出来的合计不再算。
    const total = favoriteOutput("total", [amount()], [{ amount: 1286.5 }]);
    const [withTotalDetail, withTotal] = dashboardAnswerEvidence("销售额为 1,286.5 万元", [detail, total]);
    expect(withTotalDetail).toMatchObject({ hasEvidence: false, columns: [] });
    expect(withTotal).toMatchObject({ hasEvidence: true, columns: [{ key: "amount", match: "cell" }] });
  });

  it("名称出现在回答里是辅证；问题里已有的名称与汇总行占位词不算", () => {
    const ranking = favoriteOutput("ranking", [favoriteColumn("customer", "客户名称"), amount()], [
      { customer: "四川才子科技", amount: 1 },
      { customer: "成都蓉城数据", amount: 2 },
      { customer: "善治科技", amount: 3 },
      { customer: "合计", amount: 6 }
    ]);
    const [evidence] = dashboardAnswerEvidence(
      "四川才子科技与成都蓉城数据领先，善治科技居中，合计如下。",
      [ranking],
      ["善治科技的客户排行"]
    );
    expect(evidence).toMatchObject({ nameHits: 2, numberScore: 0, hasEvidence: true });
  });

  it("精度越高的数分量越重：命中 1,286.5 万元的表压过命中「4」的表", () => {
    const outputs = [
      favoriteOutput("probe", [favoriteColumn("count", "项目数量", "number")], [{ count: 4 }]),
      favoriteOutput("total", [amount()], [{ amount: 1286.5 }])
    ];
    const [probe, total] = dashboardAnswerEvidence("销售额为 1,286.5 万元，共 4 个项目。", outputs);
    expect(probe!.hasEvidence).toBe(true);
    expect(total!.score).toBeGreaterThan(probe!.score);
  });

  it("0 行结果没有证据", () => {
    expect(dashboardAnswerEvidence("1,286.5 万元", [favoriteOutput("empty", [amount()], [])])[0]).toMatchObject({
      hasEvidence: false,
      score: 0
    });
  });
});

describe("dashboardAnswerPlainText", () => {
  it("去掉 markdown 符号，保留换行", () => {
    const answer = [
      "## 结论",
      "> 善治今年的销售额为 **1,286.5 万元**（[来源](https://example.com/a)）。",
      "",
      "- 第一名：`四川才子科技`",
      "| 客户 | 金额 |",
      "| --- | --- |",
      "| 四川才子科技 | 520 |"
    ].join("\n");
    expect(dashboardAnswerPlainText(answer)).toBe([
      "结论",
      "善治今年的销售额为 1,286.5 万元（来源）。",
      "第一名：四川才子科技",
      "客户 金额",
      "四川才子科技 520"
    ].join("\n"));
  });

  it("没有回答时为空串", () => {
    expect(dashboardAnswerPlainText(undefined)).toBe("");
    expect(dashboardAnswerPlainText(null)).toBe("");
    expect(dashboardAnswerPlainText("  \n ")).toBe("");
  });
});
