import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { AppRoutes } from "@/app/AppRoutes";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";

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

    expect(await screen.findByText(/结构化数据共 5,861 项/)).toBeInTheDocument();
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

    await screen.findByRole("heading", { name: "数据资产管理" });
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

  it("disables dashboard actions that have no real workflow", async () => {
    renderRoute("/dashboard");

    await screen.findByRole("heading", { name: "我的看板" });
    expect(screen.getByRole("button", { name: "看板市场" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新建看板" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "切换看板" })).toBeDisabled();
    expect(screen.getAllByText("即将开放").length).toBeGreaterThanOrEqual(1);
  });

  it("marks a dashboard alert as handled in local state", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click(await screen.findByRole("button", { name: "处理 销售额环比下降 12.3%" }));

    expect(screen.getByRole("button", { name: "已处理 销售额环比下降 12.3%" })).toBeDisabled();
    expect(screen.getByText("1条未处理")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已处理预警：销售额环比下降 12.3%");
  });
});
