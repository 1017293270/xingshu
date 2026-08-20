import type { EChartsOption } from "echarts";
import { ArrowsOutSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DataHubTableResult } from "@/types/dataHub";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";
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
  motionPreset?: "inherit" | "subtle" | "none";
  /**
   * 「全屏查看 / 查看数据」放哪：默认独占卡片页脚；`head` 挪进标题行右侧。
   * 定高卡片里页脚是纯开销（1px 上边线 + 40px 行高 + 间距），只有一屏看板需要 `head`。
   */
  controlsPlacement?: "footer" | "head";
  /** 是否展示「查看数据」展开表。数据资产看板这类汇总图不需要源表明细。 */
  showDataTable?: boolean;
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
  maxTableRows = 50,
  motionPreset = "inherit",
  controlsPlacement = "footer",
  showDataTable = true
}: XsChartCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenTriggerRef = useRef<HTMLButtonElement | null>(null);
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

  const controls = (
    <div className="xs-chart-card__controls">
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
      {showDataTable ? (
        <details className="xs-chart-card__data">
          <summary>查看数据</summary>
          <div className="xs-chart-card__table-scroll">
            <table className="xs-table">
              <caption>{tableCaption}</caption>
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column.key} scope="col" title={column.title}>
                      {formatDataHubColumnTitle(column.title, column.key)}
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
      ) : null}
    </div>
  );
  const controlsInHead = controlsPlacement === "head";

  return (
    <>
      <article className={`${contained ? "xs-card " : ""}xs-chart-card ${className}`.trim()} aria-label={ariaLabel}>
        <header className="xs-chart-card__head">
          <div>
            <Heading>{title}</Heading>
            <p className="xs-chart-card__summary">{summary}</p>
          </div>
          {action || controlsInHead ? (
            <div className="xs-chart-card__action">
              {action}
              {controlsInHead ? controls : null}
            </div>
          ) : null}
        </header>

        {beforeChart}
        {chartAside ? (
          <div className="xs-chart-card__visual">
            <XsEChart
              className={`xs-chart-card__chart ${chartClassName}`.trim()}
              option={option}
              label={title}
              summary={summary}
              motionPreset={motionPreset}
            />
            {chartAside}
          </div>
        ) : (
          <XsEChart
            className={`xs-chart-card__chart ${chartClassName}`.trim()}
            option={option}
            label={title}
            summary={summary}
            motionPreset={motionPreset}
          />
        )}
        {afterChart}

        {controlsInHead ? null : <div className="xs-chart-card__footer">{controls}</div>}
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
                <XsEChart
                  className="xs-chart-card__fullscreen-chart"
                  option={option}
                  label={title}
                  summary={summary}
                  motionPreset={motionPreset}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
