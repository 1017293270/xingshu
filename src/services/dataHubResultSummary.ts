import { createAiChartPlanRequestSummary, isDataHubScalarResult } from "./aiChartPlannerService";
import { formatDataHubColumnTitle, formatDataHubTableTitle } from "./dataHubFormat";
import { formatDataHubTableCell } from "./dataHubTableExport";
import type { DataHubTableResult } from "@/types/dataHub";

function literal(value: unknown) {
  return formatDataHubTableCell(value).replace(/\s+/g, " ").replace(/[\\`*_{}[\]()<>#+.!|~-]/g, "\\$&");
}

/** 保留表格中的结果事实；不合并多表、不推断业务口径或完整数据集的排名。 */
export function buildDataHubResultSummary(question: string, tables: DataHubTableResult[]): string {
  return tables.map((table, index) => {
    if (isDataHubScalarResult(table)) {
      const column = table.columns[0];
      return `${literal(formatDataHubColumnTitle(column.title, column.key))}：${literal(table.rows[0][column.key])}。`;
    }
    const prefix = tables.length > 1 ? `**${literal(formatDataHubTableTitle(table, index))}**\n\n` : "";
    if (!table.rows.length) return `${prefix}本次返回 0 行数据。`;

    const columns = createAiChartPlanRequestSummary({ question: "", tables: [table] }).tables[0].columns;
    const rankColumns = columns.filter((column) => /排名|名次|\brank\b/i.test(`${column.title} ${column.key}`));
    const dataColumns = columns.filter((column) => !rankColumns.includes(column));
    const dimensions = dataColumns.filter((column) => column.type === "dimension");
    const metrics = dataColumns.filter((column) => column.type === "number");
    const requestedTop = `${question} ${table.groupLabel ?? ""}`.match(/(?:top\s*|前\s*)(\d{1,3})(?!\d)/i)?.[1];
    const numberOf = (value: unknown) => value === null || value === undefined || String(value).trim() === ""
      ? Number.NaN : Number(String(value).replace(/,/g, ""));
    // ponytail: 自动排名仅支持单表、一个分类和一个数值列；多指标或多表继续摘录原始行。
    const rankColumn = rankColumns[0];
    const canRank = tables.length === 1 && dataColumns.length === 2 && dimensions.length === 1 && metrics.length === 1
      && rankColumns.length <= 1
      && (!rankColumn || table.rows.every((row) => Number.isInteger(numberOf(row[rankColumn.key])) && numberOf(row[rankColumn.key]) > 0))
      && Boolean(requestedTop && Number(requestedTop) > 0)
      && (!rankColumn || table.rows.some((row) => numberOf(row[rankColumn.key]) <= Number(requestedTop)))
      && table.rows.every((row) => Number.isFinite(numberOf(row[metrics[0].key]))
        && typeof row[dimensions[0].key] === "string" && String(row[dimensions[0].key]).trim()
        && !/^(?:合计|总计|小计|全部|汇总|total)$/i.test(String(row[dimensions[0].key]).trim()))
      && new Set(table.rows.map((row) => String(row[dimensions[0].key]).trim())).size === table.rows.length;
    const ascending = /最少|最低|最小|后\s*\d|倒数|升序/.test(question);
    let rows = table.source === "answer" ? table.rows : table.rows.slice(0, 3);
    let order = "，摘要如下";
    if (canRank) {
      const top = Number(requestedTop);
      const sorted = [...table.rows].sort((a, b) => rankColumn
        ? numberOf(a[rankColumn.key]) - numberOf(b[rankColumn.key])
        : (numberOf(a[metrics[0].key]) - numberOf(b[metrics[0].key])) * (ascending ? 1 : -1));
      const cutoff = numberOf(sorted[Math.min(top, sorted.length) - 1][metrics[0].key]);
      // 已返回名次优先；没有名次时只依据本表第 N 行数值扩展并列，不合并其他查询。
      rows = (table.source === "answer" ? table.rows : sorted).filter((row) => rankColumn
        ? numberOf(row[rankColumn.key]) <= top
        : ascending ? numberOf(row[metrics[0].key]) <= cutoff : numberOf(row[metrics[0].key]) >= cutoff);
      const count = Math.min(top, rows.length);
      const selection = rows.length > top ? `前 ${top} 名（含并列，共 ${rows.length} 项）` : `前 ${count} 项`;
      order = rankColumn ? `，按已返回排名列出${selection}`
        : table.source === "answer" ? `，列出本次返回数据的${selection}`
          : `，按${literal(metrics[0].title)}${ascending ? "升序" : "降序"}列出${selection}`;
    }
    const body = rows.map((row) => {
      if (canRank) {
        return `- **${literal(row[dimensions[0].key])}** — ${literal(metrics[0].title)}：**${literal(row[metrics[0].key])}**`;
      }
      return `- ${(table.source === "answer" ? columns : columns.slice(0, 3)).map((column) => `${literal(column.title)}：**${literal(row[column.key])}**`).join("；")}`;
    }).join("\n");
    return `${prefix}本次返回 **${table.rows.length} 行数据**${order}：\n\n${body}`;
  }).join("\n\n");
}
