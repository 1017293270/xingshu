import { CaretDown, Check, PaperPlaneTilt, Plus, StopCircle, Table } from "@phosphor-icons/react";
import { Button, Dropdown, Input } from "antd";
import type { MenuProps } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import {
  XsChatAssistant,
  XsChatTurn,
  XsChatUserBubble,
  XsComposerBox,
  XsSidePanel
} from "@/components/xs/conversation";
import { DataHubResultTable } from "@/components/xs/datahub";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { TablePlaceholder } from "@/features/tableGeneration/TablePlaceholder";
import { TableTurnBody, tableViewerKey, type TableTurnStatus } from "@/features/tableGeneration/TableTurnBody";
import { groupTableSessions } from "@/features/tableGeneration/sessionGroups";
import { getTableGenerationProgress } from "@/features/tableGeneration/tableGenerationProgress";
import {
  tableSessionPath,
  useTableGeneration,
  type TableSessionLaunchState
} from "@/features/tableGeneration/useTableGeneration";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { copyText } from "@/services/clipboard";
import { hasPendingClarification } from "@/services/dataHubClarification";
import { exportDataHubTablesCsv } from "@/services/dataHubTableExport";
import { listRecentTables } from "@/services/tableService";
import type { DataHubAskDataStatus, DataHubAskTurn } from "@/types/dataHub";
import { PageFrame } from "@/pages/PageFrame";
import "@/pages/styles/workflows.css";

/** 侧栏里的表比对话流里宽得多，预览行数跟着放宽——侧栏存在的意义就是把表看全。 */
const PANEL_ROW_LIMIT = 100;

const followUpPlaceholder = "继续追问字段、筛选条件或统计口径…";
const clarifyPlaceholder = "选择上面的选项，或直接说明你的情况…";

function statusToneFor(
  message: string,
  isBusy: boolean,
  status: DataHubAskDataStatus,
  restoreError: string
): XsStatusTone {
  if (status === "error" || restoreError || message.includes("失败")) {
    return "error";
  }
  if (isBusy || message.startsWith("正在")) {
    return "loading";
  }
  if (message.startsWith("已")) {
    return "success";
  }
  return "info";
}

function turnKeyOf(turn: DataHubAskTurn) {
  return turn.chatId || turn.question;
}

