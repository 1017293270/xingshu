import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { HomePage } from "./HomePage";

function renderHomePage() {
  useUiStore.getState().resetUiState();

  return render(
    <AppProviders>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("HomePage", () => {
  it("renders the required enterprise agent entry structure", () => {
    renderHomePage();

    const navigation = screen.getByRole("navigation", { name: "星数主导航" });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建对话" })).toBeInTheDocument();
    expect(within(navigation).getByText("历史对话")).toBeInTheDocument();
    expect(within(navigation).getByText("智能制表")).toBeInTheDocument();
    expect(within(navigation).getByText("智能写作")).toBeInTheDocument();
    expect(within(navigation).getByText("我的看板")).toBeInTheDocument();
    expect(within(navigation).getByText("我的云盘")).toBeInTheDocument();
    expect(within(navigation).getByText("数据资产看板")).toBeInTheDocument();
    expect(within(navigation).getByText("数据资产管理")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "您好，张三" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "命令输入" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "推荐应用" })).toBeInTheDocument();
  });

  it("writes an app prompt into the command box when an app card is selected", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: /智能问数/ }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue(
      "帮我分析本月经营数据，并生成趋势图表"
    );
  });

  it("clears the draft when starting a new chat", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "查看销售数据");
    await user.click(screen.getByRole("button", { name: "新建对话" }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue("");
  });

  it("expands and collapses the more navigation group", async () => {
    const user = userEvent.setup();
    renderHomePage();
    const navigation = screen.getByRole("navigation", { name: "星数主导航" });

    await user.click(screen.getByRole("button", { name: "更多" }));
    expect(within(navigation).queryByText("数据资产看板")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更多" }));
    expect(within(navigation).getByText("数据资产看板")).toBeInTheDocument();
  });

  it("shows a sent status after submitting a command", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "生成经营日报");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByRole("status")).toHaveTextContent("已发送：生成经营日报");
  });

  it("shows feedback for command box attachment and voice actions", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: "附件" }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开附件选择");

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByRole("status")).toHaveTextContent("已准备语音输入");
  });
});
