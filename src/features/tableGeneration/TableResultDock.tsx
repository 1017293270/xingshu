import { CaretDown, Copy, DownloadSimple, FloppyDisk, X } from "@phosphor-icons/react";
import { Button, Dropdown } from "antd";
import { useEffect } from "react";
import { DataHubResultTable } from "@/components/xs/datahub";
import { formatDataHubTableTitle } from "@/services/dataHubFormat";
import type { DataHubAskTurn, DataHubTableResult } from "@/types/dataHub";

export type TableViewerItem = {
  key: string;
  turn: DataHubAskTurn;
  table: DataHubTableResult;
  /** 这张表来自第几轮，1 起。 */
  round: number;
  /** 这一轮里的第几张，0 起。 */
  position: number;
};

type TableResultDockProps = {
  /** 会话里全部结果表，按轮次顺序；多于一张时顶部出 tab 条。 */
  items: TableViewerItem[];
  active: TableViewerItem;
  /** 面板预览行数上限，比对话流里宽松得多。 */
  rowLimit: number;
  onSelect: (key: string) => void;
  onClose: () => void;
  onCopy: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onSaveTemplate: () => void;
};

/**
 * 结果台：打开表之后右侧的分栏工作区，不是浮层。
 * 自带头部与底栏，所以内部那张共享结果表组件的表头和行数脚注由样式收掉，避免两层头。
 */
export function TableResultDock({
  items,
  active,
  rowLimit,
  onSelect,
  onClose,
  onCopy,
  onExport,
  onSaveTemplate
}: TableResultDockProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = formatDataHubTableTitle(active.table);
  const datasourceName = active.turn.dataSources.at(-1)?.datasourceName ?? "";
  const previewRows = Math.min(active.table.rows.length, rowLimit);
  const truncated = active.table.totalRows > previewRows;

  return (
    <aside className="tgs__dock" aria-label="结果表预览">
      <header className="tgs-dock__head">
        <div className="tgs-dock__identity">
          <h2 title={title}>{title}</h2>
          <p className="tgs-dock__desc" title={active.turn.question}>{active.turn.question}</p>
          <p className="tgs-dock__meta">
            {`第 ${active.round} 轮 · 字段 ${active.table.columns.length} · 行 ${active.table.totalRows}`}
            {datasourceName ? ` · ${datasourceName}` : ""}
          </p>
        </div>
      </header>

      {items.length > 1 ? (
        <div className="tgs-dock__tabs" role="tablist" aria-label="会话内的结果表">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="tgs-dock__tab"
              aria-selected={item.key === active.key}
              onClick={() => onSelect(item.key)}
            >
              {`第${item.round}轮 · 表${item.position + 1}`}
            </button>
          ))}
        </div>
      ) : null}

      <div className="tgs-dock__tools">
        <Button
          type="text"
          size="small"
          aria-label="复制结果表"
          icon={<Copy size={14} aria-hidden="true" />}
          onClick={onCopy}
        >
          复制
        </Button>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "csv", label: "导出 CSV" },
              { key: "xlsx", label: "导出 XLSX" }
            ],
            onClick: ({ key }) => onExport(key as "csv" | "xlsx")
          }}
        >
          <Button
            type="text"
            size="small"
            aria-label="下载当前结果表"
            aria-haspopup="menu"
            icon={<DownloadSimple size={14} aria-hidden="true" />}
          >
            导出
            <CaretDown size={11} weight="bold" aria-hidden="true" />
          </Button>
        </Dropdown>
        <Button
          type="text"
          size="small"
          aria-label="把当前结果表存为模板"
          icon={<FloppyDisk size={14} aria-hidden="true" />}
          onClick={onSaveTemplate}
        >
          存为模板
        </Button>
        <span className="tgs-dock__tools-spacer" />
        <Button
          className="tgs-dock__close"
          type="text"
          size="small"
          aria-label="关闭预览"
          icon={<X size={15} aria-hidden="true" />}
          onClick={onClose}
        />
      </div>

      <div className="tgs-dock__body">
        <DataHubResultTable table={active.table} rowLimit={rowLimit} key={active.key} />
      </div>

      <footer className="tgs-dock__foot">
        <span>
          {truncated
            ? <>预览前 <b>{previewRows}</b> 行，导出可获得全部 <b>{active.table.totalRows}</b> 行</>
            : <>已显示全部 <b>{active.table.totalRows}</b> 行</>}
        </span>
        {active.table.source ? <span>{active.table.source}</span> : null}
      </footer>
    </aside>
  );
}
