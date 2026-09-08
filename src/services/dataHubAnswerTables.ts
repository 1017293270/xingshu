import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes } from "mdast";
import type { DataHubTableResult } from "@/types/dataHub";
import { formatDataHubColumnTitle } from "./dataHubFormat";
import { formatDataHubTableCell } from "./dataHubTableExport";

const parser = unified().use(remarkParse).use(remarkGfm);

function visibleText(node: Nodes): string {
  if ("value" in node) return node.value;
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if (node.type === "break") return "\n";
  return "children" in node ? node.children.map(visibleText).join("") : "";
}

/** 与回答渲染共用 GFM 解析规则，只提取真实表节点，代码示例及其他正文保持原样。 */
export function splitDataHubAnswerTables(markdown: string): { answer: string; tables: DataHubTableResult[] } {
  const tables: DataHubTableResult[] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let heading = "";
  function visit(node: Nodes) {
    if (node.type === "heading") heading = visibleText(node);
    if (node.type === "table") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start == null || end == null || !node.children.length) return;
      const columns = node.children[0].children.map((cell, index) => ({ key: `col_${index + 1}`, title: visibleText(cell) }));
      const rows = node.children.slice(1).map((row) => Object.fromEntries(
        columns.map((column, index) => [column.key, row.children[index] ? visibleText(row.children[index]) : ""])
      ));
      tables.push({ columns, rows, totalRows: rows.length, tableIndex: tables.length, source: "answer", groupLabel: heading || "回答中的表格" });
      // 嵌套表的首行还带引用/列表容器标记；一并移除该空容器，不改其他段落。
      const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
      const prefix = markdown.slice(lineStart, start);
      ranges.push({ start: /^[\s>\d.+*-]*$/.test(prefix) ? lineStart : start, end });
    } else if ("children" in node) {
      node.children.forEach(visit);
    }
  }
  visit(parser.parse(markdown));
  let answer = markdown;
  for (const { start, end } of ranges.reverse()) answer = answer.slice(0, start) + answer.slice(end);
  return { answer: tables.length ? answer.trim() : markdown, tables };
}

/** 保留每个原始查询，仅避免再加入正文中复述的同一张表。 */
export function appendDataHubAnswerTables(queried: DataHubTableResult[], answers: DataHubTableResult[]) {
  const signature = (table: DataHubTableResult) => JSON.stringify([
    table.columns.map((column) => formatDataHubColumnTitle(column.title, column.key)),
    table.rows.map((row) => table.columns.map((column) => formatDataHubTableCell(row[column.key])))
  ]);
  const seen = new Set(queried.map(signature));
  return [...queried, ...answers.filter((table) => {
    const key = signature(table);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })].map((table, tableIndex) => ({ ...table, tableIndex }));
}
