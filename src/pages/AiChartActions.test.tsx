import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";

function renderPage(page: ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
    </AppProviders>
  );
}

function appendRatioTable(runId: string) {
  const store = useUiStore.getState();
  store.appendAskDataEvent(runId, {
    type: "table",
    data: {
      columns: [
        { name: "income_group", title: "收入人群" },
        { name: "ratio", title: "占比", type: "number" }
      ],
      rows: [
        { income_group: "低收入", ratio: 25 },
        { income_group: "中收入", ratio: 50 },
        { income_group: "高收入", ratio: 25 }
      ],
      totalRows: 3,
      source: "cube"
    }
  });
}

function appendAgentAskChildEvents(runId: string, childCount = 1) {
  const store = useUiStore.getState();
  const turn = useUiStore
    .getState()
    .analysisTurns.find((item) => item.id === runId)!;
  const rootSessionId = turn.sessionId!;

  for (let index = 0; index < childCount; index += 1) {
    const childSessionId = `ask-data-child-${index + 1}`;
    store.appendAskDataEvent(runId, {
      type: "subagent_exposed",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        agentId: "ask-data",
        sessionId: childSessionId,
        subagentId: `ask-data-subagent-${index + 1}`,
        label: `问数智能体 ${index + 1}`
      }
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: {
        columns: ["咨询对象", "咨询量"],
        rows:
          index === 0
            ? [
                ["小治", 456],
                ["Senrun", 93]
              ]
            : [
                ["合同咨询", 32],
                ["物业咨询", 18]
              ],
        totalRows: 2
      }
    });
    store.appendAskDataEvent(runId, {
      type: "done",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: rootSessionId,
      parentSessionId: rootSessionId,
      chatId: turn.chatId,
      content: { mode: "ask" }
    });
  }
  store.appendAskDataEvent(runId, {
    type: "text",
    agentName: "编排智能体",
    sessionId: rootSessionId,
    globalSessionId: rootSessionId,
    chatId: turn.chatId,
    content:
      "| 咨询对象 | 咨询量 |\n| --- | ---: |\n| 小治 | 456 |\n| Senrun | 93 |"
  });
  store.appendAskDataEvent(runId, {
    type: "done",
    agentName: "编排智能体",
    sessionId: rootSessionId,
    globalSessionId: rootSessionId,
    chatId: turn.chatId,
    content: { mode: "agent", adaptiveTeam: true },
    finished: true
  });
}

function seedAgentAskChildResult(childCount = 1) {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun("统计咨询对象排名", null, "agent");
  appendAgentAskChildEvents(runId, childCount);
}

function seedRatioResult() {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun("每个收入人群占比多少");
  appendRatioTable(runId);
  store.completeAskDataRun(runId);
}

