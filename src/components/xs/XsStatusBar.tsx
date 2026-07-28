import { Alert, Spin, Tag } from "antd";
import type { ReactNode } from "react";

export type XsStatusTone = "info" | "success" | "warning" | "error" | "loading";

type XsStatusBarProps = {
  message?: ReactNode;
  tone?: XsStatusTone;
  label?: string;
  className?: string;
  transitionKey?: string | number;
  reserveSpace?: boolean;
};

const toneTagColor: Record<Exclude<XsStatusTone, "loading">, string> = {
  info: "blue",
  success: "success",
  warning: "warning",
  error: "error"
};

const defaultLabel: Record<XsStatusTone, string> = {
  info: "状态",
  success: "完成",
  warning: "提示",
  error: "失败",
  loading: "处理中"
};

export function XsStatusBar({
  message,
  tone = "info",
  label,
  className = "",
  transitionKey,
  reserveSpace = false
}: XsStatusBarProps) {
  if (!message && !reserveSpace) {
    return null;
  }

  const content = !message ? null : tone === "error" ? (
    <Alert
      className={`xs-status-bar xs-status-bar--alert xs-status-bar--error ${className}`.trim()}
      type="error"
      showIcon
      message={message}
      role="alert"
    />
  ) : (
    <div className={`xs-status-bar xs-status-bar--${tone} ${className}`.trim()} role="status">
      {tone === "loading" ? (
        <span className="xs-status-bar__loading">
          <Spin size="small" />
        </span>
      ) : (
        <Tag bordered={false} color={toneTagColor[tone]}>
          {label ?? defaultLabel[tone]}
        </Tag>
      )}
      <span className="xs-status-bar__message">{message}</span>
    </div>
  );

  return (
    <div
      className={`xs-status-bar-slot${reserveSpace ? " xs-status-bar-slot--reserved" : ""}`}
      aria-hidden={!message || undefined}
    >
      {content ? (
        <div key={transitionKey ?? `${tone}`} className="xs-status-bar-slot__content">
          {content}
        </div>
      ) : null}
    </div>
  );
}
