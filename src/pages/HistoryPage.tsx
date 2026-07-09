import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import historyConversationIcon from "@/assets/icon-kit/xingshu-sidebar-image2-v1/icon-sidebar-history-conversation.png";
import dataInsightIcon from "@/assets/history-icons/history-data-insight.svg";
import knowledgeQuickIcon from "@/assets/history-icons/history-knowledge-quick.svg";
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
  const statusText = actionStatus || (isFetching ? "正在同步 data-hub 历史对话" : `已筛选 ${sessions.length} 条历史对话`);

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
    <PageFrame title="历史对话">
      <section className="history-tools" aria-label="历史对话筛选">
        <Input
          aria-label="历史搜索"
          prefix={<MagnifyingGlass size={18} />}
          placeholder="搜索历史对话..."
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setActionStatus("");
          }}
        />
        {historyCategoryFilters.map((tab) => (
          <Button
            aria-pressed={category === tab}
            autoInsertSpace={false}
            key={tab}
            type={category === tab ? "primary" : "default"}
            onClick={() => {
              setCategory(tab);
              setActionStatus("");
            }}
          >
            {tab}
          </Button>
        ))}
      </section>
      <p className="workflow-status" role="status">{statusText}</p>
      {isError ? (
        <section className="datahub-empty-state history-empty-state" role="alert">
          <span>历史记录同步失败，请确认 data-hub 会话服务可用。</span>
          <Button onClick={() => void refetch()}>重试</Button>
        </section>
      ) : null}
      <section className="history-list" aria-label="历史对话列表">
        {!isError && sessions.length === 0 ? (
          <div className="datahub-empty-state history-empty-state" role="note">暂无历史对话。</div>
        ) : null}
        {!isError && sessions.map((session) => (
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
            <div>
              <h2>{session.title}</h2>
              <p>{session.summary}</p>
              <div className="tagline"><span className="xs-tag">{session.category}</span><span>{session.updatedAt}</span></div>
            </div>
          </button>
        ))}
      </section>
    </PageFrame>
  );
}
