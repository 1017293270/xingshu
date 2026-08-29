import { useEffect, useRef } from "react";
import type { OfficialDocumentStructureNode } from "@/types/officialDocument";
import { templateNodeDomId } from "./templateOutline";

export type TemplateDocumentPreviewProps = {
  nodes: OfficialDocumentStructureNode[];
  activeNodeId?: string;
  /** 滚动到某个节点时回填大纲高亮；点击大纲触发的程序化滚动不会回调。 */
  onVisibleNodeChange: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
};

/**
 * 按角色连续排版模板样本文字，替代逐段平铺的结构列表。
 * 只读渲染：这里展示的是模板里的原文，改角色仍然走右侧检查器。
 */
export function TemplateDocumentPreview({
  nodes,
  activeNodeId,
  onVisibleNodeChange,
  onSelect
}: TemplateDocumentPreviewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /* 程序化滚动期间静音观察器，否则点大纲会被途经的段落顶掉高亮。 */
  const suppressUntilRef = useRef(0);
  /* 观察器自己报出来的高亮不再回头滚动，否则手动滚动会被反复拉回居中。 */
  const reportedNodeIdRef = useRef<string>("");
  const onVisibleRef = useRef(onVisibleNodeChange);
  onVisibleRef.current = onVisibleNodeChange;

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressUntilRef.current) return;
        const first = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        const nodeId = first?.target.getAttribute("data-node-id");
        if (!nodeId) return;
        reportedNodeIdRef.current = nodeId;
        onVisibleRef.current(nodeId);
      },
      { root, rootMargin: "-12% 0px -70% 0px", threshold: 0 }
    );

    root.querySelectorAll("[data-node-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [nodes]);

  useEffect(() => {
    if (!activeNodeId || activeNodeId === reportedNodeIdRef.current) return;
    const target = document.getElementById(templateNodeDomId(activeNodeId));
    if (!target) return;
    suppressUntilRef.current = Date.now() + 600;
    target.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [activeNodeId]);

  if (!nodes.length) {
    return <div className="official-document-inline-empty">模板还没有可展示的正文内容。</div>;
  }

  return (
    <div className="template-document" ref={scrollRef}>
      <article className="template-document__page">
        {nodes.map((node) => (
          <p
            key={node.id}
            id={templateNodeDomId(node.id)}
            data-node-id={node.id}
            data-role={node.role}
            data-active={node.id === activeNodeId || undefined}
            className="official-document-line template-document__line"
            title={node.styleSummary.join(" · ") || undefined}
            onClick={() => onSelect(node.id)}
          >
            {node.tableIndex !== undefined
              ? node.tableRowIndex !== undefined
                ? `${node.roleLabel}：${node.preview}`
                : `［表格 ${node.tableIndex + 1}${node.dataBinding ? " · 问数槽位" : ""}］`
              : node.preview || "（空段）"}
          </p>
        ))}
      </article>
    </div>
  );
}
