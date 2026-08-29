import { CopySimple, DownloadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { formatDataHubColumnTitle, formatDataHubTableTitle, getDataHubColumnMinWidth } from "@/services/dataHubFormat";
import {
  buildDataHubTablesCsv,
  downloadCsv,
  formatDataHubTableCell,
  sanitizeCsvBasename
} from "@/services/dataHubTableExport";
import type { DataHubTableColumn, DataHubTableResult } from "@/types/dataHub";

type DataHubResultTableProps = {
  table: DataHubTableResult;
  onStatus?: (message: string) => void;
  /** 预览行数上限。默认按对话流里的紧凑预览给 20；整块侧栏在看表时可以放宽。 */
  rowLimit?: number;
};

const PREVIEW_ROW_LIMIT = 20;

/** 数值型单元格：整数、小数、千分位、正负号、百分比。用于右对齐与等宽表格数字。 */
const numericCellPattern = /^[+-]?[\d,]+(?:\.\d+)?%?$/;

function isNumericColumn(column: DataHubTableColumn, rows: Record<string, unknown>[]) {
  const values = rows
    .map((row) => formatDataHubTableCell(row[column.key]))
    .filter((text) => text !== "-");

  if (values.length === 0) {
    return false;
  }

  return values.every((text) => numericCellPattern.test(text));
}

export function DataHubResultTable({
  table,
  onStatus,
  rowLimit = PREVIEW_ROW_LIMIT
}: DataHubResultTableProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdge, setScrollEdge] = useState<"none" | "start" | "end" | "both">("none");
  const previewRows = table.rows.slice(0, rowLimit);
  const hiddenRowCount = Math.max(0, table.totalRows - previewRows.length);
  const tableTitle = formatDataHubTableTitle(table);
  const numericColumnKeys = new Set(
    table.columns.filter((column) => isNumericColumn(column, previewRows)).map((column) => column.key)
  );
  // 横向溢出提示：只有真正被裁切时才显示渐隐边缘，避免给窄表加无意义的装饰。
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const syncEdge = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      if (maxScroll <= 1) {
        setScrollEdge("none");
        return;
      }

      const atStart = element.scrollLeft <= 1;
      const atEnd = element.scrollLeft >= maxScroll - 1;
      setScrollEdge(atStart ? "end" : atEnd ? "start" : "both");
    };

    syncEdge();
    element.addEventListener("scroll", syncEdge, { passive: true });

    // ResizeObserver 在测试环境与老浏览器里可能缺席，回落到窗口尺寸变化。
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncEdge);
      return () => {
        element.removeEventListener("scroll", syncEdge);
        window.removeEventListener("resize", syncEdge);
      };
    }

    const observer = new ResizeObserver(syncEdge);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", syncEdge);
      observer.disconnect();
    };
  }, [table]);

  return (
    <article className="datahub-table-card">
      <div className="datahub-result-head">
        <h3 title={tableTitle}>{tableTitle}</h3>
        <div className="datahub-table-card__actions">
          <button
            type="button"
            className="analysis-icon-button"
            aria-label="复制表格"
            onClick={async () => {
              const csv = buildDataHubTablesCsv([table]);
              try {
                await navigator.clipboard.writeText(csv);
                onStatus?.(`已复制 ${table.rows.length} 行表格`);
              } catch {
                onStatus?.("复制表格失败，请稍后重试");
              }
            }}
          >
            <CopySimple size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="analysis-icon-button"
            aria-label="下载表格"
            onClick={() => {
              const basename = sanitizeCsvBasename(tableTitle) || "问数表格";
              downloadCsv(`${basename}-${new Date().toISOString().slice(0, 10)}.csv`, buildDataHubTablesCsv([table]));
              onStatus?.(`已导出 ${table.rows.length} 行问数结果`);
            }}
          >
            <DownloadSimple size={16} aria-hidden="true" />
          </button>
        </div>
        {/* 口径条：字段数、行数 */}
        <dl className="datahub-result-meta">
          <div>
            <dt>字段</dt>
            <dd data-numeric="true">{table.columns.length}</dd>
          </div>
          <div>
            <dt>行数</dt>
            <dd data-numeric="true">{table.totalRows}</dd>
          </div>
        </dl>
      </div>
      <div className="datahub-table-scroll" data-edge={scrollEdge} ref={scrollRef} tabIndex={0}>
        <table className="xs-table xs-table--data">
          <thead>
            <tr>
              <th className="xs-table__gutter" scope="col">
                <span className="sr-only">行号</span>
              </th>
              {table.columns.map((column) => {
                const title = formatDataHubColumnTitle(column.title, column.key);
                const numeric = numericColumnKeys.has(column.key);

                return (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.title}
                    data-numeric={numeric ? "true" : undefined}
                    style={{ minWidth: getDataHubColumnMinWidth(column) }}
                  >
                    {title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={`${table.tableIndex}-${rowIndex}`}>
                <td className="xs-table__gutter">{rowIndex + 1}</td>
                {table.columns.map((column) => {
                  const cellText = formatDataHubTableCell(row[column.key]);
                  const numeric = numericColumnKeys.has(column.key);

                  return (
                    <td
                      key={column.key}
                      title={cellText}
                      data-numeric={numeric ? "true" : undefined}
                      data-empty={cellText === "-" ? "true" : undefined}
                    >
                      {cellText}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenRowCount > 0 ? (
        <p className="datahub-table-card__note">
          预览前 {previewRows.length} 行，导出可获得全部 {table.totalRows} 行
        </p>
      ) : null}
    </article>
  );
}
