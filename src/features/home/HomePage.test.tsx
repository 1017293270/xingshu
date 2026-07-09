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
    expect(screen.getByRole("heading", { name: /您好，张三/ })).toBeInTheDocument();
    expect(screen.getByText("我是您的数据管家，有什么可以帮您？")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "命令输入" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "推荐应用" })).toBeInTheDocument();
  });

  it("renders the full seven-card recommended app set", () => {
    const { container } = renderHomePage();

    const expectedApps = ["智能问数", "知识问答", "文档助手", "报表生成", "智能写作", "会议纪要", "更多应用"];

    for (const appName of expectedApps) {
      expect(screen.getByRole("button", { name: new RegExp(`选择 ${appName}`) })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `打开 ${appName}` })).toBeInTheDocument();
    }

    const iconSrcs = Array.from(
      container.querySelectorAll<HTMLImageElement>('.xs-app-card [data-icon-source="xingshu-home-apps-image2-v1"]')
    ).map((icon) => icon.src);

    expect(iconSrcs).toHaveLength(7);
    expect(iconSrcs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("app-data-chat.png"),
        expect.stringContaining("app-knowledge-qa.png"),
        expect.stringContaining("app-document-assistant.png"),
        expect.stringContaining("app-report-generation.png"),
        expect.stringContaining("app-writing.png"),
        expect.stringContaining("app-meeting-minutes.png"),
        expect.stringContaining("app-more-apps.png")
      ])
    );
  });

  it("writes an app prompt into the command box when an app card is selected", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: /^选择 智能问数/ }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue(
      "帮我分析本月经营数据，并生成趋势图表"
    );
    expect(screen.getByRole("status")).toHaveTextContent("已选择：智能问数");
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

    expect(screen.getByRole("status")).toHaveTextContent("已提交问数：生成经营日报");
  });

  it("shows feedback for the command box voice action", async () => {
    const user = userEvent.setup();
    renderHomePage();

    expect(screen.queryByRole("button", { name: "附件" })).not.toBeInTheDocument();
    expect(screen.queryByText("企业数据、文档、看板与 Agent 应用统一入口")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByRole("status")).toHaveTextContent("已准备语音输入");
  });
});
