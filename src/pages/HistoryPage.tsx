import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import { Input, Pagination, Segmented, Tag, Tooltip } from "antd";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import type { XsIconComponent } from "@/components/xs/XsIconTile";
import {
  XsGlyphHistoryDocument,
  XsGlyphHistoryInsight,
  XsGlyphHistoryKnowledge
} from "@/components/xs/XsMetricGlyphs";
import {
  filterHistorySessionList,
  listHistorySessions,
  loadDataHubHistoryReplay
} from "@/services/historyService";
import { useUiStore } from "@/stores/uiStore";
import type { DataHubChatMode } from "@/types/dataHub";
import type { HistoryCategory, HistoryFilter, HistorySession } from "@/types/history";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { PageFrame } from "./PageFrame";

const defaultPageSize = 8;

const historyCategoryFilters: NonNullable<HistoryFilter["category"]>[] = [
  "全部",
  "知识快查",
  "数据洞察",
  "文档处理"
];

/** 历史类型图标固定 28px：42px 底板的 2/3，与指标卡底板 32/52 同比例。 */
const HISTORY_GLYPH_SIZE = 28;

const historyGlyphByCategory: Record<HistoryCategory, XsIconComponent> = {
  知识快查: XsGlyphHistoryKnowledge,
  数据洞察: XsGlyphHistoryInsight,
  文档处理: XsGlyphHistoryDocument
};

export function getHistoryReplayRoute(chatMode: DataHubChatMode) {
  if (chatMode === "rag") return "/ask-knowledge";
  if (chatMode === "document_lookup") return "/document-lookup";
  if (chatMode === "agent") return "/ask-agent";
  return "/ask-data";
}

function getHistoryFallbackMode(session: HistorySession): DataHubChatMode {
  if (session.chatMode) return session.chatMode;
  if (session.category === "知识快查") return "rag";
  if (session.category === "文档处理") return "document_lookup";
  return "ask";
}

function getHistoryGlyph(category: HistoryCategory) {
  return historyGlyphByCategory[category];
}

function resolveStatusTone(message: string, isFetching: boolean): XsStatusTone {
  if (message.includes("失败")) {
    return "error";
  }

  if (isFetching || message.startsWith("正在")) {
    return "loading";
  }

  if (message.startsWith("已打开")) {
    return "success";
  }

  return "info";
}

