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
  it("switches the active dashboard and reports the status", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);

    expect(screen.getByText("当前看板：经营分析看板")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "切换看板" }));

    expect(screen.getByText("当前看板：风险监控看板")).toBeInTheDocument();
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

  it("creates an upload task from the cloud empty state", async () => {
    const user = userEvent.setup();
    renderPage(<CloudPage />);

    await user.click(screen.getByRole("button", { name: "上传文件" }));

    expect(screen.getByRole("status")).toHaveTextContent("已创建上传任务");
  });
});
