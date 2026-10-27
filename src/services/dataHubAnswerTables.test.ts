import { describe, expect, it } from "vitest";
import { appendDataHubAnswerTables, inlineDataHubSingleRowTables, splitDataHubAnswerTables } from "./dataHubAnswerTables";

describe("splitDataHubAnswerTables", () => {
  it("does not repeat a returned table in the dropdown or merge independent query results", () => {
    const native = { columns: [{ key: "name", title: "名称" }, { key: "count", title: "数量" }],
      rows: [{ name: "甲", count: 12 }], totalRows: 1, source: "cube" };
    const markdown = splitDataHubAnswerTables("| 名称 | 数量 |\n| --- | --- |\n| 甲 | 12 |");
    expect(appendDataHubAnswerTables([native, native], markdown.tables)).toHaveLength(2);
    const different = splitDataHubAnswerTables("| 名称 | 数量 |\n| --- | --- |\n| 乙 | 8 |");
    const merged = appendDataHubAnswerTables([native], [...markdown.tables, ...different.tables]);
    expect(merged).toHaveLength(2);
    expect(merged.map((table) => table.tableIndex)).toEqual([0, 1]);
  });

  it("moves a one-row nonnumeric result table while preserving surrounding content", () => {
    const result = splitDataHubAnswerTables("## 查询结果\n\n结论保持。\n\n| 名称 | 状态 |\n| --- | --- |\n| 合同甲 | 已签署 |\n\n- 保留备注");
    expect(result.answer).toBe("## 查询结果\n\n结论保持。\n\n\n\n- 保留备注");
    expect(result.tables).toEqual([{ columns: [{ key: "col_1", title: "名称" }, { key: "col_2", title: "状态" }],
      rows: [{ col_1: "合同甲", col_2: "已签署" }], totalRows: 1, tableIndex: 0, source: "answer", groupLabel: "查询结果" }]);
  });

  it("returns an empty answer for table-only output and supports optional outer pipes", () => {
    const result = splitDataHubAnswerTables("名称 | 数量\n:--- | ---:\n甲 | 12");
    expect(result.answer).toBe("");
    expect(result.tables[0].rows).toEqual([{ col_1: "甲", col_2: "12" }]);
  });

  it("keeps escaped pipes, inline code and duplicate column names in distinct cells", () => {
    const result = splitDataHubAnswerTables("| 项目 | 项目 |\n| --- | --- |\n| **甲**\\|乙 | `a\\|b` |");
    expect(result.tables[0].columns.map((column) => column.title)).toEqual(["项目", "项目"]);
    expect(result.tables[0].rows).toEqual([{ col_1: "甲|乙", col_2: "a|b" }]);
  });

  it("preserves fenced and inline table examples and invalid table syntax", () => {
    for (const input of [
      "```md\n| 甲 | 乙 |\n| --- | --- |\n| a | b |\n```",
      "~~~\n甲 | 乙\n--- | ---\na | b\n~~~",
      "示例：`| 甲 | 乙 |`，不是结果表。",
      "| 甲 | 乙 |\n| 不合法分隔 | --- |\n| a | b |"
    ]) expect(splitDataHubAnswerTables(input)).toEqual({ answer: input, tables: [] });
  });

  it("keeps lists and headings while extracting multiple tables including a quoted table", () => {
    const input = "# 第一份\n\n| 名称 |\n| --- |\n| 甲 |\n\n- 保留列表\n\n## 第二份\n\n> | 状态 |\n> | --- |\n> | 完成 |\n\n正文保留";
    const result = splitDataHubAnswerTables(input);
    expect(result.tables.map((table) => table.groupLabel)).toEqual(["第一份", "第二份"]);
    expect(result.tables.map((table) => table.rows)).toEqual([[{ col_1: "甲" }], [{ col_1: "完成" }]]);
    expect(result.answer).toContain("- 保留列表");
    expect(result.answer).toContain("## 第二份");
    expect(result.answer).toContain("正文保留");
    expect(result.answer).not.toContain("|");
    expect(result.answer).not.toContain(">");
  });
});

describe("inlineDataHubSingleRowTables", () => {
  it("rewrites a one-row table as a sentence and leaves real tables alone", () => {
    expect(inlineDataHubSingleRowTables("全市养老机构数量：\n\n| 养老机构数量（家） |\n| --- |\n| **97** |\n\n以上。"))
      .toBe("全市养老机构数量：\n\n养老机构数量（家）：97\n\n以上。");
    expect(inlineDataHubSingleRowTables("- | 名称 | 状态 |\n  | --- | --- |\n  | 合同甲 | 已签署 |"))
      .toBe("- 名称：合同甲；状态：已签署");

    const ranking = "| 名称 | 数量 |\n| --- | --- |\n| 甲 | 12 |\n| 乙 | 8 |";
    expect(inlineDataHubSingleRowTables(ranking)).toBe(ranking);
    const wide = "| 一 | 二 | 三 | 四 | 五 |\n| --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 |";
    expect(inlineDataHubSingleRowTables(wide)).toBe(wide);
    expect(inlineDataHubSingleRowTables("```\n| a |\n| --- |\n| 1 |\n```")).toBe("```\n| a |\n| --- |\n| 1 |\n```");
  });
});
