import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { HistoryPage } from "./HistoryPage";

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

describe("HistoryPage", () => {
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

    await user.click(screen.getByRole("button", { name: "数据洞察" }));

    const historyList = screen.getByRole("region", { name: "历史对话列表" });
    expect(within(historyList).getByRole("heading", { name: "Q2销售业绩分析" })).toBeInTheDocument();
    expect(within(historyList).getByRole("heading", { name: "库存周转率分析" })).toBeInTheDocument();
    expect(within(historyList).queryByRole("heading", { name: "员工报销流程说明" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 2 条历史对话");

    await user.click(screen.getByRole("button", { name: "文档处理" }));

    expect(within(historyList).queryByRole("heading", { name: "Q2销售业绩分析" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 0 条历史对话");

    await user.click(screen.getByRole("button", { name: "全部" }));

    expect(await within(historyList).findByRole("heading", { name: "员工报销流程说明" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已筛选 5 条历史对话");
  });

  it("restores a selected history conversation", async () => {
    const user = userEvent.setup();
    renderHistoryPage();

    await user.click(await screen.findByRole("button", { name: /员工报销流程说明/ }));

    expect(screen.getByRole("status")).toHaveTextContent("已恢复历史对话：员工报销流程说明");
  });
});
