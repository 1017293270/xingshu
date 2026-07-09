import { Alert, Button, Empty } from "antd";
import type { ReactNode } from "react";

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
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="xs-empty-state__copy">
            {title ? <strong>{title}</strong> : null}
            <span>{description}</span>
          </div>
        }
      >
        {actionLabel && onAction ? (
          <Button type="primary" aria-label={actionLabel} onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </Empty>
    </div>
  );
}
