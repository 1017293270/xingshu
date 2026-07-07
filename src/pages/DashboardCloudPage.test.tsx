import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { CloudPage } from "./CloudPage";
import { DashboardPage } from "./DashboardPage";

function renderPage(page: React.ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
    </AppProviders>
  );
}

describe("dashboard and cloud page actions", () => {
  it("renders the restored dashboard header and eight compact widgets", () => {
    renderPage(<DashboardPage />);

    expect(screen.getByText("经营分析全景看板")).toBeInTheDocument();
    expect(screen.getByText("12 个指标 · 8 个组件 · 更新于今日 14:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "看板市场" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: /看板组件：/ })).toHaveLength(8);
  });

  it("switches the active dashboard and reports the status", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);

    expect(screen.getByText("经营分析看板")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "切换看板" }));

    expect(screen.getByText("风险监控看板")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已切换至风险监控看板");
  });

  it("reports when a new dashboard task is created", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);

    await user.click(screen.getByRole("button", { name: "新建看板" }));

    expect(screen.getByRole("status")).toHaveTextContent("已创建新建看板任务");
  });

  it("opens a dashboard card detail and handles an alert", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);

    await user.click(screen.getByRole("button", { name: "查看 月度营收趋势" }));
    expect(screen.getByRole("status")).toHaveTextContent("已打开看板组件：月度营收趋势");

    await user.click(screen.getByRole("button", { name: "处理 销售额环比下降 12.3%" }));
    expect(screen.getByRole("status")).toHaveTextContent("已处理预警：销售额环比下降 12.3%");
  });

  it("renders a production-facing cloud workspace and creates cloud tasks", async () => {
    const user = userEvent.setup();
    renderPage(<CloudPage />);

    expect(screen.getByText("企业资料工作台")).toBeInTheDocument();
    expect(screen.queryByText(/预留|正式后端接入前/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: /云盘资料：/ })).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "上传文件" }));

    expect(screen.getByRole("status")).toHaveTextContent("已创建上传任务");

    await user.click(screen.getByRole("button", { name: "同步知识库" }));

    expect(screen.getByRole("status")).toHaveTextContent("已发起知识库同步");
  });
});