export function HistoryPage() {
  const navigate = useNavigate();
  const sessionScope = useSessionQueryScope();
  const restoreAskDataHistory = useUiStore((state) => state.restoreAskDataHistory);
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const [category, setCategory] = useState<NonNullable<HistoryFilter["category"]>>("全部");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [actionStatus, setActionStatus] = useState("");
  const historyListRef = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const historyQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "historySessions"),
    queryFn: listHistorySessions,
    placeholderData: keepPreviousData
  });
  const sessions = useMemo(
    () =>
      filterHistorySessionList(historyQuery.data ?? [], {
        keyword: deferredKeyword,
        category
      }),
    [category, deferredKeyword, historyQuery.data]
  );
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sessions.slice(start, start + pageSize);
  }, [currentPage, pageSize, sessions]);
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

  useEffect(() => {
    historyListRef.current?.scrollTo?.({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth"
    });
  }, [category, currentPage, deferredKeyword, pageSize, reducedMotion]);

  async function handleRestoreSession(session: HistorySession) {
    if (!session.sessionId || session.source !== "data-hub") {
      setActionStatus(`已打开历史对话：${session.title}`);
      return;
    }

    const fallbackMode = getHistoryFallbackMode(session);
    const initialRoute = getHistoryReplayRoute(fallbackMode);
    restoreAskDataHistory({
      sessionId: session.sessionId,
      question: session.title,
      events: [],
      chatMode: fallbackMode,
      status: "streaming"
    });
    navigate(initialRoute);

    try {
      const replay = await loadDataHubHistoryReplay(session.sessionId, fallbackMode);
      const currentState = useUiStore.getState();
      if (
        currentState.activeAnalysisSessionId !== session.sessionId ||
        currentState.activeAskDataRunId !== null
      ) {
        return;
      }
      restoreAskDataHistory({
        sessionId: replay.sessionId,
        question: replay.question,
        events: replay.events,
        turns: replay.turns,
        chatMode: replay.chatMode,
        status: replay.turns.length > 0 || replay.events.length > 0 ? "done" : "idle"
      });
      const replayRoute = getHistoryReplayRoute(replay.chatMode);
      if (replayRoute !== initialRoute) {
        navigate(replayRoute, { replace: true });
      }
    } catch (error) {
      if (useUiStore.getState().activeAnalysisSessionId !== session.sessionId) {
        return;
      }
      restoreAskDataHistory({
        sessionId: session.sessionId,
        question: session.title,
        events: [],
        chatMode: fallbackMode,
        status: "error",
        error: error instanceof Error ? `历史对话加载失败：${error.message}` : "历史对话加载失败"
      });
    }
  }

  return (
    <PageFrame title="历史对话" className="history-page">
      <div className="history-page__chrome">
        <section className="history-tools" aria-label="历史对话筛选">
          <Input
            aria-label="历史搜索"
            allowClear
            className="xs-focus-glow"
            prefix={<MagnifyingGlass size={18} />}
            placeholder="搜索历史对话..."
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
              setActionStatus("");
            }}
          />
          <Segmented
            aria-label="历史分类筛选"
            options={historyCategoryFilters}
            value={category}
            onChange={(value) => {
              setCategory(value as NonNullable<HistoryFilter["category"]>);
              setPage(1);
              setActionStatus("");
            }}
          />
        </section>
        <XsStatusBar
          className="history-page__status"
          tone={statusTone}
          label={statusTone === "info" ? "筛选结果" : undefined}
          message={statusText}
          transitionKey={`${statusTone}:${statusText}`}
          reserveSpace
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
        loadingVariant="rows"
        contentKey={`${category}:${deferredKeyword}:${currentPage}:${pageSize}`}
        preserveContentWhileRefreshing
        staggerLimit={8}
      >
        <section ref={historyListRef} className="history-list" aria-label="历史对话列表">
          {visibleSessions.map((session, index) => (
            <button
              className={`history-card xs-card-button${index < 8 ? " history-card--enter" : ""}`}
              style={index < 8 ? { animationDelay: `${Math.min(index * 32, 256)}ms` } : undefined}
              key={session.id}
              type="button"
              aria-label={`${session.title}：${session.summary}`}
              onClick={() => void handleRestoreSession(session)}
            >
              <span className="topic-icon" aria-hidden="true">
                {(() => {
                  const HistoryGlyph = getHistoryGlyph(session.category);
                  return <HistoryGlyph size={HISTORY_GLYPH_SIZE} />;
                })()}
              </span>
              <div className="history-card__body">
                <Tooltip title={session.title} placement="topLeft">
                  <h2 className="history-card__title">{session.title}</h2>
                </Tooltip>
                <p>{session.summary}</p>
              </div>
              <div className="history-card__aside">
                <Tag bordered={false} color="blue">
                  {session.category}
                </Tag>
                <span className="history-card__time">{session.updatedAt}</span>
                <span className="history-card__restore-state" aria-hidden="true">
                  打开
                  <ArrowRight size={14} weight="bold" />
                </span>
              </div>
            </button>
          ))}
        </section>
        {sessions.length > defaultPageSize ? (
          <nav className="history-page__pagination" aria-label="历史对话分页">
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={sessions.length}
              pageSizeOptions={[8, 16, 32]}
              showSizeChanger
              showTotal={(total) => `共 ${total} 条`}
              onChange={(nextPage, nextPageSize) => {
                setPage(nextPageSize === pageSize ? nextPage : 1);
                setPageSize(nextPageSize);
                setActionStatus("");
              }}
            />
          </nav>
        ) : null}
      </XsAsyncPanel>
    </PageFrame>
  );
}
