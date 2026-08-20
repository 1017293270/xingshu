import { Button, Input } from "antd";
import { ArrowLeft, DownloadSimple, Lightning, Plus } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { TablePlaceholder } from "@/features/tableGeneration/TablePlaceholder";
import { TableResultStage } from "@/features/tableGeneration/TableResultStage";
import { groupTableSessions } from "@/features/tableGeneration/sessionGroups";
import { getTableGenerationProgress } from "@/features/tableGeneration/tableGenerationProgress";
import {
  tableSessionPath,
  useTableGeneration,
  type TableSessionLaunchState
} from "@/features/tableGeneration/useTableGeneration";
import { exportDataHubTablesCsv } from "@/services/dataHubTableExport";
import { listRecentTables } from "@/services/tableService";
import type { DataHubAskDataStatus, DataHubAskTurn } from "@/types/dataHub";
import { PageFrame } from "@/pages/PageFrame";
import "@/pages/styles/workflows.css";

const followUpPlaceholder = "继续追问字段、筛选条件或统计口径…";

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

export function TableSessionView() {
  const { sessionId: rawSessionId = "" } = useParams();
  const sessionId = decodeURIComponent(rawSessionId);
  const location = useLocation();
  const sessionScope = useSessionQueryScope();
  const queryClient = useQueryClient();
  const launchPrompt = (location.state as TableSessionLaunchState | null)?.prompt?.trim() ?? "";
  const [followUp, setFollowUp] = useState("");
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
  const statusMessage = generation.isRestoring
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

  useEffect(() => {
    if (generation.status === "done") {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionScope, "recentTables") });
    }
  }, [generation.status, queryClient, sessionScope]);

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

  return (
    <PageFrame
      className="table-session-page"
      track="data"
      title="问表智能体"
      subtitle="每次制表都是独立会话，可还原当时的结果表，也可以继续追问"
      actions={
        <>
          <Link className="xs-action-link" to="/table">
            <ArrowLeft size={15} aria-hidden="true" />
            最近制表
          </Link>
          <Link className="xs-action-link" to="/table">
            <Plus size={15} aria-hidden="true" />
            新建制表
          </Link>
        </>
      }
    >
      <div className="table-agent">
        <section className="table-agent__stage" aria-label="制表工作台">
          <div className="table-agent__turns">
            {generation.restoreError && generation.turns.length === 0 ? (
              <p className="sheet-result__empty sheet-result__empty--error">{generation.restoreError}</p>
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
              const isLatest = index === generation.turns.length - 1;
              const canExport =
                item.tableResults.length > 0 && (item.status === "done" || item.status === "cancelled");

              return (
                <article className="table-agent__turn" key={item.chatId || item.question} aria-label={`制表轮次：${item.question}`}>
                  {/* 追问是有序的：第 N 轮的口径继承自第 N-1 轮，序号是信息不是装饰 */}
                  <header className="table-agent__request">
                    <div className="table-agent__request-body">
                      <span className="table-agent__request-index" aria-hidden="true">
                        需求 {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="table-agent__user">{item.question}</p>
                    </div>
                    {canExport ? (
                      <Button
                        className="table-agent__export"
                        icon={<DownloadSimple size={16} aria-hidden="true" />}
                        onClick={() => handleExport(item)}
                      >
                        导出结果
                      </Button>
                    ) : null}
                  </header>
                  <TableResultStage
                    status={item.status}
                    turn={item}
                    progress={isLatest ? progress : getTableGenerationProgress(item)}
                    isLatest={isLatest}
                  />
                </article>
              );
            })}
          </div>
          <section
            className="sheet-prompt xs-focus-glow table-agent__composer"
            aria-label="继续制表"
            aria-busy={isBusy}
            data-state={generation.isStreaming ? "streaming" : undefined}
          >
            <Input.TextArea
              aria-label="继续追问"
              variant="borderless"
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder={followUpPlaceholder}
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
            <div className="sheet-prompt__bar">
              <span className="sheet-prompt__shortcut" aria-hidden="true">Enter 追问 · Shift + Enter 换行</span>
              {generation.isStreaming ? (
                <Button onClick={generation.stop}>停止生成</Button>
              ) : null}
              <Button
                type="primary"
                icon={<Lightning size={18} weight="fill" aria-hidden="true" />}
                loading={generation.isStreaming}
                disabled={isBusy || !followUp.trim()}
                onClick={handleFollowUp}
              >
                继续制表
              </Button>
            </div>
          </section>
        </section>
        <aside className="table-agent__rail" aria-label="制表会话">
          {recentTablesQuery.isError ? (
            <p className="agent-rail__note">
              会话列表加载失败
              <button type="button" onClick={() => void recentTablesQuery.refetch()}>
                重试
              </button>
            </p>
          ) : null}
          {!recentTablesQuery.isError && !recentTablesQuery.isPending && railItems.length === 0 ? (
            <p className="agent-rail__note">还没有制表会话</p>
          ) : null}
          {railItems.length > 0 ? (
            <nav className="agent-rail" aria-label="最近制表会话">
              {groupTableSessions(railItems).map((group) => (
                <div className="agent-rail__group" key={group.label}>
                  <h2 className="agent-rail__group-label">{group.label}</h2>
                  {group.items.map((item) => (
                    <Link
                      key={item.id}
                      className="agent-rail__item"
                      data-active={item.id === sessionId ? "true" : "false"}
                      aria-current={item.id === sessionId ? "page" : undefined}
                      title={`${item.title} · ${item.description}`}
                      to={tableSessionPath(item.id)}
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          ) : null}
        </aside>
      </div>
      <div className="workflow-status-slot table-page__status-slot">
        <XsStatusBar
          tone={statusToneFor(statusMessage, isBusy, generation.status, generation.restoreError)}
          label="问表"
          spinner={false}
          message={statusMessage}
          transitionKey={`${generation.status}:${statusMessage}`}
          reserveSpace
        />
      </div>
    </PageFrame>
  );
}
