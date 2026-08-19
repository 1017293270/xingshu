import { DataHubResultTable } from "@/components/xs/datahub";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { TableAgentTrace } from "@/features/tableGeneration/TableAgentTrace";
import { TablePlaceholder } from "@/features/tableGeneration/TablePlaceholder";
import { buildTableAgentTrace } from "@/features/tableGeneration/agentTrace";
import type { DataHubAskDataStatus, DataHubAskTurn } from "@/types/dataHub";

type TableResultStageProps = {
  status: DataHubAskDataStatus;
  turn: DataHubAskTurn;
  progress: string;
  isLatest: boolean;
};

export function TableResultStage({ status, turn, progress, isLatest }: TableResultStageProps) {
  const trace = buildTableAgentTrace(turn);
  const hasTables = trace.tableCount > 0;
  const answer = turn.answerBlocks[0]?.content.trim() ?? "";
  const datasourceName = trace.datasourceName || undefined;
  const isStreaming = status === "streaming";
  const isDone = status === "done";
  const isError = status === "error";
  const isCancelled = status === "cancelled";
  const showAnswer = Boolean(answer) && (isDone || isCancelled);

  return (
    <section className="sheet-result" aria-label="制表结果" data-state={status}>
      <TableAgentTrace trace={trace} isStreaming={isStreaming} progress={progress} defaultExpanded={isLatest} />
      {isError ? (
        <p className="sheet-result__empty sheet-result__empty--error">
          {turn.error?.message || "制表执行失败，请稍后重试"}
        </p>
      ) : null}
      {isCancelled && !hasTables ? (
        <p className="sheet-result__empty">已停止本次制表生成，可以修改需求后重新提交。</p>
      ) : null}
      {/* 实时步骤由上方推演轨迹播报，空表框只说明表会落在哪里，不重复同一句话 */}
      {isStreaming && !hasTables ? (
        <TablePlaceholder state="loading" title="正在生成结果表" hint="结果表就绪后会出现在这里" />
      ) : null}
      {hasTables ? (
        <div className="sheet-result__tables">
          {turn.tableResults.map((table) => (
            <DataHubResultTable table={table} datasourceName={datasourceName} key={table.tableIndex} />
          ))}
        </div>
      ) : null}
      {showAnswer ? (
        <div className="sheet-result__answer">
          <XsSafeMarkdown content={answer} />
        </div>
      ) : null}
      {isDone && !hasTables ? (
        <p className="sheet-result__empty">未生成结果表，请补充字段、时间或统计口径</p>
      ) : null}
    </section>
  );
}
