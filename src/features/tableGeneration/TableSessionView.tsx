import { Check } from "@phosphor-icons/react";
import type { MenuProps } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { useClarifyDock, XsClarifyPanel } from "@/components/xs/conversation";
import { TableComposer } from "@/features/tableGeneration/TableComposer";
import { TablePlaceholder } from "@/features/tableGeneration/TablePlaceholder";
import { TableResultDock, type TableViewerItem } from "@/features/tableGeneration/TableResultDock";
import { TableSessionTopBar } from "@/features/tableGeneration/TableSessionTopBar";
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
import { clarificationKey, hasPendingClarification } from "@/services/dataHubClarification";
import {
  buildDataHubTablesCsv,
  exportDataHubTablesCsv,
  exportDataHubTablesXlsx
} from "@/services/dataHubTableExport";
import { TableTemplateModal } from "@/features/tableGeneration/TableTemplateModal";
import { formatAskTableSessionTitle } from "@/services/dataHubAskTable";
import {
  buildTableStructureJson,
  createTableTemplate,
  suggestTableTemplateDraft,
  type TableTemplateInput
} from "@/services/tableTemplateService";
import { listRecentTables } from "@/services/tableService";
import type { DataHubAskTurn, DataHubTableResult } from "@/types/dataHub";
import type { TableTemplate } from "@/types/table";
import { PageFrame } from "@/pages/PageFrame";
import "@/pages/styles/workflows.css";
import "@/features/tableGeneration/tableSession.css";

/** 结果台里的表比对话列宽得多，预览行数跟着放宽——结果台存在的意义就是把表看全。 */
const PANEL_ROW_LIMIT = 100;

/** 结果台滑出的时长，比 CSS 里的 --xs-motion-state(180ms) 多留一点余量再卸载。 */
const DOCK_EXIT_MS = 220;

/**
 * 顶栏会话下拉只做就近切换，留最近 12 个：连同日期分组标题，在 768px 高的笔记本屏上也不用在菜单里再滚。
 * 完整列表在「我的表格」，超出时菜单末尾给一个入口过去。
 */
const SESSION_MENU_LIMIT = 12;
const ALL_SESSIONS_MENU_KEY = "all-sessions";
/** 列表还没回来时的占位：固定一个引用，下拉的 useMemo 才不会每次渲染都重算。 */
const NO_SESSIONS: TableTemplate[] = [];

