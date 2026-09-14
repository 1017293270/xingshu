import { Pagination } from "antd";
import { CopySimple, DownloadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/services/clipboard";
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
  compact?: boolean;
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
  rowLimit = PREVIEW_ROW_LIMIT,
  compact = false
}: DataHubResultTableProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdge, setScrollEdge] = useState<"none" | "start" | "end" | "both">("none");
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const returnedRows = table.rows.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(returnedRows / PREVIEW_ROW_LIMIT)));
  const offset = compact && expanded ? (currentPage - 1) * PREVIEW_ROW_LIMIT : 0;
  const previewRows = table.rows.slice(offset, offset + (compact ? expanded ? PREVIEW_ROW_LIMIT : 5 : rowLimit));
  const hiddenRowCount = Math.max(0, returnedRows - previewRows.length);
  const totalRowsKnown = table.totalRowsKnown !== false && Number.isFinite(table.totalRows) && table.totalRows >= returnedRows;
  const partial = totalRowsKnown && table.totalRows > returnedRows;
  const rowSummary = `已返回 ${returnedRows} 行${partial ? `，结果共 ${table.totalRows} 行` : ""}`;
  const tableTitle = table.title?.trim() || formatDataHubTableTitle(table);
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
  }, [table, compact, expanded, currentPage]);

  return (
    <article className={`datahub-table-card${compact ? " datahub-table-card--compact" : ""}`}>
      <div className="datahub-result-head">
        {compact ? <span className="datahub-table-card__toolbar-summary">
          {rowSummary}{expanded && returnedRows > 0 ? ` · 当前 ${offset + 1}–${offset + previewRows.length} 行` : ""}
        </span> : <h3 title={tableTitle}>{tableTitle}</h3>}
        <div className="datahub-table-card__actions">
          <button
            type="button"
            className="analysis-icon-button"
            aria-label="复制表格"
            onClick={async () => {
              const copied = await copyText(buildDataHubTablesCsv([table]));
              onStatus?.(copied ? `已复制 ${table.rows.length} 行表格` : "复制表格失败，请稍后重试");
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
        {!compact ? <dl className="datahub-result-meta">
          <div>
            <dt>字段</dt>
            <dd data-numeric="true">{table.columns.length}</dd>
          </div>
          <div>
            <dt>已返回</dt>
            <dd data-numeric="true">{returnedRows}</dd>
          </div>
        </dl> : null}
      </div>
      <div className="datahub-table-scroll" data-edge={scrollEdge} ref={scrollRef} tabIndex={0}>
        <table className="xs-table xs-table--data">
          <caption className="sr-only">{tableTitle}</caption>
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
                <td className="xs-table__gutter">{offset + rowIndex + 1}</td>
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
      {returnedRows === 0 ? <p className="datahub-table-card__note">本次返回 0 行数据。</p> : null}
      {compact && returnedRows > 5 ? <div className="datahub-table-card__pagination">
        <button type="button" className="datahub-table-card__expand" aria-expanded={expanded}
          onClick={() => { setExpanded(!expanded); setPage(1); }}>
          {expanded ? "收起结果表" : `查看全部 ${returnedRows} 行`}
        </button>
        {expanded && returnedRows > PREVIEW_ROW_LIMIT ? <Pagination size="small" current={currentPage}
          pageSize={PREVIEW_ROW_LIMIT} total={returnedRows} showSizeChanger={false} onChange={setPage} /> : null}
      </div> : null}
      {partial || hiddenRowCount > 0 ? (
        <p className="datahub-table-card__note">
          {!compact ? `${rowSummary}。` : ""}
          {compact && expanded ? `每页展示最多 ${PREVIEW_ROW_LIMIT} 行。` : `预览前 ${previewRows.length} 行。`}
          复制和导出包含已返回的 {returnedRows} 行{partial ? "，不含尚未返回的数据" : ""}。
        </p>
      ) : null}
    </article>
  );
}
