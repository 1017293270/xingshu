import { useEffect, useRef, useState } from "react";
import { formatDataHubColumnTitle, getDataHubColumnMinWidth } from "@/services/dataHubFormat";
import { formatDataHubTableCell } from "@/services/dataHubTableExport";
import type { DataHubTableColumn, DataHubTableResult } from "@/types/dataHub";

type DataHubResultTableProps = {
  table: DataHubTableResult;
  /** 命中的数据源名称，来自本轮 data_source_selected 事件；缺省时回落到表自带的 source。 */
  datasourceName?: string;
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

export function DataHubResultTable({ table, datasourceName }: DataHubResultTableProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdge, setScrollEdge] = useState<"none" | "start" | "end" | "both">("none");
  const previewRows = table.rows.slice(0, PREVIEW_ROW_LIMIT);
  const hiddenRowCount = Math.max(0, table.totalRows - previewRows.length);
  const source = datasourceName || table.source || "data-hub";
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
        <h3>{table.groupLabel || `结果表 ${table.tableIndex !== undefined ? table.tableIndex + 1 : 1}`}</h3>
        {/* 口径条：表格可信度的全部依据——来源、字段数、行数 */}
        <dl className="datahub-result-meta">
          <div>
            <dt>数据源</dt>
            <dd title={source}>{source}</dd>
          </div>
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
