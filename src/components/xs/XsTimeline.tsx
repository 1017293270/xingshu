import { Check } from "@phosphor-icons/react";

export type XsTimelineStatus = "complete" | "active" | "pending";

export type XsTimelineItem = {
  title: string;
  description: string;
  status?: XsTimelineStatus;
};

type XsTimelineProps = {
  items: XsTimelineItem[];
  ariaLabel?: string;
};

const statusLabel: Record<XsTimelineStatus, string> = {
  complete: "已完成",
  active: "进行中",
  pending: "待处理"
};

export function XsTimeline({ items, ariaLabel = "步骤时间线" }: XsTimelineProps) {
  return (
    <ol className="xs-timeline" aria-label={ariaLabel}>
      {items.map((item) => {
        const status = item.status ?? "complete";

        return (
          <li
            key={item.title}
            className={`xs-timeline__item xs-timeline__item--${status}`}
            aria-label={`${item.title}，${statusLabel[status]}`}
          >
            <span className="xs-timeline__marker" aria-hidden="true">
              {status === "complete" ? <Check size={14} weight="bold" /> : null}
            </span>
            <div className="xs-timeline__body">
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
