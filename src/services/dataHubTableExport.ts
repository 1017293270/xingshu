import { formatDataHubColumnTitle } from "@/services/dataHubFormat";
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
      const title = table.groupLabel || `结果表 ${table.tableIndex !== undefined ? table.tableIndex + 1 : index + 1}`;
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
