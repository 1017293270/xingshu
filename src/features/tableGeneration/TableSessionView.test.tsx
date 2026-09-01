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
  respondToAgentInteraction: vi.fn(),
  loadDataHubHistoryReplay: vi.fn(),
  exportDataHubTablesCsv: vi.fn(),
  exportDataHubTablesXlsx: vi.fn(),
  createTableTemplate: vi.fn()
}));

vi.mock("@/services/tableService", () => ({
  listRecentTables: serviceMocks.listRecentTables
}));

vi.mock("@/services/agentService", () => ({
  streamAgentMessage: serviceMocks.streamAgentMessage,
  respondToAgentInteraction: serviceMocks.respondToAgentInteraction
}));

vi.mock("@/services/historyService", () => ({
  loadDataHubHistoryReplay: serviceMocks.loadDataHubHistoryReplay
}));

vi.mock("@/services/dataHubTableExport", async () => {
  const actual = await vi.importActual<typeof import("@/services/dataHubTableExport")>(
    "@/services/dataHubTableExport"
  );
  return {
    ...actual,
    exportDataHubTablesCsv: serviceMocks.exportDataHubTablesCsv,
    exportDataHubTablesXlsx: serviceMocks.exportDataHubTablesXlsx
  };
});

vi.mock("@/services/tableTemplateService", async () => {
  const actual = await vi.importActual<typeof import("@/services/tableTemplateService")>(
    "@/services/tableTemplateService"
  );
  return { ...actual, createTableTemplate: serviceMocks.createTableTemplate };
});

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

