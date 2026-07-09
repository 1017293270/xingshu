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
  it("switches the dashboard date and opens management from a hot asset", async () => {
    const user = userEvent.setup();
    renderRoute("/data-dashboard");

    await user.click(await screen.findByRole("button", { name: "2024-06-04" }));
    expect(screen.getByRole("status")).toHaveTextContent("已切换数据日期：2024-06-03");

    await user.click(screen.getByRole("link", { name: "客户基础信息表" }));

    expect(await screen.findByRole("heading", { name: "数据资产管理" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toContain(
      "已从看板定位：客户基础信息表"
    );
  });

  it("switches management tabs, creates a draft, and opens knowledge base details", async () => {
    const user = userEvent.setup();
    renderRoute("/data-management");

    await screen.findByRole("heading", { name: "数据资产管理" });
    const assetTabs = screen.getByRole("radiogroup", { name: "资产管理类型" });
    await user.click(within(assetTabs).getByText("数据源管理"));
    expect(screen.getByRole("status")).toHaveTextContent("已切换到数据源管理");

    await user.click(screen.getByRole("button", { name: "新增知识库" }));
    expect(screen.getByRole("status")).toHaveTextContent("已创建知识库草稿");

    await user.click(screen.getByRole("button", { name: /财务审计知识库/ }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开知识库详情：财务审计知识库");
  });
});
