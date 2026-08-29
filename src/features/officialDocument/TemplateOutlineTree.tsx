import { CaretDown, CaretRight, Table, TextAa, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import type { TemplateOutlineItem } from "./templateOutline";

export type TemplateOutlineTreeProps = {
  items: TemplateOutlineItem[];
  /** 当前高亮的结构节点 id；由文档预览的滚动位置或点击共同决定。 */
  activeNodeId?: string;
  onSelect: (nodeId: string) => void;
};

/** 正文归并项默认折叠；展开后逐段列出，方便定位到具体某一段。 */
function OutlineRow({
  item,
  activeNodeId,
  onSelect
}: {
  item: TemplateOutlineItem;
  activeNodeId?: string;
  onSelect: (nodeId: string) => void;
}) {
  const expandable = item.children.length > 0 || item.nodes.length > 1;
  const [expanded, setExpanded] = useState(item.kind === "heading");
  const contains = item.nodes.some((node) => node.id === activeNodeId);

  return (
    <li className="template-outline__item" data-kind={item.kind} data-depth={item.depth}>
      <div className="template-outline__row" data-active={contains || undefined}>
        {expandable ? (
          <button
            type="button"
            className="template-outline__toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `折叠 ${item.label}` : `展开 ${item.label}`}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
          </button>
        ) : (
          <span className="template-outline__toggle" aria-hidden="true" />
        )}
        <button
          type="button"
          className="template-outline__label"
          onClick={() => onSelect(item.nodes[0].id)}
        >
          <span className="template-outline__kind">
            {item.kind === "table" ? <Table size={12} weight="bold" aria-hidden="true" /> : null}
            {item.kind === "preserve" ? <TextAa size={12} weight="bold" aria-hidden="true" /> : null}
            {item.label}
          </span>
          <span className="template-outline__preview">{item.preview}</span>
        </button>
      </div>

      {expanded && item.nodes.length > 1 && item.kind !== "preserve" ? (
        <ul className="template-outline__leaves">
          {item.nodes.map((node, index) => (
            <li key={node.id}>
              <button
                type="button"
                data-active={node.id === activeNodeId || undefined}
                onClick={() => onSelect(node.id)}
              >
                <i aria-hidden="true">{index + 1}</i>
                <span>{node.preview || "（空段）"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {expanded && item.children.length ? (
        <ul className="template-outline__children">
          {item.children.map((child) => (
            <OutlineRow key={child.key} item={child} activeNodeId={activeNodeId} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TemplateOutlineTree({ items, activeNodeId, onSelect }: TemplateOutlineTreeProps) {
  if (!items.length) {
    return <div className="official-document-inline-empty">尚无结构结果，等待 Word 引擎完成分析。</div>;
  }

  return (
    <ul className="template-outline" aria-label="模板大纲">
      {items.map((item) => (
        <OutlineRow key={item.key} item={item} activeNodeId={activeNodeId} onSelect={onSelect} />
      ))}
    </ul>
  );
}

export function TemplateOutlineMissingHint({ missingRoles }: { missingRoles: string[] }) {
  if (!missingRoles.length) return null;
  return (
    <p className="template-outline__missing" role="status">
      <WarningCircle size={14} weight="bold" aria-hidden="true" />
      结构模板里没有识别到{missingRoles.join("和")}，需要先校准后再发布。
    </p>
  );
}
