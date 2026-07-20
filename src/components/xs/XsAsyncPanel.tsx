import { useEffect, useState, type ReactNode } from "react";
import { XsEmptyState } from "./XsEmptyState";

export type XsAsyncStatus = "pending" | "refreshing" | "stale" | "error" | "ready";

type ResolveXsAsyncStatusInput = {
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  hasData: boolean;
};

export function resolveXsAsyncStatus({
  isPending,
  isFetching,
  isError,
  hasData
}: ResolveXsAsyncStatusInput): XsAsyncStatus {
  if (isPending) {
    return "pending";
  }
  if (isError && !hasData) {
    return "error";
  }
  if (isError && hasData) {
    return "stale";
  }
  if (isFetching) {
    return "refreshing";
  }
  return "ready";
}

type XsAsyncPanelProps = {
  status: XsAsyncStatus;
  empty: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  errorTitle?: ReactNode;
  error?: ReactNode;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
};

const SKELETON_DELAY_MS = 200;

function LoadingSkeleton({ label }: { label: "正在加载" | "正在刷新" }) {
  return (
    <div className="xs-async-panel__skeleton" role="status" aria-label={label}>
      <span />
      <span />
      <span />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function XsAsyncPanel({
  status,
  empty,
  emptyTitle,
  emptyDescription = "暂无内容",
  emptyActionLabel,
  onEmptyAction,
  errorTitle = "加载失败",
  error = "暂时无法加载，请稍后重试。",
  onRetry,
  children,
  className = ""
}: XsAsyncPanelProps) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const classes = `xs-async-panel xs-async-panel--${status} ${className}`.trim();

  useEffect(() => {
    if (status !== "pending") {
      setShowSkeleton(false);
      return undefined;
    }

    setShowSkeleton(false);
    const timeoutId = window.setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  if (status === "pending") {
    return (
      <div className={classes} aria-busy="true">
        {showSkeleton ? <LoadingSkeleton label="正在加载" /> : <div className="xs-async-panel__pending-delay" />}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={classes}>
        <div className="xs-async-panel__content" data-view="error">
          <XsEmptyState
            tone="error"
            title={errorTitle}
            description={error}
            actionLabel={onRetry ? "重试" : undefined}
            onAction={onRetry}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={classes} aria-busy={status === "refreshing"}>
      {status === "refreshing" ? (
        <div className="xs-async-panel__refresh" role="status" aria-label="正在刷新">
          正在刷新
        </div>
      ) : null}
      {status === "stale" ? (
        <div className="xs-async-panel__refresh xs-async-panel__refresh--warning" role="alert">
          刷新失败，正在显示上次数据。
        </div>
      ) : null}
      <div className="xs-async-panel__content" data-view={empty ? "empty" : "content"}>
        {empty ? (
          <XsEmptyState
            title={emptyTitle}
            description={emptyDescription}
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
