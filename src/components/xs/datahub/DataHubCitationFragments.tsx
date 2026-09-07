import { ArrowSquareOut, FileText, Quotes } from "@phosphor-icons/react";
import { Button, Input, Modal, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { formatDataHubCitationFragment } from "@/services/dataHubFormat";
import {
  loadDataHubKnowledgeDocumentChunks,
  type DataHubKnowledgeChunk
} from "@/services/dataHubKnowledgeService";
import type { DataHubCitationDocument } from "@/types/dataHub";
import { citationDisplayTitle, citationKnowledgeBaseLabel, citationLocationText } from "./citationLabels";

export type DataHubCitationFragmentsProps = {
  open: boolean;
  citation?: DataHubCitationDocument;
  onClose: () => void;
  /** 复用引用芯片那条「打开原文」链路（PDF/Markdown 预览由调用方决定）。 */
  onOpen?: (citation: DataHubCitationDocument) => void;
};

type ChunksStatus = "loading" | "ready" | "error";

/** 引用片段可能是整段原文，直接全串匹配会被切块边界切断，改用定长探针。 */
const PROBE_LENGTH = 12;
const MAX_PROBES_PER_FRAGMENT = 8;

function normalizeForMatch(value: string) {
  return value.replace(/\s+/g, "").toLocaleLowerCase();
}

function fragmentProbes(fragments: string[]) {
  const probes: string[] = [];
  fragments.forEach((fragment) => {
    const normalized = normalizeForMatch(fragment);
    if (normalized.length < PROBE_LENGTH) {
      return;
    }
    const stride = Math.max(PROBE_LENGTH, Math.ceil(normalized.length / MAX_PROBES_PER_FRAGMENT));
    let taken = 0;
    for (
      let start = 0;
      start + PROBE_LENGTH <= normalized.length && taken < MAX_PROBES_PER_FRAGMENT;
      start += stride
    ) {
      probes.push(normalized.slice(start, start + PROBE_LENGTH));
      taken += 1;
    }
  });
  return probes;
}

function citedChunkIds(chunks: DataHubKnowledgeChunk[], fragments: string[]) {
  const probes = fragmentProbes(fragments);
  const ids = new Set<string>();
  if (probes.length === 0) {
    return ids;
  }

  chunks.forEach((chunk) => {
    const normalized = normalizeForMatch(chunk.content);
    if (normalized && probes.some((probe) => normalized.includes(probe))) {
      ids.add(chunk.id);
    }
  });
  return ids;
}

/**
 * 引用文档的片段浏览弹窗：上半是本轮回答实际引用的片段，
 * 下半是这份文档的全部检索切块（按切块顺序，被引用的置顶并打标）。
 */
export function DataHubCitationFragments({
  open,
  citation,
  onClose,
  onOpen
}: DataHubCitationFragmentsProps) {
  const [status, setStatus] = useState<ChunksStatus>("loading");
  const [chunks, setChunks] = useState<DataHubKnowledgeChunk[]>([]);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (!open || !citation) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setChunks([]);
    setError("");
    setKeyword("");
    loadDataHubKnowledgeDocumentChunks(citation)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setChunks(result.chunks);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(cause instanceof Error && cause.message ? cause.message : "切块读取失败");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open, citation]);

  const fragments = useMemo(
    () => (citation?.fragments ?? []).map(formatDataHubCitationFragment).filter(Boolean),
    [citation]
  );
  const citedIds = useMemo(
    () => citedChunkIds(chunks, citation?.fragments ?? []),
    [chunks, citation]
  );
  const visibleChunks = useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase();
    const matched = needle
      ? chunks.filter((chunk) => chunk.content.toLocaleLowerCase().includes(needle))
      : chunks;
    return [...matched].sort((left, right) => {
      const leftRank = citedIds.has(left.id) ? 0 : 1;
      const rightRank = citedIds.has(right.id) ? 0 : 1;
      return leftRank - rightRank || left.order - right.order;
    });
  }, [chunks, citedIds, keyword]);

  const title = citation ? citationDisplayTitle(citation) : "";
  const location = citation
    ? [citationKnowledgeBaseLabel(citation), citationLocationText(citation)].filter(Boolean).join(" · ")
    : "";
  const countText = keyword.trim()
    ? `${visibleChunks.length} / ${chunks.length} 个片段`
    : `共 ${chunks.length} 个片段`;

  return (
    <Modal
      className="knowledge-citation-fragments"
      open={open}
      onCancel={onClose}
      centered
      width={760}
      destroyOnHidden
      title={
        <div className="knowledge-citation-fragments__title">
          <span aria-hidden="true"><FileText size={20} weight="duotone" /></span>
          <div>
            <strong>{title}</strong>
            {location ? <small>{location}</small> : null}
          </div>
        </div>
      }
      footer={
        <div className="knowledge-citation-fragments__footer">
          <Button
            icon={<ArrowSquareOut size={15} aria-hidden="true" />}
            disabled={!citation?.sourceAvailable || !onOpen}
            onClick={() => {
              if (citation) {
                onClose();
                onOpen?.(citation);
              }
            }}
          >
            打开原文
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
    >
      <div className="knowledge-citation-fragments__body">
        <section className="knowledge-citation-fragments__section" aria-label="回答引用的片段">
          <header className="knowledge-citation-fragments__section-head">
            <h4>
              <Quotes size={15} weight="duotone" aria-hidden="true" />
              回答引用的片段
            </h4>
          </header>
          {fragments.length === 0 ? (
            <p className="knowledge-citation-fragments__empty">本次回答未附带原文片段</p>
          ) : (
            <div className="knowledge-citation-fragments__quotes">
              {fragments.map((fragment, index) => (
                <blockquote key={`fragment-${index}`}>
                  <XsSafeMarkdown content={fragment} />
                </blockquote>
              ))}
            </div>
          )}
        </section>

        <section className="knowledge-citation-fragments__section" aria-label="文档全部片段">
          <header className="knowledge-citation-fragments__section-head">
            <h4>文档全部片段</h4>
            <Input
              allowClear
              value={keyword}
              placeholder="筛选片段"
              aria-label="筛选片段"
              style={{ width: 280 }}
              onChange={(event) => setKeyword(event.target.value)}
            />
            {status === "ready" && chunks.length > 0 ? (
              <span className="knowledge-citation-fragments__count">{countText}</span>
            ) : null}
          </header>
          {status === "loading" ? (
            <p className="knowledge-citation-fragments__empty">读取切块中…</p>
          ) : null}
          {status === "error" ? (
            <p className="knowledge-citation-fragments__empty knowledge-citation-fragments__empty--error">
              {error}
            </p>
          ) : null}
          {status === "ready" && chunks.length === 0 ? (
            <p className="knowledge-citation-fragments__empty">暂无切块制品</p>
          ) : null}
          {status === "ready" && chunks.length > 0 && visibleChunks.length === 0 ? (
            <p className="knowledge-citation-fragments__empty">没有匹配的片段</p>
          ) : null}
          {visibleChunks.length > 0 ? (
            <ol className="knowledge-citation-fragments__list">
              {visibleChunks.map((chunk) => (
                <li key={chunk.id} className="knowledge-citation-fragments__chunk">
                  <div className="knowledge-citation-fragments__chunk-meta">
                    <span>#{chunk.order + 1}</span>
                    {typeof chunk.tokens === "number" ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{chunk.tokens} tokens</span>
                      </>
                    ) : null}
                    {citedIds.has(chunk.id) ? (
                      <Tag bordered={false} color="blue">回答引用</Tag>
                    ) : null}
                  </div>
                  {chunk.content ? (
                    <XsSafeMarkdown content={chunk.content} />
                  ) : (
                    <p className="knowledge-citation-fragments__empty">（空切块）</p>
                  )}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
