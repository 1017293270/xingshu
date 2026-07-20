import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input, Segmented, Space, Tag, Tooltip } from "antd";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import historyConversationIcon from "@/assets/history-icons/history-conversation-image2.png";
import dataInsightIcon from "@/assets/history-icons/history-data-insight.svg";
import knowledgeQuickIcon from "@/assets/history-icons/history-knowledge-quick.svg";
import { resolveXsAsyncStatus, XsAsyncPanel, XsStatusBar, type XsStatusTone } from "@/components/xs";
import { filterHistorySessions, loadDataHubHistoryReplay } from "@/services/historyService";
import { useUiStore } from "@/stores/uiStore";
import type { HistoryCategory, HistoryFilter, HistorySession } from "@/types/history";
import { PageFrame } from "./PageFrame";

const historyCategoryFilters: NonNullable<HistoryFilter["category"]>[] = [
  "全部",
  "知识快查",
  "数据洞察",
  "文档处理"
];

const historyIconByCategory: Record<HistoryCategory, string> = {
  知识快查: knowledgeQuickIcon,
  数据洞察: dataInsightIcon,
  文档处理: historyConversationIcon
};

function getHistoryIcon(category: HistoryCategory) {
  return historyIconByCategory[category];
}

function resolveStatusTone(message: string, isFetching: boolean): XsStatusTone {
  if (message.includes("失败")) {
    return "error";
  }

  if (isFetching || message.startsWith("正在")) {
    return "loading";
  }

  if (message.startsWith("已恢复")) {
    return "success";
  }

  return "info";
}

export function HistoryPage() {
  const navigate = useNavigate();
  const restoreAskDataHistory = useUiStore((state) => state.restoreAskDataHistory);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<NonNullable<HistoryFilter["category"]>>("全部");
  const [actionStatus, setActionStatus] = useState("");
  const [restoringSessionId, setRestoringSessionId] = useState<string | null>(null);
  const historyQuery = useQuery({
    queryKey: ["historySessions", { keyword, category }],
    queryFn: () => filterHistorySessions({ keyword, category }),
    placeholderData: keepPreviousData
  });
  const sessions = historyQuery.data ?? [];
  const hasActiveFilter = Boolean(keyword.trim()) || category !== "全部";
  const asyncStatus = resolveXsAsyncStatus({
    isPending: historyQuery.isPending,
    isFetching: historyQuery.isFetching,
    isError: historyQuery.isError,
    hasData: historyQuery.data !== undefined
  });
  const statusText =
    actionStatus || (asyncStatus === "ready" ? `已筛选 ${sessions.length} 条历史对话` : "");
  const statusTone = useMemo(
    () => resolveStatusTone(statusText, false),
    [statusText]
  );

  async function handleRestoreSession(session: HistorySession) {
    if (restoringSessionId) {
      return;
    }

    if (!session.sessionId || session.source !== "data-hub") {
      setActionStatus(`已恢复历史对话：${session.title}`);
      return;
    }

    setRestoringSessionId(session.id);
    setActionStatus(`正在恢复历史对话：${session.title}`);

    try {
      const replay = await loadDataHubHistoryReplay(session.sessionId);
      restoreAskDataHistory({
        sessionId: replay.sessionId,
        question: replay.question,
        events: replay.events,
        turns: replay.turns,
        status: replay.turns.length > 0 || replay.events.length > 0 ? "done" : "idle"
      });
      navigate("/analysis");
    } catch (error) {
      setActionStatus(error instanceof Error ? `恢复历史对话失败：${error.message}` : "恢复历史对话失败");
    } finally {
      setRestoringSessionId(null);
    }
  }

  return (
    <PageFrame title="历史对话" className="history-page">
      <div className="history-page__chrome">
        <section className="history-tools" aria-label="历史对话筛选">
          <Input
            aria-label="历史搜索"
            allowClear
            prefix={<MagnifyingGlass size={18} />}
            placeholder="搜索历史对话..."
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setActionStatus("");
            }}
          />
          <Segmented
            aria-label="历史分类筛选"
            options={historyCategoryFilters}
            value={category}
            onChange={(value) => {
              setCategory(value as NonNullable<HistoryFilter["category"]>);
              setActionStatus("");
            }}
          />
        </section>
        <XsStatusBar
          className="history-page__status"
          tone={statusTone}
          label={statusTone === "info" ? "筛选结果" : undefined}
          message={statusText}
        />
      </div>
      <XsAsyncPanel
        className="history-page__async"
        status={asyncStatus}
        empty={sessions.length === 0}
        emptyTitle={hasActiveFilter ? "暂无匹配的历史对话" : "还没有历史对话"}
        emptyDescription={hasActiveFilter ? "调整搜索词或分类后再试试。" : "开始一次新对话后，记录会显示在这里。"}
        emptyActionLabel="开始新对话"
        onEmptyAction={() => navigate("/")}
        error="历史记录同步失败，请确认 data-hub 会话服务可用后重试。"
        onRetry={() => void historyQuery.refetch()}
      >
        <section className="history-list" aria-label="历史对话列表">
          {sessions.map((session) => (
            <button
              className="xs-card history-card xs-card-button"
              key={session.id}
              type="button"
              aria-label={`${session.title}：${session.summary}`}
              aria-busy={restoringSessionId === session.id}
              disabled={restoringSessionId !== null}
              onClick={() => void handleRestoreSession(session)}
            >
              <span className="topic-icon" aria-hidden="true">
                <img src={getHistoryIcon(session.category)} alt="" />
              </span>
              <div className="history-card__body">
                <Tooltip title={session.title} placement="topLeft">
                  <h2 className="history-card__title">{session.title}</h2>
                </Tooltip>
                <p>{session.summary}</p>
                <Space size={10} className="tagline" wrap>
                  <Tag bordered={false} color="blue">
                    {session.category}
                  </Tag>
                  <span>{session.updatedAt}</span>
                </Space>
              </div>
              <span
                className="history-card__restore-state"
                data-active={restoringSessionId === session.id}
                aria-hidden="true"
              >
                {restoringSessionId === session.id ? (
                  <>
                    <span className="history-card__restore-spinner" />
                    恢复中
                  </>
                ) : (
                  "打开"
                )}
              </span>
            </button>
          ))}
        </section>
      </XsAsyncPanel>
    </PageFrame>
  );
}
