import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type XsSafeMarkdownProps = {
  content: string;
  className?: string;
};

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
          img: () => null
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
