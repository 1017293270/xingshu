import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("starts an agent analysis from the home command box", async () => {
    const user = userEvent.setup();
    renderRoute("/");

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "分析本月经营数据");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("heading", { name: "已完成分析" })).toBeInTheDocument();
    expect(screen.getByText("分析本月经营数据")).toBeInTheDocument();
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

  it("filters knowledge bases in data asset management", async () => {
    const user = userEvent.setup();
    renderRoute("/data-management");

    await user.type(screen.getByRole("searchbox", { name: "知识库搜索" }), "财务");

    expect(await screen.findByRole("status")).toHaveTextContent("已筛选 1 个知识库");
    expect(screen.getByText("财务审计知识库")).toBeInTheDocument();
    expect(screen.queryByText("企业制度文档库")).not.toBeInTheDocument();
  });
});
