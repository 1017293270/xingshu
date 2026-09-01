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
};

/**
 * 执行过程：跑完之后它就是一行元信息（「执行过程 · 5 步 · 用时 2.4s ›」），默认收起。
 * 只有正在跑的那一轮把步骤摊开——那时候过程本身才是用户在等的东西。
 */
export function TableAgentTrace({ trace, isStreaming, progress }: TableAgentTraceProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(isStreaming);
  const [pinned, setPinned] = useState(false);

  // 跟随流式自动开合；用户手动切换过就不再接管。
  useEffect(() => {
    if (!pinned) {
      setExpanded(isStreaming);
    }
  }, [isStreaming, pinned]);

  if (trace.steps.length === 0 && !isStreaming) {
    return null;
  }

  const summary = summarizeTableAgentTrace(trace) || (isStreaming ? progress : "");

  return (
    <section className="tgs-trace" data-streaming={isStreaming ? "true" : "false"} aria-label="执行过程">
      <button
        type="button"
        className="tgs-trace__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setPinned(true);
          setExpanded((current) => !current);
        }}
      >
        <span className="tgs-trace__label">执行过程</span>
        {summary ? <span className="tgs-trace__summary">{summary}</span> : null}
        <CaretRight className="tgs-trace__caret" size={12} weight="bold" aria-hidden="true" />
      </button>
      <div className="tgs-trace__panel" id={panelId} hidden={!expanded}>
        <ol className="tgs-trace__steps">
          {trace.steps.map((step, index) => (
            <li className="tgs-trace__step" key={step.id} data-status={step.status}>
              <span className="tgs-trace__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="tgs-trace__name">{step.label}</span>
              {step.durationMs ? (
                <span className="tgs-trace__time">{formatTraceDuration(step.durationMs)}</span>
              ) : null}
              {step.detail ? <span className="tgs-trace__detail">{step.detail}</span> : null}
              {step.sql ? (
                <details className="tgs-trace__sql">
                  <summary>查询语句</summary>
                  <pre>{step.sql}</pre>
                </details>
              ) : null}
            </li>
          ))}
          {isStreaming ? (
            <li className="tgs-trace__step" data-status="running" data-pending="true">
              <span className="tgs-trace__index" aria-hidden="true">
                {String(trace.steps.length + 1).padStart(2, "0")}
              </span>
              <span className="tgs-trace__name">{progress}</span>
            </li>
          ) : null}
        </ol>
      </div>
    </section>
  );
}
