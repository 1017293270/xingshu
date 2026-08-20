import { Alert, Button } from "antd";
import type { ReactNode } from "react";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-2x.png";

type XsEmptyStateProps = {
  description: ReactNode;
  title?: ReactNode;
  /** 状态名（如"暂无大屏"），出现在标题上方。 */
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  tone?: "empty" | "error";
  className?: string;
  /** 空状态本身就是这一屏的内容时，给它一个可被定位的区域名。 */
  ariaLabel?: string;
};

export function XsEmptyState({
  description,
  title,
  eyebrow,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  tone = "empty",
  className = "",
  ariaLabel
}: XsEmptyStateProps) {
  if (tone === "error") {
    return (
      <Alert
        className={`xs-empty-state xs-empty-state--error ${className}`.trim()}
        role="alert"
        type="error"
        showIcon
        message={title ?? "加载失败"}
        description={description}
        action={
          actionLabel && onAction ? (
            <Button size="small" aria-label={actionLabel} onClick={onAction}>
              {actionLabel}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const hasPrimary = Boolean(actionLabel && onAction);
  const hasSecondary = Boolean(secondaryActionLabel && onSecondaryAction);

  return (
    <div
      className={`xs-empty-state ${className}`.trim()}
      role={ariaLabel ? "region" : "note"}
      aria-label={ariaLabel}
    >
      <div className="xs-empty-state__visual" aria-hidden="true">
        <span className="xs-empty-state__orbit xs-empty-state__orbit--outer" />
        <span className="xs-empty-state__orbit xs-empty-state__orbit--inner" />
        <img src={assistantMark} alt="" width={160} height={160} />
      </div>
      <div className="xs-empty-state__copy">
        {eyebrow ? <p className="xs-empty-state__eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="xs-empty-state__title">{title}</h2> : null}
        <span>{description}</span>
      </div>
      {hasPrimary || hasSecondary ? (
        <div className="xs-empty-state__actions">
          {hasSecondary ? (
            <Button aria-label={secondaryActionLabel} onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
          {hasPrimary ? (
            <Button type="primary" aria-label={actionLabel} onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
