import { existsSync, readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { XsShell } from "@/components/xs";
import { useUiStore } from "@/stores/uiStore";
import { HomePage } from "./HomePage";

function HomeWorkspaceFixture() {
  const isMoreOpen = useUiStore((state) => state.isMoreOpen);
  const toggleMore = useUiStore((state) => state.toggleMore);
  const clearHomeConversation = useUiStore((state) => state.clearHomeConversation);

  return (
    <XsShell isMoreOpen={isMoreOpen} onToggleMore={toggleMore} onNewChat={clearHomeConversation}>
      <HomePage />
    </XsShell>
  );
}

function renderHomePage() {
  useUiStore.getState().resetUiState();

  return render(
    <AppProviders>
      <MemoryRouter>
        <HomeWorkspaceFixture />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("HomePage", () => {
  it("keeps runtime brand PNG assets in an auditable registry", () => {
    const registryPath = "src/assets/iconRegistry.ts";

    expect(existsSync(registryPath)).toBe(true);
    const registrySource = readFileSync(registryPath, "utf8");
    expect(registrySource).toContain("assetPath");
    expect(registrySource).toContain("sourcePath");
    expect(registrySource).toContain("allowedWidthsPx");
    expect(registrySource).toContain("pages");
    expect(registrySource).toContain("xingshu-logo");
    expect(registrySource).toContain("assistant-mark");
  });

  it("removes card movement when reduced motion is requested", () => {
    const xsCss = readFileSync("src/components/xs/xs.css", "utf8").replaceAll("\r\n", "\n");

    expect(xsCss).toContain(
      "@media (prefers-reduced-motion: reduce) {\n  .xs-app-card:hover,\n  .xs-app-card--selected"
    );
    expect(xsCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.xs-app-card[\s\S]*?transform: none;/);
  });

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

  it("uses the linear XingShu icon system and exposes selection state", async () => {
    const user = userEvent.setup();
    const { container } = renderHomePage();

    const expectedApps = ["智能问数", "知识问答", "文档助手", "报表生成", "智能写作", "会议纪要", "更多应用"];

    for (const appName of expectedApps) {
      expect(screen.getByRole("button", { name: new RegExp(`选择 ${appName}`) })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      expect(screen.getByRole("button", { name: `打开 ${appName}` })).toBeInTheDocument();
    }

    expect(screen.queryByText("👋")).not.toBeInTheDocument();
    expect(container.querySelector('[data-icon-source="xingshu-home-apps-image2-v1"]')).toBeNull();
    expect(container.querySelectorAll(".xs-app-card .xs-icon-tile svg")).toHaveLength(7);

    const dataChatButton = screen.getByRole("button", { name: /选择 智能问数/ });
    await user.click(dataChatButton);
    expect(dataChatButton).toHaveAttribute("aria-pressed", "true");
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

  it("accepts attachments and reports unsupported voice input", async () => {
    const user = userEvent.setup();
    renderHomePage();

    expect(screen.getByRole("button", { name: "附件" })).toBeInTheDocument();
    expect(screen.queryByText("企业数据、文档、看板与 Agent 应用统一入口")).not.toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("添加附件"),
      new File(["经营数据"], "经营日报.txt", { type: "text/plain" })
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 个附件已加入本地队列，尚未上传");
    expect(screen.getByRole("list", { name: "附件队列" })).toHaveTextContent("经营日报.txt");

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByRole("status")).toHaveTextContent("当前浏览器不支持语音输入");
  });
});
