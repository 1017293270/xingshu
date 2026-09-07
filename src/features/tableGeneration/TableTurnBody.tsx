import { useEffect, useState } from "react";
import { ArrowsClockwise, CircleNotch, Copy } from "@phosphor-icons/react";
import { XsClarifyCard } from "@/components/xs/conversation";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { TableAgentTrace } from "@/features/tableGeneration/TableAgentTrace";
import { TableArtifactGroup } from "@/features/tableGeneration/TableArtifactGroup";
import { buildTableAgentTrace, type TableExecutionTurn } from "@/features/tableGeneration/agentTrace";
import { clarificationKey, hasPendingClarification } from "@/services/dataHubClarification";
import { formatDataHubTableTitle } from "@/services/dataHubFormat";
import type { DataHubAskTurn } from "@/types/dataHub";

export type TableTurnStatus = {
  tone: "success" | "error";
  message: string;
};

type TableTurnBodyProps = {
  turn: TableExecutionTurn;
  /** 流式过程中的当前动作，交给执行过程当最后一条占位。 */
  progress: string;
  /** 正在结果台里浏览的那张表，格式见 tableViewerKey。 */
  activeTableKey: string;
  busy: boolean;
  status?: TableTurnStatus;
  onOpenTable: (position: number) => void;
  /** 这一轮在会话里的键，澄清卡的身份要靠它拼出来。 */
  turnKey: string;
  /** 正在输入框上方浮层里展示的那张，对话流里就别重复一遍了。 */
  dockedClarifyKey?: string;
  /** 被用户收起的澄清卡，留一行带"去选择"的窄条。 */
  dismissedClarifyKeys: string[];
  /** 刚答完的那张，进场闪一下。 */
  freshClarifyKey?: string;
  onExpandClarify: (key: string) => void;
  onCopyAnswer: () => void;
  onRegenerate: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onExportTable: (position: number, format: "csv" | "xlsx") => void;
};

/**
 * 侧栏定位一张表要同时知道是哪一轮的第几张。
 * 用数组下标而不是 `tableIndex`：后者是可选字段，缺席时所有表会撞成同一个键。
 */
export function tableViewerKey(turn: DataHubAskTurn, position: number) {
  return `${turn.chatId || turn.question}:${position}`;
}

/**
 * 一轮制表在对话流里的助手侧内容：执行过程 → 回答正文 → 结果表工件卡 → 消息级操作。
 * 全部平铺，不套气泡框；表本身不铺在这里，只留一张卡，
 * 几十行数据摊进对话列，上一轮就再也翻不回去了——完整的表在结果台看。
 */
export function TableTurnBody({
  turn,
  progress,
  activeTableKey,
  busy,
  status,
  onOpenTable,
  turnKey,
  dockedClarifyKey,
  dismissedClarifyKeys,
  freshClarifyKey,
  onExpandClarify,
  onCopyAnswer,
  onRegenerate,
  onExport,
  onExportTable
}: TableTurnBodyProps) {
  const trace = buildTableAgentTrace(turn);
  const hasTables = turn.tableResults.length > 0;
  const answer = turn.answerBlocks.map((block) => block.content).join("\n\n").trim();
  const isStreaming = turn.status === "streaming";
  const isDone = turn.status === "done";
  const [longRunning, setLongRunning] = useState(false);
  useEffect(() => {
    setLongRunning(false);
    if (!isStreaming) return;
    const timer = window.setTimeout(() => setLongRunning(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [isStreaming, turnKey]);
  const isError = turn.status === "error";
  const isCancelled = turn.status === "cancelled";
  const canExport = hasTables && (isDone || isCancelled);
  /* 挂在 ask_user 上的这一轮虽然是 done，但其实在等用户选，不能按"跑完了"处理。 */
  const pendingClarification = hasPendingClarification(turn);
  const retryLabel = isError ? "重试" : isCancelled ? "继续生成" : "重新生成";

  return (
    <div className="tgs-turn__reply" data-error={isError || undefined} aria-live="polite">
      <TableAgentTrace trace={trace} isStreaming={isStreaming} progress={progress} />

      {/* 错误与提示就是一行正文加一行灰色小字，不做红色横幅 */}
      {isError ? (
        <>
          <p>{turn.error?.message || "制表执行失败，请稍后重试"}</p>
          <small data-error="true">可以调整需求后重新提交，或点下面的重试再跑一次</small>
        </>
      ) : null}

      {isCancelled && !hasTables ? (
        <>
          <p>已停止本次制表生成</p>
          <small>可以修改需求后重新提交。</small>
        </>
      ) : null}

      {/* 实时步骤由上方执行过程播报，这里只补一句"表会长在哪儿"，不重复同一件事 */}
      {isStreaming && !hasTables ? (
        <>
          <p>正在生成结果表…</p>
          <small>
            <CircleNotch className="tgs-spin" size={14} aria-hidden="true" />
            结果表就绪后会出现在这里
          </small>
        </>
      ) : null}

      {longRunning && isStreaming ? (
        <p role="status">生成时间较长，结果表尚未生成完成。你可以继续等待，或停止后调整需求重试。</p>
      ) : null}
      {answer && !isError ? <XsSafeMarkdown content={answer} /> : null}

      {turn.clarifications.map((clarification, index) => {
        const key = clarificationKey(turnKey, clarification, index);
        const dismissed = dismissedClarifyKeys.includes(key);
        // 待答且没被收起的那张在浮层里，这里不留副本
        if (key === dockedClarifyKey || (!clarification.selectedAnswer && !dismissed)) {
          return null;
        }

        return (
          <XsClarifyCard
            key={key}
            clarification={clarification}
            fresh={key === freshClarifyKey}
            onExpand={clarification.selectedAnswer ? undefined : () => onExpandClarify(key)}
          />
        );
      })}

      {hasTables ? (
        <TableArtifactGroup
          rows={turn.tableResults.map((table, position) => ({
            key: tableViewerKey(turn, position),
            title: formatDataHubTableTitle(table),
            meta: `字段 ${table.columns.length} · 行 ${table.totalRows}`
          }))}
          activeKey={activeTableKey}
          canExport={canExport}
          onOpen={onOpenTable}
          onExport={onExport}
          onExportTable={onExportTable}
        />
      ) : null}

      {isDone && !hasTables && !pendingClarification ? (
        <p>未生成结果表，请补充字段、时间或统计口径</p>
      ) : null}

      {isStreaming ? null : (
        <div className="tgs-turn__actions">
          {answer ? (
            <button type="button" aria-label="复制回答" onClick={onCopyAnswer}>
              <Copy size={13} aria-hidden="true" />
              复制
            </button>
          ) : null}
          <button
            type="button"
            aria-label={retryLabel}
            disabled={busy || pendingClarification}
            onClick={onRegenerate}
          >
            <ArrowsClockwise size={13} aria-hidden="true" />
            {retryLabel}
          </button>
          {/* 整轮导出已经挪进工件组头部，跟"这轮出了几张表"待在一起更合读法 */}
        </div>
      )}

      {status ? (
        <small role="status" data-error={status.tone === "error" || undefined}>
          {status.message}
        </small>
      ) : null}
    </div>
  );
}
