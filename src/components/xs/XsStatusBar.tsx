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
  announce?: boolean;
  /** 页面本身已有加载表达（骨架、微光）时传 false，避免再叠一个转圈。 */
  spinner?: boolean;
};

const toneTagColor: Record<XsStatusTone, string> = {
  info: "blue",
  success: "success",
  warning: "warning",
  error: "error",
  loading: "blue"
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
  reserveSpace = false,
  announce = true,
  spinner = true
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
      role={announce ? "alert" : undefined}
    />
  ) : (
    <div
      className={`xs-status-bar xs-status-bar--${tone} ${className}`.trim()}
      role={announce ? "status" : undefined}
    >
      {tone === "loading" && spinner ? (
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
