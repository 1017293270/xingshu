import { AsteriskSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** 一轮完整问答：用户气泡在上，助手侧在下，两者共享同一个纵向节奏。 */
export function XsChatTurn({ children }: { children: ReactNode }) {
  return <div className="xs-chat__turn">{children}</div>;
}

export function XsChatUserBubble({ meta, children }: { meta?: ReactNode; children: ReactNode }) {
  return (
    <article className="xs-chat__user">
      {meta ? <small>{meta}</small> : null}
      <p>{children}</p>
    </article>
  );
}

/**
 * 助手侧：左边一枚星标，右边是内容。
 * `error` 只改文字颜色，不换成整块红条——多轮对话里红条会盖掉可读的历史。
 */
export function XsChatAssistant({
  mark,
  error,
  children
}: {
  mark?: ReactNode;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <article className="xs-chat__assistant">
      <span className="xs-chat__mark">
        {mark ?? <AsteriskSimple size={20} weight="bold" aria-hidden="true" />}
      </span>
      <div className="xs-chat__assistant-body" data-error={error || undefined} aria-live="polite">
        {children}
      </div>
    </article>
  );
}

/** 消息级操作行：复制、重试、导出这类"对这一条动手"的动作。 */
export function XsChatActions({ children }: { children: ReactNode }) {
  return <div className="xs-chat__actions">{children}</div>;
}

export function XsChatActionButton({
  icon,
  label,
  text,
  disabled,
  onClick
}: {
  icon: ReactNode;
  /** 可访问名。按钮上露出的文字可以更短，所以 `text` 单独给。 */
  label: string;
  text?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
      {text ?? label}
    </button>
  );
}
