import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";

vi.mock("@/components/xs/XsEChart", () => ({
  XsEChart: ({ label, summary, option }: { label: string; summary?: string; option: unknown }) => (
    <div role="img" aria-label={[label, summary].filter(Boolean).join("，")} data-option={JSON.stringify(option)} />
  )
}));

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

function appendAgentAskChildEvents(runId: string, childCount = 1, answer = "| 咨询对象 | 咨询量 |\n| --- | ---: |\n| 小治 | 456 |\n| Senrun | 93 |") {
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
    content: answer
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

describe("AI chart actions", () => {
  it("pages dense comparisons without aggregating records and can isolate a small metric", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 200, message: "ok", data: {
      chartable: true, reason: "比较已返回的两项金额", chartType: "bar", allowedTypes: ["bar"],
      title: "合同金额对比", tableIndex: 0, dimensionKey: "company", metricKeys: ["amount", "received"]
    } })));
    const rows = Array.from({ length: 50 }, (_, index) => ({
      company: `示例企业${Math.floor(index / 2) + 1}有限公司`, amount: 50_000_000 - index * 100_000,
      received: index === 0 ? null : index * 1000
    }));
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("比较合同金额和到账金额", null, "ask");
    renderPage(<AnalysisPage mode="ask" />);
    act(() => {
      store.appendAskDataEvent(runId, { type: "table", content: {
        columns: [{ name: "company", title: "合同乙方" }, { name: "amount", title: "合同总金额", type: "number" },
          { name: "received", title: "总贷方发生额", type: "number" }], rows, totalRows: 50, source: "cube"
      } });
      store.completeAskDataRun(runId);
    });
    await screen.findByText("合同金额对比");
    const card = screen.getByRole("region", { name: "智能图表建议" });
    const option = () => JSON.parse(within(card).getByRole("img").getAttribute("data-option")!);
    expect(card).toHaveTextContent("当前显示第 1–8 条");
    expect(card).toHaveTextContent("同名记录未合并");
    expect(option().series[0].data).toEqual(rows.slice(0, 8).map((row) => row.amount));
    expect(option().series[1].data[0]).toBeNull();
    await user.click(within(card).getByText("总贷方发生额", { exact: true }));
    expect(option().series).toHaveLength(1);
    expect(option().series[0].data).toEqual(rows.slice(0, 8).map((row) => row.received));
    for (let group = 1; group < 7; group++) await user.click(within(card).getByRole("button", { name: "下一组" }));
    expect(card).toHaveTextContent("当前显示第 49–50 条");
    expect(option().series[0].data).toEqual([48000, 49000]);
    expect(within(card).getByRole("button", { name: "下一组" })).toBeDisabled();
    await user.click(within(card).getByText("表格", { exact: true }));
    expect(card).toHaveTextContent("已返回 50 行");
    expect(within(card).getByRole("columnheader", { name: "合同乙方" })).toHaveAttribute("scope", "col");
  });

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

  it("keeps non-chartable results silent", async () => {
    const rationale =
      "问题'合同设备清单有哪些'本质上是列表查询/枚举类问题，需要返回的是合同明细记录本身而非分析对比。表格仅有 2-3 行记录，数据量过少，图表无法提供额外洞察。";
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ code: 200, message: "ok", data: { chartable: false, reason: rationale } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("合同设备清单有哪些");
    renderPage(<AnalysisPage mode="ask" />);

    act(() => {
      appendRatioTable(runId);
      store.completeAskDataRun(runId);
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "智能图表建议" })).not.toBeInTheDocument();
    expect(screen.queryByText(rationale)).not.toBeInTheDocument();
    expect(document.querySelector(".analysis-composer__status-slot")?.textContent ?? "")
      .not.toContain("暂不适合生成图表");
  });

  it("does not auto-plan a chart for a completed scalar answer", async () => {
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

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /展开结果表/ })).not.toBeInTheDocument();
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
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("每个收入人群占比多少");
    renderPage(<AnalysisPage mode="ask" />);

    act(() => {
      appendRatioTable(runId);
      store.completeAskDataRun(runId);
    });

    expect(await screen.findByText("收入人群占比")).toBeInTheDocument();
    const chartCard = screen.getByRole("region", { name: "智能图表建议" });
    expect(
      within(chartCard).getByRole("img", { name: "收入人群占比" })
    ).toBeInTheDocument();
    expect(within(chartCard).getByRole("radio", { name: "柱状" })).toBeInTheDocument();

    const pie = JSON.parse(within(chartCard).getByRole("img").getAttribute("data-option")!);
    expect(pie.series[0].data).toEqual([
      { name: "低收入", value: 25 }, { name: "中收入", value: 50 }, { name: "高收入", value: 25 }
    ]);
    await user.click(within(chartCard).getByText("柱状"));
    const bar = JSON.parse(within(chartCard).getByRole("img").getAttribute("data-option")!);
    expect(bar.series[0].data).toEqual([25, 50, 25]);
    await user.click(within(chartCard).getByText("表格"));
    expect(within(chartCard).queryByRole("img")).not.toBeInTheDocument();
    const sourceTable = within(chartCard).getByRole("table");
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
        title: string;
        totalRows: number;
        sampleRows: Array<Record<string, unknown>>;
      }>;
    };
    expect(request.question).toBe("统计咨询对象排名");
    expect(request.tables[0]).toMatchObject({
      totalRows: 2,
      sampleRows: [
        { 咨询对象: "小治", 咨询量: 456 },
        { 咨询对象: "Senrun", 咨询量: 93 }
      ]
    });
    // 正文里的排名一并送给规划模型，图表口径要跟正文对齐
    expect(request.tables[1]).toMatchObject({
      title: "结果表 2 - 回答中的排行表",
      totalRows: 2
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

    expect(screen.queryByRole("button", { name: "AI 生成图表" })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aligns the chart to the root ranking without merging unrelated child rows", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: 200, message: "ok", data: {
        chartable: true, chartType: "bar", allowedTypes: ["bar", "pie"], title: "最终咨询对象排名",
        tableIndex: 2, dimensionKey: "咨询对象", metricKeys: ["咨询量"]
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("统计咨询对象排名", null, "agent");
    renderPage(<AnalysisPage mode="agent" />);
    act(() => {
      appendAgentAskChildEvents(runId, 2);
      store.completeAskDataRun(runId);
    });
    await screen.findByRole("region", { name: "智能图表建议" });
    const request = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(request.tables.map((table: { totalRows: number }) => table.totalRows)).toEqual([2, 2, 2]);
    expect(request.tables[2].sampleRows).toEqual([
      { 咨询对象: "小治", 咨询量: "456" }, { 咨询对象: "Senrun", 咨询量: "93" }
    ]);
    const chartCard = screen.getByRole("region", { name: "智能图表建议" });
    const bar = JSON.parse(within(chartCard).getByRole("img").getAttribute("data-option")!);
    expect(bar.xAxis.data).toEqual(["小治", "Senrun"]);
    expect(bar.series[0].data).toEqual([456, 93]);
    await user.click(within(chartCard).getByText("表格"));
    const rows = within(chartCard).getAllByRole("row").slice(1).map((row) =>
      within(row).getAllByRole("cell").slice(1).map((cell) => cell.textContent)
    );
    expect(rows).toEqual([["小治", "456"], ["Senrun", "93"]]);
    expect(within(chartCard).queryByText("合同咨询")).not.toBeInTheDocument();
  });

  it("keeps all original query tables visible including the table used by the chart", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: 200, message: "ok", data: {
        chartable: true, chartType: "bar", allowedTypes: ["bar"], title: "咨询对象分布",
        tableIndex: 0, dimensionKey: "咨询对象", metricKeys: ["咨询量"]
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("分别查询咨询对象与咨询类型", null, "agent");
    renderPage(<AnalysisPage mode="agent" />);
    act(() => {
      appendAgentAskChildEvents(runId, 2, "");
      store.completeAskDataRun(runId);
    });
    await screen.findByRole("region", { name: "智能图表建议" });
    const result = within(screen.getByRole("region", { name: "分析结果" }));
    expect(result.queryByRole("table")).not.toBeInTheDocument();
    const query = screen.getByRole("region", { name: "查询过程" });
    const queryToggle = within(query).getByRole("button", { name: /查询过程/ });
    expect(queryToggle).toHaveAttribute("aria-expanded", "true");
    const tables = within(within(query).getByRole("region", { name: "查询结果" }));
    expect(tables.getAllByRole("table")).toHaveLength(2);
    expect(tables.getByRole("cell", { name: "合同咨询" })).toBeVisible();
    expect(tables.getByRole("cell", { name: "32" })).toBeVisible();
    expect(tables.getByRole("cell", { name: "小治" })).toBeVisible();
    expect(tables.getByRole("cell", { name: "456" })).toBeVisible();
    expect(tables.getAllByRole("button", { name: "下载表格" })).toHaveLength(2);
  });

  it("shows which result table AI used when multiple tables are available", async () => {
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
    renderPage(<AnalysisPage mode="ask" />);

    act(() => {
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
    });

    expect(await screen.findByText("来源：结果表 2")).toBeInTheDocument();
    const chartCard = screen.getByRole("region", { name: "智能图表建议" });
    expect(within(chartCard).getByText("咨询类型分布")).toBeInTheDocument();
  });

});
