import { existsSync, readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import { AppProviders } from "@/app/providers";
import { XsShell } from "@/components/xs";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";
import { HomePage } from "./HomePage";

function CurrentLocation() {
  const location = useLocation();
  return <div aria-label="当前应用路径">{`${location.pathname}${location.search}`}</div>;
}

function HomeWorkspaceFixture() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const clearHomeConversation = useUiStore((state) => state.clearHomeConversation);

  return (
    <XsShell
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebarCollapsed={toggleSidebarCollapsed}
      onNewChat={clearHomeConversation}
    >
      <HomePage />
      <CurrentLocation />
    </XsShell>
  );
}

function renderHomePage(username = "张三") {
  useUiStore.getState().resetUiState();
  useDataHubAuthStore.getState().setAuth({
    token: "home-test-token",
    userId: 1,
    username,
    isAdmin: false
  });

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

  it("keeps programmatic route focus from drawing a full-width frame around page headings", () => {
    const xsCss = readFileSync("src/components/xs/xs.css", "utf8").replaceAll("\r\n", "\n");

    expect(xsCss).toMatch(
      /\.xs-shell__main h1\[tabindex="-1"\]:focus \{[\s\S]*?outline: none;[\s\S]*?box-shadow: none;/
    );
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
    expect(screen.getByRole("button", { name: "选择模型，当前编排模型" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "推荐应用" })).toBeInTheDocument();
  });

  it("uses the colorful recommended app icons and exposes selection state", async () => {
    const user = userEvent.setup();
    const { container } = renderHomePage();

    const expectedApps = ["智能问数", "知识问答", "文档助手", "报表生成", "智能写作", "会议纪要", "更多应用"];

    for (const appName of expectedApps) {
      expect(screen.getByRole("button", { name: new RegExp(`打开 ${appName}`) })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      expect(screen.getByRole("button", { name: `进入 ${appName}` })).toBeInTheDocument();
    }

    expect(screen.queryByText("👋")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-icon-source="xingshu-home-apps-image2-v1"]')).toHaveLength(7);
    expect(container.querySelectorAll(".xs-app-card .xs-icon-tile svg")).toHaveLength(0);

    const dataChatButton = screen.getByRole("button", { name: /打开 智能问数/ });
    await user.click(dataChatButton);
    expect(dataChatButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "选择模型，当前问数模型" })).toBeInTheDocument();
    expect(screen.queryByText("已切换为问数模型")).not.toBeInTheDocument();
    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/ask-data");
  });

  it("uses the authenticated username in the greeting", () => {
    renderHomePage("李四");

    expect(screen.getByRole("heading", { name: "您好，李四" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "您好，张三" })).not.toBeInTheDocument();
  });

  it("keeps the command toolbar clean without hints or quick-prompt dividers", () => {
    renderHomePage();
    const homeCss = readFileSync("src/features/home/home.css", "utf8").replaceAll("\r\n", "\n");

    expect(screen.queryByRole("group", { name: "快捷问题" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ctrl/⌘ + Enter 发送")).not.toBeInTheDocument();
    expect(homeCss).toMatch(
      /\.home-page \.xs-command-box__input:focus-visible \{[\s\S]*?box-shadow: none;/
    );
    expect(homeCss).toMatch(
      /\.home-page \.xs-command-box__toolbar \{[\s\S]*?border-top: 0 !important;/
    );
    expect(homeCss).toMatch(
      /\.home-page \.xs-command-box__send\.ant-btn \{[\s\S]*?background: #176ff2;/
    );
  });

  it("opens the ask workspace from the full card and selects its model", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: /^打开 智能问数/ }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue(
      "帮我分析本月经营数据，并生成趋势图表"
    );
    expect(screen.queryByText("已切换为问数模型")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择模型，当前问数模型" })).toBeInTheDocument();
    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/ask-data");
    expect(useUiStore.getState().homeChatMode).toBe("ask");
  });

  it.each([
    ["文档助手", "/cloud"],
    ["报表生成", "/dashboard"],
    ["智能写作", "/writing"],
    ["会议纪要", "/writing"],
    ["更多应用", "/data-dashboard"]
  ])("routes %s to its product workspace", async (appName, expectedPath) => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: new RegExp(`^打开 ${appName}`) }));

    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent(expectedPath);
  });

  it("opens the knowledge workspace and selects the knowledge model", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: /^打开 知识问答/ }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue(
      "帮我查询最新销售政策中的重点变化"
    );
    expect(screen.getByRole("button", { name: "选择模型，当前问知模型" })).toBeInTheDocument();
    expect(screen.queryByText("已切换为问知模型")).not.toBeInTheDocument();
    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/ask-knowledge");
    expect(useUiStore.getState().homeChatMode).toBe("rag");
  });

  it("clears the draft when starting a new chat", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "查看销售数据");
    await user.click(screen.getByRole("button", { name: "新建对话" }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue("");
  });

  it("collapses and expands the desktop sidebar rail", async () => {
    const user = userEvent.setup();
    const { container } = renderHomePage();

    expect(screen.getByRole("navigation", { name: "星数主导航" })).toBeInTheDocument();
    expect(container.querySelector(".xs-shell--sidebar-collapsed")).toBeNull();
    expect(container.querySelector(".xs-sidebar--collapsed")).toBeNull();

    await user.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(container.querySelector(".xs-shell--sidebar-collapsed")).toBeTruthy();
    expect(container.querySelector(".xs-sidebar--collapsed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(container.querySelector(".xs-shell--sidebar-collapsed")).toBeNull();
    expect(container.querySelector(".xs-sidebar--collapsed")).toBeNull();
    expect(screen.getByRole("button", { name: "收起侧边栏" })).toBeInTheDocument();
  });

  it("submits a command with Enter", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const commandInput = screen.getByRole("textbox", { name: "命令输入" });
    expect(commandInput).toHaveAttribute("aria-keyshortcuts", "Enter");

    await user.type(commandInput, "生成经营日报{Enter}");

    expect(screen.getByRole("status")).toHaveTextContent("已提交智能编排：生成经营日报");
    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/ask-agent");
    expect(useUiStore.getState().analysisTurns.at(-1)?.chatMode).toBe("agent");
  });

  it("routes recommended ask and knowledge entries without starting a conversation", async () => {
    const user = userEvent.setup();
    const { unmount } = renderHomePage();

    await user.click(screen.getByRole("button", { name: /^打开 智能问数/ }));
    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/ask-data");
    expect(useUiStore.getState().homeChatMode).toBe("ask");
    expect(useUiStore.getState().analysisTurns).toHaveLength(0);

    unmount();
    renderHomePage();
    await user.click(screen.getByRole("button", { name: /^打开 知识问答/ }));
    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/ask-knowledge");
    expect(useUiStore.getState().homeChatMode).toBe("rag");
    expect(useUiStore.getState().analysisTurns).toHaveLength(0);
  });

  it("routes a manually selected document model to the document lookup workspace", async () => {
    const user = userEvent.setup();
    renderHomePage();

    await user.click(screen.getByRole("button", { name: "选择模型，当前编排模型" }));
    await user.click(screen.getByRole("menuitem", { name: /找文档模型/ }));
    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "帮我找最新版员工手册");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByLabelText("当前应用路径")).toHaveTextContent("/document-lookup");
    expect(useUiStore.getState().analysisTurns.at(-1)?.chatMode).toBe("document_lookup");
  });

  it("hides upload and reports unsupported voice input", async () => {
    const user = userEvent.setup();
    renderHomePage();

    expect(screen.queryByRole("button", { name: "附件" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("添加附件")).not.toBeInTheDocument();
    expect(screen.queryByText("企业数据、文档、看板与 Agent 应用统一入口")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByRole("status")).toHaveTextContent("当前浏览器不支持语音输入");
  });
});
