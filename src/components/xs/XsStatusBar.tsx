import { Alert, Spin, Tag } from "antd";
import type { ReactNode } from "react";

export type XsStatusTone = "info" | "success" | "warning" | "error" | "loading";

type XsStatusBarProps = {
  message: ReactNode;
  tone?: XsStatusTone;
  label?: string;
  className?: string;
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

export function XsStatusBar({ message, tone = "info", label, className = "" }: XsStatusBarProps) {
  if (!message) {
    return null;
  }

  if (tone === "error") {
    return (
      <Alert
        className={`xs-status-bar xs-status-bar--alert ${className}`.trim()}
        type="error"
        showIcon
        message={message}
        role="alert"
      />
    );
  }

  return (
    <div className={`xs-status-bar ${className}`.trim()} role="status">
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
}
