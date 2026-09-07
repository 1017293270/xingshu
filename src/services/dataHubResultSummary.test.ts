import { describe, expect, it } from "vitest";
import { buildDataHubResultSummary } from "./dataHubResultSummary";
import type { DataHubTableResult } from "@/types/dataHub";

const table: DataHubTableResult = {
  columns: [{ key: "name", title: "公司" }, { key: "count", title: "合同数量", type: "number" }],
  rows: [{ name: "甲公司", count: 2 }, { name: "乙公司", count: 6 }, { name: "丙公司", count: 5 }, { name: "丁公司", count: 3 }],
  totalRows: 400, source: "cube"
};

describe("returned data summary", () => {
  it("ranks only returned rows and does not mutate the full table", () => {
    const result = buildDataHubResultSummary("合同数量top3", [table]);
    expect(result).toContain("本次返回 **4 行数据**，按合同数量降序列出前 3 项");
    expect(result).toContain("**乙公司** — 合同数量：**6**");
    expect(result.indexOf("乙公司")).toBeLessThan(result.indexOf("丙公司"));
    expect(result).not.toContain("甲公司");
    expect(result).not.toContain("400");
    expect(table.rows[0].name).toBe("甲公司");
    expect(buildDataHubResultSummary("合同数量最少的前2名", [table])).toContain("升序列出前 2 项");
  });

  it("keeps ambiguous queries and multiple result sets separate without inventing a combined ranking", () => {
    const second = { ...table, tableIndex: 1, columns: [...table.columns, { key: "amount", title: "金额", type: "number" }] };
    const result = buildDataHubResultSummary("top3", [table, second]);
    expect(result).toContain("结果表 1");
    expect(result).toContain("结果表 2");
    expect(result).not.toContain("降序");
    expect(buildDataHubResultSummary("top3", [second])).not.toContain("降序");
    expect(buildDataHubResultSummary("top3", [{ ...table, rows: [...table.rows, { name: "甲公司", count: 8 }] }])).not.toContain("降序");
    expect(buildDataHubResultSummary("top3", [{ ...table, rows: [...table.rows, { name: "总计", count: 16 }] }])).not.toContain("降序");
  });

  it("does not rank absent or malformed numbers and escapes data as literal text", () => {
    expect(buildDataHubResultSummary("top3", [{ ...table, rows: [{ name: "甲公司", count: null }] }])).not.toContain("降序");
    expect(buildDataHubResultSummary("top3", [{ ...table, rows: [{ name: "甲公司", count: "不是数值" }] }])).not.toContain("降序");
    const result = buildDataHubResultSummary("合同列表", [{ ...table, rows: [{ name: "[供应商](https://example.com)\n#标题", count: 0 }] }]);
    expect(result).toContain("\\[供应商\\]\\(https://example\\.com\\) \\#标题");
    expect(result).toContain("合同数量：**0**");
  });

  it("preserves scalar values and reports zero returned rows honestly", () => {
    expect(buildDataHubResultSummary("合同数", [{ ...table, columns: [table.columns[1]], rows: [{ count: 0 }], totalRows: 1 }])).toBe("合同数量：0。");
    expect(buildDataHubResultSummary("合同数", [{ ...table, rows: [] }])).toBe("本次返回 0 行数据。");
    expect(buildDataHubResultSummary("合同数", [])).toBe("");
  });
});

it("uses the supplied rank column and includes all third-place ties but not fourth place", () => {
  const ranked: DataHubTableResult = {
    columns: [{ key: "rank", title: "排名" }, ...table.columns], source: "answer",
    groupLabel: "合同对手方数量排名（Top 3，并列全部列出）", totalRows: 5,
    rows: [
      { rank: 1, name: "甲公司", count: 9 }, { rank: 2, name: "乙公司", count: 7 },
      { rank: 3, name: "丙公司", count: 5 }, { rank: 3, name: "丁公司", count: 5 },
      { rank: 4, name: "戊公司", count: 5 }
    ]
  };
  const result = buildDataHubResultSummary("签约公司", [ranked]);
  expect(result).toContain("**丙公司** — 合同数量：**5**");
  expect(result).toContain("**丁公司** — 合同数量：**5**");
  expect(result).not.toContain("戊公司");
  expect(result).toContain("并列");
});

it("includes numeric cutoff ties without claiming a combined or unseen ranking", () => {
  const result = buildDataHubResultSummary("合同数量top3，并列全部", [{ ...table, totalRows: 100,
    rows: [{ name: "甲公司", count: 9 }, { name: "乙公司", count: 7 }, { name: "丙公司", count: 5 },
      { name: "丁公司", count: 5 }, { name: "戊公司", count: 4 }] }]);
  expect(result).toContain("丁公司");
  expect(result).not.toContain("戊公司");
  expect(result).not.toContain("100");
});

it("keeps ambiguous answer rows as returned instead of inferring ranks from a heading", () => {
  const result = buildDataHubResultSummary("Top3", [{ ...table, source: "answer", groupLabel: "Top3",
    rows: [{ name: "甲公司", count: 9 }, { name: "甲公司", count: 7 }, { name: "丙公司", count: null }, { name: "丁公司", count: 4 }] }]);
  expect(result).toContain("丁公司");
  expect(result).not.toContain("降序");
});
