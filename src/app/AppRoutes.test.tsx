import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "./providers";
import { AppRoutes, resolveRouteFallbackVariant } from "./AppRoutes";
import { expireDataHubSession } from "@/services/dataHubSession";
import * as dataAssetService from "@/services/dataAssetService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@/features/dashboardStudio/DashboardDesignerIsland", () => ({
  DashboardDesignerIsland: () => <div aria-label="星数大屏设计器">Vue 大屏工作区</div>
}));

const ROUTE_LOAD_TIMEOUT_MS = 4_000;

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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps routes to layout-matched loading fallbacks", () => {
    expect(resolveRouteFallbackVariant("/history")).toBe("rows");
    expect(resolveRouteFallbackVariant("/data-dashboard")).toBe("metrics");
    expect(resolveRouteFallbackVariant("/settings/ai")).toBe("cards");
    expect(resolveRouteFallbackVariant("/ask-data")).toBe("workspace");
    expect(resolveRouteFallbackVariant("/ask-knowledge")).toBe("workspace");
    expect(resolveRouteFallbackVariant("/document-lookup")).toBe("workspace");
    expect(resolveRouteFallbackVariant("/ask-agent")).toBe("workspace");
    expect(resolveRouteFallbackVariant("/dashboard-view")).toBe("fullscreen");
    expect(resolveRouteFallbackVariant("/writing")).toBe("cards");
    expect(resolveRouteFallbackVariant("/writing/templates/template-demo-work-report")).toBe("workspace");
    expect(resolveRouteFallbackVariant("/writing/drafts/draft-demo-1")).toBe("workspace");
  });

  const routeCases: Array<[string, string | RegExp, string]> = [
    ["/", "您好，zhangsan", "推荐应用"],
    ["/ask-data", "从一个经营问题开始", "空白问数工作区"],
    ["/ask-knowledge", "从一个企业知识问题开始", "空白问知工作区"],
    ["/document-lookup", "描述您要查找的企业文档", "空白找文档工作区"],
    ["/ask-agent", "从一个跨数据与知识的任务开始", "空白智能编排工作区"],
    ["/history", "历史对话", "历史对话列表"],
    ["/table", "智能制表", "最近制表"],
    ["/writing", "公文写作", "公文写作工作台"],
    ["/dashboard", "大屏库", "大屏库空状态"],
    ["/dashboard-editor", "看板编辑器", "看板编辑器工作区"],
    ["/welcome", "欢迎来到星数", "星数欢迎页"],
    ["/login", /让每一次问数.*都有据可依/, "星数登录页"],
    ["/cloud", "我的云盘", "我的云盘内容"],
    ["/data-dashboard", "数据资产看板", "数据资产指标"],
    ["/data-management", "数据资产管理", "知识库列表"]
  ];

  it.each(routeCases)("renders %s", async (path, heading, landmark) => {
    if (path === "/data-dashboard") {
      vi.spyOn(dataAssetService, "getDataAssetOverview").mockResolvedValue({
        updatedAt: "2026-08-11T08:00:00Z",
        range: "30D",
        kpis: {
          assetCount: 0,
          dataVolumeBytes: 0,
          unstructuredCount: 0,
          tableCount: 0,
          dataSourceCount: 0,
          serviceCallCount: 0
        },
        typeDistribution: [],
        growth: [{ date: "2026-08-11", assetCount: 0, dataVolumeBytes: 0 }],
        sourceDistribution: [],
        usageByScenario: [],
        hotAssets: []
      });
    }
    renderRoute(path, { authenticated: !["/welcome", "/login"].includes(path) });

    expect(
      await screen.findByRole("heading", { name: heading }, { timeout: ROUTE_LOAD_TIMEOUT_MS })
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(landmark, {}, { timeout: ROUTE_LOAD_TIMEOUT_MS })
    ).toBeInTheDocument();
  });

  it("opens analysis as a blank agent workspace without a mode switcher", async () => {
    const user = userEvent.setup();
    renderRoute("/analysis");

    expect(await screen.findByLabelText("空白智能编排工作区")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "从一个跨数据与知识的任务开始" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /销售下滑|客户增长数据|区域经营表现|经营数据与知识库/ })).toHaveLength(4);
    expect(screen.getByRole("textbox", { name: "命令输入" })).toBeInTheDocument();
    expect(screen.queryByLabelText("DataHub 对话模式")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("用户提问")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "同时核对客户增长数据和最新销售政策，给出行动建议" }));

    expect(screen.getByRole("textbox", { name: "命令输入" })).toHaveValue(
      "同时核对客户增长数据和最新销售政策，给出行动建议"
    );
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain(
      "已填入快捷问题，确认后即可发送"
    );
  });

  it("redirects protected app routes to login when no data-hub session exists", async () => {
    renderRoute("/", { authenticated: false });

    expect(await screen.findByRole("heading", { name: /让每一次问数.*都有据可依/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /您好，zhangsan/ })).not.toBeInTheDocument();
  });

  it("redirects to login and explains when the active session expires", async () => {
    renderRoute("/analysis");
    expect(await screen.findByLabelText("空白智能编排工作区")).toBeInTheDocument();

    act(() => {
      expireDataHubSession("test-token");
    });

    expect(await screen.findByRole("heading", { name: "登录星数" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("登录状态已过期，请重新登录");
    expect(useDataHubAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      currentSpaceId: null
    });
  });

  it("keeps the shared sidebar on routed pages", async () => {
    const user = userEvent.setup();
    const { container } = renderRoute("/dashboard");

    expect(await screen.findByRole("navigation", { name: "星数主导航" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "星数" })).toHaveAttribute(
      "src",
      expect.stringContaining("xingshu-logo-2x.png")
    );
    expect(screen.getByRole("link", { name: /数据资产管理/ })).toHaveAttribute("href", "/data-management");
    expect(container.querySelectorAll(".xs-sidebar__menu > .ant-menu-item")).toHaveLength(5);
    expect(container.querySelectorAll(".xs-sidebar__menu > .ant-menu-submenu")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "新建对话" }).querySelector("svg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(container.querySelector(".xs-shell--sidebar-collapsed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
  });

  it("exposes every product destination from the mobile navigation drawer", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click(await screen.findByRole("button", { name: "打开主导航" }));

    const navigationDialog = screen.getByRole("dialog", { name: "星数主导航" });
    expect(navigationDialog).toBeVisible();
    expect(within(navigationDialog).getByRole("link", { name: "历史对话" })).toHaveAttribute("href", "/history");
    expect(within(navigationDialog).getByRole("link", { name: "公文写作" })).toHaveAttribute("href", "/writing");
    expect(within(navigationDialog).getByRole("link", { name: "数据资产管理" })).toHaveAttribute(
      "href",
      "/data-management"
    );
    expect(within(navigationDialog).getByRole("button", { name: "移动端账户菜单" })).toBeVisible();
  });

  it("announces and focuses the new page after navigation", async () => {
    const user = userEvent.setup();
    const { container } = renderRoute("/");
    const initialRouteView = container.querySelector(".xs-route-view");

    expect(initialRouteView).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "我的看板" }));

    const heading = await screen.findByRole("heading", { name: "大屏库", level: 1 });
    expect(heading).toHaveFocus();
    expect(container.querySelector(".xs-route-view")).not.toBe(initialRouteView);
    expect(document.title).toBe("我的看板 · 星数");
  });

  it("keeps focus on the destination heading after navigating from the mobile drawer", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click(await screen.findByRole("button", { name: "打开主导航" }));
    const navigationDialog = screen.getByRole("dialog", { name: "星数主导航" });
    await user.click(within(navigationDialog).getByRole("link", { name: "历史对话" }));

    const heading = await screen.findByRole("heading", { name: "历史对话", level: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "星数主导航" })).not.toBeInTheDocument());
    await waitFor(() => expect(heading).toHaveFocus());
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

    expect(await screen.findByRole("heading", { name: "智能编排完成" })).toBeInTheDocument();
    expect(screen.getByText("分析本月经营数据")).toBeInTheDocument();
  });

  it("opens the ask workspace from the recommended app arrow", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.click(screen.getByRole("button", { name: "进入 智能问数" }));

    expect(await screen.findByLabelText("空白问数工作区")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "从一个经营问题开始" })).toBeInTheDocument();
    expect(useUiStore.getState().homeChatMode).toBe("ask");
    expect(document.title).toBe("智能问数 · 星数");
  });

  it("opens the dedicated ask-data page from the recommended card", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.click(await screen.findByRole("button", { name: /^打开 智能问数/ }));

    expect(await screen.findByLabelText("空白问数工作区")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "从一个经营问题开始" })).toBeInTheDocument();
    expect(document.title).toBe("智能问数 · 星数");
  });

  it("submits from the workspace with the selected DataHub model", async () => {
    const user = userEvent.setup();
    renderRoute("/ask-data");

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "查询最新销售制度");
    await user.click(screen.getByRole("button", { name: "选择模型，当前问数模型" }));
    await user.click(screen.getByRole("menuitem", { name: /问知模型/ }));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("heading", { name: "问知完成" })).toBeInTheDocument();
    expect(screen.getByText("查询最新销售制度")).toBeInTheDocument();
    expect(document.title).toBe("知识问答 · 星数");
  });

  it("logs out from the sidebar account menu", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.click(screen.getByRole("button", { name: /账户菜单/ }));
    await user.click(await screen.findByText("退出登录"));

    expect(await screen.findByRole("heading", { name: /让每一次问数.*都有据可依/ })).toBeInTheDocument();
    expect(document.title).toBe("登录 · 星数");
  });

  it("hides the local AI configuration from the account menu and direct routes", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoute("/");

    await user.click(screen.getByRole("button", { name: /账户菜单/ }));
    expect(screen.queryByText("AI 配置")).not.toBeInTheDocument();

    unmount();
    renderRoute("/settings/ai");

    expect(await screen.findByRole("heading", { name: /您好，zhangsan/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("AI 配置表单")).not.toBeInTheDocument();
  });

  it("submits a table generation prompt through the mock service", async () => {
    const user = userEvent.setup();
    renderRoute("/table");

    await user.clear(screen.getByRole("textbox", { name: "制表需求" }));
    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成华南区客户销售排行");
    await user.click(screen.getByRole("button", { name: "预览需求" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "预览需求已记录，不会创建真实报表：生成华南区客户销售排行"
    );
  });

  it("opens data asset management from the data dashboard", async () => {
    const user = userEvent.setup();
    renderRoute("/data-dashboard");

    await user.click(screen.getByRole("link", { name: "管理数据资产" }));

    expect(await screen.findByRole("heading", { name: "数据资产管理" })).toBeInTheDocument();
  });

  it("opens the internal dashboard designer from the dashboard page", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click((await screen.findAllByRole("button", { name: "新建大屏" }))[0]);
    await user.type(await screen.findByLabelText("大屏名称"), "路由回归看板");
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    expect(await screen.findByRole("heading", { name: "看板编辑器" })).toBeInTheDocument();
    expect(await screen.findByLabelText("星数大屏设计器")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "星数主导航" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();
  });

  it("does not expose dashboard generation from a completed ask-data result", async () => {
    renderRoute("/ask-data");

    act(() => {
      const store = useUiStore.getState();
      const runId = store.startAskDataRun("分析本月经营数据");
      store.appendAskDataEvent(runId, {
        type: "table",
        data: {
          columns: ["月份", "营收"],
          rows: [["1月", 48], ["2月", 56]],
          totalRows: 2
        }
      });
      store.appendAskDataEvent(runId, {
        type: "done",
        data: { summary: "本月营收保持增长。" }
      });
      store.completeAskDataRun(runId);
    });

    expect(await screen.findByText("本月营收保持增长。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成大屏" })).not.toBeInTheDocument();
    expect(localStorage.getItem("xingshu.dashboard.records.v1")).toBeNull();
  });

  it("opens the shared knowledge workspace from the knowledge card", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.click(await screen.findByRole("button", { name: /^打开 知识问答/ }));

    expect(await screen.findByLabelText("空白问知工作区")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "从一个企业知识问题开始" })).toBeInTheDocument();
    expect(useUiStore.getState().homeChatMode).toBe("rag");
    expect(document.title).toBe("知识问答 · 星数");
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
