import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import {
  formatTraceDuration,
  summarizeTableAgentTrace,
  type TableAgentTrace as TableAgentTraceModel
} from "@/features/tableGeneration/agentTrace";

type TableAgentTraceProps = {
  trace: TableAgentTraceModel;
  /** 本轮是否仍在流式输出；跑的时候默认展开，跑完自动收起。 */
  isStreaming: boolean;
  /** 流式过程中的当前动作，作为最后一条占位，让空轨迹也有反馈。 */
  progress: string;
  /** 最新一轮默认展开——过程本身就是 agent 的交付物；历史轮次收起让位给表。 */
  defaultExpanded?: boolean;
};

export function TableAgentTrace({
  trace,
  isStreaming,
  progress,
  defaultExpanded = false
}: TableAgentTraceProps) {
  const panelId = useId();
  const shouldExpand = isStreaming || defaultExpanded;
  const [expanded, setExpanded] = useState(shouldExpand);
  const [pinned, setPinned] = useState(false);

  // 跟随流式与"是否最新轮次"自动开合；用户手动切换过就不再接管。
  useEffect(() => {
    if (!pinned) {
      setExpanded(shouldExpand);
    }
  }, [pinned, shouldExpand]);

  if (trace.steps.length === 0 && !isStreaming) {
    return null;
  }

  const summary = summarizeTableAgentTrace(trace) || (isStreaming ? progress : "");

  return (
    <section className="agent-trace" data-streaming={isStreaming ? "true" : "false"} aria-label="推演轨迹">
      <button
        type="button"
        className="agent-trace__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setPinned(true);
          setExpanded((current) => !current);
        }}
      >
        <CaretRight className="agent-trace__caret" size={13} weight="bold" aria-hidden="true" />
        <span className="agent-trace__title">推演轨迹</span>
        <span className="agent-trace__summary">{summary}</span>
      </button>
      <div className="agent-trace__panel" id={panelId} hidden={!expanded}>
        <ol className="agent-trace__steps">
          {trace.steps.map((step, index) => (
            <li className="agent-trace__step" key={step.id} data-status={step.status}>
              <span className="agent-trace__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="agent-trace__label">{step.label}</span>
              {step.detail ? <span className="agent-trace__detail">{step.detail}</span> : null}
              {step.durationMs ? (
                <span className="agent-trace__duration">{formatTraceDuration(step.durationMs)}</span>
              ) : null}
              {step.sql ? (
                <details className="agent-trace__sql">
                  <summary>查询语句</summary>
                  <pre>{step.sql}</pre>
                </details>
              ) : null}
            </li>
          ))}
          {isStreaming ? (
            <li className="agent-trace__step" data-status="running" data-pending="true">
              <span className="agent-trace__index" aria-hidden="true">
                {String(trace.steps.length + 1).padStart(2, "0")}
              </span>
              <span className="agent-trace__label">{progress}</span>
            </li>
          ) : null}
        </ol>
      </div>
    </section>
  );
}
