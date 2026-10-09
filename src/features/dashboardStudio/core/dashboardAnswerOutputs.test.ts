import { describe, expect, it } from "vitest";
import {
  RANKING_ANSWER,
  SALES_ANSWER,
  customerRankingAsset,
  favoriteColumn,
  favoriteExecution,
  favoriteOutput,
  monthlyIncomeAsset,
  mustSignAsset,
  salesAsset,
  salesDetailAsset,
  salesRecheckAsset,
  withAnswer
} from "../testing/favoriteAnswerFixtures";
import {
  dashboardAnswerCandidates,
  dashboardAnswerIntent,
  dashboardAnswerMetric,
  orderMetricsByQuestion,
  pickDashboardAnswerOutputKey,
  rankDashboardAnswerOutputs
} from "./dashboardAnswerOutputs";
import { numericMetricColumns } from "./dashboardColumnSemantics";

function question(text: string) {
  return { name: text, originalQuestion: text, resolvedQuestion: text };
}

function outputsOf(asset: typeof salesAsset) {
  return asset.stableVersion!.outputs.map((definition) => favoriteOutput(
    definition.outputKey,
    definition.columns,
    // 行数照抄定义，够排序用；具体数值由各用例自己给。
    Array.from({ length: definition.rowCount ?? 0 }, () => ({}))
  ));
}

describe("dashboardAnswerIntent", () => {
  it("按问题形状区分单值、分组、明细", () => {
    expect(dashboardAnswerIntent(question("善治今年的销售额"))).toBe("single");
    expect(dashboardAnswerIntent(question("善治今年的必签项目金额"))).toBe("single");
    expect(dashboardAnswerIntent(question("今年一共签了几个项目？"))).toBe("single");
    expect(dashboardAnswerIntent(question("善治每月收入"))).toBe("grouped");
    expect(dashboardAnswerIntent(question("各区域销售额合计"))).toBe("grouped");
    expect(dashboardAnswerIntent(question("列出今年签约的合同"))).toBe("detail");
    expect(dashboardAnswerIntent(question("今年签约的客户"))).toBe("neutral");
  });
});

describe("rankDashboardAnswerOutputs", () => {
  it("单值问题取最后一次单行取数，不取前面带「4」的探查结果", () => {
    const outputs = salesAsset.stableVersion!.outputs.map((definition) => ({
      outputKey: definition.outputKey,
      columns: definition.columns,
      rows: definition.outputKey === "output_001"
        ? [{ "ProjectSign.projectName": "四川才子", "ProjectSign.customerName": "善治科技", "ProjectSign.projectCount": 4 }]
        : definition.outputKey === "output_003" ? [{ "ProjectSign.signAmount": 1286.5 }] : [],
      totalRows: definition.rowCount ?? 0
    }));

    const ranked = rankDashboardAnswerOutputs(salesAsset, outputs);
    expect(ranked.map((output) => output.outputKey)).toEqual(["output_003", "output_001", "output_002"]);
    expect(pickDashboardAnswerOutputKey(salesAsset, outputs)).toBe("output_003");
    // 排序时顺带清洗列名，入参不动。
    expect(ranked[0]!.columns[0]).toMatchObject({ label: "签约金额（万元）", title: "签约金额（万元）" });
    expect(outputs[2]!.columns[0]!.label).toContain("项目签约台账");
  });

  it("单值问题里单行但没有数值列的结果排在单行取数之后", () => {
    const outputs = [
      favoriteOutput("output_001", [favoriteColumn("total", "合计", "number")], [{ total: 12 }]),
      favoriteOutput("output_002", [favoriteColumn("name", "客户名称")], [{ name: "善治科技" }])
    ];
    expect(pickDashboardAnswerOutputKey(question("一共多少钱"), outputs)).toBe("output_001");
  });

  it("分组问题取多行结果，明细与汇总都多行时取后调用的", () => {
    expect(pickDashboardAnswerOutputKey(monthlyIncomeAsset, outputsOf(monthlyIncomeAsset))).toBe("output_002");
  });

  it("明细问题不拿收尾补的一行合计当答案", () => {
    const outputs = [
      favoriteOutput("output_001", [favoriteColumn("name", "合同名称"), favoriteColumn("amount", "金额", "number")], [
        { name: "A", amount: 1 },
        { name: "B", amount: 2 }
      ]),
      favoriteOutput("output_002", [favoriteColumn("amount", "金额", "number")], [{ amount: 3 }])
    ];
    expect(pickDashboardAnswerOutputKey(question("列出今年的合同"), outputs)).toBe("output_001");
  });

  it("看不出形状时取最后一个非空结果", () => {
    const outputs = [
      favoriteOutput("output_001", [favoriteColumn("name", "客户名称")], [{ name: "A" }, { name: "B" }]),
      favoriteOutput("output_002", [favoriteColumn("name", "客户名称")], [{ name: "A" }]),
      favoriteOutput("output_003", [favoriteColumn("name", "客户名称")], [])
    ];
    expect(pickDashboardAnswerOutputKey(question("今年签约的客户"), outputs)).toBe("output_002");
  });
});

