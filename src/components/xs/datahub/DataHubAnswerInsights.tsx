import { ArrowBendDownRight } from "@phosphor-icons/react";
import { useId } from "react";
import type { DataHubAnswerInsight } from "@/types/answerInsight";
import "../../../pages/styles/datahub-answer-insights.css";

export type DataHubAnswerInsightState =
  | { status: "loading" }
  | { status: "success"; insight: DataHubAnswerInsight }
  | { status: "error"; message: string };

/**
 * 数据洞察：从分布、趋势、可能原因补充文字回答没讲到的发现。
 * 生成中和失败只留一行灰字，不挂标题：单个数值往往没有洞察，标题出现又消失反而让人困惑。
 */
export function DataHubAnswerInsightSection({
  state,
  onRetry
}: {
  state: DataHubAnswerInsightState;
  onRetry?: () => void;
}) {
  const headingId = useId();

  if (state.status === "loading") {
    return <p className="datahub-answer-insight__pending" role="status">正在生成数据洞察…</p>;
  }

  if (state.status === "error") {
    return (
      <p className="datahub-answer-insight__pending">
        数据洞察暂未生成。
        {onRetry ? (
          <button type="button" className="datahub-answer-insight__retry" onClick={onRetry}>
            重新生成
          </button>
        ) : null}
      </p>
    );
  }

  if (state.insight.insights.length === 0) {
    return null;
  }

  return (
    <section className="datahub-answer-insight" aria-labelledby={headingId}>
      <h3 className="datahub-answer-insight__title" id={headingId}>数据洞察</h3>
      <ul className="datahub-answer-insight__list">
        {state.insight.insights.map((item) => (
          <li key={`${item.title}:${item.detail}`}>
            {item.title ? <strong>{item.title}：</strong> : null}
            {item.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 引导问题：推测用户下一步想问什么，点一下直接追问。 */
export function DataHubFollowUpQuestions({
  questions,
  disabled = false,
  onAsk
}: {
  questions: string[];
  disabled?: boolean;
  onAsk: (question: string) => void;
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <section className="datahub-follow-ups" aria-label="你可能还想问">
      <span className="datahub-follow-ups__label" aria-hidden="true">你可能还想问</span>
      <div className="datahub-follow-ups__list">
        {questions.map((question) => (
          <button
            type="button"
            className="datahub-follow-up"
            key={question}
            disabled={disabled}
            onClick={() => onAsk(question)}
          >
            <ArrowBendDownRight size={14} aria-hidden="true" />
            <span>{question}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
