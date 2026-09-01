import { DownloadSimple, Table } from "@phosphor-icons/react";
import { Button, Dropdown } from "antd";

export type TableArtifactCardProps = {
  title: string;
  /** 「字段 N · 行 M」这一行灰字。 */
  meta: string;
  /** 正在结果台里浏览的那一张要标出来。 */
  active: boolean;
  onOpen: () => void;
  onExport: (format: "csv" | "xlsx") => void;
};

/**
 * 结果表在对话流里的工件卡：一行 1px 边框的条子，表名 + 口径灰字 + 行内动作。
 * 整卡就是"打开结果台"的按钮，导出单独一颗，避免几十行数据摊进对话列。
 */
export function TableArtifactCard({ title, meta, active, onOpen, onExport }: TableArtifactCardProps) {
  return (
    <article className="tgs-artifact" aria-label="结果表" data-active={active || undefined}>
      <button
        type="button"
        className="tgs-artifact__open"
        aria-label={`浏览结果表：${title}`}
        onClick={onOpen}
      >
        <span className="tgs-artifact__icon">
          <Table size={15} aria-hidden="true" />
        </span>
        <span className="tgs-artifact__name" title={title}>{title}</span>
        <span className="tgs-artifact__meta">{meta}</span>
        <span className="tgs-artifact__cue" aria-hidden="true">打开</span>
      </button>
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
          className="tgs-artifact__export"
          type="text"
          size="small"
          aria-label={`导出结果表：${title}`}
          aria-haspopup="menu"
          icon={<DownloadSimple size={14} aria-hidden="true" />}
        >
          导出
        </Button>
      </Dropdown>
    </article>
  );
}
