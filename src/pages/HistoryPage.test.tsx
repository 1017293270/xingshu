import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import * as historyService from "@/services/historyService";
import { useUiStore } from "@/stores/uiStore";
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

describe("HistoryPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 1 条历史对话");
  });

  it("switches category filters and announces the filtered result count", async () => {
    const user = userEvent.setup();
    renderHistoryPage();

    expect(await screen.findByRole("heading", { name: "Q2销售业绩分析" })).toBeInTheDocument();

    await user.click(segmentedOption("数据洞察"));

    const historyList = screen.getByRole("region", { name: "历史对话列表" });
    expect(within(historyList).getByRole("heading", { name: "Q2销售业绩分析" })).toBeInTheDocument();
    expect(within(historyList).getByRole("heading", { name: "库存周转率分析" })).toBeInTheDocument();
    expect(within(historyList).queryByRole("heading", { name: "员工报销流程说明" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 2 条历史对话");

    await user.click(segmentedOption("文档处理"));

    expect(within(historyList).queryByRole("heading", { name: "Q2销售业绩分析" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 0 条历史对话");

    await user.click(segmentedOption("全部"));

    expect(await screen.findByRole("heading", { name: "员工报销流程说明" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 5 条历史对话");
  });

  it("restores a selected history conversation", async () => {
    const user = userEvent.setup();
    renderHistoryPage();

    await user.click(await screen.findByRole("button", { name: /员工报销流程说明/ }));

    expect(screen.getByRole("status")).toHaveTextContent("已恢复历史对话：员工报销流程说明");
  });

  it("keeps recovery feedback on the selected data-hub conversation", async () => {
    const user = userEvent.setup();
    let resolveReplay!: (
      value: Awaited<ReturnType<typeof historyService.loadDataHubHistoryReplay>>
    ) => void;
    vi.spyOn(historyService, "listHistorySessions").mockResolvedValue([
      {
        id: "session-42",
        sessionId: "session-42",
        title: "恢复经营分析",
        summary: "来自 data-hub 的历史会话",
        category: "数据洞察",
        updatedAt: "2026-07-15 10:00",
        source: "data-hub"
      }
    ]);
    vi.spyOn(historyService, "loadDataHubHistoryReplay").mockReturnValue(
      new Promise((resolve) => {
        resolveReplay = resolve;
      })
    );
    renderHistoryPageWithIsolatedQuery();

    const restoreButton = await screen.findByRole("button", { name: /恢复经营分析/ });
    await user.click(restoreButton);

    expect(restoreButton).toHaveAttribute("aria-busy", "true");
    expect(restoreButton).toBeDisabled();
    expect(within(restoreButton).getByText("恢复中")).toBeInTheDocument();

    resolveReplay({
      sessionId: "session-42",
      chatMode: "ask",
      question: "分析经营数据",
      events: [],
      turns: []
    });

    await waitFor(() => expect(restoreButton).toHaveAttribute("aria-busy", "false"));
  });

  it("routes restored knowledge history back to the shared rag workspace", async () => {
    const user = userEvent.setup();
    vi.spyOn(historyService, "listHistorySessions").mockResolvedValue([
      {
        id: "session-rag",
        sessionId: "session-rag",
        title: "合同制度问答",
        summary: "来自 data-hub 的历史会话",
        category: "知识快查",
        updatedAt: "2026-07-28 10:00",
        source: "data-hub"
      }
    ]);
    vi.spyOn(historyService, "loadDataHubHistoryReplay").mockResolvedValue({
      sessionId: "session-rag",
      chatMode: "rag",
      question: "合同审批流程？",
      events: [
        {
          type: "done",
          data: { mode: "rag", askKnowledge: true, summary: "需经过部门审核。" },
          sessionId: "session-rag",
          chatId: "chat-rag"
        }
      ],
      turns: [
        {
          id: "session-rag-chat-rag-0",
          question: "合同审批流程？",
          sessionId: "session-rag",
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
    expect(useUiStore.getState().activeAnalysisSessionId).toBe("session-rag");
  });

  it("paginates history sessions and avoids refetching when filters change", async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      id: `history-${index + 1}`,
      title: `历史对话 ${index + 1}`,
      summary: `第 ${index + 1} 条历史内容`,
      category: "知识快查" as const,
      updatedAt: "2026-07-24 10:00"
    }));
    const listSpy = vi.spyOn(historyService, "listHistorySessions").mockResolvedValue(sessions);
    renderHistoryPageWithIsolatedQuery();

    expect(await screen.findByRole("heading", { name: "历史对话 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "历史对话 8" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "历史对话 9" })).not.toBeInTheDocument();

    await user.click(screen.getByTitle("2"));

    expect(await screen.findByRole("heading", { name: "历史对话 9" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "历史对话 1" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "历史搜索" }), "10");

    expect(await screen.findByRole("heading", { name: "历史对话 10" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "历史对话 9" })).not.toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledTimes(1);
  });
});
