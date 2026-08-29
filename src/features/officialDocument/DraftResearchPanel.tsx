import {
  ChartBar,
  CheckCircle,
  Database,
  FileText,
  Play,
  WarningCircle
} from "@phosphor-icons/react";
import { Button, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { DataHubBusinessExplanation } from "@/components/xs/datahub";
import { executeOfficialDocumentResearch } from "@/services/officialDocumentResearchService";
import type {
  OfficialDocumentContentProfile,
  OfficialDocumentResearchResult
} from "@/types/officialDocument";

type DraftResearchPanelProps = {
  profile?: OfficialDocumentContentProfile;
  results: OfficialDocumentResearchResult[];
  onPersist: (results: OfficialDocumentResearchResult[]) => Promise<void>;
  onStatus: (tone: "loading" | "success" | "error", message: string) => void;
  onGenerate: () => void;
};

const statusMeta: Record<OfficialDocumentResearchResult["status"], { label: string; color: string }> = {
  PENDING: { label: "待执行", color: "default" },
  RUNNING: { label: "执行中", color: "processing" },
  SUCCESS: { label: "成功", color: "success" },
  NO_RESULT: { label: "无结果", color: "warning" },
  FAILED: { label: "失败", color: "error" },
  SKIPPED: { label: "待补充", color: "warning" }
};

export function DraftResearchPanel({
  profile,
  results,
  onPersist,
  onStatus,
  onGenerate
}: DraftResearchPanelProps) {
  const [localResults, setLocalResults] = useState(results);
  const [runningTaskId, setRunningTaskId] = useState<string>();
  const plan = profile?.profile.confirmedPlan;

  useEffect(() => setLocalResults(results), [results]);

  const sections = useMemo(() => new Map(
    (plan?.sections ?? []).map((section) => [section.id, section.title])
  ), [plan]);
  const blocking = localResults.filter((result) => result.required
    && !["SUCCESS", "SKIPPED"].includes(result.status));
  const allFinished = localResults.every((result) => ["SUCCESS", "NO_RESULT", "FAILED", "SKIPPED"].includes(result.status));

  const persist = async (next: OfficialDocumentResearchResult[]) => {
    await onPersist(next);
    setLocalResults(next);
  };

  const execute = async (taskIds?: Set<string>) => {
    if (runningTaskId) return;
    let next = [...localResults];
    const candidates = next.filter((result) => (
      taskIds?.has(result.taskId)
      || (!taskIds && !["SUCCESS", "SKIPPED"].includes(result.status))
    ));
    if (!candidates.length) return;
    let chartCount = next.filter((result) => Boolean(result.chart)).length;
    onStatus("loading", `正在按计划执行 ${candidates.length} 项问数与问知任务`);

    try {
      for (const candidate of candidates) {
        setRunningTaskId(candidate.taskId);
        next = next.map((result) => result.taskId === candidate.taskId
          ? { ...result, status: "RUNNING", summary: "" }
          : result);
        await persist(next);
        const need = plan?.researchNeeds.find((item) => item.id === candidate.taskId);
        if (!need) {
          next = next.map((result) => result.taskId === candidate.taskId
            ? { ...result, status: "FAILED", summary: "内容方案中找不到该研究任务" }
            : result);
          await persist(next);
          continue;
        }
        try {
          const completed = await executeOfficialDocumentResearch(need, chartCount < 3);
          if (completed.chart) chartCount += 1;
          const noResult = need.kind === "ASK_DATA"
            ? !completed.table?.rows.length
            : !completed.citations.length;
          const resultPayload = noResult && need.kind === "ASK_KNOWLEDGE"
            ? { ...completed, summary: "未找到可引用的知识来源，请重试或标记为待补充。" }
            : completed;
          next = next.map((result) => result.taskId === candidate.taskId
            ? { ...result, ...resultPayload, status: noResult ? "NO_RESULT" : "SUCCESS" }
            : result);
        } catch (error) {
          next = next.map((result) => result.taskId === candidate.taskId
            ? {
                ...result,
                status: "FAILED",
                summary: error instanceof Error ? error.message : "资料查询失败"
              }
            : result);
        }
        await persist(next);
      }

      const failedRequired = next.filter((result) => result.required
        && !["SUCCESS", "SKIPPED"].includes(result.status));
      onStatus(
        failedRequired.length ? "error" : "success",
        failedRequired.length
          ? `${failedRequired.length} 项必需资料未完成，重试或标记为待补充后再生成全文。`
          : "问数与问知已执行，结果已按章节保存。"
      );
    } catch (error) {
      onStatus("error", error instanceof Error ? error.message : "资料任务状态保存失败");
    } finally {
      setRunningTaskId(undefined);
    }
  };

  const skip = async (taskId: string) => {
    const next = localResults.map((result) => result.taskId === taskId
      ? { ...result, status: "SKIPPED" as const, summary: "待补充" }
      : result);
    try {
      await persist(next);
    } catch (error) {
      onStatus("error", error instanceof Error ? error.message : "待补充状态保存失败");
    }
  };

  if (!profile || !plan) {
    return <div className="official-document-inline-empty">旧草稿没有绑定内容方案，可继续手工编辑和导出。</div>;
  }

  return (
    <section className="draft-research" aria-labelledby="draft-research-heading">
      <div className="official-document-section-title">
        <div>
          <h4 id="draft-research-heading">资料补全</h4>
          <p>按已确认计划执行问数和问知；结果成功后才会写入全文。</p>
        </div>
        <Button
          type="primary"
          icon={<Play size={15} />}
          loading={Boolean(runningTaskId)}
          disabled={!localResults.length || Boolean(runningTaskId)}
          onClick={() => void execute()}
        >
          执行问数与问知
        </Button>
      </div>

      <div className="draft-research__list">
        {localResults.map((result) => {
          const meta = statusMeta[result.status];
          return (
            <article key={result.taskId} data-status={result.status.toLocaleLowerCase()}>
              <header>
                <span aria-hidden="true">{result.kind === "ASK_DATA" ? <Database size={18} /> : <FileText size={18} />}</span>
                <div>
                  <strong>{result.kind === "ASK_DATA" ? "问数" : "问知"} · {sections.get(result.sectionId) || result.sectionId}</strong>
                  <p>{result.question}</p>
                </div>
                {result.required ? <Tag bordered={false} color="red">必需</Tag> : null}
                <Tag bordered={false} color={meta.color}>{meta.label}</Tag>
              </header>

              {result.summary ? <div className="draft-research__summary"><XsSafeMarkdown content={result.summary} /></div> : null}
              <DataHubBusinessExplanation
                kind={result.kind}
                intent={result.question}
                status={result.status === "RUNNING" ? "running" : result.status === "FAILED" ? "error" : "done"}
                columns={(result.table?.columns ?? []).map((column) => ({ key: column, title: column }))}
                knowledgeBases={result.citations.map((citation) => citation.kbName)}
                dataAsOf={result.querySource?.dataAsOf}
              />
              {result.table ? (
                <details className="draft-research__result">
                  <summary><Database size={14} />查询结果 · {result.table.totalRows} 行</summary>
                  <div><table><thead><tr>{result.table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{result.table.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
                  </table></div>
                  {result.querySource?.dataAsOf ? <small>数据时间：{result.querySource.dataAsOf}</small> : null}
                </details>
              ) : null}
              {result.chart ? <p className="draft-research__asset"><ChartBar size={15} />已生成白底 PNG 图表</p> : null}
              {result.citations.length ? (
                <details className="draft-research__result">
                  <summary><FileText size={14} />知识来源 · {result.citations.length} 份文档</summary>
                  {Array.from(new Set(result.citations.map((citation) => citation.kbName))).map((kbName) => (
                    <section key={kbName}>
                      <strong>{kbName}</strong>
                      <ul>{result.citations.filter((citation) => citation.kbName === kbName).map((citation) => (
                        <li key={citation.docId}>{citation.docName}{citation.fragments[0] ? <small>{citation.fragments[0]}</small> : null}</li>
                      ))}</ul>
                    </section>
                  ))}
                </details>
              ) : null}

              {["FAILED", "NO_RESULT"].includes(result.status) ? (
                <footer>
                  <Button size="small" icon={<WarningCircle size={14} />} disabled={Boolean(runningTaskId)} onClick={() => void execute(new Set([result.taskId]))}>重试</Button>
                  {result.required ? <Button size="small" onClick={() => void skip(result.taskId)}>保留待补充并继续</Button> : null}
                </footer>
              ) : result.status === "SUCCESS" ? <p className="draft-research__asset"><CheckCircle size={15} />已关联到本章节</p> : null}
            </article>
          );
        })}
        {!localResults.length ? <div className="official-document-inline-empty">该内容方案没有需要补全的资料，可直接生成全文。</div> : null}
      </div>

      <footer className="draft-research__generate">
        <span>{blocking.length ? `${blocking.length} 项必需资料未完成` : allFinished ? "资料任务已处理" : "仍有资料任务待执行"}</span>
        <Button type="primary" disabled={Boolean(runningTaskId) || blocking.length > 0} onClick={onGenerate}>生成全文</Button>
      </footer>
    </section>
  );
}
