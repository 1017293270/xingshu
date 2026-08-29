import { ArrowDown } from "@phosphor-icons/react";
import { Button } from "antd";
import type { ReactNode } from "react";

export type XsComposerBoxProps = {
  /** hero=首屏大输入盒；chat=会话态压矮、工具条浮到底部那一条带上。 */
  mode: "hero" | "chat";
  /** 给了才会成为一个有名字的 region；不给就只是一个盒子。 */
  label?: string;
  busy?: boolean;
  className?: string;
  /** 输入框上方的常驻信息，例如已选参考草稿的芯片。 */
  chip?: ReactNode;
  children: ReactNode;
  toolbarLead?: ReactNode;
  toolbarTail: ReactNode;
  footnote?: ReactNode;
  /** 用户上滚脱离后才出现，贴在输入盒正上方居中。 */
  showScrollToBottom?: boolean;
  onScrollToBottom?: () => void;
};

export function XsComposerBox({
  mode,
  label,
  busy,
  className = "",
  chip,
  children,
  toolbarLead,
  toolbarTail,
  footnote,
  showScrollToBottom,
  onScrollToBottom
}: XsComposerBoxProps) {
  return (
    <section
      className={["xs-composer", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-busy={busy ? true : undefined}
      data-mode={mode}
      data-busy={busy || undefined}
    >
      {showScrollToBottom && onScrollToBottom ? (
        <Button
          className="xs-composer__scroll-to-bottom"
          shape="circle"
          aria-label="回到底部"
          title="回到底部"
          icon={<ArrowDown size={18} weight="bold" />}
          onClick={onScrollToBottom}
        />
      ) : null}
      {chip}
      {children}
      <div className="xs-composer__toolbar">
        <span className="xs-composer__lead">{toolbarLead}</span>
        <span className="xs-composer__tail">{toolbarTail}</span>
      </div>
      {footnote ? <p className="xs-composer__footnote">{footnote}</p> : null}
    </section>
  );
}
