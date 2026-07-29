import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

function seedRatioResult() {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun("每个收入人群占比多少");
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
  store.completeAskDataRun(runId);
}

describe("AI chart actions", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the DataHub orchestrator model without a local AI configuration", async () => {
    const user = userEvent.setup();
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
    seedRatioResult();
    renderPage(<AnalysisPage />);

    await user.click(screen.getByRole("button", { name: "AI 生成图表" }));

    expect(await screen.findByRole("region", { name: "智能图表建议" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/chat/chart-plan",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"question":"每个收入人群占比多少"')
      })
    );
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
    renderPage(<AnalysisPage />);

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
    renderPage(<AnalysisPage />);

    await user.click(screen.getByRole("button", { name: "AI 生成图表" }));

    const chartCard = await screen.findByRole("region", { name: "智能图表建议" });
    expect(within(chartCard).getByText("来源：结果表 2")).toBeInTheDocument();
    expect(within(chartCard).getByText("咨询类型分布")).toBeInTheDocument();
  });

});
