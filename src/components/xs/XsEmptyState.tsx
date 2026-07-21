import { Alert, Button } from "antd";
import type { ReactNode } from "react";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-image2-transparent.png";

type XsEmptyStateProps = {
  description: ReactNode;
  title?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "empty" | "error";
  className?: string;
};

export function XsEmptyState({
  description,
  title,
  actionLabel,
  onAction,
  tone = "empty",
  className = ""
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

  return (
    <div className={`xs-empty-state ${className}`.trim()} role="note">
      <div className="xs-empty-state__visual" aria-hidden="true">
        <span className="xs-empty-state__orbit xs-empty-state__orbit--outer" />
        <span className="xs-empty-state__orbit xs-empty-state__orbit--inner" />
        <img src={assistantMark} alt="" />
      </div>
      <div className="xs-empty-state__copy">
        {title ? <strong>{title}</strong> : null}
        <span>{description}</span>
      </div>
      {actionLabel && onAction ? (
        <Button type="primary" aria-label={actionLabel} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