describe("dashboardAnswerCandidates", () => {
  it("剔除 0 行结果，答案排第一", () => {
    const outputs = salesAsset.stableVersion!.outputs.map((definition) => favoriteOutput(
      definition.outputKey,
      definition.columns,
      definition.outputKey === "output_002" ? [] : [{ "ProjectSign.projectCount": 4, "ProjectSign.signAmount": 1286.5 }]
    ));
    expect(dashboardAnswerCandidates(salesAsset, outputs).map((output) => output.outputKey)).toEqual([
      "output_003",
      "output_001"
    ]);
  });

  it("整份都是 0 行时只留一张，让卡片如实显示暂无数据", () => {
    const candidates = dashboardAnswerCandidates(mustSignAsset, outputsOf(mustSignAsset));
    expect(candidates.map((output) => output.outputKey)).toEqual(["output_002"]);
    expect(candidates[0]!.columns[0]!.label).toBe("合同金额（万元）");
  });
});

describe("orderMetricsByQuestion", () => {
  const columns = [
    { key: "contractAmount", label: "合同金额（万元）" },
    { key: "presignAmount", label: "预签金额（万元）" },
    { key: "projectCount", label: "项目数量" }
  ];

  it("问题点名的指标排最前", () => {
    expect(orderMetricsByQuestion(question("善治今年的项目预签金额"), columns).map((item) => item.key)).toEqual([
      "presignAmount",
      "contractAmount",
      "projectCount"
    ]);
  });

  it("问「几个」时计数列在前", () => {
    expect(orderMetricsByQuestion(question("今年一共签了几个"), columns)[0]?.key).toBe("projectCount");
  });

  it("没点名时保持原有顺序", () => {
    expect(orderMetricsByQuestion(question("今年签约情况"), columns).map((item) => item.key)).toEqual([
      "contractAmount",
      "presignAmount",
      "projectCount"
    ]);
  });
});

