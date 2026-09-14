import { CaretRight, CircleNotch, Clock, MinusCircle, WarningCircle } from "@phosphor-icons/react";
import { useId, useState } from "react";
import {
  formatTraceDuration,
  summarizeTableAgentTrace,
  type TableAgentTrace as TableAgentTraceModel
} from "@/features/tableGeneration/agentTrace";
import type { DataHubAskDataStatus } from "@/types/dataHub";

type TableAgentTraceProps = {
  trace: TableAgentTraceModel;
  /** 兼容旧调用；传入 status 时以实际轮次状态为准。 */
  isStreaming: boolean;
  status?: DataHubAskDataStatus;
  /** 仅在运行中且尚无真实步骤时，作为面板内的说明。 */
  progress: string;
};

/** 执行轨迹默认收起，用户展开后由用户控制；不根据工具状态推断任务成功。 */
export function TableAgentTrace({ trace, isStreaming, progress, status }: TableAgentTraceProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const actualStatus = status ?? (isStreaming ? "streaming" : "idle");
  const running = actualStatus === "streaming";

  if (trace.steps.length === 0 && !running) return null;

  const summary = summarizeTableAgentTrace(trace);
  const stateLabel = running ? "进行中" : actualStatus === "done" ? "处理结束"
    : actualStatus === "error" ? "执行失败" : actualStatus === "cancelled" ? "已停止" : "";
  const StatusIcon = running ? CircleNotch : actualStatus === "error" ? WarningCircle
    : actualStatus === "cancelled" ? MinusCircle : Clock;

  return (
    <section className="tgs-trace" data-streaming={running ? "true" : "false"} data-status={actualStatus} aria-label="执行过程">
      <button
        type="button"
        className="tgs-trace__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setMounted(true);
          setExpanded((current) => !current);
        }}
      >
        <StatusIcon className="tgs-trace__status-icon" size={14} aria-hidden="true" />
        <span className="tgs-trace__label">执行过程</span>
        {stateLabel || summary ? <span className="tgs-trace__summary">{[stateLabel, summary].filter(Boolean).join(" · ")}</span> : null}
        <CaretRight className="tgs-trace__caret" size={12} weight="bold" aria-hidden="true" />
      </button>
      <div className="tgs-trace__panel" id={panelId} data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
        <div className="tgs-trace__inner">
          {mounted && trace.steps.length > 0 ? <ol className="tgs-trace__steps">
            {trace.steps.map((step, index) => (
              <li className="tgs-trace__step" key={step.id} data-status={step.status}>
                <span className="tgs-trace__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="tgs-trace__name">{step.label}</span>
                {step.durationMs != null ? (
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
          </ol> : null}
          {mounted && trace.steps.length === 0 && running && progress ? <p className="tgs-trace__progress">{progress}</p> : null}
        </div>
      </div>
    </section>
  );
}
