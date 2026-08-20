import { CaretLeft, CaretRight, DownloadSimple, FileText, X } from "@phosphor-icons/react";
import { Button, Spin } from "antd";
import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { XsIconTile } from "@/components/xs/XsIconTile";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import type { DataHubKnowledgeDocument } from "@/types/dataHub";

type CloudDocumentPreviewProps = {
  open: boolean;
  previewDocument: DataHubKnowledgeDocument | null;
  documents: DataHubKnowledgeDocument[];
  markdown?: string;
  sourceUrl?: string;
  sourceContentType?: string;
  loading: boolean;
  error?: string;
  onSelect: (document: DataHubKnowledgeDocument) => void;
  onClose: () => void;
};

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function formatFileSize(sizeBytes?: number) {
  if (sizeBytes == null) {
    return undefined;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function markdownFileName(title: string) {
  const trimmed = title.trim() || "document";
  return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed.replace(/\.[a-z0-9]{2,8}$/i, "")}.md`;
}

function sourceFileName(title: string, contentType?: string) {
  const trimmed = title.trim() || "document";
  if (contentType === "application/pdf") {
    return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed.replace(/\.[a-z0-9]{2,8}$/i, "")}.pdf`;
  }
  return markdownFileName(trimmed);
}

export function canBrowseKnowledgeDocument(document: DataHubKnowledgeDocument) {
  return Boolean(document.docKey?.trim());
}

export function isInlinePdfPreview(contentType?: string) {
  return contentType === "application/pdf";
}

export function CloudDocumentPreview({
  open,
  previewDocument,
  documents,
  markdown,
  sourceUrl,
  sourceContentType,
  loading,
  error,
  onSelect,
  onClose
}: CloudDocumentPreviewProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onSelectRef = useRef(onSelect);
  onCloseRef.current = onClose;
  onSelectRef.current = onSelect;

  const openable = documents.filter(canBrowseKnowledgeDocument);
  const currentIndex = previewDocument
    ? openable.findIndex((item) => item.id === previewDocument.id)
    : -1;
  const previous = currentIndex > 0 ? openable[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < openable.length - 1
    ? openable[currentIndex + 1]
    : undefined;
  const pdfPreview = isInlinePdfPreview(sourceContentType) && Boolean(sourceUrl);
  const markdownUrl = useMemo(() => {
    if (pdfPreview || !markdown) {
      return undefined;
    }
    return URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  }, [markdown, pdfPreview]);
  const downloadUrl = pdfPreview ? sourceUrl : markdownUrl;
  const downloadName = sourceFileName(previewDocument?.title ?? "document", pdfPreview ? sourceContentType : undefined);

  useEffect(() => () => {
    if (markdownUrl) {
      URL.revokeObjectURL(markdownUrl);
    }
  }, [markdownUrl]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "ArrowLeft" && previous) {
        event.preventDefault();
        onSelectRef.current(previous);
        return;
      }
      if (event.key === "ArrowRight" && next) {
        event.preventDefault();
        onSelectRef.current(next);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, previous, next]);

  if (!open || !previewDocument || typeof document === "undefined") {
    return null;
  }

  const meta = [
    pdfPreview ? "原文预览" : "Markdown 预览",
    formatFileSize(previewDocument.sizeBytes),
    previewDocument.chunkCount != null ? `${previewDocument.chunkCount.toLocaleString("zh-CN")} 个切片` : undefined
  ].filter(Boolean).join(" · ");
  const position = currentIndex >= 0 ? `${currentIndex + 1} / ${openable.length}` : undefined;
  const pdfViewerUrl = pdfPreview && sourceUrl
    ? `${sourceUrl}#toolbar=0&navpanes=0`
    : undefined;

  return createPortal(
    <div
      className="cloud-preview"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={panelRef}
        className="cloud-preview__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <aside className="cloud-preview__rail" aria-label="知识库文档">
          <p>知识浏览</p>
          <ul>
            {openable.map((item) => {
              const selected = item.id === previewDocument.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="cloud-preview__rail-item"
                    aria-label={item.title}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(item)}
                  >
                    <FileText size={16} aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      {formatFileSize(item.sizeBytes) ? <small>{formatFileSize(item.sizeBytes)}</small> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="cloud-preview__main">
          <header className="cloud-preview__header">
            <XsIconTile icon={FileText} label={previewDocument.title} tone="blue" size="sm" />
            <div className="cloud-preview__heading">
              <h2 id={titleId}>{previewDocument.title}</h2>
              {meta ? <p>{meta}</p> : null}
            </div>
            {position ? <span className="cloud-preview__count">{position}</span> : null}
            <div className="cloud-preview__actions">
              <Button
                disabled={!previous}
                aria-label="上一份文档"
                onClick={() => previous && onSelect(previous)}
                icon={<CaretLeft size={16} />}
              />
              <Button
                disabled={!next}
                aria-label="下一份文档"
                onClick={() => next && onSelect(next)}
                icon={<CaretRight size={16} />}
              />
              {downloadUrl ? (
                <a
                  className="cloud-preview__download"
                  href={downloadUrl}
                  download={downloadName}
                >
                  <DownloadSimple size={16} aria-hidden="true" />
                  下载
                </a>
              ) : null}
              <button
                ref={closeButtonRef}
                type="button"
                className="cloud-preview__close"
                aria-label="关闭原文预览"
                onClick={onClose}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div
            className={`cloud-preview__stage${pdfPreview ? " cloud-preview__stage--pdf" : ""}`}
            tabIndex={0}
            aria-label={pdfPreview ? "原文预览内容" : "Markdown 预览内容"}
          >
            {loading ? (
              <div className="cloud-preview__state" role="status">
                <Spin />
                <strong>正在载入原文</strong>
                <p>在星数内打开文件，不会跳转到外部站点。</p>
              </div>
            ) : error ? (
              <div className="cloud-preview__state" role="alert">
                <strong>原文暂时无法预览</strong>
                <p>{error}</p>
              </div>
            ) : pdfViewerUrl ? (
              <iframe
                className="cloud-preview__pdf"
                src={pdfViewerUrl}
                title={`${previewDocument.title} 原文预览`}
              />
            ) : markdown ? (
              <article className="cloud-preview__markdown" aria-label={`${previewDocument.title} Markdown 预览`}>
                <XsSafeMarkdown content={markdown} />
              </article>
            ) : (
              <div className="cloud-preview__state">
                <strong>没有可浏览的原文</strong>
                <p>当前文档还没有可预览的 PDF 或解析文本。</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
