import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppProviders } from "@/app/providers";
import * as historyService from "@/services/historyService";
import { useUiStore } from "@/stores/uiStore";
import type { DataHubChatMode } from "@/types/dataHub";
import type { HistorySession } from "@/types/history";
import { HistoryPage } from "./HistoryPage";

function segmentedOption(name: string) {
  const option = screen
    .getAllByText(name)
    .map((element) => element.closest(".ant-segmented-item"))
    .find(Boolean);

  if (!option) {
    throw new Error(`未找到筛选项：${name}`);
  }

  return option;
}

function renderHistoryPage() {
  useUiStore.getState().resetUiState();

  return render(
    <AppProviders>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </AppProviders>
  );
}

function renderHistoryPageWithIsolatedQuery() {
  useUiStore.getState().resetUiState();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderHistoryRouteFlow() {
  useUiStore.getState().resetUiState();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/history"]}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/ask-data" element={<div aria-label="问数历史目标" />} />
          <Route path="/ask-knowledge" element={<div aria-label="问知历史目标" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderHistoryClickFlow() {
  useUiStore.getState().resetUiState();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/history"]}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/ask-data" element={<div aria-label="历史加载目标" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HistoryPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("xingshu_history_session_kinds");
  });

  it("shows loading without an empty-state flash, then offers a new conversation", async () => {
    let resolveSessions!: (sessions: []) => void;
    vi.spyOn(historyService, "listHistorySessions").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSessions = resolve;
      })
    );
    renderHistoryPageWithIsolatedQuery();

    expect(await screen.findByRole("status", { name: "正在加载" })).toBeInTheDocument();
    expect(screen.queryByText("还没有历史对话")).not.toBeInTheDocument();

    resolveSessions([]);

    expect(await screen.findByText("还没有历史对话")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始新对话" })).toBeInTheDocument();
  });

  it("retries an initial history loading error", async () => {
    const user = userEvent.setup();
    const filterSpy = vi
      .spyOn(historyService, "listHistorySessions")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    renderHistoryPageWithIsolatedQuery();

    expect(await screen.findByRole("alert")).toHaveTextContent("历史记录同步失败");
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("还没有历史对话")).toBeInTheDocument();
    expect(filterSpy).toHaveBeenCalledTimes(2);
  });

  it("filters history sessions by search keyword from an accessible search box", async () => {
    const user = userEvent.setup();
    renderHistoryPage();

    expect(await screen.findByRole("heading", { name: "员工报销流程说明" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "历史搜索" }), "报销");

    const historyList = screen.getByRole("region", { name: "历史对话列表" });
    expect(within(historyList).getByRole("heading", { name: "员工报销流程说明" })).toBeInTheDocument();
    expect(within(historyList).queryByRole("heading", { name: "Q2销售业绩分析" })).not.toBeInTheDocument();
    expect(within(historyList).queryByRole("heading", { name: "客户管理系统操作指南" })).not.toBeInTheDocument();
    expect(screen.getByText("已筛选 1 条历史对话")).toBeInTheDocument();
  });

  it("switches category filters and announces the filtered result count", async () => {
    const user = userEvent.setup();
    renderHistoryPage();

    expect(await screen.findByRole("heading", { name: "Q2销售业绩分析" })).toBeInTheDocument();

    await user.click(segmentedOption("查数据"));

    const historyList = screen.getByRole("region", { name: "历史对话列表" });
    expect(within(historyList).getByRole("heading", { name: "Q2销售业绩分析" })).toBeInTheDocument();
    expect(within(historyList).getByRole("heading", { name: "库存周转率分析" })).toBeInTheDocument();
    expect(within(historyList).queryByRole("heading", { name: "员工报销流程说明" })).not.toBeInTheDocument();
    expect(screen.getByText("已筛选 2 条历史对话")).toBeInTheDocument();

    await user.click(segmentedOption("找文档"));

    expect(within(historyList).queryByRole("heading", { name: "Q2销售业绩分析" })).not.toBeInTheDocument();
    expect(screen.getByText("已筛选 0 条历史对话")).toBeInTheDocument();

    await user.click(segmentedOption("全部"));

    expect(await screen.findByRole("heading", { name: "员工报销流程说明" })).toBeInTheDocument();
    expect(screen.getByText("已筛选 5 条历史对话")).toBeInTheDocument();
  });

  it("restores a selected history conversation", async () => {
    const user = userEvent.setup();
    renderHistoryPage();

    await user.click(await screen.findByRole("button", { name: /员工报销流程说明/ }));

    expect(screen.getByText("已打开历史对话：员工报销流程说明")).toBeInTheDocument();
  });

  it("leaves the history list immediately while a slow conversation loads", async () => {
    const user = userEvent.setup();
    vi.spyOn(historyService, "listHistorySessions").mockResolvedValue([
      {
        id: "ask-data-42",
        sessionId: "ask-data-42",
        title: "恢复经营分析",
        summary: "来自 data-hub 的历史会话",
        categories: ["数据洞察"],
        updatedAt: "2026-07-15 10:00",
        source: "data-hub",
        // 后端列表不返回模式，这里是 listHistorySessions 按 ask-data- 前缀认出来的。
        chatMode: "ask"
      }
    ]);
    vi.spyOn(historyService, "loadDataHubHistoryReplay").mockReturnValue(new Promise(() => {}));
    renderHistoryClickFlow();

    const restoreButton = await screen.findByRole("button", { name: /恢复经营分析/ });
    await user.click(restoreButton);

    expect(await screen.findByLabelText("历史加载目标")).toBeInTheDocument();
    expect(screen.queryByText("恢复中")).not.toBeInTheDocument();
  });

  it("routes restored knowledge history back to the shared rag workspace", async () => {
    const user = userEvent.setup();
    vi.spyOn(historyService, "listHistorySessions").mockResolvedValue([
      {
        id: "ask-knowledge-7",
        sessionId: "ask-knowledge-7",
        title: "合同制度问答",
        summary: "来自 data-hub 的历史会话",
        categories: ["知识快查"],
        updatedAt: "2026-07-28 10:00",
        source: "data-hub",
        chatMode: "rag"
      }
    ]);
    // 回放的模式由前端从事件里认出（done.mode），不是后端会话字段。
    vi.spyOn(historyService, "loadDataHubHistoryReplay").mockResolvedValue({
      sessionId: "ask-knowledge-7",
      chatMode: "rag",
      question: "合同审批流程？",
      events: [
        {
          type: "done",
          data: { mode: "rag", askKnowledge: true, summary: "需经过部门审核。" },
          sessionId: "ask-knowledge-7",
          chatId: "chat-rag"
        }
      ],
      turns: [
        {
          id: "ask-knowledge-7-chat-rag-0",
          question: "合同审批流程？",
          sessionId: "ask-knowledge-7",
          chatId: "chat-rag",
          chatMode: "rag",
          status: "done",
          events: [],
          error: ""
        }
      ]
    });
    renderHistoryRouteFlow();

    await user.click(await screen.findByRole("button", { name: /合同制度问答/ }));

    expect(await screen.findByLabelText("问知历史目标")).toBeInTheDocument();
    expect(useUiStore.getState().activeAnalysisMode).toBe("rag");
    expect(useUiStore.getState().activeAnalysisSessionId).toBe("ask-knowledge-7");
  });

  it("routes an unlabeled legacy session by the mode its replay reveals", async () => {
    const user = userEvent.setup();
    vi.spyOn(historyService, "listHistorySessions").mockResolvedValue([
      {
        id: "session-legacy",
        sessionId: "session-legacy",
        title: "旧版制度问答",
        summary: "来自 data-hub 的历史会话",
        categories: [],
        updatedAt: "2026-07-01 10:00",
        source: "data-hub"
      }
    ]);
    const replaySpy = vi.spyOn(historyService, "loadDataHubHistoryReplay").mockResolvedValue({
      sessionId: "session-legacy",
      chatMode: "rag",
      question: "旧版制度问答",
      events: [],
      turns: []
    });
    renderHistoryRouteFlow();

    const card = await screen.findByRole("button", { name: "旧版制度问答，2026-07-01 10:00" });
    await user.click(card);

    expect(replaySpy).toHaveBeenCalledWith("session-legacy", "ask");
    expect(await screen.findByLabelText("问知历史目标")).toBeInTheDocument();
  });

  it("paginates history sessions and avoids refetching when filters change", async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 20 }, (_, index) => ({
      id: `history-${index + 1}`,
      title: `历史对话 ${index + 1}`,
      summary: `第 ${index + 1} 条历史内容`,
      categories: ["知识快查" as const],
      updatedAt: "2026-07-24 10:00"
    }));
    const listSpy = vi.spyOn(historyService, "listHistorySessions").mockResolvedValue(sessions);
    renderHistoryPageWithIsolatedQuery();

    expect(await screen.findByRole("heading", { name: "历史对话 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "历史对话 16" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "历史对话 17" })).not.toBeInTheDocument();

    await user.click(screen.getByTitle("2"));

    expect(await screen.findByRole("heading", { name: "历史对话 17" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "历史对话 1" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "历史搜索" }), "10");

    expect(await screen.findByRole("heading", { name: "历史对话 10" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "历史对话 17" })).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  it("labels every capability an orchestration used and leaves unknown sessions unlabeled", async () => {
    const user = userEvent.setup();
    const session = (sessionId: string, title: string, categories: HistorySession["categories"], chatMode?: DataHubChatMode) => ({
      id: sessionId,
      sessionId,
      title,
      summary: "来自 data-hub 的历史会话",
      categories,
      updatedAt: "2026-09-20 10:00",
      source: "data-hub" as const,
      ...(chatMode ? { chatMode } : {})
    });
    // 编排会话在列表缓存之后才跑完：类型只在本机记忆里。
    localStorage.setItem("xingshu_history_session_kinds", JSON.stringify({
      "agent-2": { chatMode: "agent", categories: ["数据洞察", "文档处理"], updatedAt: 1 }
    }));
    vi.spyOn(historyService, "listHistorySessions").mockResolvedValue([
      session("agent-1", "数据与制度核对", ["数据洞察", "知识快查"], "agent"),
      session("agent-2", "合同与附件核对", [], "agent"),
      session("ask-knowledge-3", "报销制度", ["知识快查"], "rag"),
      session("session-legacy", "经营数据旧会话", [])
    ]);
    renderHistoryPageWithIsolatedQuery();

    const historyList = await screen.findByRole("region", { name: "历史对话列表" });
    const card = (title: string) =>
      within(historyList).getByRole("heading", { name: title }).closest("button") as HTMLElement;

    expect(await within(historyList).findByRole("button", { name: "数据与制度核对，查数据 · 查知识，2026-09-20 10:00" }))
      .toBeInTheDocument();
    expect(card("合同与附件核对")).toHaveTextContent("查数据 · 找文档");
    // 标题里有「经营数据」也不猜类别。
    expect(card("经营数据旧会话")).toHaveAccessibleName("经营数据旧会话，2026-09-20 10:00");
    expect(card("经营数据旧会话").querySelector(".history-card__type")).toBeEmptyDOMElement();

    // 切换筛选会重建列表区域，每次都重新取。
    const visibleTitles = () => within(screen.getByRole("region", { name: "历史对话列表" }))
      .getAllByRole("heading")
      .map((heading) => heading.textContent);

    await user.click(segmentedOption("查知识"));
    expect(visibleTitles()).toEqual(["数据与制度核对", "报销制度"]);

    await user.click(segmentedOption("找文档"));
    expect(visibleTitles()).toEqual(["合同与附件核对"]);

    await user.click(segmentedOption("查数据"));
    expect(visibleTitles()).toEqual(["数据与制度核对", "合同与附件核对"]);
    expect(screen.getByText("已筛选 2 条历史对话")).toBeInTheDocument();
  });
});
