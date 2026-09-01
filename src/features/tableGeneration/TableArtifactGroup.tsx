import { CaretDown, DownloadSimple, Table } from "@phosphor-icons/react";
import { Dropdown } from "antd";

export type TableArtifactRow = {
  /** 与结果台定位同一张表用的键，见 tableViewerKey。 */
  key: string;
  title: string;
  /** 「字段 N · 行 M」这一行灰字。 */
  meta: string;
};

type TableArtifactGroupProps = {
  rows: TableArtifactRow[];
  /** 正在结果台里浏览的那一张要标出来。 */
  activeKey: string;
  /** 整轮导出：流式还没定型时不给，跟消息级动作原来的口径一致。 */
  canExport: boolean;
  onOpen: (position: number) => void;
  onExport: (format: "csv" | "xlsx") => void;
  onExportTable: (position: number, format: "csv" | "xlsx") => void;
};

const exportItems = [
  { key: "csv", label: "导出 CSV" },
  { key: "xlsx", label: "导出 XLSX" }
];

/**
 * 一轮制表产出的全部结果表收在一张卡里：头部一行交代"这轮出了几张 + 整轮导出"，
 * 底下每张表占一行。两张表以上时不再是两张独立卡竖着堆，读起来是一组而不是一堆。
 * 表本身仍然不铺在对话列里——行是"打开结果台"的按钮。
 */
export function TableArtifactGroup({
  rows,
  activeKey,
  canExport,
  onOpen,
  onExport,
  onExportTable
}: TableArtifactGroupProps) {
  return (
    <section className="tgs-group" aria-label="结果表">
      <header className="tgs-group__head">
        <span className="tgs-group__icon" aria-hidden="true">
          <Table size={14} />
        </span>
        <span className="tgs-group__title">
          结果表
          <span className="tgs-group__count">{` · ${rows.length} 张`}</span>
        </span>
        {canExport ? (
          <Dropdown
            trigger={["click"]}
            menu={{ items: exportItems, onClick: ({ key }) => onExport(key as "csv" | "xlsx") }}
          >
            {/* Dropdown 要能挂 ref 的触发器；用原生按钮而非 antd Button，
                免得被页面层的 .xs-page .ant-btn 最小高度拉高，破坏这一行的密度。 */}
            <button className="tgs-group__export" type="button" aria-label="导出结果" aria-haspopup="menu">
              <DownloadSimple size={13} aria-hidden="true" />
              导出结果
              <CaretDown size={10} weight="bold" aria-hidden="true" />
            </button>
          </Dropdown>
        ) : null}
      </header>

      <ul className="tgs-group__list">
        {rows.map((row, position) => (
          <li
            key={row.key}
            className="tgs-group__row"
            data-active={row.key === activeKey || undefined}
          >
            <button
              className="tgs-group__open"
              type="button"
              aria-label={`浏览结果表：${row.title}`}
              onClick={() => onOpen(position)}
            >
              <span className="tgs-group__index" aria-hidden="true">{`表 ${position + 1}`}</span>
              <span className="tgs-group__name" title={row.title}>{row.title}</span>
              <span className="tgs-group__meta">{row.meta}</span>
            </button>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: exportItems,
                onClick: ({ key }) => onExportTable(position, key as "csv" | "xlsx")
              }}
            >
              <button
                className="tgs-group__row-export"
                type="button"
                aria-label={`导出结果表：${row.title}`}
                aria-haspopup="menu"
              >
                <DownloadSimple size={13} aria-hidden="true" />
                导出
              </button>
            </Dropdown>
          </li>
        ))}
      </ul>
    </section>
  );
}