describe("AI chart actions", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("automatically uses the DataHub orchestrator model when a completed answer is chartable", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          message: "ok",
          data: {
            chartable: true,
            reason: "包含收入人群维度和占比数值，适合饼图。",
            chartType: "pie",
            allowedTypes: ["pie", "bar"],
            title: "收入人群占比",
            tableIndex: 0,
            dimensionKey: "income_group",
            metricKeys: ["ratio"]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("每个收入人群占比多少");
    renderPage(<AnalysisPage mode="ask" />);

    act(() => {
      appendRatioTable(runId);
      store.completeAskDataRun(runId);
    });

    expect(await screen.findByText("收入人群占比")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能图表建议" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/chat/chart-plan",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"question":"每个收入人群占比多少"')
      })
    );
  });

  it("does not auto-plan a chart for a completed scalar answer", () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("咨询总数是多少");
    renderPage(<AnalysisPage mode="ask" />);

    act(() => {
      store.appendAskDataEvent(runId, {
        type: "table",
        data: {
          columns: [{ name: "count", title: "咨询总数", type: "number" }],
          rows: [{ count: 716 }],
          totalRows: 1,
          source: "cube"
        }
      });
      store.completeAskDataRun(runId);
    });

    expect(screen.getByRole("cell", { name: "716" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "智能图表建议" })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("generates an ECharts card from the latest ask-data table", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          message: "ok",
          data: {
            chartable: true,
            reason: "有收入人群维度和占比数值，适合饼图。",
            chartType: "pie",
            allowedTypes: ["pie", "bar"],
            title: "收入人群占比",
            tableIndex: 0,
            dimensionKey: "income_group",
            metricKeys: ["ratio"]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    seedRatioResult();
    renderPage(<AnalysisPage mode="ask" />);

    await user.click(screen.getByRole("button", { name: "AI 生成图表" }));

    const chartCard = await screen.findByRole("region", { name: "智能图表建议" });
    expect(within(chartCard).getByText("收入人群占比")).toBeInTheDocument();
    expect(
      within(chartCard).getByRole("img", { name: /收入人群占比.*有收入人群维度和占比数值/ })
    ).toBeInTheDocument();
    expect(within(chartCard).getByRole("radio", { name: "柱状" })).toBeInTheDocument();

    await user.click(within(chartCard).getByText("查看数据"));
    const sourceTable = within(chartCard).getByRole("table", { name: "收入人群占比数据" });
    expect(within(sourceTable).getByRole("columnheader", { name: "收入人群" })).toHaveAttribute("scope", "col");
    expect(within(sourceTable).getByRole("cell", { name: "中收入" })).toBeInTheDocument();
    expect(within(sourceTable).getByRole("cell", { name: "50" })).toBeInTheDocument();
  });

  it("generates a chart from the structured ask-data child in agent mode", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          message: "ok",
          data: {
            chartable: true,
            reason: "包含咨询对象维度和咨询量指标，适合柱状图。",
            chartType: "bar",
            allowedTypes: ["bar", "pie"],
            title: "咨询对象排名",
            tableIndex: 0,
            dimensionKey: "咨询对象",
            metricKeys: ["咨询量"]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("统计咨询对象排名", null, "agent");
    renderPage(<AnalysisPage mode="agent" />);

    act(() => {
      appendAgentAskChildEvents(runId);
      store.completeAskDataRun(runId);
    });

    await screen.findByText("咨询对象排名");
    const chartCard = screen.getByRole("region", { name: "智能图表建议" });
    expect(within(chartCard).getByText("咨询对象排名")).toBeInTheDocument();

    const request = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body)
    ) as {
      question: string;
      tables: Array<{
        totalRows: number;
        sampleRows: Array<Record<string, unknown>>;
      }>;
    };
    expect(request).toMatchObject({
      question: "统计咨询对象排名",
      tables: [
        {
          totalRows: 2,
          sampleRows: [
            { 咨询对象: "小治", 咨询量: 456 },
            { 咨询对象: "Senrun", 咨询量: 93 }
          ]
        }
      ]
    });
  });

  it("keeps chart generation available after replaying the same agent history", () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    seedAgentAskChildResult();
    const turn = useUiStore.getState().analysisTurns[0];

    useUiStore.getState().restoreAskDataHistory({
      sessionId: turn.sessionId!,
      question: turn.question,
      chatMode: "agent",
      status: "done",
      events: turn.events
    });
    renderPage(<AnalysisPage mode="agent" />);

    expect(
      screen.getByRole("button", { name: "AI 生成图表" })
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not merge tables from multiple ask-data child sessions", () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("统计咨询对象排名", null, "agent");
    renderPage(<AnalysisPage mode="agent" />);

    act(() => {
      appendAgentAskChildEvents(runId, 2);
      store.completeAskDataRun(runId);
    });

    expect(
      screen.queryByRole("button", { name: "AI 生成图表" })
    ).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows which result table AI used when multiple tables are available", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          message: "ok",
          data: {
            chartable: true,
            reason: "第二张表包含咨询类型分布。",
            chartType: "bar",
            allowedTypes: ["bar"],
            title: "咨询类型分布",
            tableIndex: 1,
            dimensionKey: "name",
            metricKeys: ["count"]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const store = useUiStore.getState();
    const runId = store.startAskDataRun("按不同维度统计咨询");
    store.appendAskDataEvent(runId, {
      type: "table",
      data: {
        columns: [
          { name: "name", title: "项目名称" },
          { name: "count", title: "记录数", type: "number" }
        ],
        rows: [
          { name: "演示账号", count: 718 },
          { name: "六角井社区", count: 264 }
        ],
        totalRows: 2,
        source: "cube"
      }
    });
    store.appendAskDataEvent(runId, {
      type: "table",
      data: {
        columns: [
          { name: "name", title: "咨询类型" },
          { name: "count", title: "记录数", type: "number" }
        ],
        rows: [
          { name: "物业咨询", count: 18 },
          { name: "民生咨询", count: 12 }
        ],
        totalRows: 2,
        source: "cube"
      }
    });
    store.completeAskDataRun(runId);
    renderPage(<AnalysisPage mode="ask" />);

    await user.click(screen.getByRole("button", { name: "AI 生成图表" }));

    const chartCard = await screen.findByRole("region", { name: "智能图表建议" });
    expect(within(chartCard).getByText("来源：结果表 2")).toBeInTheDocument();
    expect(within(chartCard).getByText("咨询类型分布")).toBeInTheDocument();
  });

});
