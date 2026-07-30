import {
  Brain,
  CheckCircle,
  CircleNotch,
  FlowArrow,
  GitBranch,
  WarningCircle,
  Wrench
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useId, type CSSProperties } from "react";
import {
  formatExecutionDuration,
  formatExecutionTime,
  formatStructuredContent,
  orchestrationEventsForSession
} from "./display";
import type { DataHubExecutionEventView, DataHubExecutionTimelineProps } from "./types";

function eventIcon(item: DataHubExecutionEventView): Icon {
  if (item.status === "error") {
    return WarningCircle;
  }
  if (item.type.startsWith("routing_")) {
    return item.type === "routing_decompose" ? GitBranch : FlowArrow;
  }
  if (item.type === "react_step") {
    return Brain;
  }
  if (item.type === "tool_call" || item.type === "tool_result") {
    return Wrench;
  }
  return item.status === "done" ? CheckCircle : CircleNotch;
}

export function DataHubExecutionTimeline({ session }: DataHubExecutionTimelineProps) {
  const titleId = useId();
  const items = orchestrationEventsForSession(session);

  if (!items.length) {
    return (
      <div className="xs-datahub-timeline xs-datahub-timeline--empty">
        <FlowArrow size={20} aria-hidden="true" />
        <p>本次响应没有独立的路由、ReAct 或工具调用事件。</p>
      </div>
    );
  }

  return (
    <section className="xs-datahub-timeline" aria-labelledby={titleId}>
      <header className="xs-datahub-section-title">
        <div>
          <span>EXECUTION LOG</span>
          <h3 id={titleId}>编排执行轨迹</h3>
        </div>
        <small>{items.length} 个事件</small>
      </header>
      <ol>
        {items.map((item, index) => {
          const Icon = eventIcon(item);
          const detail = item.event.content ?? item.event.data;
          const hasDetail =
            detail !== undefined &&
            typeof detail !== "string" &&
            detail !== null;
          return (
            <li
              key={item.id}
              className={`xs-datahub-timeline__item xs-datahub-timeline__item--${item.status}`}
              style={{ "--xs-datahub-stagger": index } as CSSProperties}
            >
              <span className="xs-datahub-timeline__rail" aria-hidden="true">
                <Icon
                  size={15}
                  weight={item.status === "running" ? "regular" : "fill"}
                />
              </span>
              <div className="xs-datahub-timeline__body">
                <header>
                  <strong>{item.title}</strong>
                  {item.agentName ? <span>{item.agentName}</span> : null}
                  {item.durationMs !== undefined ? (
                    <time>{formatExecutionDuration(item.durationMs)}</time>
                  ) : null}
                  {formatExecutionTime(item.timestamp) ? (
                    <time>{formatExecutionTime(item.timestamp)}</time>
                  ) : null}
                </header>
                {item.summary ? <p>{item.summary}</p> : null}
                {hasDetail ? (
                  <details>
                    <summary>查看事件详情</summary>
                    <pre>{formatStructuredContent(detail)}</pre>
                  </details>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
