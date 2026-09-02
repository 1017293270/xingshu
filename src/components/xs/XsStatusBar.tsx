import { CheckCircle, Info, Warning, WarningOctagon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type XsStatusTone = "info" | "success" | "warning" | "error" | "loading";

type XsStatusBarProps = {
  message?: ReactNode;
  /** 第二行补充说明。只在需要交代后果时给，日常状态一行就够。 */
  detail?: ReactNode;
  tone?: XsStatusTone;
  /** 类别前缀（「筛选结果」「汇总」），同色重字排在消息前。只在它真的补充了信息时给。 */
  label?: string;
  /** 行内动作（「取消」「重试」），排在条尾。 */
  action?: ReactNode;
  className?: string;
  /** 落位用：宽度、外边距、对齐这类"条在哪儿"的规则挂在外层槽位上。 */
  slotClassName?: string;
  transitionKey?: string | number;
  reserveSpace?: boolean;
  announce?: boolean;
  /** 页面本身已有加载表达（骨架、微光）时传 false：脉冲点静止，不再叠第二个"正在转"。 */
  spinner?: boolean;
};

const toneIcon = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  error: WarningOctagon
} as const;

/**
 * 全站唯一的行内状态条：一种外形、四种语气。
 * 语气只由左侧图标与描边颜色承担，不再另起色块药丸——那块药丸和消息本身抢同一处注意力。
 */
export function XsStatusBar({
  message,
  detail,
  tone = "info",
  label,
  action,
  className = "",
  slotClassName = "",
  transitionKey,
  reserveSpace = false,
  announce = true,
  spinner = true
}: XsStatusBarProps) {
  if (!message && !reserveSpace) {
    return null;
  }

  const ToneIcon = tone === "loading" ? null : toneIcon[tone];
  const barClassName = [
    "xs-status-bar",
    `xs-status-bar--${tone}`,
    detail ? "xs-status-bar--stacked" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const content = !message ? null : (
    <div
      className={barClassName}
      /* 与"铺底色"同一条线：需要你动手的两种语气才打断读屏，其余只更新 status */
      role={announce ? (tone === "error" || tone === "warning" ? "alert" : "status") : undefined}
    >
      {ToneIcon ? (
        <ToneIcon className="xs-status-bar__mark" size={15} aria-hidden="true" />
      ) : (
        <span className="xs-status-bar__pulse" aria-hidden="true" data-static={spinner ? undefined : "true"}>
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="xs-status-bar__body">
        <span className="xs-status-bar__message">
          {label ? <b className="xs-status-bar__label">{label}</b> : null}
          {message}
        </span>
        {detail ? <small className="xs-status-bar__detail">{detail}</small> : null}
      </span>
      {action ? <span className="xs-status-bar__action">{action}</span> : null}
    </div>
  );

  return (
    <div
      className={`xs-status-bar-slot${reserveSpace ? " xs-status-bar-slot--reserved" : ""}${slotClassName ? ` ${slotClassName}` : ""}`}
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
