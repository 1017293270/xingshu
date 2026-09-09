import { CheckCircle, Info, WarningCircle } from "@phosphor-icons/react";
import { Button } from "antd";
import { useState } from "react";
import type { OfficialDocumentFactReviewIssue } from "@/services/officialDocumentFullDraft";
import type { OfficialDocumentResearchResult } from "@/types/officialDocument";
import "./official-document-review-panel.css";

/** 默认只露前几条，长列表在会话流里会把成稿卡挤到看不见。 */
const PREVIEW_COUNT = 3;

const MISSING_STATUS_LABEL: Record<string, string> = {
  NO_RESULT: "没有找到",
  FAILED: "查询失败",
  SKIPPED: "已跳过"
};

function missingStatusLabel(status: OfficialDocumentResearchResult["status"]) {
  return MISSING_STATUS_LABEL[status] ?? "未完成";
}

/** 同一个原因重复十几遍只是噪音；重复的收进脚注，逐项只留不一样的那部分。 */
function groupMissingReasons(results: OfficialDocumentResearchResult[]) {
  const counts = new Map<string, number>();
  results.forEach((result) => {
    const reason = result.summary.trim();
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  });
  const shared = [...counts.entries()].filter(([, count]) => count > 1);
  return {
    isShared: (reason: string) => (counts.get(reason.trim()) ?? 0) > 1,
    footnotes: shared.map(([reason, count]) => ({ reason, count }))
  };
}

function FactReviewSection({
  issues,
  confirmedAt,
  onConfirm
}: {
  issues: OfficialDocumentFactReviewIssue[];
  confirmedAt?: string;
  onConfirm: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const confirmed = Boolean(confirmedAt);
  // 确认过就默认收起：它已经不是待办，只是一份可回查的记录。
  const visible = expanded ? issues : confirmed ? [] : issues.slice(0, PREVIEW_COUNT);
  const toggleLabel = expanded ? "收起" : confirmed ? `查看 ${issues.length} 处` : `展开全部 ${issues.length} 处`;

  return (
    <div className="compose-review__block" data-confirmed={confirmed || undefined}>
      <div className="compose-review__head">
        {confirmed
          ? <CheckCircle className="compose-review__icon" data-tone="success" size={14} weight="fill" aria-hidden="true" />
          : <WarningCircle className="compose-review__icon" data-tone="warning" size={14} weight="fill" aria-hidden="true" />}
        <h4 className="compose-review__title">{confirmed ? "已核对来源" : "需核对来源"}</h4>
        <span className="compose-review__count">{issues.length} 处</span>
        <Button size="small" onClick={onConfirm}>{confirmed ? "撤销确认" : "我已核对来源"}</Button>
      </div>
      <div className="compose-review__hint">这些时间、数量或执行要求没有在需求与资料里匹配到，原文已保留</div>
      {visible.length ? (
        <ul className="compose-review__facts">
          {visible.map((issue, index) => (
            <li key={index}>
              {issue.additions.map((addition) => (
                <em key={addition} className="compose-review__tag">{addition}</em>
              ))}
              <span className="compose-review__sentence" title={issue.sentence}>{issue.sentence}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {issues.length > PREVIEW_COUNT || confirmed ? (
        <button type="button" className="compose-review__more" onClick={() => setExpanded((open) => !open)}>
          {toggleLabel}
        </button>
      ) : null}
    </div>
  );
}

function MissingResearchSection({
  results,
  busy,
  onRetry
}: {
  results: OfficialDocumentResearchResult[];
  busy: boolean;
  onRetry: () => void;
}) {
  const { isShared, footnotes } = groupMissingReasons(results);

  return (
    <div className="compose-review__block">
      <div className="compose-review__head">
        <Info className="compose-review__icon" size={14} aria-hidden="true" />
        <h4 className="compose-review__title">有 {results.length} 项资料未补齐</h4>
        <Button size="small" disabled={busy} onClick={onRetry}>重试缺失资料</Button>
      </div>
      <div className="compose-review__hint">可以直接用当前成稿，也可以补齐后重新生成</div>
      <ul className="compose-review__missing">
        {results.map((result) => {
          const reason = result.summary.trim();
          return (
            <li key={result.taskId}>
              <div className="compose-review__line">
                <span className="compose-review__question">{result.question}</span>
                <span className="compose-review__state">{missingStatusLabel(result.status)}</span>
              </div>
              {reason && !isShared(reason) ? <div className="compose-review__reason">{reason}</div> : null}
            </li>
          );
        })}
      </ul>
      {footnotes.map(({ reason, count }) => (
        <div key={reason} className="compose-review__footnote">以上 {count} 项：{reason}</div>
      ))}
    </div>
  );
}

/**
 * 成稿之后的三类提醒合成一块面板：颜色只落在需要动作的地方，
 * 长列表默认折起，避免整段同色文字盖住成稿本身。
 */
export function ComposeReviewPanel({
  factReview,
  factReviewConfirmedAt,
  researchResults,
  busy = false,
  onConfirmFactReview,
  onRetryMissing
}: {
  factReview?: OfficialDocumentFactReviewIssue[];
  factReviewConfirmedAt?: string;
  researchResults?: OfficialDocumentResearchResult[];
  busy?: boolean;
  onConfirmFactReview: () => void;
  onRetryMissing: () => void;
}) {
  const issues = factReview ?? [];
  const results = researchResults ?? [];
  const missing = results.filter((result) => result.status !== "SUCCESS");
  const missingCitations = results.some((result) => (
    result.kind === "ASK_KNOWLEDGE" && result.status === "SUCCESS" && !result.citations.length
  ));

  if (!issues.length && !missing.length && !missingCitations) return null;

  return (
    <section className="compose-review" aria-label="成稿核对">
      {issues.length ? (
        <FactReviewSection issues={issues} confirmedAt={factReviewConfirmedAt} onConfirm={onConfirmFactReview} />
      ) : null}
      {missing.length ? <MissingResearchSection results={missing} busy={busy} onRetry={onRetryMissing} /> : null}
      {missingCitations ? (
        <div className="compose-review__note">
          <Info className="compose-review__icon" size={14} aria-hidden="true" />
          部分资料未附来源链接，内容已保留供参考
        </div>
      ) : null}
    </section>
  );
}
