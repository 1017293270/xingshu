import type { EChartsOption } from "echarts";
import { ArrowsOutSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DataHubTableResult } from "@/types/dataHub";
import { XsEChart } from "./XsEChart";

export type XsChartCardProps = {
  title: string;
  summary: string;
  option: EChartsOption;
  table: DataHubTableResult;
  className?: string;
  chartClassName?: string;
  action?: ReactNode;
  beforeChart?: ReactNode;
  afterChart?: ReactNode;
  chartAside?: ReactNode;
  headingLevel?: 2 | 3;
  ariaLabel?: string;
  contained?: boolean;
  maxTableRows?: number;
};

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function XsChartCard({
  title,
  summary,
  option,
  table,
  className = "",
  chartClassName = "",
  action,
  beforeChart,
  afterChart,
  chartAside,
  headingLevel = 3,
  ariaLabel,
  contained = true,
  maxTableRows = 50
}: XsChartCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chartLabel = `${title}。${summary}`;
  const visibleRows = table.rows.slice(0, maxTableRows);
  const totalRows = Math.max(table.totalRows, table.rows.length);
  const tableCaption =
    totalRows > visibleRows.length
      ? `${title}数据（前 ${visibleRows.length} 行，共 ${totalRows} 行）`
      : `${title}数据`;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const background = document.querySelector(".xs-shell") ?? fullscreenTriggerRef.current?.closest("article");
    const hadInert = background?.hasAttribute("inert") ?? false;
    const previousAriaHidden = background?.getAttribute("aria-hidden") ?? null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
        window.requestAnimationFrame(() => fullscreenTriggerRef.current?.focus());
      }
    };
    document.body.style.overflow = "hidden";
    background?.setAttribute("inert", "");
    background?.setAttribute("aria-hidden", "true");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      if (!hadInert) {
        background?.removeAttribute("inert");
      }
      if (previousAriaHidden === null) {
        background?.removeAttribute("aria-hidden");
      } else {
        background?.setAttribute("aria-hidden", previousAriaHidden);
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  const closeFullscreen = () => {
    setIsFullscreen(false);
    window.requestAnimationFrame(() => fullscreenTriggerRef.current?.focus());
  };

  return (
    <>
      <article className={`${contained ? "xs-card " : ""}xs-chart-card ${className}`.trim()} aria-label={ariaLabel}>
        <header className="xs-chart-card__head">
          <div>
            <Heading>{title}</Heading>
            <p className="xs-chart-card__summary">{summary}</p>
          </div>
          {action ? <div className="xs-chart-card__action">{action}</div> : null}
        </header>

        {beforeChart}
        {chartAside ? (
          <div className="xs-chart-card__visual">
            <XsEChart
              className={`xs-chart-card__chart ${chartClassName}`.trim()}
              option={option}
              label={chartLabel}
            />
            {chartAside}
          </div>
        ) : (
          <XsEChart
            className={`xs-chart-card__chart ${chartClassName}`.trim()}
            option={option}
            label={chartLabel}
          />
        )}
        {afterChart}

        <div className="xs-chart-card__footer">
          <button
            ref={fullscreenTriggerRef}
            type="button"
            className="xs-chart-card__fullscreen-trigger"
            aria-label={`全屏查看${title}`}
            onClick={() => setIsFullscreen(true)}
          >
            <ArrowsOutSimple size={16} aria-hidden="true" />
            全屏查看
          </button>
          <details className="xs-chart-card__data">
            <summary>查看数据</summary>
            <div className="xs-chart-card__table-scroll">
              <table className="xs-table">
                <caption>{tableCaption}</caption>
                <thead>
                  <tr>
                    {table.columns.map((column) => (
                      <th key={column.key} scope="col">
                        {column.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {table.columns.map((column) => (
                        <td key={column.key}>{formatCell(row[column.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </article>
      {isFullscreen
        ? createPortal(
            <div
              className="xs-chart-card__fullscreen"
              role="dialog"
              aria-modal="true"
              aria-label={`${title}全屏图表`}
            >
              <div className="xs-chart-card__fullscreen-panel">
                <header>
                  <div>
                    <h2>{title}</h2>
                    <p>{summary}</p>
                  </div>
                  <button type="button" autoFocus aria-label="关闭全屏图表" onClick={closeFullscreen}>
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>
                <XsEChart className="xs-chart-card__fullscreen-chart" option={option} label={chartLabel} />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
