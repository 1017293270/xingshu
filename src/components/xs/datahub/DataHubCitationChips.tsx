import { CaretDown, FileText } from "@phosphor-icons/react";
import { useState } from "react";
import type { DataHubCitationDocument } from "@/types/dataHub";

type DataHubCitationChipsProps = {
  citations: DataHubCitationDocument[];
  onOpen: (citation: DataHubCitationDocument) => void;
  /** 结果区底部默认收合，用户点开后保持展开。 */
  defaultCollapsed?: boolean;
};

export function citationDisplayTitle(citation: DataHubCitationDocument) {
  return citation.docName || citation.fileName || citation.docKey || citation.docId;
}

/** 章节/页码定位徽标：缺失的部分不显示，都缺时返回空串。 */
export function citationLocationText(citation: DataHubCitationDocument) {
  const chapter = citation.chapter?.trim();
  const rawPage = citation.pageNumber?.trim();
  const page = rawPage ? (/^\d+$/.test(rawPage) ? `第${rawPage}页` : rawPage) : "";
  const shortChapter = chapter && chapter.length > 24 ? `${chapter.slice(0, 24)}…` : chapter;
  return [shortChapter, page].filter(Boolean).join(" · ");
}

function groupByKnowledgeBase(citations: DataHubCitationDocument[]) {
  const groups = new Map<string, DataHubCitationDocument[]>();
  citations.forEach((citation) => {
    const key = citation.kbName || "企业知识库";
    groups.set(key, [...(groups.get(key) ?? []), citation]);
  });
  return Array.from(groups);
}

/**
 * 结果底部的引用文档 chips：按知识库分组，默认收成一行「引用 N 篇文档」。
 * 章节/页码有值时随 chip 展示；原文不可用的 chip 禁点但保留在列表里。
 */
export function DataHubCitationChips({
  citations,
  onOpen,
  defaultCollapsed = true
}: DataHubCitationChipsProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (citations.length === 0) {
    return null;
  }

  return (
    <section className="knowledge-citations knowledge-citations--chips" aria-label="引用文档">
      <button
        type="button"
        className="knowledge-citations__toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span>引用 {citations.length} 篇文档</span>
        <CaretDown
          size={14}
          aria-hidden="true"
          className={collapsed ? undefined : "knowledge-citations__caret--open"}
        />
      </button>
      {collapsed
        ? null
        : groupByKnowledgeBase(citations).map(([kbName, items]) => (
            <section className="knowledge-citations__group" key={kbName}>
              <strong>{kbName}</strong>
              <div className="knowledge-citations__chips">
                {items.map((citation) => {
                  const title = citationDisplayTitle(citation);
                  const location = citationLocationText(citation);
                  return (
                    <button
                      type="button"
                      className="knowledge-citation-chip"
                      key={`${citation.docId}::${citation.docKey ?? ""}`}
                      aria-label={`${citation.sourceAvailable ? "打开原文" : "原文不可用"}：${title}${location ? `（${location}）` : ""}`}
                      disabled={!citation.sourceAvailable}
                      onClick={() => onOpen(citation)}
                    >
                      <FileText size={15} aria-hidden="true" />
                      <span>{title}</span>
                      {location ? (
                        <span className="knowledge-citation-chip__location">{location}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
    </section>
  );
}
