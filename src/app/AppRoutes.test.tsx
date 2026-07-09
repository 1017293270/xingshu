import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./providers";
import { AppRoutes } from "./AppRoutes";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";

function renderRoute(path: string, options: { authenticated?: boolean } = {}) {
  const authenticated = options.authenticated ?? true;

  localStorage.clear();
  useUiStore.getState().resetUiState();
  useDataHubAuthStore.getState().clearAuthState();

  if (authenticated) {
    useDataHubAuthStore.getState().setAuth({
      token: "test-token",
      userId: 1,
      username: "zhangsan",
      isAdmin: false
    });
    useDataHubAuthStore.getState().setCurrentSpaceId(7);
  }

  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("AppRoutes", () => {
  it.each([
    ["/", "您好，张三", "推荐应用"],
    ["/history", "历史对话", "历史对话列表"],
    ["/table", "智能制表", "最近制表"],
    ["/writing", "智能写作", "推荐写作场景"],
    ["/dashboard", "我的看板", "经营分析看板"],
    ["/dashboard-editor", "看板编辑器", "看板编辑器工作区"],
    ["/welcome", "欢迎来到星数", "星数欢迎页"],
    ["/login", "可信数据智能入口", "星数登录页"],
    ["/cloud", "我的云盘", "我的云盘内容"],
    ["/data-dashboard", "数据资产看板", "数据资产指标"],
    ["/data-management", "数据资产管理", "知识库列表"]
  ])("renders %s", async (path, heading, landmark) => {
    renderRoute(path, { authenticated: !["/welcome", "/login"].includes(path) });

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByLabelText(landmark)).toBeInTheDocument();
  });

  it("opens analysis as a blank ask-data workspace before the user asks", async () => {
    renderRoute("/analysis");

    expect(await screen.findByLabelText("空白问数工作区")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "命令输入" })).toBeInTheDocument();
    expect(screen.queryByLabelText("用户提问")).not.toBeInTheDocument();
  });

  it("redirects protected app routes to login when no data-hub session exists", async () => {
    renderRoute("/", { authenticated: false });

    expect(await screen.findByRole("heading", { name: "可信数据智能入口" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /您好，张三/ })).not.toBeInTheDocument();
  });

  it("keeps the shared sidebar on routed pages", async () => {
    const { container } = renderRoute("/dashboard");

    expect(await screen.findByRole("navigation", { name: "星数主导航" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "星数" })).toHaveAttribute(
      "src",
      expect.stringContaining("xingshu-logo-transparent.png")
    );
    expect(screen.getByRole("link", { name: /数据资产管理/ })).toHaveAttribute("href", "/data-management");
    expect(container.querySelectorAll(".xs-sidebar__nav .xs-icon-tile svg")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "新建对话" }).querySelector("svg")).toBeInTheDocument();
  });

  it("uses the unified image2 icon kit on the welcome capability cards", async () => {
    const { container } = renderRoute("/welcome");

    expect(await screen.findByRole("heading", { name: "欢迎来到星数" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-icon-source="image2"]')).toHaveLength(2);

    const kitIconSrcs = Array.from(
      container.querySelectorAll<HTMLImageElement>('[data-icon-source="xingshu-image2-v1"]')
    ).map((icon) => icon.src);

    expect(kitIconSrcs).toHaveLength(3);
    expect(kitIconSrcs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("icon-data-question-analytics.png"),
        expect.stringContaining("icon-intelligent-writing.png"),
        expect.stringContaining("icon-business-dashboard.png")
      ])
    );
  });

  it("starts an agent analysis from the home command box", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "分析本月经营数据");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("heading", { name: "问数完成" })).toBeInTheDocument();
    expect(screen.getByText("分析本月经营数据")).toBeInTheDocument();
  });

  it("opens the target feature from a recommended app arrow", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.click(screen.getByRole("button", { name: "打开 智能问数" }));

    expect(await screen.findByRole("heading", { name: "问数完成" })).toBeInTheDocument();
    expect(screen.getByText("帮我分析本月经营数据，并生成趋势图表")).toBeInTheDocument();
  });

  it("logs out from the sidebar account menu", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.click(screen.getByRole("button", { name: /账户菜单/ }));
    await user.click(await screen.findByText("退出登录"));

    expect(await screen.findByRole("heading", { name: "可信数据智能入口" })).toBeInTheDocument();
  });

  it("submits a table generation prompt through the mock service", async () => {
    const user = userEvent.setup();
    renderRoute("/table");

    await user.clear(screen.getByRole("textbox", { name: "制表需求" }));
    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成华南区客户销售排行");
    await user.click(screen.getByRole("button", { name: /生成/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("已提交制表需求：生成华南区客户销售排行");
  });

  it("submits a writing prompt through the mock service", async () => {
    const user = userEvent.setup();
    renderRoute("/writing");

    await user.clear(screen.getByRole("textbox", { name: "写作需求" }));
    await user.type(screen.getByRole("textbox", { name: "写作需求" }), "写一份数据资产月报");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("status")).toHaveTextContent("已提交写作需求：写一份数据资产月报");
  });

  it("opens data asset management from the data dashboard", async () => {
    const user = userEvent.setup();
    renderRoute("/data-dashboard");

    await user.click(screen.getByRole("link", { name: "管理数据资产" }));

    expect(await screen.findByRole("heading", { name: "数据资产管理" })).toBeInTheDocument();
  });

  it("opens the embedded dashboard editor from the dashboard page", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click(await screen.findByRole("button", { name: "编辑" }));

    expect(await screen.findByRole("heading", { name: "看板编辑器" })).toBeInTheDocument();
    expect(screen.getByTitle("看板编辑器子应用")).toHaveAttribute(
      "src",
      expect.stringContaining("/workbenches")
    );
  });

  it("filters knowledge bases in data asset management", async () => {
    const user = userEvent.setup();
    renderRoute("/data-management");

    await user.type(screen.getByRole("searchbox", { name: "知识库搜索" }), "财务");

    expect(await screen.findByRole("status")).toHaveTextContent("已筛选 1 个知识库");
    expect(screen.getByText("财务审计知识库")).toBeInTheDocument();
    expect(screen.queryByText("企业制度文档库")).not.toBeInTheDocument();
  });
});
