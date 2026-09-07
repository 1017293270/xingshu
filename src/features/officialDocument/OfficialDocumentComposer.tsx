import { ArrowDown } from "@phosphor-icons/react";
import { Button } from "antd";
import {
  useLayoutEffect,
  type ReactNode,
  type KeyboardEvent,
  type RefObject
} from "react";
import "./official-document-composer.css";
import "@/components/xs/composer-surface.css";

/** 文本区按行增高，行高与上下内边距写死在这里，CSS 只负责画皮。 */
const LINE_HEIGHT = 22;
const VERTICAL_PADDING = 18;
const MAX_ROWS = 8;

function composerHeight(rows: number) {
  return rows * LINE_HEIGHT + VERTICAL_PADDING;
}

export type OfficialDocumentComposerProps = {
  /** hero=首屏两行起步；chat=会话态压到一行。 */
  mode: "hero" | "chat";
  label?: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
  busy?: boolean;
  disabled?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** 输入盒正上方的浮层（@ 弹层）。 */
  overlay?: ReactNode;
  /** 工具条最左的动作按钮，通常是那个 + 号。 */
  lead: ReactNode;
  /** 引用与参考资料芯片，跟在 + 号后面同一条带上。 */
  chips?: ReactNode;
  /** 工具条最右的发送 / 停止按钮。 */
  tail: ReactNode;
  footnote?: ReactNode;
  showScrollToBottom?: boolean;
  onScrollToBottom?: () => void;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelectionChange?: () => void;
  onBlur?: () => void;
};

/**
 * 公文写作自己的输入盒。和 XsComposerBox 分家的理由是这里多了三件东西：
 * 输入盒正上方的 @ 浮层、工具条左侧的附件动作、以及一条能挂多枚芯片的引用带。
 */
export function OfficialDocumentComposer({
  mode,
  label,
  value,
  placeholder,
  ariaLabel,
  maxLength,
  busy,
  disabled,
  textareaRef,
  overlay,
  lead,
  chips,
  tail,
  footnote,
  showScrollToBottom,
  onScrollToBottom,
  onChange,
  onKeyDown,
  onSelectionChange,
  onBlur
}: OfficialDocumentComposerProps) {
  const minRows = mode === "hero" ? 2 : 1;

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    const max = composerHeight(MAX_ROWS);
    element.style.height = "auto";
    const next = Math.min(Math.max(element.scrollHeight, composerHeight(minRows)), max);
    element.style.height = `${next}px`;
    element.style.overflowY = element.scrollHeight > max ? "auto" : "hidden";
  }, [minRows, textareaRef, value]);

  return (
    <div className="official-document-composer-slot">
      <section
        className="official-document-composer xs-prompt-surface"
        aria-label={label}
        aria-busy={busy ? true : undefined}
        data-mode={mode}
        data-busy={busy || undefined}
      >
        {showScrollToBottom && onScrollToBottom ? (
          <Button
            className="official-document-composer__scroll-to-bottom"
            shape="circle"
            aria-label="回到底部"
            title="回到底部"
            icon={<ArrowDown size={18} weight="bold" />}
            onClick={onScrollToBottom}
          />
        ) : null}
        {overlay}
        <textarea
          ref={textareaRef}
          className="official-document-composer__input"
          aria-label={ariaLabel}
          value={value}
          rows={minRows}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onSelect={onSelectionChange}
          onClick={onSelectionChange}
          onBlur={onBlur}
        />
        <div className="official-document-composer__toolbar">
          <div className="official-document-composer__lead">
            {lead}
            {chips}
          </div>
          <div className="official-document-composer__tail">{tail}</div>
        </div>
      </section>
      {footnote ? <p className="official-document-composer__footnote">{footnote}</p> : null}
    </div>
  );
}
