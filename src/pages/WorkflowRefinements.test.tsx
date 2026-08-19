import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablePage } from "./TablePage";
import { TableSessionView } from "@/features/tableGeneration/TableSessionView";
import type { DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import { useUiStore } from "@/stores/uiStore";
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

function renderPage(page: ReactElement, initialEntries: string[] = ["/table"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/table" element={page} />
          <Route path="/table/:sessionId" element={<TableSessionView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockStream(run: (handlers: DataHubAskDataStreamHandlers, controller: AbortController) => void) {
  serviceMocks.streamAgentMessage.mockImplementation((
    _input: AgentMessageInput,
    handlers: DataHubAskDataStreamHandlers
  ) => {
    const controller = new AbortController();
    run(handlers, controller);
    return controller;
  });
}

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

describe("workflow refinements", () => {
  beforeEach(() => {
    serviceMocks.listRecentTables.mockReset();
    serviceMocks.streamAgentMessage.mockReset();
    serviceMocks.loadDataHubHistoryReplay.mockReset();
    serviceMocks.listRecentTables.mockResolvedValue([]);
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue({
      sessionId: "ask-table-demo",
      chatMode: "ask",
      question: "历史制表",
      events: [],
      turns: []
    });
    useUiStore.getState().resetUiState();
  });

  it("keeps the full table title available and opens the table agent after generate", async () => {
    const user = userEvent.setup();
    const fullTitle = "华东区域重点客户季度销售排行榜及同比环比趋势分析表";
    serviceMocks.listRecentTables.mockResolvedValue([
      {
        id: "ask-table-long-title",
        title: fullTitle,
        tag: "排行",
        description: "完整标题不得被业务逻辑截断",
        iconId: "ranking"
      }
    ]);
    mockStream((handlers) => {
      queueMicrotask(() => {
        handlers.onEvent({
          type: "data_source_selected",
          data: { datasourceId: 8, datasourceName: "经营分析库" }
        });
        handlers.onEvent(rankingTableEvent);
        handlers.onDone?.();
      });
    });

    const { container } = renderPage(<TablePage />);

    expect(container.querySelector(".workflow-status-slot.table-page__status-slot")).toBeInTheDocument();
    expect(screen.queryByText("写清这 4 点，表结构更准")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "制表描述要点" })).not.toBeInTheDocument();

    const title = await screen.findByRole("heading", { name: fullTitle });
    expect(title).toHaveAttribute("title", fullTitle);

    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成销售排行");
    await user.click(screen.getByRole("button", { name: "生成表格" }));

    expect(useUiStore.getState().analysisTurns).toEqual([]);
    expect(await screen.findByRole("heading", { name: "问表智能体", level: 1 })).toBeInTheDocument();
    expect(serviceMocks.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(serviceMocks.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "生成销售排行", chatMode: "ask_table" }),
      expect.any(Object)
    );

    expect(await screen.findByRole("columnheader", { name: "区域" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("已生成 1 张结果表");
    });
    expect(screen.getByText("华东")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出结果" })).toBeInTheDocument();
  });

  it("disables follow-up actions while streaming and ignores a second enter", async () => {
    const user = userEvent.setup();
    mockStream((handlers) => {
      queueMicrotask(() => {
        handlers.onEvent({
          type: "data_source_selected",
          data: { datasourceId: 8, datasourceName: "经营分析库" }
        });
      });
    });

    renderPage(<TablePage />);
    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成销售排行");
    await user.click(screen.getByRole("button", { name: "生成表格" }));

    expect(await screen.findByRole("heading", { name: "问表智能体", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /继续制表/ })).toBeDisabled();
    expect(screen.getByRole("region", { name: "继续制表" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在生成结果表");
    expect(await screen.findByText("已定位数据源：经营分析库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止生成" })).toBeEnabled();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "继续追问" }), { key: "Enter", code: "Enter" });
    expect(serviceMocks.streamAgentMessage).toHaveBeenCalledTimes(1);
  });

  it("stops an in-flight table generation", async () => {
    const user = userEvent.setup();
    mockStream(() => undefined);

    renderPage(<TablePage />);
    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成库存表");
    await user.click(screen.getByRole("button", { name: "生成表格" }));
    await user.click(await screen.findByRole("button", { name: "停止生成" }));

    expect(await screen.findByRole("status")).toHaveTextContent("已停止本次制表生成");
    expect(screen.getByRole("button", { name: "继续制表" })).toBeDisabled();
  });

  it("shows an empty-result hint when ask-table finishes without a table", async () => {
    const user = userEvent.setup();
    mockStream((handlers) => {
      queueMicrotask(() => {
        handlers.onEvent({ type: "text", data: "当前空间没有可汇总的费用明细。" });
        handlers.onDone?.();
      });
    });

    renderPage(<TablePage />);
    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "月度费用统计报表");
    await user.click(screen.getByRole("button", { name: "生成表格" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("未生成结果表，请补充字段、时间或统计口径");
    });
    expect(screen.getByText("当前空间没有可汇总的费用明细。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出结果" })).not.toBeInTheDocument();
  });

  it("shows an error state when table generation cannot be queued", async () => {
    const user = userEvent.setup();
    mockStream((handlers) => {
      queueMicrotask(() => handlers.onError?.(new Error("offline")));
    });

    renderPage(<TablePage />);
    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成库存表");
    await user.click(screen.getByRole("button", { name: "生成表格" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    expect(screen.getByRole("button", { name: "继续制表" })).toBeDisabled();
  });

  it("opens a recent table record into the restored result workspace", async () => {
    const user = userEvent.setup();
    serviceMocks.listRecentTables.mockResolvedValue([
      {
        id: "ask-table-sales",
        title: "客户销售排行榜表",
        tag: "排行",
        description: "2026-08-17 10:00",
        iconId: "ranking",
        prompt: "客户销售排行榜表"
      }
    ]);
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue({
      sessionId: "ask-table-sales",
      chatMode: "ask",
      question: "客户销售排行榜表",
      events: [rankingTableEvent],
      turns: [
        {
          id: "turn-1",
          question: "客户销售排行榜表",
          sessionId: "ask-table-sales",
          chatId: "chat-1",
          chatMode: "ask",
          status: "done",
          events: [rankingTableEvent],
          error: ""
        }
      ]
    });

    renderPage(<TablePage />);
    await user.click(await screen.findByRole("link", { name: "打开制表结果：客户销售排行榜表" }));

    expect(await screen.findByRole("heading", { name: "问表智能体", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "区域" })).toBeInTheDocument();
    expect(screen.getByText("华东")).toBeInTheDocument();
    expect(serviceMocks.streamAgentMessage).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("已还原 1 张结果表");
    });
  });

  it("keeps space between the table preview banner and the workbench", () => {
    const workflowsCss = readFileSync("src/pages/styles/workflows.css", "utf8");
    const workbenchRule = workflowsCss.match(/\.sheet-workbench\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(workbenchRule).toContain("margin: var(--xs-module-gap) 0 0");
    expect(workbenchRule).not.toContain("1.62fr");
  });

  it("keeps the welcome page on the document scrollport instead of creating a second vertical scroller", () => {
    const welcomeCss = readFileSync("src/pages/welcome.css", "utf8");
    const pageRule = welcomeCss.match(/\.welcome-page\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(pageRule).toContain("min-height: 100dvh");
    expect(pageRule).toContain("overflow-x: clip");
    expect(pageRule).not.toContain("overflow-x: hidden");
  });
});
