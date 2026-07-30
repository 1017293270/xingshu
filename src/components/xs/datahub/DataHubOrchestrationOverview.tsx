import {
  Brain,
  Clock,
  FlowArrow,
  GitBranch,
  Robot,
  TreeStructure
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { DataHubAdaptiveSourceResult } from "@/types/dataHub";
import {
  asString,
  formatExecutionDuration,
  routeValue,
  sessionDisplayName
} from "./display";
import { XsCountUpText } from "../XsCountUpText";
import { DataHubExecutionStatus } from "./DataHubExecutionStatus";
import type { DataHubOrchestrationOverviewProps } from "./types";

function sourceResultLabel(result: DataHubAdaptiveSourceResult) {
  if (result.datasourceName) {
    return result.datasourceName;
  }
  if (result.knowledgeNames?.length) {
    return result.knowledgeNames.join("、");
  }
  return result.sourceKind === "knowledge" ? "知识检索" : "数据查询";
}

function sourceResultStatus(result: DataHubAdaptiveSourceResult) {
  const labels: Record<string, string> = {
    answered: "已回答",
    partial: "部分完成",
    no_capability: "无可用能力",
    no_match: "未匹配",
    failed: "失败"
  };
  return labels[result.status ?? ""] ?? result.status ?? "处理中";
}

/** 记录上一次的字符串值，供数字滚动从上一次值继续动画。 */
function usePreviousValue(value: string) {
  const ref = useRef<string | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export function DataHubOrchestrationOverview({
  session,
  eventCount,
  agentCount,
  subagentCount
}: DataHubOrchestrationOverviewProps) {
  const titleId = useId();
  const intent = routeValue(session, "routing_intent", "intentLabel", "intent", "summary");
  const skill = routeValue(
    session,
    "routing_skill",
    "skillLabel",
    "skillName",
    "skill",
    "summary"
  );
  const strategy = routeValue(
    session,
    "routing_strategy",
    "strategyLabel",
    "strategy",
    "summary"
  );
  const decompose = session.orchestration.decompose;
  const subQuestions = decompose?.subQuestions ?? [];
  const executionMode = asString(decompose?.executionMode);
  const hasRouting = Boolean(intent || skill || strategy || executionMode || subQuestions.length);
  const done = session.done;
  const coverage = done?.coverage;
  const sourceResults = done?.sourceResults ?? [];
  const agentCountText = String(agentCount);
  const subagentCountText = String(subagentCount);
  const eventCountText = String(eventCount);
  const previousAgentCount = usePreviousValue(agentCountText);
  const previousSubagentCount = usePreviousValue(subagentCountText);
  const previousEventCount = usePreviousValue(eventCountText);
  const routeSteps = [
    intent ? { label: "意图", value: intent } : undefined,
    skill ? { label: "能力", value: skill } : undefined,
    strategy ? { label: "策略", value: strategy } : undefined
  ].filter((step): step is { label: string; value: string } => Boolean(step));

  return (
    <article className="xs-datahub-overview" aria-labelledby={titleId}>
      <header className="xs-datahub-overview__header">
        <span className="xs-datahub-overview__icon" aria-hidden="true">
          <TreeStructure size={20} weight="duotone" />
        </span>
        <div className="xs-datahub-overview__heading">
          <p>ORCHESTRATION</p>
          <h3 id={titleId}>
            {sessionDisplayName(session) || "智能编排器"}
          </h3>
        </div>
        {done?.adaptiveTeam ? (
          <span className="xs-datahub-overview__mode">自适应团队</span>
        ) : executionMode ? (
          <span className="xs-datahub-overview__mode">{executionMode}</span>
        ) : null}
        <DataHubExecutionStatus status={session.status} />
      </header>

      <dl className="xs-datahub-overview__metrics" aria-label="编排执行概览">
        <div>
          <dt>
            <Robot size={15} aria-hidden="true" />
            参与智能体
          </dt>
          <dd>
            <XsCountUpText value={agentCountText} previousValue={previousAgentCount} />
          </dd>
        </div>
        <div>
          <dt>
            <GitBranch size={15} aria-hidden="true" />
            子智能体
          </dt>
          <dd>
            <XsCountUpText value={subagentCountText} previousValue={previousSubagentCount} />
          </dd>
        </div>
        <div>
          <dt>
            <FlowArrow size={15} aria-hidden="true" />
            编排事件
          </dt>
          <dd>
            <XsCountUpText value={eventCountText} previousValue={previousEventCount} />
          </dd>
        </div>
        <div>
          <dt>
            <Clock size={15} aria-hidden="true" />
            总耗时
          </dt>
          <dd>{formatExecutionDuration(done?.totalDurationMs) || "—"}</dd>
        </div>
      </dl>

      {hasRouting ? (
        <div className="xs-datahub-overview__route">
          <div className="xs-datahub-overview__route-line" aria-label="路由决策">
            {routeSteps.map((step, index) => (
              <span
                key={step.label}
                style={{ "--xs-datahub-stagger": index } as CSSProperties}
              >
                <small>{step.label}</small>
                {step.value}
              </span>
            ))}
          </div>
          {subQuestions.length ? (
            <section className="xs-datahub-overview__decompose">
              <h4>
                <Brain size={16} weight="duotone" aria-hidden="true" />
                任务拆解
                <span>{subQuestions.length}</span>
              </h4>
              <ol>
                {subQuestions.map((question, index) => (
                  <li
                    key={`${index}-${question}`}
                    style={{ "--xs-datahub-stagger": index } as CSSProperties}
                  >
                    <span>{index + 1}</span>
                    <p>{question}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : (
        <p className="xs-datahub-overview__empty">
          本次响应未返回独立的路由或任务拆解事件。
        </p>
      )}

      {coverage || sourceResults.length ? (
        <section className="xs-datahub-overview__coverage" aria-label="自适应团队覆盖情况">
          <header>
            <h4>任务覆盖</h4>
            {done?.completion ? <span>{done.completion}</span> : null}
          </header>
          {coverage ? (
            <dl>
              <div>
                <dt>已覆盖</dt>
                <dd>{coverage.returned ?? 0}</dd>
              </div>
              <div>
                <dt>检查项</dt>
                <dd>{coverage.examined ?? coverage.scopeTotal ?? 0}</dd>
              </div>
              <div>
                <dt>完成状态</dt>
                <dd>{coverage.complete ? "完整" : "部分"}</dd>
              </div>
            </dl>
          ) : null}
          {sourceResults.length ? (
            <ul>
              {sourceResults.map((result, index) => (
                <li
                  key={`${result.observationId ?? result.sourceKind ?? "source"}-${index}`}
                  style={{ "--xs-datahub-stagger": index } as CSSProperties}
                >
                  <span>{sourceResultLabel(result)}</span>
                  <small>{sourceResultStatus(result)}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {done?.summary ? (
        <p className="xs-datahub-overview__summary">{done.summary}</p>
      ) : null}
    </article>
  );
}
