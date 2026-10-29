import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDataHubAnswerInsightRequest,
  normalizeDataHubAnswerInsight,
  readRememberedAnswerInsight,
  rememberAnswerInsight
} from "./dataHubAnswerInsightService";
import type { DataHubTableResult } from "@/types/dataHub";

const departments: DataHubTableResult = {
  columns: [
    { key: "dept", title: "部门" },
    { key: "amount", title: "差旅费用", type: "number" },
    { key: "rate", title: "报销率", type: "number" }
  ],
  rows: [
    { dept: "客服部", amount: 30535.18, rate: 0.9 },
    { dept: "销售部", amount: 12812.01, rate: 0.7 },
    { dept: "行政部", amount: 5000, rate: 0.5 },
    { dept: "合计", amount: 48347.19, rate: 0.7 }
  ],
  totalRows: 4
};

describe("buildDataHubAnswerInsightRequest", () => {
  it("does not ask for insight when no table returned rows", () => {
    expect(buildDataHubAnswerInsightRequest("合同有多少", "共 0 份", [
      { columns: [{ key: "count", title: "合同数" }], rows: [], totalRows: 0 }
    ])).toBeNull();
  });

  it("precomputes totals and shares without counting the total row, and never sums a rate", () => {
    const request = buildDataHubAnswerInsightRequest("各部门差旅费用", "客服部最高。", [departments])!;
    const [table] = request.tables;

    expect(request.answer).toBe("客服部最高。");
    expect(table.columns.map((column) => column.type)).toEqual(["dimension", "number", "number"]);
    expect(table.facts).toContain("“差旅费用”共 3 项，合计 48,347.19，平均每项 16,115.73");
    expect(table.facts).toContain("“差旅费用”最高的是“客服部”30,535.18，占 63.16%；最低的是“行政部”5,000，占 10.34%");
    expect(table.facts).toContain("“差旅费用”最高值是最低值的 6.11 倍");
    expect(table.facts).toContain("“报销率”共 3 项，平均 0.7");
    expect(table.facts.join("\n")).not.toMatch(/“报销率”[^\n]*合计/);
  });

  it("orders time points before describing the change between the first and last period", () => {
    const request = buildDataHubAnswerInsightRequest("月度合同额", "", [{
      columns: [{ key: "month", title: "月份" }, { key: "amount", title: "合同额", type: "number" }],
      rows: [{ month: "2025-03", amount: 30 }, { month: "2025-01", amount: 10 }, { month: "2025-02", amount: 25 }],
      totalRows: 3
    }])!;

    expect(request.answer).toBeUndefined();
    expect(request.tables[0].facts).toContain("“合同额”从“2025-01”的 10 变为“2025-03”的 30，增长 200%");
    expect(request.tables[0].facts).toContain("“合同额”相邻两期变化最大的是“2025-01”到“2025-02”，增加 15，增长 150%");
  });

  it("treats a period-name column as time and never sums period codes", () => {
    const revenue = [10957.17, 13771.41, 16133.16, 17507.71, 20174.39, 20293.24, 20039.42, 18783.81, 12027.87];
    const request = buildDataHubAnswerInsightRequest("2026年1至9月各月营业收入分别是多少？", "", [{
      columns: [
        { key: "period", title: "期间名称（冗余）" },
        { key: "code", title: "会计期间编码（YYYYMM）" },
        { key: "revenue", title: "营业收入合计（万元）", type: "number" }
      ],
      rows: revenue.map((value, index) => ({ period: `2026年${index + 1}月`, code: `20260${index + 1}`, revenue: value })),
      totalRows: 9
    }])!;
    const { facts } = request.tables[0];

    expect(facts).toContain("“营业收入合计（万元）”从“2026年1月”的 10,957.17 变为“2026年9月”的 12,027.87，增长 9.77%");
    expect(facts).toContain("“营业收入合计（万元）”相邻两期变化最大的是“2026年8月”到“2026年9月”，减少 6,755.94，下降 35.97%");
    expect(facts.join("\n")).not.toContain("会计期间编码");
  });

  it("puts a set of data before single values and keeps the payload within budget", () => {
    const scalar: DataHubTableResult = {
      columns: [{ key: "count", title: "合同数", type: "number" }], rows: [{ count: 12 }], totalRows: 1
    };
    const wide: DataHubTableResult = {
      columns: [{ key: "name", title: "合同名称" }, { key: "amount", title: "金额", type: "number" }],
      rows: Array.from({ length: 300 }, (_, index) => ({ name: `${"很长的合同名称".repeat(20)}${index}`, amount: index })),
      totalRows: 1200
    };
    const request = buildDataHubAnswerInsightRequest("合同情况", "", [scalar, wide])!;

    expect(request.tables.map((table) => table.totalRows)).toEqual([1200, 1]);
    expect(request.tables[0].facts[0]).toBe("结果共 1200 行，以下统计只基于返回的前 300 行");
    expect(String(request.tables[0].rows[0].name)).toHaveLength(81);
    expect(request.tables[0].rows.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(request).length).toBeLessThanOrEqual(48_000);
    expect(request.tables[1].facts).toEqual(["“合同数”为 12"]);
  });
});

describe("normalizeDataHubAnswerInsight", () => {
  it("drops empty insights and repeated or echoed follow-up questions", () => {
    expect(normalizeDataHubAnswerInsight({
      insights: [
        { title: "客服部偏高", detail: " 占 63.16%。 " },
        { title: "空的", detail: "" },
        { detail: "没有标题也保留" },
        "不是对象"
      ],
      followUps: ["客服部明细？", "客服部明细?", "各部门差旅费用？", "按月看变化", "", 3, "第四个"]
    }, "各部门差旅费用")).toEqual({
      insights: [
        { title: "客服部偏高", detail: "占 63.16%。" },
        { title: "", detail: "没有标题也保留" }
      ],
      followUps: ["客服部明细？", "按月看变化", "第四个"]
    });
    expect(normalizeDataHubAnswerInsight(null)).toEqual({ insights: [], followUps: [] });
  });
});

describe("remembered answer insights", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps the insight for a reopened conversation", () => {
    const insight = { insights: [{ title: "集中", detail: "前三项占八成。" }], followUps: ["看明细"] };
    rememberAnswerInsight("session-1::chat-1", insight);

    expect(readRememberedAnswerInsight("session-1::chat-1")).toEqual(insight);
    expect(readRememberedAnswerInsight("session-1::chat-2")).toBeUndefined();
  });
});
