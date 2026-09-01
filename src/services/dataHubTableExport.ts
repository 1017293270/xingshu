import { formatDataHubColumnTitle, formatDataHubTableTitle } from "@/services/dataHubFormat";
import type { DataHubTableResult } from "@/types/dataHub";

export function formatDataHubTableCell(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function countDataHubTableRows(tables: DataHubTableResult[]) {
  return tables.reduce((count, table) => count + table.rows.length, 0);
}

export function sanitizeCsvBasename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 28);
}

function escapeCsvCell(value: unknown) {
  const text = formatDataHubTableCell(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildDataHubTablesCsv(tables: DataHubTableResult[]) {
  return tables
    .map((table, index) => {
      const title = formatDataHubTableTitle(table, index);
      const header = table.columns
        .map((column) => escapeCsvCell(formatDataHubColumnTitle(column.title, column.key)))
        .join(",");
      const rows = table.rows.map((row) => table.columns.map((column) => escapeCsvCell(row[column.key])).join(","));

      return [escapeCsvCell(title), header, ...rows].join("\r\n");
    })
    .join("\r\n\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportDataHubTablesCsv(tables: DataHubTableResult[], basename: string) {
  const rowCount = countDataHubTableRows(tables);
  if (rowCount === 0) {
    return 0;
  }

  const safeName = sanitizeCsvBasename(basename) || "结果表";
  downloadCsv(`${safeName}-${new Date().toISOString().slice(0, 10)}.csv`, buildDataHubTablesCsv(tables));
  return rowCount;
}

/** XLSX 工作表名：≤31 字符、去掉 Excel 禁用字符，并在多表同名时追加序号保证唯一。 */
function sheetNameOf(title: string, index: number, used: Set<string>) {
  const base = title.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 28) || `结果表${index + 1}`;
  let name = base;
  let attempt = 2;
  while (used.has(name)) {
    name = `${base.slice(0, 25)}(${attempt})`;
    attempt += 1;
  }
  used.add(name);
  return name;
}

/**
 * 导出 XLSX：每份结果表一个工作表，数值保持数值类型。
 * xlsx 体积大，动态 import 惰性分包，不进主包预算。
 */
export async function exportDataHubTablesXlsx(tables: DataHubTableResult[], basename: string) {
  const rowCount = countDataHubTableRows(tables);
  if (rowCount === 0) {
    return 0;
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  tables.forEach((table, index) => {
    const header = table.columns.map((column) => formatDataHubColumnTitle(column.title, column.key));
    const rows = table.rows.map((row) =>
      table.columns.map((column) => {
        const value = row[column.key];
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : formatDataHubTableCell(value);
      })
    );
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      sheetNameOf(formatDataHubTableTitle(table, index), index, usedNames)
    );
  });

  const safeName = sanitizeCsvBasename(basename) || "结果表";
  XLSX.writeFile(workbook, `${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return rowCount;
}
