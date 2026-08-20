import { ArrowLeft, ArrowsClockwise, FileText } from "@phosphor-icons/react";
import { Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import {
  listDataHubKnowledgeBases,
  listDataHubKnowledgeDocuments,
  loadDataHubKnowledgeMarkdown,
  loadDataHubKnowledgeSource
} from "@/services/dataHubKnowledgeService";
import type { DataHubKnowledgeDocument, DataHubKnowledgeDocumentStatus } from "@/types/dataHub";
import { canBrowseKnowledgeDocument, CloudDocumentPreview } from "./CloudDocumentPreview";
import { PageFrame } from "./PageFrame";
import "./styles/cloud.css";

const documentStatusLabel: Record<DataHubKnowledgeDocumentStatus, string> = {
  uploading: "上传中",
  uploaded: "待解析",
  parsing: "解析中",
  indexed: "已入库",
  failed: "失败",
  unknown: "未知"
};

const documentStatusTone: Record<DataHubKnowledgeDocumentStatus, string> = {
  uploading: "info",
  uploaded: "warning",
  parsing: "info",
  indexed: "success",
  failed: "danger",
  unknown: "muted"
};

function formatFileSize(sizeBytes?: number) {
  if (sizeBytes == null) {
    return undefined;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function CloudKnowledgeDetailPage() {
  const { kbId: rawKbId = "" } = useParams();
  const kbId = decodeURIComponent(rawKbId).trim();
  const sessionScope = useSessionQueryScope();
  const [previewDocument, setPreviewDocument] = useState<DataHubKnowledgeDocument | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState("");
  const [previewSourceUrl, setPreviewSourceUrl] = useState("");
  const [previewSourceType, setPreviewSourceType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const knowledgeBasesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "knowledge-bases"),
    queryFn: listDataHubKnowledgeBases,
    retry: false
  });
  const documentsQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "knowledge-documents", kbId),
    queryFn: () => listDataHubKnowledgeDocuments(kbId),
    enabled: Boolean(kbId),
    retry: false
  });
  const knowledgeBase = knowledgeBasesQuery.data?.find((item) => item.id === kbId);
  const documents = documentsQuery.data ?? [];
  const status = resolveXsAsyncStatus({
    isPending: documentsQuery.isPending,
    isFetching: documentsQuery.isFetching,
    isError: documentsQuery.isError,
    hasData: documentsQuery.data !== undefined
  });
  const title = knowledgeBase?.title || (kbId ? `知识库 ${kbId}` : "知识库");
  const previewId = previewDocument?.id;
  const previewSourceRevokeRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!previewId || !kbId) {
      return undefined;
    }

    const current = documents.find((item) => item.id === previewId);
    if (!current || !canBrowseKnowledgeDocument(current)) {
      return undefined;
    }

    let cancelled = false;
    previewSourceRevokeRef.current?.();
    previewSourceRevokeRef.current = undefined;
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewMarkdown("");
    setPreviewSourceUrl("");
    setPreviewSourceType("");

    void (async () => {
      try {
        const access = await loadDataHubKnowledgeSource(kbId, current);
        if (cancelled) {
          access.revoke?.();
          return;
        }
        if (access.contentType === "application/pdf") {
          previewSourceRevokeRef.current = access.revoke;
          setPreviewSourceUrl(access.url);
          setPreviewSourceType(access.contentType);
          setPreviewLoading(false);
          return;
        }
        access.revoke?.();
      } catch {
        // PDF 原文不可用时再回退到已解析 Markdown，避免合同预览空白。
      }

      try {
        const { markdown } = await loadDataHubKnowledgeMarkdown(kbId, current);
        if (cancelled) {
          return;
        }
        setPreviewMarkdown(markdown);
        setPreviewLoading(false);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setPreviewLoading(false);
        setPreviewError(error instanceof Error ? error.message : "原文读取失败，请稍后重试");
      }
    })();

    return () => {
      cancelled = true;
      previewSourceRevokeRef.current?.();
      previewSourceRevokeRef.current = undefined;
    };
  }, [documents, kbId, previewId]);

  const handleOpenDocument = (document: DataHubKnowledgeDocument) => {
    if (!canBrowseKnowledgeDocument(document)) {
      return;
    }
    setPreviewDocument(document);
  };

  const handleClosePreview = () => {
    setPreviewDocument(null);
    setPreviewMarkdown("");
    setPreviewSourceUrl("");
    setPreviewSourceType("");
    setPreviewError("");
    setPreviewLoading(false);
  };

  return (
    <PageFrame
      title={title}
      subtitle={knowledgeBase?.description || "查看当前知识库已入库的文档"}
      actions={(
        <>
          <Link className="xs-action-link" to="/cloud">
            <ArrowLeft size={16} aria-hidden="true" />
            返回我的云盘
          </Link>
          <Button
            icon={<ArrowsClockwise size={18} />}
            loading={documentsQuery.isFetching && !documentsQuery.isPending}
            onClick={() => void documentsQuery.refetch()}
          >
            刷新
          </Button>
        </>
      )}
      track="data"
    >
      <nav className="cloud-detail__crumb xs-page-enter" aria-label="返回列表">
        <Link to="/cloud">我的云盘</Link>
        <span aria-hidden="true">/</span>
        <span>{title}</span>
      </nav>
      <XsAsyncPanel
        status={status}
        empty={documents.length === 0}
        emptyTitle="暂无文档"
        emptyDescription="该知识库还没有可展示的文档。上传和解析请到 DataHub 完成。"
        error={
          documentsQuery.error instanceof Error
            ? documentsQuery.error.message
            : "文档列表加载失败，请稍后重试。"
        }
        onRetry={() => void documentsQuery.refetch()}
        loadingVariant="rows"
        contentKey={documentsQuery.dataUpdatedAt}
      >
        <section className="cloud-doc-table" aria-label="知识库文档">
          <div className="cloud-doc-table__head" aria-hidden="true">
            <span>文档</span>
            <span>状态</span>
            <span>大小</span>
            <span>切片</span>
            <span />
          </div>
          {documents.map((document) => {
            const canOpen = canBrowseKnowledgeDocument(document);
            return (
              <article className="cloud-doc-row" key={document.id} aria-label={`文档：${document.title}`}>
                <span className="cloud-doc-row__name">
                  <span className="cloud-doc-row__icon" aria-hidden="true">
                    <FileText size={20} />
                  </span>
                  <span className="cloud-doc-row__text">
                    <strong>{document.title}</strong>
                    {document.message ? <small>{document.message}</small> : null}
                  </span>
                </span>
                <span className={`cloud-doc-status cloud-doc-status--${documentStatusTone[document.status]}`}>
                  {documentStatusLabel[document.status]}
                </span>
                <span className="cloud-doc-row__meta">{formatFileSize(document.sizeBytes) ?? "—"}</span>
                <span className="cloud-doc-row__meta">
                  {document.chunkCount != null ? `${document.chunkCount.toLocaleString("zh-CN")} 个切片` : "—"}
                </span>
                <Button
                  type="link"
                  disabled={!canOpen}
                  aria-label={`打开 ${document.title} 原文`}
                  onClick={() => handleOpenDocument(document)}
                >
                  打开原文
                </Button>
              </article>
            );
          })}
        </section>
      </XsAsyncPanel>
      <CloudDocumentPreview
        open={Boolean(previewDocument)}
        previewDocument={previewDocument}
        documents={documents}
        markdown={previewMarkdown}
        sourceUrl={previewSourceUrl}
        sourceContentType={previewSourceType}
        loading={previewLoading}
        error={previewError}
        onSelect={setPreviewDocument}
        onClose={handleClosePreview}
      />
    </PageFrame>
  );
}
