import { ArrowsClockwise, CircleNotch, Copy, DownloadSimple, Table, WarningCircle } from "@phosphor-icons/react";
import { Dropdown } from "antd";
import {
  XsArtifactCard,
  XsChatActionButton,
  XsChatActions,
  XsClarifyCard
} from "@/components/xs/conversation";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { TableAgentTrace } from "@/features/tableGeneration/TableAgentTrace";
import { buildTableAgentTrace } from "@/features/tableGeneration/agentTrace";
import { clarificationKey, hasPendingClarification } from "@/services/dataHubClarification";
import { formatDataHubTableTitle } from "@/services/dataHubFormat";
import type { DataHubAskTurn } from "@/types/dataHub";

export type TableTurnStatus = {
  tone: "success" | "error";
  message: string;
};

type TableTurnBodyProps = {
  turn: DataHubAskTurn;
  /** 流式过程中的当前动作，交给推演轨迹当最后一条占位。 */
  progress: string;
  /** 最新一轮的轨迹默认展开——过程本身就是 agent 的交付物。 */
  isLatest: boolean;
  /** 正在侧栏里浏览的那张表，格式见 tableViewerKey。 */
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
};

/**
 * 侧栏定位一张表要同时知道是哪一轮的第几张。
 * 用数组下标而不是 `tableIndex`：后者是可选字段，缺席时所有表会撞成同一个键。
 */
export function tableViewerKey(turn: DataHubAskTurn, position: number) {
  return `${turn.chatId || turn.question}:${position}`;
}

/**
 * 一轮制表在对话流里的助手侧内容：推演轨迹 → 回答正文 → 结果表卡 → 消息级操作。
 * 表本身不铺在这里，只留一张卡；几十行数据摊进 640px 的对话栏，
 * 上一轮就再也翻不回去了——完整的表在右侧栏看。
 */
export function TableTurnBody({
  turn,
  progress,
  isLatest,
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
  onExport
}: TableTurnBodyProps) {
  const trace = buildTableAgentTrace(turn);
  const hasTables = turn.tableResults.length > 0;
  const answer = turn.answerBlocks[0]?.content.trim() ?? "";
  const isStreaming = turn.status === "streaming";
  const isDone = turn.status === "done";
  const isError = turn.status === "error";
  const isCancelled = turn.status === "cancelled";
  const canExport = hasTables && (isDone || isCancelled);
  /* 挂在 ask_user 上的这一轮虽然是 done，但其实在等用户选，不能按"跑完了"处理。 */
  const pendingClarification = hasPendingClarification(turn);
  const retryLabel = isError ? "重试" : isCancelled ? "继续生成" : "重新生成";

  return (
    <>
      <TableAgentTrace
        trace={trace}
        isStreaming={isStreaming}
        progress={progress}
        defaultExpanded={isLatest}
      />

      {isError ? (
        <p>
          <WarningCircle size={15} weight="bold" aria-hidden="true" />
          {turn.error?.message || "制表执行失败，请稍后重试"}
        </p>
      ) : null}

      {isCancelled && !hasTables ? <p>已停止本次制表生成，可以修改需求后重新提交。</p> : null}

      {/* 实时步骤由上方轨迹播报，这里只补一句"表会长在哪儿"，不重复同一件事 */}
      {isStreaming && !hasTables ? (
        <>
          <p>正在生成结果表…</p>
          <small>
            <CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />
            结果表就绪后会出现在这里
          </small>
        </>
      ) : null}

      {answer && (isDone || isCancelled) ? <XsSafeMarkdown content={answer} /> : null}

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

      {turn.tableResults.map((table, position) => {
        const title = formatDataHubTableTitle(table);
        return (
          <XsArtifactCard
            key={tableViewerKey(turn, position)}
            label="结果表"
            icon={<Table size={24} aria-hidden="true" />}
            eyebrow={trace.datasourceName || "结果表 · 点击浏览"}
            title={title}
            badge={turn.tableResults.length > 1 ? `表 ${position + 1}` : undefined}
            meta={`字段 ${table.columns.length} · 行 ${table.totalRows}`}
            active={activeTableKey === tableViewerKey(turn, position)}
            openLabel={`浏览结果表：${title}`}
            onOpen={() => onOpenTable(position)}
          />
        );
      })}

      {isDone && !hasTables && !pendingClarification ? (
        <p>未生成结果表，请补充字段、时间或统计口径</p>
      ) : null}

      {isStreaming ? null : (
        <XsChatActions>
          {answer ? (
            <XsChatActionButton
              icon={<Copy size={14} aria-hidden="true" />}
              label="复制回答"
              text="复制"
              onClick={onCopyAnswer}
            />
          ) : null}
          <XsChatActionButton
            icon={<ArrowsClockwise size={14} aria-hidden="true" />}
            label={retryLabel}
            disabled={busy || pendingClarification}
            onClick={onRegenerate}
          />
          {canExport ? (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "csv", label: "导出 CSV" },
                  { key: "xlsx", label: "导出 XLSX" }
                ],
                onClick: ({ key }) => onExport(key as "csv" | "xlsx")
              }}
            >
              {/* Dropdown 需要能挂 ref 的触发器，这里用与 XsChatActionButton 同容器样式的原生按钮 */}
              <button type="button" aria-label="导出结果" aria-haspopup="menu">
                <DownloadSimple size={14} aria-hidden="true" />
                导出结果
              </button>
            </Dropdown>
          ) : null}
        </XsChatActions>
      )}

      {status ? (
        <small className="xs-chat__status" role="status" data-error={status.tone === "error" || undefined}>
          {status.message}
        </small>
      ) : null}
    </>
  );
}
