import { useEffect, useMemo, useRef, useState } from "react";
import { citationDisplayTitle, citationIdentity } from "@/components/xs/datahub/citationLabels";
import {
  loadDataHubCitationDocument,
  loadDataHubKnowledgeMarkdown
} from "@/services/dataHubKnowledgeService";
import type { DataHubCitationDocument, DataHubKnowledgeDocument } from "@/types/dataHub";
import { CloudDocumentPreview } from "./CloudDocumentPreview";

export function citationPreviewId(citation: DataHubCitationDocument) {
  return citationIdentity(citation);
}

function toKnowledgeDocument(citation: DataHubCitationDocument): DataHubKnowledgeDocument {
  return {
    id: citationPreviewId(citation),
    title: citationDisplayTitle(citation),
    docId: citation.docId,
    docKey: citation.docKey,
    status: "indexed",
    sourceAvailable: citation.sourceAvailable !== false
  };
}

type AnalysisCitationPreviewProps = {
  open: boolean;
  citations: DataHubCitationDocument[];
  active: DataHubCitationDocument | null;
  onSelect: (citation: DataHubCitationDocument) => void;
  onClose: () => void;
  /** 「新标签打开」次级动作；不传则不显示按钮。 */
  onOpenExternal?: (citation: DataHubCitationDocument) => void;
};

/**
 * 引用原文弹窗：点击引用 chip 在星数内预览，PDF 原文优先，
 * 原文不可内嵌时回退已解析 Markdown（与云盘知识浏览同一梯度）。
 */
export function AnalysisCitationPreview({
  open,
  citations,
  active,
  onSelect,
  onClose,
  onOpenExternal
}: AnalysisCitationPreviewProps) {
  const [markdown, setMarkdown] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sourceRevokeRef = useRef<(() => void) | undefined>(undefined);

  const documents = useMemo(() => citations.map(toKnowledgeDocument), [citations]);
  const activeId = active ? citationPreviewId(active) : null;
  const activeDocument = useMemo(
    () => (activeId ? documents.find((item) => item.id === activeId) ?? null : null),
    [documents, activeId]
  );

  useEffect(() => {
    if (!open || !active || !activeId) {
      return undefined;
    }

    let cancelled = false;
    sourceRevokeRef.current?.();
    sourceRevokeRef.current = undefined;
    setLoading(true);
    setError("");
    setMarkdown("");
    setSourceUrl("");
    setSourceType("");

    const citation = active;
    let hasContent = false;
    // 已解析内容和原文独立读取，避免大文件下载阻塞可读内容。
    const sourceRequest = loadDataHubCitationDocument(citation).then((access) => {
      if (cancelled) {
        access.revoke?.();
        return;
      }
      if (access.contentType === "application/pdf") {
        hasContent = true;
        sourceRevokeRef.current = access.revoke;
        setSourceUrl(access.url);
        setSourceType(access.contentType);
        setLoading(false);
      } else {
        access.revoke?.();
      }
    });
    const markdownRequest = loadDataHubKnowledgeMarkdown(
      citation.kbId,
      toKnowledgeDocument(citation)
    ).then(({ markdown: content }) => {
      if (!cancelled && content.trim()) {
        hasContent = true;
        setMarkdown(content);
        setLoading(false);
      }
    });
    void Promise.allSettled([sourceRequest, markdownRequest]).then((results) => {
      if (cancelled || hasContent) {
        return;
      }
      setLoading(false);
      const failure = results[1].status === "rejected" ? results[1].reason : undefined;
      setError(failure instanceof Error ? failure.message : "原文读取失败，请稍后重试");
    });

    return () => {
      cancelled = true;
      sourceRevokeRef.current?.();
      sourceRevokeRef.current = undefined;
    };
  }, [open, active, activeId]);

  const findCitation = (document: DataHubKnowledgeDocument) =>
    citations.find((citation) => citationPreviewId(citation) === document.id);

  return (
    <CloudDocumentPreview
      open={open}
      knowledgeBaseId={active?.kbId}
      previewDocument={activeDocument}
      documents={documents}
      markdown={markdown || undefined}
      sourceUrl={sourceUrl || undefined}
      sourceContentType={sourceType || undefined}
      loading={loading}
      error={error || undefined}
      onSelect={(document) => {
        const citation = findCitation(document);
        if (citation) {
          onSelect(citation);
        }
      }}
      onClose={onClose}
      onOpenExternal={
        onOpenExternal
          ? (document) => {
              const citation = findCitation(document);
              if (citation) {
                onOpenExternal(citation);
              }
            }
          : undefined
      }
    />
  );
}
