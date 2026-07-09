import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { XsChartCard } from "./XsChartCard";

const table = {
  columns: [
    { key: "month", title: "月份" },
    { key: "revenue", title: "收入" }
  ],
  rows: [
    { month: "6 月", revenue: 120 },
    { month: "7 月", revenue: null }
  ],
  totalRows: 2,
  groupLabel: "月度收入"
};

describe("XsChartCard", () => {
  it("includes the trend summary in the chart accessible name", () => {
    render(
      <XsChartCard
        title="收入趋势"
        summary="7 月收入较 6 月增长 12%"
        option={{ series: [{ type: "line", data: [120, 134] }] }}
        table={table}
      />
    );

    expect(screen.getByRole("heading", { name: "收入趋势" })).toBeVisible();
    expect(screen.getByText("7 月收入较 6 月增长 12%")).toBeVisible();
    expect(screen.getByRole("img", { name: /收入趋势.*7 月收入较 6 月增长 12%/ })).toBeVisible();
  });

  it("exposes the source data through a semantic disclosure table", async () => {
    const user = userEvent.setup();
    render(
      <XsChartCard
        title="收入趋势"
        summary="7 月收入较 6 月增长 12%"
        option={{ series: [{ type: "line", data: [120, 134] }] }}
        table={table}
      />
    );

    const disclosure = screen.getByText("查看数据").closest("details");
    expect(disclosure).not.toHaveAttribute("open");

    await user.click(screen.getByText("查看数据"));

    expect(disclosure).toHaveAttribute("open");
    const dataTable = screen.getByRole("table", { name: "收入趋势数据" });
    expect(within(dataTable).getByRole("columnheader", { name: "月份" })).toHaveAttribute(
      "scope",
      "col"
    );
    expect(within(dataTable).getByRole("columnheader", { name: "收入" })).toHaveAttribute(
      "scope",
      "col"
    );
    expect(within(dataTable).getByRole("cell", { name: "6 月" })).toBeVisible();
    expect(within(dataTable).getByRole("cell", { name: "120" })).toBeVisible();
    expect(within(dataTable).getByRole("cell", { name: "—" })).toBeVisible();
  });

  it("opens a focused full-screen chart view and closes it", async () => {
    const user = userEvent.setup();
    render(
      <XsChartCard
        title="收入趋势"
        summary="7 月收入较 6 月增长 12%"
        option={{ series: [{ type: "line", data: [120, 134] }] }}
        table={table}
      />
    );

    await user.click(screen.getByRole("button", { name: "全屏查看收入趋势" }));
    expect(screen.getByRole("dialog", { name: "收入趋势全屏图表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭全屏图表" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "关闭全屏图表" }));
    expect(screen.queryByRole("dialog", { name: "收入趋势全屏图表" })).not.toBeInTheDocument();
  });

  it("labels a sampled source table without implying that every row is rendered", async () => {
    const user = userEvent.setup();
    render(
      <XsChartCard
        title="收入趋势"
        summary="展示抽样结果"
        option={{ series: [] }}
        table={{ ...table, totalRows: 100 }}
      />
    );

    await user.click(screen.getByText("查看数据"));
    expect(screen.getByRole("table", { name: "收入趋势数据（前 2 行，共 100 行）" })).toBeInTheDocument();
  });
});