export function TableSessionView() {
  const { sessionId: rawSessionId = "" } = useParams();
  const sessionId = decodeURIComponent(rawSessionId);
  const location = useLocation();
  const navigate = useNavigate();
  const sessionScope = useSessionQueryScope();
  const queryClient = useQueryClient();
  const launchPrompt = (location.state as TableSessionLaunchState | null)?.prompt?.trim() ?? "";
  const [followUp, setFollowUp] = useState("");
  const [viewerKey, setViewerKey] = useState("");
  const [turnStatus, setTurnStatus] = useState<TableTurnStatus & { turnId: string }>();
  /* 每一轮只自动弹一次侧栏；用户关掉之后这一轮不再自己蹦出来。 */
  const autoOpenedRef = useRef(new Set<string>());
  const generation = useTableGeneration({
    sessionId,
    launchPrompt
  });
  const recentTablesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "recentTables"),
    queryFn: listRecentTables
  });
  const recentTables = recentTablesQuery.data ?? [];
  const isBusy = generation.isStreaming || generation.isRestoring;
  const activeQuestion = generation.turns.at(-1)?.question || generation.turn.question;
  const progress = useMemo(
    () => getTableGenerationProgress(generation.turn),
    [generation.turn]
  );
  const tableCount = generation.turns.reduce((count, item) => count + item.tableResults.length, 0);
  /* 挂在 ask_user 上的这一轮状态是 done，但真正的下一步在用户手里。 */
  const awaitingClarification = generation.turns.some(hasPendingClarification);
  const baseStatusMessage = generation.isRestoring
    ? "正在还原当时的结果表"
    : generation.restoreError
      ? `制表记录加载失败：${generation.restoreError}`
      : generation.status === "streaming"
        ? "正在生成结果表"
        : generation.status === "error"
          ? generation.turn.error?.message || "制表执行失败"
          : generation.status === "cancelled"
            ? "已停止本次制表生成"
            : generation.status === "done" && tableCount > 0
              ? `${generation.didRestore ? "已还原" : "已生成"} ${tableCount} 张结果表`
              : generation.status === "done"
                ? "未生成结果表，请补充字段、时间或统计口径"
                : "问表智能体已就绪，可继续追问";
  const statusMessage = awaitingClarification && !isBusy
    ? "问表智能体在等你确认"
    : baseStatusMessage;

  const conversationSignature = generation.turns
    .map((item) => `${turnKeyOf(item)}:${item.status}:${item.reactSteps.length}:${item.tableResults.length}`)
    .join("|");
  const conversation = useStickToBottom<HTMLDivElement>({
    signature: conversationSignature,
    enabled: generation.turns.length > 0
  });

  useEffect(() => {
    if (generation.status === "done") {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionScope, "recentTables") });
    }
  }, [generation.status, queryClient, sessionScope]);

  /* 出表就把侧栏开到这一轮的第一张：制表的交付物是表，不该再多一次点击才看得到。 */
  useEffect(() => {
    for (const item of generation.turns) {
      if (item.status === "streaming" || item.tableResults.length === 0) continue;
      const key = turnKeyOf(item);
      if (autoOpenedRef.current.has(key)) continue;
      autoOpenedRef.current.add(key);
      setViewerKey(tableViewerKey(item, 0));
    }
  }, [generation.turns]);

  const viewer = useMemo(() => generation.turns
    .flatMap((item, index) => item.tableResults.map((table, position) => ({
      turn: item,
      table,
      round: index + 1,
      key: tableViewerKey(item, position)
    })))
    .find((candidate) => candidate.key === viewerKey),
  [generation.turns, viewerKey]);

  const handleFollowUp = () => {
    if (isBusy) {
      return;
    }

    generation.generate(followUp, sessionId);
    setFollowUp("");
  };

  const handleExport = (turn: DataHubAskTurn) => {
    exportDataHubTablesCsv(turn.tableResults, turn.question || "制表结果");
  };

  const handleCopyAnswer = async (turn: DataHubAskTurn) => {
    const answer = turn.answerBlocks[0]?.content.trim() ?? "";
    const copied = await copyText(answer);
    setTurnStatus({
      turnId: turnKeyOf(turn),
      tone: copied ? "success" : "error",
      message: copied ? "已复制回答" : "复制失败，请手动选中正文"
    });
  };

  const railItems = useMemo(() => {
    if (recentTables.some((item) => item.id === sessionId) || !sessionId) {
      return recentTables;
    }

    return [
      {
        id: sessionId,
        title: activeQuestion || "新制表",
        description: "当前会话",
        tag: "清单" as const,
        iconId: "contact-list" as const
      },
      ...recentTables
    ];
  }, [activeQuestion, recentTables, sessionId]);

  /* 会话列表从右侧栏收进页头：右边整块留给结果表，是这一页真正的交付物。 */
  const sessionMenu: MenuProps = {
    items: recentTablesQuery.isError
      ? [{ key: "error", disabled: true, label: "会话列表加载失败" }]
      : railItems.length === 0
        ? [{ key: "empty", disabled: true, label: "还没有制表会话" }]
        : groupTableSessions(railItems).map((group) => ({
          key: group.label,
          type: "group" as const,
          label: group.label,
          children: group.items.map((item) => ({
            key: item.id,
            label: (
              <span className="table-chat__session-item" data-active={item.id === sessionId || undefined}>
                <span title={`${item.title} · ${item.description}`}>{item.title}</span>
                {item.id === sessionId ? <Check size={14} weight="bold" aria-hidden="true" /> : null}
              </span>
            )
          }))
        })),
    onClick: ({ key }) => {
      if (key === sessionId || key === "error" || key === "empty") return;
      navigate(tableSessionPath(key));
    }
  };

  return (
    <PageFrame
      className="table-session-page"
      track="data"
      title="问表智能体"
      hideHeader
    >
      <div className="table-chat xs-chat-shell" data-panel={viewer ? "" : undefined}>
        <div className="xs-chat-shell__main">
          <header className="table-chat__head">
            <Dropdown trigger={["click"]} menu={sessionMenu} placement="bottomLeft">
              <button type="button" className="table-chat__session-switch" aria-label="切换制表会话">
                <span>{activeQuestion || "新制表"}</span>
                <CaretDown size={14} weight="bold" aria-hidden="true" />
              </button>
            </Dropdown>
            <Link className="table-chat__new" to="/table">
              <Plus size={15} aria-hidden="true" />
              新建制表
            </Link>
          </header>

          <section
            className="xs-chat"
            aria-label="制表对话"
            tabIndex={-1}
            {...conversation.containerProps}
          >
            {generation.restoreError && generation.turns.length === 0 ? (
              <p className="table-chat__empty-error">{generation.restoreError}</p>
            ) : null}
            {!generation.restoreError && generation.turns.length === 0 ? (
              <TablePlaceholder
                state={generation.isRestoring ? "loading" : "idle"}
                title={generation.isRestoring ? "正在还原当时的结果表" : "还没有结果表"}
                hint={
                  generation.isRestoring
                    ? "正在读取这次会话的执行记录与结果表"
                    : "用自然语言描述你需要的表，例如「华东区Q1销售排行」"
                }
              />
            ) : null}
            {generation.turns.map((item, index) => {
              const key = turnKeyOf(item);
              const isLatest = index === generation.turns.length - 1;

              return (
                <XsChatTurn key={key}>
                  <XsChatUserBubble meta={`第 ${index + 1} 轮`}>{item.question}</XsChatUserBubble>
                  <XsChatAssistant error={item.status === "error"}>
                    <TableTurnBody
                      turn={item}
                      progress={isLatest ? progress : getTableGenerationProgress(item)}
                      isLatest={isLatest}
                      activeTableKey={viewerKey}
                      busy={isBusy}
                      status={turnStatus?.turnId === key ? turnStatus : undefined}
                      onOpenTable={(position) => setViewerKey(tableViewerKey(item, position))}
                      onAnswerClarification={(answer, interactionId) => {
                        generation.respondToClarification(key, answer, interactionId);
                      }}
                      onCopyAnswer={() => void handleCopyAnswer(item)}
                      onRegenerate={() => generation.generate(item.question, sessionId)}
                      onExport={() => handleExport(item)}
                    />
                  </XsChatAssistant>
                </XsChatTurn>
              );
            })}
          </section>

          <XsComposerBox
            className="table-chat__composer"
            mode="chat"
            label="继续制表"
            busy={isBusy}
            showScrollToBottom={conversation.showScrollToBottom}
            onScrollToBottom={conversation.scrollToBottom}
            toolbarTail={(
              <>
                {generation.isStreaming ? (
                  <Button
                    danger
                    type="text"
                    icon={<StopCircle size={18} weight="fill" aria-hidden="true" />}
                    onClick={generation.stop}
                  >停止生成</Button>
                ) : null}
                <Button
                  type="primary"
                  shape="circle"
                  aria-label="继续制表"
                  disabled={isBusy || !followUp.trim()}
                  icon={<PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />}
                  onClick={handleFollowUp}
                />
              </>
            )}
          >
            <Input.TextArea
              aria-label="继续追问"
              variant="borderless"
              autoSize={{ minRows: 1, maxRows: 6 }}
              placeholder={awaitingClarification ? clarifyPlaceholder : followUpPlaceholder}
              value={followUp}
              disabled={isBusy}
              onChange={(event) => setFollowUp(event.target.value)}
              onPressEnter={(event) => {
                if (event.shiftKey) {
                  return;
                }
                event.preventDefault();
                handleFollowUp();
              }}
            />
          </XsComposerBox>

          <div className="workflow-status-slot table-page__status-slot">
            <XsStatusBar
              tone={statusToneFor(statusMessage, isBusy, generation.status, generation.restoreError)}
              spinner={false}
              message={statusMessage}
              transitionKey={`${generation.status}:${statusMessage}`}
              reserveSpace
            />
          </div>
        </div>

        {viewer ? (
          <XsSidePanel
            label="结果表预览"
            icon={<Table size={18} aria-hidden="true" />}
            title={viewer.turn.question}
            titleHint={viewer.turn.question}
            meta={`第 ${viewer.round} 轮${viewer.turn.dataSources.at(-1)?.datasourceName ? ` · ${viewer.turn.dataSources.at(-1)!.datasourceName}` : ""}`}
            onClose={() => setViewerKey("")}
          >
            <div className="table-chat__panel-body">
              <DataHubResultTable table={viewer.table} rowLimit={PANEL_ROW_LIMIT} />
            </div>
          </XsSidePanel>
        ) : null}
      </div>
    </PageFrame>
  );
}
