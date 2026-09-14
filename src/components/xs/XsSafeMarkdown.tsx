import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type XsSafeMarkdownProps = {
  content: string;
  className?: string;
  /** Evidence previews display image descriptions without loading remote media. */
  renderImages?: boolean;
  resolveImage?: (src: string, signal: AbortSignal) => Promise<{ url: string; revoke?: () => void } | null>;
  references?: Record<string, { label: string; onClick: () => void }>;
};

type SafeImageUrlOptions = {
  pageOrigin?: string;
  publicOrigin?: string;
};

export const RAG_KNOWLEDGE_IMAGE_PATH_PREFIX = "/data-source/rag-source/images/";

function pageOriginFallback() {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

function isHttpUrl(url: URL) {
  return url.protocol === "http:" || url.protocol === "https:";
}

function isRagKnowledgeImagePath(pathname: string) {
  return (
    pathname === RAG_KNOWLEDGE_IMAGE_PATH_PREFIX.slice(0, -1)
    || pathname.startsWith(RAG_KNOWLEDGE_IMAGE_PATH_PREFIX)
  );
}

function resolveRewriteOrigin(pageOrigin: string, publicOrigin?: string) {
  const trimmed = publicOrigin?.trim();
  if (!trimmed) {
    return pageOrigin;
  }

  try {
    const url = new URL(trimmed);
    return isHttpUrl(url) ? url.origin : pageOrigin;
  } catch {
    return pageOrigin;
  }
}

export function getSafeImageUrl(src: string | undefined, options: SafeImageUrlOptions = {}) {
  const value = src?.trim();
  if (!value) {
    return null;
  }

  try {
    const pageOrigin = options.pageOrigin?.trim() || pageOriginFallback();
    const url = new URL(value, pageOrigin);
    if (!isHttpUrl(url)) {
      return null;
    }

    if (!isRagKnowledgeImagePath(url.pathname)) {
      return url.toString();
    }

    const rewriteOrigin = resolveRewriteOrigin(pageOrigin, options.publicOrigin);
    return new URL(`${url.pathname}${url.search}`, rewriteOrigin).toString();
  } catch {
    return null;
  }
}

function XsSafeMarkdownImage({ src, alt, title, resolveImage }: {
  src?: string; alt?: string; title?: string; resolveImage?: XsSafeMarkdownProps["resolveImage"];
}) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resolution, setResolution] = useState<{ src?: string; resolver: XsSafeMarkdownProps["resolveImage"]; status: "ready" | "error"; url?: string }>();
  useEffect(() => {
    setFailed(false);
    setResolution(undefined);
    if (!resolveImage || !src) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    resolveImage(src, controller.signal).then((result) => {
      if (controller.signal.aborted) { result?.revoke?.(); return; }
      release = result?.revoke;
      setResolution({ src, resolver: resolveImage, status: "ready", url: result?.url });
    }).catch(() => {
      if (!controller.signal.aborted) setResolution({ src, resolver: resolveImage, status: "error" });
    });
    return () => { controller.abort(); release?.(); };
  }, [src, resolveImage, retry]);
  const resolved = resolution && resolution.src === src && resolution.resolver === resolveImage ? resolution : undefined;
  if (resolveImage && src && !resolved) return <span className="xs-safe-markdown__image-blocked" role="status">图片读取中…</span>;
  if (resolved?.status === "error") return <button className="xs-safe-markdown__image-fallback" type="button" onClick={() => setRetry(value => value + 1)}>图片读取失败，点击重试</button>;
  // blob URL 只接受调用方受保护制品服务的解析结果，不接受 Markdown 中的任意 blob。
  const safeUrl = resolved?.url || getSafeImageUrl(src, {
    publicOrigin: import.meta.env.VITE_RAG_IMAGE_ORIGIN
  });
  const accessibleAlt = alt?.trim() || "回答中的图片";

  if (!safeUrl) {
    return <span className="xs-safe-markdown__image-blocked">[图片链接不可用]</span>;
  }

  if (failed) {
    return (
      <a
        className="xs-safe-markdown__image-fallback"
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        图片加载失败，点击打开原图
      </a>
    );
  }

  return (
    <a
      className="xs-safe-markdown__image-link"
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`查看图片：${accessibleAlt}`}
      title={title || "点击打开原图"}
    >
      <img
        className="xs-safe-markdown__image"
        src={safeUrl}
        alt={accessibleAlt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

export function XsSafeMarkdown({ content, className = "", references, resolveImage, renderImages = true }: XsSafeMarkdownProps) {
  return (
    <div className={`xs-safe-markdown${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          code: ({ children, node: _node, ...props }) => {
            const id = typeof children === "string" ? children : "";
            const reference = /^e\d+$/i.test(id) ? references?.[id] : undefined;
            return reference && !props.className && !id.includes("\n")
              ? <button type="button" className="analysis-citation-reference" aria-label={reference.label}
                  title={reference.label} onClick={reference.onClick}>{children}</button>
              : <code {...props}>{children}</code>;
          },
          a: ({ children, node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ node: _node, src, alt, title }) => renderImages
            ? <XsSafeMarkdownImage src={src} alt={alt} title={title} resolveImage={resolveImage} />
            : alt ? <span>{alt}</span> : null
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
