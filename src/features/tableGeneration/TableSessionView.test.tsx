import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TableSessionView } from "./TableSessionView";
import type { DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import type { AgentMessageInput } from "@/types/agent";
import type { DataHubStreamEvent } from "@/types/dataHub";

const serviceMocks = vi.hoisted(() => ({
  listRecentTables: vi.fn(),
  streamAgentMessage: vi.fn(),
  loadDataHubHistoryReplay: vi.fn()
}));

vi.mock("@/services/tableService", () => ({
  listRecentTables: serviceMocks.listRecentTables
}));

vi.mock("@/services/agentService", () => ({
  streamAgentMessage: serviceMocks.streamAgentMessage
}));

vi.mock("@/services/historyService", () => ({
  loadDataHubHistoryReplay: serviceMocks.loadDataHubHistoryReplay
}));

const SESSION_ID = "ask-table-demo";

const rankingTableEvent: DataHubStreamEvent = {
  type: "table",
  data: {
    columns: [
      { name: "region", title: "区域" },
      { name: "sales", title: "销售额", type: "number" }
    ],
    rows: [{ region: "华东", sales: 128 }],
    totalRows: 1,
    source: "cube"
  }
};

function renderSession(state?: { prompt: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/table/${SESSION_ID}`, state }]}>
        <Routes>
          <Route path="/table" element={<h1>最近制表</h1>} />
          <Route path="/table/:sessionId" element={<TableSessionView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockStream(run: (handlers: DataHubAskDataStreamHandlers) => void) {
  serviceMocks.streamAgentMessage.mockImplementation((
    _input: AgentMessageInput,
    handlers: DataHubAskDataStreamHandlers
  ) => {
    const controller = new AbortController();
    run(handlers);
    return controller;
  });
}

function replayWithTable(question = "华东区Q1销售排行") {
  return {
    sessionId: SESSION_ID,
    chatMode: "ask" as const,
    question,
    events: [rankingTableEvent],
    turns: [
      {
        id: "turn-1",
        question,
        sessionId: SESSION_ID,
        chatId: "chat-1",
        chatMode: "ask" as const,
        status: "done" as const,
        events: [rankingTableEvent],
        error: ""
      }
    ]
  };
}

describe("TableSessionView", () => {
  beforeEach(() => {
    serviceMocks.listRecentTables.mockReset();
    serviceMocks.streamAgentMessage.mockReset();
    serviceMocks.loadDataHubHistoryReplay.mockReset();
    serviceMocks.listRecentTables.mockResolvedValue([]);
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue({
      sessionId: SESSION_ID,
      chatMode: "ask",
      question: "",
      events: [],
      turns: []
    });
    window.sessionStorage.clear();
  });

  it("keeps the table out of the conversation and opens it in the side panel", async () => {
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTable());

    renderSession();

    // 对话流里只留一张卡，表本身在侧栏
    const card = await screen.findByRole("article", { name: "结果表" });
    expect(within(card).getByText("字段 2 · 行 1")).toBeInTheDocument();
    expect(card).toHaveAttribute("data-active", "true");

    const panel = await screen.findByRole("complementary", { name: "结果表预览" });
    expect(within(panel).getByRole("columnheader", { name: "区域" })).toBeInTheDocument();
    expect(within(panel).getByText("华东")).toBeInTheDocument();
  });

  it("closes the panel and reopens it from the result card", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTable());

    renderSession();
    await screen.findByRole("complementary", { name: "结果表预览" });

    await user.click(screen.getByRole("button", { name: "关闭预览" }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "结果表预览" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("article", { name: "结果表" })).not.toHaveAttribute("data-active");

    await user.click(screen.getByRole("button", { name: /浏览结果表/ }));
    expect(await screen.findByRole("complementary", { name: "结果表预览" })).toBeInTheDocument();
  });

  it("copies the answer of one turn", async () => {
    const user = userEvent.setup();
    // userEvent 会装自己的剪贴板桩，所以这一行必须排在 setup 之后
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue({
      ...replayWithTable(),
      turns: [
        {
          id: "turn-1",
          question: "月度费用统计报表",
          sessionId: SESSION_ID,
          chatId: "chat-1",
          chatMode: "ask" as const,
          status: "done" as const,
          events: [{ type: "text", data: "当前空间没有可汇总的费用明细。" } as DataHubStreamEvent],
          error: ""
        }
      ]
    });

    renderSession();

    await user.click(await screen.findByRole("button", { name: "复制回答" }));

    expect(writeText).toHaveBeenCalledWith("当前空间没有可汇总的费用明细。");
    expect(await screen.findByText("已复制回答")).toBeInTheDocument();
  });

  it("offers 继续生成 on a stopped turn and re-runs the same requirement", async () => {
    const user = userEvent.setup();
    mockStream(() => undefined);

    renderSession({ prompt: "生成库存表" });

    await user.click(await screen.findByRole("button", { name: "停止生成" }));
    expect(serviceMocks.streamAgentMessage).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: "继续生成" }));

    expect(serviceMocks.streamAgentMessage).toHaveBeenCalledTimes(2);
    expect(serviceMocks.streamAgentMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "生成库存表", chatMode: "ask_table" }),
      expect.any(Object)
    );
  });

  it("switches sessions from the header instead of a right-hand rail", async () => {
    const user = userEvent.setup();
    serviceMocks.listRecentTables.mockResolvedValue([
      {
        id: "ask-table-sales",
        title: "客户销售排行榜表",
        tag: "排行",
        description: "2026-08-17 10:00",
        iconId: "ranking",
        updatedAt: "2026-08-17T10:00:00Z"
      }
    ]);
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTable("华东区Q1销售排行"));

    renderSession();

    expect(screen.queryByRole("navigation", { name: "最近制表会话" })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "切换制表会话" }));

    expect(await screen.findByText("客户销售排行榜表")).toBeInTheDocument();
    expect(screen.getByText("当前会话")).toBeInTheDocument();
  });
});