describe("收藏带着回答原文时按回答认答案", () => {
  const outputsOf = (asset: typeof salesAsset) => favoriteExecution(asset).outputs;
  const keysOf = (asset: typeof salesAsset) => rankDashboardAnswerOutputs(asset, outputsOf(asset)).map((output) => output.outputKey);
  const metricOrder = (asset: typeof salesAsset, outputKey: string) => {
    const output = rankDashboardAnswerOutputs(asset, outputsOf(asset)).find((item) => item.outputKey === outputKey)!;
    const answer = dashboardAnswerMetric(asset, outputsOf(asset), outputKey);
    return orderMetricsByQuestion(asset, numericMetricColumns(output.columns, output.rows), answer).map((column) => column.key);
  };

  it("「善治今年的销售额」选合计那张、指标列是签约金额，不是探查里的 4", () => {
    const answered = withAnswer(salesAsset, SALES_ANSWER);
    expect(pickDashboardAnswerOutputKey(answered, outputsOf(answered))).toBe("output_003");
    expect(dashboardAnswerMetric(answered, outputsOf(answered), "output_003")).toEqual({ metricKey: "ProjectSign.signAmount" });

    // 合计在前、探查在后：只看问题形状会取后调用的探查；合计行里合同金额排在前面，也只有回答认得出要的是签约金额。
    expect(pickDashboardAnswerOutputKey(salesRecheckAsset, outputsOf(salesRecheckAsset))).toBe("output_002");
    const recheck = withAnswer(salesRecheckAsset, SALES_ANSWER);
    expect(keysOf(recheck)).toEqual(["output_001", "output_002"]);
    expect(metricOrder(salesRecheckAsset, "output_001")[0]).toBe("ProjectSign.contractAmount");
    expect(metricOrder(recheck, "output_001")).toEqual(["ProjectSign.signAmount", "ProjectSign.contractAmount"]);
  });

  it("回答里同时提到「4 个项目」时，精度更高的 1,286.5 万元说了算", () => {
    const recheck = withAnswer(salesRecheckAsset, "善治今年的销售额为 1,286.5 万元，共涉及 4 个签约项目。");
    expect(pickDashboardAnswerOutputKey(recheck, outputsOf(recheck))).toBe("output_001");
  });

  it("答案只能由明细的签约金额列求和得到：选明细表，按列求和", () => {
    expect(pickDashboardAnswerOutputKey(salesDetailAsset, outputsOf(salesDetailAsset))).toBe("output_001");
    const detail = withAnswer(salesDetailAsset, SALES_ANSWER);
    expect(keysOf(detail)).toEqual(["output_002", "output_001", "output_003"]);
    expect(dashboardAnswerMetric(detail, outputsOf(detail), "output_002")).toEqual({
      metricKey: "ProjectSign.signAmount",
      valueMode: "sum"
    });
    // 求和只给只要一个数的问题：问「每月」「列出」时仍按图表或明细落，只借回答认指标列。
    const grouped = withAnswer({ ...salesDetailAsset, name: "善治各项目签约金额", resolvedQuestion: "善治各项目签约金额", originalQuestion: "善治各项目签约金额" }, SALES_ANSWER);
    expect(dashboardAnswerMetric(grouped, outputsOf(grouped), "output_002")).toEqual({ metricKey: "ProjectSign.signAmount" });
  });

  it("排行：选包含这三家公司的多行表，不是收尾补的一行三家合计", () => {
    expect(dashboardAnswerIntent(customerRankingAsset)).toBe("neutral");
    expect(pickDashboardAnswerOutputKey(customerRankingAsset, outputsOf(customerRankingAsset))).toBe("output_003");
    const ranking = withAnswer(customerRankingAsset, RANKING_ANSWER);
    expect(keysOf(ranking)).toEqual(["output_001", "output_003", "output_002"]);
    expect(dashboardAnswerMetric(ranking, outputsOf(ranking), "output_001")).toEqual({ metricKey: "ProjectSign.signAmount" });
  });

  it("回答里的数与任何表都对不上时，结果与没有回答原文时完全一致", () => {
    const unmatched = "善治今年的销售额约为 3,000 万元，2026 年第 1 季度贡献最多。";
    for (const asset of [salesAsset, salesRecheckAsset, salesDetailAsset, customerRankingAsset, monthlyIncomeAsset, mustSignAsset]) {
      const answered = withAnswer(asset, unmatched);
      const outputs = outputsOf(asset);
      expect(rankDashboardAnswerOutputs(answered, outputs)).toEqual(rankDashboardAnswerOutputs(asset, outputs));
      expect(dashboardAnswerCandidates(answered, outputs)).toEqual(dashboardAnswerCandidates(asset, outputs));
      for (const output of outputs) {
        expect(dashboardAnswerMetric(answered, outputs, output.outputKey)).toBeUndefined();
      }
    }
  });

  it("没有回答原文、回答为空或为 null 时不看回答", () => {
    const outputs = outputsOf(salesRecheckAsset);
    const expected = rankDashboardAnswerOutputs(salesRecheckAsset, outputs);
    for (const answerText of ["", "   ", null]) {
      const asset = { ...salesRecheckAsset, answerText } as unknown as typeof salesAsset;
      expect(rankDashboardAnswerOutputs(asset, outputs)).toEqual(expected);
      expect(dashboardAnswerMetric(asset, outputs, "output_001")).toBeUndefined();
    }
  });
});