const followUpPlaceholder = "继续补充制表要求…";
const clarifyPlaceholder = "选择上面的选项，或直接说明你的情况…";

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
  const composerRef = useRef<TextAreaRef>(null);
  const [viewerKey, setViewerKey] = useState("");
  const [turnStatus, setTurnStatus] = useState<TableTurnStatus & { turnId: string }>();
  /* 结果台「存为模板」的草稿：带上正在看的表结构快照 */
  const [templateDraft, setTemplateDraft] = useState<TableTemplateInput | null>(null);
  const [templateSuggesting, setTemplateSuggesting] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  /* 每次打开「存为模板」领一个号：建议值晚到时只认最新这一次，关掉或换了张表就不再回填 */
  const suggestionTicketRef = useRef(0);
  /* 每一轮只自动开一次结果台；用户关掉之后这一轮不再自己蹦出来。 */
  const autoOpenedRef = useRef(new Set<string>());
  const generation = useTableGeneration({
    sessionId,
    launchPrompt
  });
  const recentTablesQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "recentTables"),
    queryFn: listRecentTables
  });
  const recentTables = recentTablesQuery.data ?? NO_SESSIONS;
  const listedSession = recentTables.find((item) => item.id === sessionId);
  const isBusy = generation.isStreaming || generation.isRestoring;
  /* 标题是这次会话的第一句话，追问不改它。第一轮还没挂上（刚发起、正在还原）时，
     先用带进来的首轮提示词或后端标题——同一句话的两个来源，页头不会先闪一下「新制表」 */
  const sessionTitle =
    formatAskTableSessionTitle(generation.turns[0]?.question)
    || formatAskTableSessionTitle(launchPrompt)
    || listedSession?.title
    || "新制表";
  const progress = useMemo(
    () => getTableGenerationProgress(generation.turn),
    [generation.turn]
  );
  const tableCount = generation.turns.reduce((count, item) => count + item.tableResults.length, 0);
  /* 挂在 ask_user 上的这一轮状态是 done，但真正的下一步在用户手里。 */
  const awaitingClarification = generation.turns.some(hasPendingClarification);
  const dock = useClarifyDock(isBusy);
  const clarifyTargets = useMemo(() => generation.turns.flatMap((item) => {
    const key = turnKeyOf(item);
    return item.clarifications.map((clarification, index) => ({
      key: clarificationKey(key, clarification, index),
      chatId: item.chatId ?? "",
      error: item.status === "error" ? item.error?.message : undefined,
      clarification
    }));
  }), [generation.turns]);
  /*
   * 只有"还没被后端收下、也没被收起"的那张占着浮层。
   * 提交中的那张 selectedAnswer 还是空的，所以会带着 spinner 继续留在这儿；
   * clarification_response 一到就自动腾开输入框，留痕由对话流接手。
   */
  const dockTarget = clarifyTargets.find((item) => (
    !item.clarification.selectedAnswer && !dock.dismissedKeys.includes(item.key)
  ));

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
                ? "本轮处理已结束"
                : "可以继续补充制表要求";
  const statusMessage = dock.submittedKey && generation.isStreaming
    ? "正在按你的选择继续"
    : awaitingClarification && !isBusy
      ? "等待你补充信息"
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

  /* 出表就把结果台开到这一轮的第一张：制表的交付物是表，不该再多一次点击才看得到。 */
  useEffect(() => {
    for (const item of generation.turns) {
      if (item.status === "streaming" || item.tableResults.length === 0) continue;
      const key = turnKeyOf(item);
      if (autoOpenedRef.current.has(key)) continue;
      autoOpenedRef.current.add(key);
      setViewerKey(tableViewerKey(item, 0));
    }
  }, [generation.turns]);

  const viewerItems = useMemo<TableViewerItem[]>(() => generation.turns
    .flatMap((item, index) => item.tableResults.map((table, position) => ({
      turn: item,
      table,
      round: index + 1,
      position,
      key: tableViewerKey(item, position)
    }))),
  [generation.turns]);
  const viewer = viewerItems.find((candidate) => candidate.key === viewerKey);
  /* 收起要看得见过程：面板得在关掉之后再多活一个过渡，滑出去了才卸载。 */
  const [closingViewer, setClosingViewer] = useState<TableViewerItem | null>(null);
  const shownViewer = viewer ?? closingViewer;

  useEffect(() => {
    if (!closingViewer) return;
    const timer = window.setTimeout(() => setClosingViewer(null), DOCK_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closingViewer]);

  const closeViewer = () => {
    /* 滑出中的面板对读屏是隐形的，焦点不能留在里面 */
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setClosingViewer(viewer ?? null);
    setViewerKey("");
  };

  const handleFollowUp = () => {
    if (isBusy) {
      return;
    }

    if (generation.generate(followUp, sessionId)) setFollowUp("");
  };

  const exportTables = (tables: DataHubTableResult[], turn: DataHubAskTurn, format: "csv" | "xlsx") => {
    const basename = turn.question || "制表结果";
    if (format === "csv") {
      exportDataHubTablesCsv(tables, basename);
      return;
    }
    // XLSX 走动态 import，首次点击有一次分包加载；失败要让用户知道
    void exportDataHubTablesXlsx(tables, basename).catch(() => {
      setTurnStatus({
        turnId: turnKeyOf(turn),
        tone: "error",
        message: "XLSX 导出失败，请重试或改用 CSV"
      });
    });
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

  const handleCopyTable = async (item: TableViewerItem) => {
    const copied = await copyText(buildDataHubTablesCsv([item.table]));
    setTurnStatus({
      turnId: turnKeyOf(item.turn),
      tone: copied ? "success" : "error",
      message: copied ? `已复制 ${item.table.rows.length} 行表格` : "复制表格失败，请稍后重试"
    });
  };

  const railItems = useMemo<TableTemplate[]>(() => {
    const recent = recentTables.slice(0, SESSION_MENU_LIMIT);
    if (!sessionId || recent.some((item) => item.id === sessionId)) {
      return recent;
    }
    /* 从我的表格翻出来的老会话：接在末尾，分组时自然落回它自己的日期组 */
    if (listedSession) {
      return [...recent, listedSession];
    }

    return [
      {
        id: sessionId,
        title: sessionTitle,
        description: "当前会话",
        tag: "清单",
        iconId: "contact-list"
      },
      ...recent
    ];
  }, [listedSession, recentTables, sessionId, sessionTitle]);
  const hasMoreSessions = recentTables.length > SESSION_MENU_LIMIT;

  /* 会话列表收在顶栏标题里：右边整块留给结果表，是这一页真正的交付物。 */
  const sessionMenu: MenuProps = {
    items: recentTablesQuery.isError
      ? [{ key: "error", disabled: true, label: "会话列表加载失败" }]
      : railItems.length === 0
        ? [{ key: "empty", disabled: true, label: "还没有制表会话" }]
        : [
          ...groupTableSessions(railItems).map((group) => ({
            key: group.label,
            type: "group" as const,
            label: group.label,
            children: group.items.map((item) => {
              const active = item.id === sessionId;
              /* 当前这一行与页头用同一句标题，后端截断过的长标题不会在这里换一种说法 */
              const itemTitle = active ? sessionTitle : item.title;
              return {
                key: item.id,
                label: (
                  <span className="tgs-topbar__session" data-active={active || undefined}>
                    <span title={`${itemTitle} · ${item.description}`}>{itemTitle}</span>
                    {active ? <Check size={14} weight="bold" aria-hidden="true" /> : null}
                  </span>
                )
              };
            })
          })),
          ...(hasMoreSessions
            ? [
              { key: "all-sessions-divider", type: "divider" as const },
              { key: ALL_SESSIONS_MENU_KEY, label: `查看全部 ${recentTables.length} 个制表会话` }
            ]
            : [])
        ],
    onClick: ({ key }) => {
      if (key === ALL_SESSIONS_MENU_KEY) {
        navigate("/table");
        return;
      }
      if (key === sessionId || key === "error" || key === "empty") return;
      navigate(tableSessionPath(key));
    }
  };

  const openTemplateDraft = (item: TableViewerItem) => {
    suggestionTicketRef.current += 1;
    const ticket = suggestionTicketRef.current;
    setTemplateDraft({ name: "", prompt: "", structureJson: buildTableStructureJson(item.table.columns) });
    setTemplateSuggesting(true);
    suggestTableTemplateDraft({ turns: generation.turns.slice(0, item.round), table: item.table })
      .then((draft) => {
        if (ticket !== suggestionTicketRef.current) return;
        setTemplateDraft((current) => (current ? { ...current, ...draft } : current));
      })
      // 建议没生成出来就留给用户自己填，保存不受影响
      .catch(() => undefined)
      .finally(() => {
        if (ticket === suggestionTicketRef.current) setTemplateSuggesting(false);
      });
  };

  const closeTemplateDraft = () => {
    suggestionTicketRef.current += 1;
    setTemplateDraft(null);
    setTemplateSuggesting(false);
  };

  return (
    <PageFrame
      className="table-session-page"
      track="data"
      title="问表智能体"
      hideHeader
    >
      <div className="tgs">
        <div className="tgs__main">
          <TableSessionTopBar
            title={sessionTitle}
            sessionMenu={sessionMenu}
            tableCount={tableCount}
          />

          <section
            className="tgs__stream"
            aria-label="制表对话"
            tabIndex={-1}
            {...conversation.containerProps}
          >
            <div className="tgs__column">
              {generation.restoreError && generation.turns.length === 0 ? (
                <div className="tgs-turn__reply" data-error="true">
                  <p>{generation.restoreError}</p>
                  <small data-error="true">可以刷新重试，或回到我的表格换一个会话</small>
                  <div className="tgs-turn__actions" data-recovery="true">
                    <button type="button" onClick={() => void generation.restore(sessionId)}>重新加载</button>
                  </div>
                </div>
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
              <div className="tgs__turns">
                {generation.turns.map((item, index) => {
                  const key = turnKeyOf(item);
                  const isLatest = index === generation.turns.length - 1;

                  return (
                    <article className="tgs-turn" key={key}>
                      {/* 追问是有序的：第 N 轮的口径继承自第 N-1 轮，序号是信息不是装饰 */}
                      <div className="tgs-turn__ask">
                        <span className="tgs-turn__round sr-only">{`第 ${index + 1} 轮`}</span>
                        <p>{item.question}</p>
                      </div>
                      <TableTurnBody
                        turn={item}
                        progress={isLatest ? progress : getTableGenerationProgress(item)}
                        activeTableKey={viewerKey}
                        busy={isBusy}
                        status={turnStatus?.turnId === key ? turnStatus : undefined}
                        onOpenTable={(position) => setViewerKey(tableViewerKey(item, position))}
                        turnKey={key}
                        dockedClarifyKey={dockTarget?.key}
                        dismissedClarifyKeys={dock.dismissedKeys}
                        freshClarifyKey={dock.justAnsweredKey}
                        onExpandClarify={dock.expand}
                        onCopyAnswer={() => void handleCopyAnswer(item)}
                        onRegenerate={() => generation.generate(item.question, sessionId)}
                        onEditRequest={() => {
                          if (followUp.trim() && followUp !== item.question) {
                            setTurnStatus({ turnId: key, tone: "success", message: "已保留输入框中未发送的要求。" });
                          } else {
                            setFollowUp(item.question);
                            setTurnStatus(undefined);
                          }
                          window.requestAnimationFrame(() => composerRef.current?.focus({ cursor: "end", preventScroll: true }));
                        }}
                        onExport={(format) => exportTables(item.tableResults, item, format)}
                        onExportTable={(position, format) => {
                          const table = item.tableResults[position];
                          if (table) exportTables([table], item, format);
                        }}
                      />
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="tgs__foot">
            <div className="tgs__foot-inner tgs__clarify-anchor">
              {dockTarget ? (
                <XsClarifyPanel
                  clarification={dockTarget.clarification}
                  submittingAnswer={
                    dock.submittedKey === dockTarget.key ? dock.submittingAnswer : undefined
                  }
                  error={dockTarget.error}
                  onAnswer={(answer) => {
                    dock.submit(dockTarget.key, answer);
                    generation.respondToClarification(
                      dockTarget.chatId,
                      answer,
                      dockTarget.clarification.interactionId
                    );
                  }}
                  onDismiss={() => dock.dismiss(dockTarget.key)}
                />
              ) : null}
              <TableComposer
                inputRef={composerRef}
                value={followUp}
                placeholder={awaitingClarification ? clarifyPlaceholder : followUpPlaceholder}
                busy={isBusy}
                streaming={generation.isStreaming}
                onChange={setFollowUp}
                onSubmit={handleFollowUp}
                onStop={generation.stop}
                showScrollToBottom={conversation.showScrollToBottom && !dockTarget}
                onScrollToBottom={conversation.scrollToBottom}
              />
            </div>

            <div className="sr-only" role="status">{statusMessage}</div>
          </div>
        </div>

        {shownViewer ? (
          <TableResultDock
            items={viewerItems}
            active={shownViewer}
            rowLimit={PANEL_ROW_LIMIT}
            exiting={!viewer}
            onSelect={setViewerKey}
            onClose={closeViewer}
            onCopy={() => void handleCopyTable(shownViewer)}
            onExport={(format) => exportTables([shownViewer.table], shownViewer.turn, format)}
            onSaveTemplate={() => openTemplateDraft(shownViewer)}
          />
        ) : null}
      </div>
      <TableTemplateModal
        open={templateDraft !== null}
        title="存为模板"
        initial={templateDraft ?? undefined}
        suggestion={templateSuggesting ? "pending" : "ready"}
        saving={templateSaving}
        onSave={(input) => {
          setTemplateSaving(true);
          createTableTemplate(input)
            .then(() => {
              closeTemplateDraft();
              if (viewer) {
                setTurnStatus({
                  turnId: turnKeyOf(viewer.turn),
                  tone: "success",
                  message: `已存为模板：${input.name}`
                });
              }
            })
            .catch((error: unknown) => {
              if (viewer) {
                setTurnStatus({
                  turnId: turnKeyOf(viewer.turn),
                  tone: "error",
                  message: error instanceof Error ? `模板保存失败：${error.message}` : "模板保存失败，请稍后重试"
                });
              }
            })
            .finally(() => setTemplateSaving(false));
        }}
        onClose={closeTemplateDraft}
      />
    </PageFrame>
  );
}
