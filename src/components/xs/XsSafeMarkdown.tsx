import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type XsSafeMarkdownProps = {
  content: string;
  className?: string;
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

function XsSafeMarkdownImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  const safeUrl = getSafeImageUrl(src, {
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

export function XsSafeMarkdown({ content, className = "" }: XsSafeMarkdownProps) {
  return (
    <div className={`xs-safe-markdown${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ node: _node, src, alt, title }) => (
            <XsSafeMarkdownImage src={src} alt={alt} title={title} />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
