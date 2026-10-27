import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { rememberAnswerInsight } from "@/services/dataHubAnswerInsightService";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";

vi.mock("@/components/xs/XsEChart", () => ({
  XsEChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />
}));

const insight = {
  insights: [
    { title: "客服部费用明显偏高", detail: "“客服部”30,535.18 元，占 63.16%；可能与外出频次较高有关。" },
    { title: "", detail: "行政部最低，只占一成左右。" }
  ],
  followUps: ["客服部的差旅费都花在哪些项目上？", "按月份看全年差旅费有没有明显波动？"]
};

const departmentTable = {
  columns: [{ name: "dept", title: "部门" }, { name: "amount", title: "差旅费用", type: "number" }],
  rows: [{ dept: "客服部", amount: 30535.18 }, { dept: "销售部", amount: 12812.01 }, { dept: "行政部", amount: 5000 }],
  totalRows: 3,
  source: "cube"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(status === 200 ? { code: 200, message: "ok", data } : { message: "Not Found" }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function mockDataHub(answerInsight: () => Response) {
  return vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").pathname;
    if (path === "/api/v1/chat/chart-plan") {
      return json({ chartable: true, reason: "分类比较", chartType: "bar", allowedTypes: ["bar", "pie"],
        title: "各部门差旅费用", tableIndex: 0, dimensionKey: "dept", metricKeys: ["amount"] });
    }
    if (path === "/api/v1/chat/answer-insight") return answerInsight();
    throw new Error(`Unexpected request ${path}`);
  });
}

function renderPage() {
  return render(<AppProviders><MemoryRouter><AnalysisPage mode="ask" /></MemoryRouter></AppProviders>);
}

function answerLiveRun(question = "各部门差旅费用是多少") {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun(question, null, "ask");
  renderPage();
  act(() => {
    store.appendAskDataEvent(runId, { type: "table", content: departmentTable });
    store.appendAskDataEvent(runId, { type: "text", content: "客服部差旅费用最高。" });
    store.completeAskDataRun(runId);
  });
  return runId;
}

function requestBodies(fetchSpy: ReturnType<typeof mockDataHub>, path: string) {
  return fetchSpy.mock.calls
    .filter(([input]) => String(input).endsWith(path))
    .map(([, init]) => JSON.parse(String(init?.body)));
}

describe("answer insight and follow-up questions", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("follows the text answer with the table, the chart, the insight and the follow-up questions", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockDataHub(() => json(insight));
    answerLiveRun();

    const insightSection = await screen.findByRole("region", { name: "数据洞察" });
    expect(within(insightSection).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "客服部费用明显偏高：“客服部”30,535.18 元，占 63.16%；可能与外出频次较高有关。",
      "行政部最低，只占一成左右。"
    ]);
    const [request] = requestBodies(fetchSpy, "/api/v1/chat/answer-insight");
    expect(request).toMatchObject({ question: "各部门差旅费用是多少", answer: "客服部差旅费用最高。" });
    expect(request.tables[0].facts).toContain("“差旅费用”最高的是“客服部”30,535.18，占 63.16%；最低的是“行政部”5,000，占 10.34%");

    const answer = screen.getByLabelText("正式回答");
    const table = screen.getByRole("region", { name: "表格回答" });
    const chart = await screen.findByRole("region", { name: "智能图表建议" });
    const followUps = screen.getByRole("region", { name: "你可能还想问" });
    const order = [answer, table, chart, insightSection, followUps];
    order.slice(1).forEach((node, index) => {
      expect(order[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    await user.click(within(followUps).getByRole("button", { name: "客服部的差旅费都花在哪些项目上？" }));
    expect(useUiStore.getState().analysisTurns.map((turn) => turn.question)).toEqual([
      "各部门差旅费用是多少",
      "客服部的差旅费都花在哪些项目上？"
    ]);
    // 引导问题只挂在最新一轮下面。
    await waitFor(() => expect(screen.queryByRole("region", { name: "你可能还想问" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("region", { name: "数据洞察" })).toHaveLength(1);
  });

  it("shows the remembered insight when a conversation is reopened, without asking the model again", () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockRejectedValue(new Error("offline"));
    const identity = { sessionId: "history-session", chatId: "history-chat" };
    rememberAnswerInsight("history-session::history-chat", insight);
    useUiStore.getState().restoreAskDataHistory({
      sessionId: identity.sessionId,
      question: "各部门差旅费用是多少",
      chatMode: "ask",
      events: [
        { ...identity, type: "table", content: departmentTable },
        { ...identity, type: "text", content: "客服部差旅费用最高。" },
        { ...identity, type: "done", content: {}, finished: true }
      ]
    });
    renderPage();

    expect(screen.getByRole("region", { name: "数据洞察" })).toHaveTextContent("客服部费用明显偏高");
    expect(screen.getByRole("region", { name: "你可能还想问" })).toHaveTextContent("按月份看全年差旅费有没有明显波动？");
    expect(screen.getByRole("region", { name: "表格回答" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stays quiet on a backend that has not deployed the insight endpoint", async () => {
    mockDataHub(() => json(null, 404));
    answerLiveRun();
    await screen.findByRole("region", { name: "智能图表建议" });
    await waitFor(() => expect(screen.queryByText("正在生成数据洞察…")).not.toBeInTheDocument());
    expect(screen.queryByText(/数据洞察/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "你可能还想问" })).not.toBeInTheDocument();
  });

  it("offers a retry when generating the insight fails", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const fetchSpy = mockDataHub(() => (attempts++ === 0 ? json(null, 500) : json(insight)));
    answerLiveRun();
    await user.click(await screen.findByRole("button", { name: "重新生成" }));
    expect(await screen.findByRole("region", { name: "数据洞察" })).toHaveTextContent("行政部最低");
    expect(requestBodies(fetchSpy, "/api/v1/chat/answer-insight")).toHaveLength(2);
  });
});
