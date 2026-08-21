import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { DashboardPage } from "./DashboardPage";

function renderPage(page: React.ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
    </AppProviders>
  );
}

describe("dashboard page actions", () => {
  beforeEach(() => localStorage.clear());

  it("renders the dashboard library with real creation paths instead of the fixed demo", () => {
    renderPage(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "看板广场" })).toBeInTheDocument();
    expect(screen.getByLabelText("看板广场空状态")).toBeInTheDocument();
    expect(screen.getByText("暂无看板")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "创建第一个看板" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建看板" })).toHaveLength(2);
    screen.getAllByRole("button", { name: "新建看板" }).forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByText("去问数生成")).not.toBeInTheDocument();
    expect(screen.queryByText("经营分析全景看板")).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /看板组件：/ })).not.toBeInTheDocument();
  });

  it("creates a full-hd blank draft from the dashboard library", async () => {
    const user = userEvent.setup();
    renderPage(<DashboardPage />);

    await user.click(screen.getAllByRole("button", { name: "新建看板" })[0]);
    await user.type(await screen.findByLabelText("看板名称"), "全高清空白看板");
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    const records = JSON.parse(localStorage.getItem("xingshu.dashboard.records.v1") ?? "[]") as Array<{
      schema: { canvas: { width: number; height: number }; widgets: unknown[] };
    }>;
    expect(records).toHaveLength(1);
    expect(records[0]?.schema.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(records[0]?.schema.widgets).toHaveLength(0);
  });
});
