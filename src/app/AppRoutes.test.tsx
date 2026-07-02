import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./providers";
import { AppRoutes } from "./AppRoutes";
import { useUiStore } from "@/stores/uiStore";

function renderRoute(path: string) {
  useUiStore.getState().resetUiState();

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
    ["/analysis", "已完成分析", "分析结果"],
    ["/history", "历史对话", "历史对话列表"],
    ["/table", "智能制表", "最近制表"],
    ["/writing", "智能写作", "推荐写作场景"],
    ["/dashboard", "我的看板", "经营分析看板"],
    ["/cloud", "我的云盘", "我的云盘内容"],
    ["/data-dashboard", "数据资产看板", "数据资产指标"],
    ["/data-management", "数据资产管理", "知识库列表"]
  ])("renders %s", async (path, heading, landmark) => {
    renderRoute(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByLabelText(landmark)).toBeInTheDocument();
  });

  it("keeps the shared sidebar on routed pages", async () => {
    renderRoute("/dashboard");

    expect(await screen.findByRole("navigation", { name: "星数主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /数据资产管理/ })).toHaveAttribute("href", "/data-management");
  });
});
