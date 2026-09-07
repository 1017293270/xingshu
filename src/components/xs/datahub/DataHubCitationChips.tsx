import { CaretDown, FileText, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import type { DataHubCitationDocument } from "@/types/dataHub";
import { citationDisplayTitle, citationIdentity, citationKnowledgeBaseLabel, citationLocationText } from "./citationLabels";
import { DataHubCitationFragments } from "./DataHubCitationFragments";

type DataHubCitationChipsProps = {
  citations: DataHubCitationDocument[];
  onOpen: (citation: DataHubCitationDocument) => void;
  /** 结果区底部默认收合，用户点开后保持展开。 */
  defaultCollapsed?: boolean;
};

function groupByKnowledgeBase(citations: DataHubCitationDocument[]) {
  const groups = new Map<string, DataHubCitationDocument[]>();
  citations.forEach((citation) => {
    const key = citation.kbId || citation.kbName || "";
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
  const [fragmentsCitation, setFragmentsCitation] = useState<DataHubCitationDocument>();
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
        : groupByKnowledgeBase(citations).map(([kbId, items]) => (
            <section className="knowledge-citations__group" key={kbId}>
              <strong>{citationKnowledgeBaseLabel(items[0])}</strong>
              <div className="knowledge-citations__chips">
                {items.map((citation) => {
                  const title = citationDisplayTitle(citation);
                  const location = citationLocationText(citation);
                  return (
                    <span
                      className="knowledge-citation-chip-group"
                      key={citationIdentity(citation)}
                    >
                      <button
                        type="button"
                        className="knowledge-citation-chip"
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
                      {/* 切块与原文是两条链路：原文不可用时片段仍然读得到，所以不跟着 disabled。 */}
                      <button
                        type="button"
                        className="knowledge-citation-chip__more"
                        aria-label={`浏览文档片段：${title}`}
                        title={`浏览文档片段：${title}`}
                        onClick={() => setFragmentsCitation(citation)}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </section>
          ))}
      <DataHubCitationFragments
        open={Boolean(fragmentsCitation)}
        citation={fragmentsCitation}
        onClose={() => setFragmentsCitation(undefined)}
        onOpen={onOpen}
      />
    </section>
  );
}
