import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { AppRoutes } from "@/app/AppRoutes";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

const ROUTE_LOAD_TIMEOUT_MS = 5_000;

function renderRoute(path: string) {
  localStorage.clear();
  useDataHubAuthStore.getState().clearAuthState();
  useDataHubAuthStore.getState().setAuth({
    token: "test-token",
    userId: 1,
    username: "zhangsan",
    isAdmin: false
  });
  useDataHubAuthStore.getState().setCurrentSpaceId(7);

  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("data asset actions", () => {
  it("shows the adapter update time and warns when dashboard data is stale", async () => {
    renderRoute("/data-dashboard");

    expect(
      await screen.findByText(/结构化数据共 5,861 项/, {}, { timeout: ROUTE_LOAD_TIMEOUT_MS })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /数据资产类型分布.*结构化数据共 5,861 项/ })
    ).toBeInTheDocument();
    expect(screen.getByText("数据更新于 2024-06-04 14:30:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2024-06-04" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain(
      "数据已超过 24 小时未更新"
    );

    expect(screen.getByText(/资产明细与热门资产详情即将开放/)).toBeInTheDocument();
    expect(screen.getByText(/指标下钻.*即将开放/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /数据资产总量/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 数据资产类型分布 明细" })).toBeDisabled();
    const hotAssetsTable = screen.getByRole("table", { name: "热门数据资产" });
    expect(within(hotAssetsTable).getByRole("columnheader", { name: "资产名称" })).toHaveAttribute("scope", "col");
    expect(within(hotAssetsTable).getByText("客户基础信息表")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看 客户基础信息表 详情" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "客户基础信息表" })).not.toBeInTheDocument();
  });

  it("keeps unavailable asset categories disabled instead of reusing knowledge-base content", async () => {
    renderRoute("/data-management");

    await screen.findByRole("heading", { name: "数据资产管理" }, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    const assetTabs = screen.getByRole("radiogroup", { name: "资产管理类型" });
    expect(within(assetTabs).getByRole("radio", { name: "知识库管理" })).toBeChecked();
    expect(within(assetTabs).getByRole("radio", { name: "数据源管理" })).toBeDisabled();
    expect(within(assetTabs).getByRole("radio", { name: "数据表管理" })).toBeDisabled();
    expect(within(assetTabs).getByRole("radio", { name: "数据接口管理" })).toBeDisabled();
    expect(within(assetTabs).getByRole("radio", { name: "指标管理" })).toBeDisabled();
    expect(screen.getByText(/当前仅开放知识库管理.*即将开放/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "新增知识库" })).toBeDisabled();
    expect(screen.getByText(/新增与知识库详情即将开放/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "查看 财务审计知识库 详情" })).toBeDisabled();
    expect(screen.queryByText(/已创建知识库草稿|已打开知识库详情/)).not.toBeInTheDocument();
  });

  it("exposes the real dashboard creation workflow instead of unavailable placeholders", async () => {
    renderRoute("/dashboard");

    await screen.findByRole("heading", { name: "大屏库" }, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    expect(await screen.findByRole("heading", { name: "创建第一个大屏" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建大屏" })).toHaveLength(2);
    screen.getAllByRole("button", { name: "新建大屏" }).forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByText("去问数生成")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "看板市场" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换看板" })).not.toBeInTheDocument();
  });

  it("creates a blank dashboard and opens its full-screen editor", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click((await screen.findAllByRole("button", { name: "新建大屏" }))[0]);

    expect(await screen.findByLabelText("看板编辑器工作区")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "星数主导航" })).not.toBeInTheDocument();
    expect(localStorage.getItem("xingshu.dashboard.records.v1")).toContain('"width":1920');
  });
});