const cityTableEvent: DataHubStreamEvent = {
  type: "table",
  data: {
    columns: [
      { name: "city", title: "城市" },
      { name: "orders", title: "订单数", type: "number" }
    ],
    rows: [{ city: "上海", orders: 42 }],
    totalRows: 1,
    groupLabel: "城市订单分布",
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

/** 一轮出两张表：结果台要靠 tab 条在它们之间切。 */
function replayWithTables(question = "华东区Q1销售排行与城市订单分布") {
  const events = [rankingTableEvent, cityTableEvent];

  return {
    sessionId: SESSION_ID,
    chatMode: "ask" as const,
    question,
    events,
    turns: [
      {
        id: "turn-1",
        question,
        sessionId: SESSION_ID,
        chatId: "chat-1",
        chatMode: "ask" as const,
        status: "done" as const,
        events,
        error: ""
      }
    ]
  };
}

/** 一轮挂在 ask_user 上：后端推了 clarification 之后照常推 done，状态是 done 但其实在等人。 */
function replayAwaitingClarification(question = "帮我做一张区域销售表") {
  const events: DataHubStreamEvent[] = [
    { type: "text", data: "我先请您确认统计口径。" },
    {
      type: "clarification",
      data: {
        interactionId: "tool-call-1",
        question: "区域按哪个口径？",
        options: [{ label: "客户区域" }, { label: "签约主体区域" }],
        allowFreeText: false
      }
    },
    { type: "done", data: { suspended: true } }
  ];

  return {
    sessionId: SESSION_ID,
    chatMode: "ask" as const,
    question,
    events,
    turns: [
      {
        id: "turn-1",
        question,
        sessionId: SESSION_ID,
        chatId: "chat-1",
        chatMode: "ask" as const,
        status: "done" as const,
        events,
        error: ""
      }
    ]
  };
}

function mockRespond(run: (handlers: DataHubAskDataStreamHandlers) => void) {
  serviceMocks.respondToAgentInteraction.mockImplementation((
    _input: unknown,
    handlers: DataHubAskDataStreamHandlers
  ) => {
    const controller = new AbortController();
    run(handlers);
    return controller;
  });
}

describe("TableSessionView", () => {
  beforeEach(() => {
    serviceMocks.listRecentTables.mockReset();
    serviceMocks.streamAgentMessage.mockReset();
    serviceMocks.respondToAgentInteraction.mockReset();
    serviceMocks.loadDataHubHistoryReplay.mockReset();
    serviceMocks.exportDataHubTablesCsv.mockReset();
    serviceMocks.exportDataHubTablesXlsx.mockReset();
    serviceMocks.exportDataHubTablesXlsx.mockResolvedValue(undefined);
    serviceMocks.createTableTemplate.mockReset();
    serviceMocks.createTableTemplate.mockResolvedValue({ id: 1 });
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

    // 收起入口在结果台头部右上角，不再是工具条里那颗叉
    await user.click(screen.getByRole("button", { name: "收起结果表预览" }));
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

  it("asks instead of reporting an empty turn, and resumes that same turn when an option is picked", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayAwaitingClarification());
    mockRespond((handlers) => {
      handlers.onEvent({
        type: "clarification_response",
        data: { interactionId: "tool-call-1", answer: "客户区域" }
      });
      handlers.onEvent({ type: "text", data: "好的，按客户区域统计。" });
      handlers.onDone?.();
    });

    renderSession();

    const card = await screen.findByRole("region", { name: "需要你确认" });
    expect(within(card).getByText("区域按哪个口径？")).toBeInTheDocument();
    // 挂起的一轮不是"没出结果"，那句空态必须让路
    expect(screen.queryByText("未生成结果表，请补充字段、时间或统计口径")).not.toBeInTheDocument();
    expect(await screen.findByText("问表智能体在等你确认")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "客户区域" }));

    expect(serviceMocks.respondToAgentInteraction).toHaveBeenCalledTimes(1);
    expect(serviceMocks.respondToAgentInteraction).toHaveBeenCalledWith(
      {
        sessionId: SESSION_ID,
        chatId: "chat-1",
        chatMode: "ask_table",
        interactionId: "tool-call-1",
        answer: "客户区域"
      },
      expect.any(Object)
    );
    // 续跑落回原来那一轮：答案是过程事件，不是第二条用户消息
    expect(serviceMocks.streamAgentMessage).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^第 \d+ 轮$/)).toHaveLength(1);

    await waitFor(() => {
      expect(screen.getByText("已选择")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "签约主体区域" })).not.toBeInTheDocument();
    // 澄清前后的两段文字合并成同一个正文块，所以按子串断言续答确实落进了这一轮
    expect(await screen.findByText(/好的，按客户区域统计。/)).toBeInTheDocument();
  });

  it("leaves a resolved clarification as read-only history on replay", async () => {
    const replay = replayAwaitingClarification();
    replay.turns[0].events = [
      ...replay.turns[0].events,
      { type: "clarification_response", data: { interactionId: "tool-call-1", answer: "客户区域" } }
    ];
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replay);

    renderSession();

    const card = await screen.findByRole("region", { name: "已确认的选择" });
    expect(within(card).getByText("已选择")).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "需要你确认" })).not.toBeInTheDocument();
    expect(screen.queryByText("问表智能体在等你确认")).not.toBeInTheDocument();
  });

  it("puts the panel away as soon as the answer is recorded, not when the run ends", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayAwaitingClarification());
    let streamHandlers: DataHubAskDataStreamHandlers | undefined;
    mockRespond((handlers) => {
      streamHandlers = handlers;
    });

    renderSession();

    const panel = await screen.findByRole("region", { name: "需要你确认" });
    await user.click(within(panel).getByRole("button", { name: /客户区域/ }));

    // 后端还没回话的这段时间里，选中那行自己先亮起来，其余锁住
    expect(within(panel).getByRole("button", { name: /客户区域/ })).toHaveAttribute("data-chosen", "true");
    expect(within(panel).getByRole("button", { name: /签约主体区域/ })).toBeDisabled();
    expect(within(panel).getByRole("status")).toHaveTextContent("正在提交你的选择");

    streamHandlers?.onEvent({
      type: "clarification_response",
      data: { interactionId: "tool-call-1", answer: "客户区域" }
    });

    // 回执一到浮层就让开输入框，留痕落回对话流——不必等这一轮跑完
    await waitFor(() => {
      expect(screen.getByText("已选择")).toBeInTheDocument();
    });
    expect(screen.queryByRole("region", { name: "需要你确认" })).not.toBeInTheDocument();
    expect(screen.getByText("正在按你的选择继续")).toBeInTheDocument();

    streamHandlers?.onDone?.();
  });

  it("parks a question the reader puts aside and lets them come back to it", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayAwaitingClarification());

    renderSession();

    const panel = await screen.findByRole("region", { name: "需要你确认" });
    await user.click(within(panel).getByRole("button", { name: "稍后再确认" }));

    expect(screen.queryByRole("button", { name: /签约主体区域/ })).not.toBeInTheDocument();
    expect(screen.getByText("待确认")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "去选择" }));
    expect(await screen.findByRole("button", { name: /签约主体区域/ })).toBeInTheDocument();
  });

  it("switches between the session's tables from the dock tab bar", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTables());

    renderSession();

    const dock = await screen.findByRole("complementary", { name: "结果表预览" });
    // 一轮出两张表：tab 条按「第 N 轮 · 表 M」列出，默认停在第一张
    expect(within(dock).getByRole("tab", { name: "第1轮 · 表1" })).toHaveAttribute("aria-selected", "true");
    expect(within(dock).getByRole("columnheader", { name: "区域" })).toBeInTheDocument();

    await user.click(within(dock).getByRole("tab", { name: "第1轮 · 表2" }));

    expect(within(dock).getByRole("tab", { name: "第1轮 · 表2" })).toHaveAttribute("aria-selected", "true");
    expect(await within(dock).findByRole("columnheader", { name: "城市" })).toBeInTheDocument();
    expect(within(dock).getByRole("heading", { level: 2 })).toHaveTextContent("城市订单分布");
    // 切表也把对话流里对应的那张工件卡标成正在浏览
    const cards = screen.getAllByRole("article", { name: "结果表" });
    expect(cards[1]).toHaveAttribute("data-active", "true");
    expect(cards[0]).not.toHaveAttribute("data-active");
  });

  it("exports the open table as csv and as xlsx from the dock", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTable("华东区Q1销售排行"));

    renderSession();
    const dock = await screen.findByRole("complementary", { name: "结果表预览" });

    await user.click(within(dock).getByRole("button", { name: "下载当前结果表" }));
    await user.click(await screen.findByRole("menuitem", { name: "导出 CSV" }));
    expect(serviceMocks.exportDataHubTablesCsv).toHaveBeenCalledWith(
      [expect.objectContaining({ totalRows: 1 })],
      "华东区Q1销售排行"
    );

    await user.click(within(dock).getByRole("button", { name: "下载当前结果表" }));
    await user.click(await screen.findByRole("menuitem", { name: "导出 XLSX" }));
    expect(serviceMocks.exportDataHubTablesXlsx).toHaveBeenCalledWith(
      [expect.objectContaining({ totalRows: 1 })],
      "华东区Q1销售排行"
    );
  });

  it("saves the open table as a template from the dock", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTable("月度费用统计报表"));

    renderSession();
    const dock = await screen.findByRole("complementary", { name: "结果表预览" });

    await user.click(within(dock).getByRole("button", { name: "把当前结果表存为模板" }));

    const modal = await screen.findByRole("dialog", { name: "存为模板" });
    expect(within(modal).getByLabelText("模板名称")).toHaveValue("月度费用统计报表");
    // 结构快照跟着正在看的那张表带进来，不必让用户重敲一遍列名
    expect(within(modal).getByLabelText("表结构快照")).toHaveTextContent("2 列");

    await user.click(within(modal).getByRole("button", { name: "保存模板" }));

    expect(serviceMocks.createTableTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "月度费用统计报表", prompt: "月度费用统计报表" })
    );
    expect(await screen.findByText("已存为模板：月度费用统计报表")).toBeInTheDocument();
  });

  it("sends a follow-up from the bottom composer", async () => {
    const user = userEvent.setup();
    serviceMocks.loadDataHubHistoryReplay.mockResolvedValue(replayWithTable());
    mockStream(() => undefined);

    renderSession();
    await screen.findByRole("complementary", { name: "结果表预览" });

    const composer = screen.getByRole("region", { name: "继续制表" });
    const send = within(composer).getByRole("button", { name: "继续制表" });
    // 空输入时发送钮是关着的，敲字之后才亮
    expect(send).toBeDisabled();

    await user.type(within(composer).getByRole("textbox", { name: "继续追问" }), "再按季度拆一下");
    expect(send).toBeEnabled();
    await user.click(send);

    expect(serviceMocks.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "再按季度拆一下", chatMode: "ask_table" }),
      expect.any(Object)
    );
    expect(within(composer).getByRole("textbox", { name: "继续追问" })).toHaveValue("");
  });
});
