import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input, Segmented, Space, Tag, Tooltip } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import historyConversationIcon from "@/assets/history-icons/history-conversation-image2.png";
import dataInsightIcon from "@/assets/history-icons/history-data-insight.svg";
import knowledgeQuickIcon from "@/assets/history-icons/history-knowledge-quick.svg";
import { XsEmptyState, XsStatusBar, type XsStatusTone } from "@/components/xs";
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
  const { data: sessions = [], isError, isFetching, refetch } = useQuery({
    queryKey: ["historySessions", { keyword, category }],
    queryFn: () => filterHistorySessions({ keyword, category })
  });
  const statusText =
    actionStatus || (isFetching ? "正在同步 data-hub 历史对话" : `已筛选 ${sessions.length} 条历史对话`);
  const statusTone = useMemo(
    () => resolveStatusTone(statusText, isFetching && !actionStatus),
    [actionStatus, isFetching, statusText]
  );

  async function handleRestoreSession(session: HistorySession) {
    if (!session.sessionId || session.source !== "data-hub") {
      setActionStatus(`已恢复历史对话：${session.title}`);
      return;
    }

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
        {isError ? (
          <XsEmptyState
            className="history-empty-state"
            tone="error"
            title="历史记录同步失败"
            description="请确认 data-hub 会话服务可用后重试。"
            actionLabel="重试"
            onAction={() => void refetch()}
          />
        ) : null}
      </div>
      <section className="history-list" aria-label="历史对话列表">
        {!isError && sessions.length === 0 ? (
          <XsEmptyState className="history-empty-state" description="暂无历史对话。" />
        ) : null}
        {!isError &&
          sessions.map((session) => (
            <button
              className="xs-card history-card xs-card-button"
              key={session.id}
              type="button"
              aria-label={`${session.title}：${session.summary}`}
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
            </button>
          ))}
      </section>
    </PageFrame>
  );
}
