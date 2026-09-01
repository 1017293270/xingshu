import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { CURRENT_DASHBOARD_STORAGE_KEY } from "@/features/dashboard/currentDashboard";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import { DashboardSquarePage } from "./DashboardSquarePage";

function renderPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/dashboard/square"]}>
        <Routes>
          <Route path="/dashboard/square" element={<DashboardSquarePage />} />
          <Route path="/dashboard" element={<div>我的看板目标页</div>} />
          <Route path="/dashboard-editor" element={<div>编辑器目标页</div>} />
          <Route path="/dashboard-view" element={<div>运行态目标页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

function createStoredDashboard(title: string, id: string, published = false, description = "") {
  const repository = createDashboardRepository(localStorage, {
    now: () => new Date("2026-07-15T08:00:00.000Z")
  });
  const schema = {
    ...createBlankDashboard({
      title,
      idFactory: (prefix) => `${prefix}-${id}`,
      now: new Date("2026-07-15T07:00:00.000Z")
    }),
    description
  };
  repository.saveDraft(schema);
  if (published) repository.publish(schema.id);
  return { record: repository.get(schema.id)!, repository };
}

function cardOf(title: string) {
  const card = screen.getByRole("link", { name: title }).closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

async function openCardMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole("button", { name: `${title} 设置` }));
}

describe("DashboardSquarePage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows favorite-question entry points in the dashboard-library empty state", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "看板广场" })).toBeInTheDocument();
    expect(screen.getByLabelText("看板广场空状态")).toBeInTheDocument();
    expect(screen.getByText("暂无看板")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "创建第一个看板" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建看板" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "从收藏问数创建" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择收藏问数" })).toBeInTheDocument();
    expect(screen.queryByText("去问数生成")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入为静态看板" })).not.toBeInTheDocument();
    expect(screen.queryByText(/旧本地看板/)).not.toBeInTheDocument();
  });

  it("returns to the current-dashboard workbench from the page head", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("link", { name: "返回我的看板" }));

    expect(await screen.findByText("我的看板目标页")).toBeInTheDocument();
  });

  it("renders saved dashboards as management cards", async () => {
    const user = userEvent.setup();
    createStoredDashboard("运营草稿", "draft", false, "不应在大屏库中展示的问数摘要");
    createStoredDashboard("善治测试", "published", true);

    renderPage();

    const draftCard = cardOf("运营草稿");
    expect(within(draftCard).getByText("草稿")).toBeInTheDocument();
    expect(within(draftCard).getByRole("link", { name: "浏览大屏" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("不应在大屏库中展示的问数摘要")).not.toBeInTheDocument();

    const publishedCard = cardOf("善治测试");
    expect(within(publishedCard).getByText("已发布")).toBeInTheDocument();
    expect(within(publishedCard).getByRole("link", { name: "浏览大屏" })).toHaveAttribute(
      "href",
      "/dashboard-view?dashboard=dashboard-published"
    );

    await openCardMenu(user, "善治测试");
    ["设为当前", "编辑", "复制", "版本", "分享", "归档"].forEach((action) => {
      expect(screen.getByRole("menuitem", { name: action })).toBeInTheDocument();
    });
    // 服务层只有归档接口，没有真删除，卡片菜单不再把归档写成"删除"
    expect(screen.queryByRole("menuitem", { name: "删除" })).not.toBeInTheDocument();
  });

  it("promotes a dashboard to the current one and goes back to the workbench", async () => {
    const user = userEvent.setup();
    createStoredDashboard("库存周转", "stock", true);
    renderPage();

    await openCardMenu(user, "库存周转");
    await user.click(screen.getByRole("menuitem", { name: "设为当前" }));

    expect(await screen.findByText("我的看板目标页")).toBeInTheDocument();
    expect(localStorage.getItem(CURRENT_DASHBOARD_STORAGE_KEY)).toBe("dashboard-stock");
  });

  it("requires a dashboard name before entering the editor", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "新建看板" })[0]);
    await user.type(await screen.findByLabelText("看板名称"), "华东区经营驾驶舱");
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    expect(await screen.findByText("编辑器目标页")).toBeInTheDocument();
    const records = createDashboardRepository(localStorage).list();
    expect(records).toHaveLength(1);
    expect(records[0]?.schema.title).toBe("华东区经营驾驶舱");
  });

  it("copies a dashboard into a new editable draft", async () => {
    const user = userEvent.setup();
    createStoredDashboard("销售大屏", "sales", true);
    renderPage();

    await openCardMenu(user, "销售大屏");
    await user.click(screen.getByRole("menuitem", { name: "复制" }));

    expect(await screen.findByText("编辑器目标页")).toBeInTheDocument();
    const records = createDashboardRepository(localStorage).list();
    expect(records).toHaveLength(2);
    expect(records.some((record) => record.schema.title === "销售大屏 副本" && record.status === "draft")).toBe(true);
  });

  it("archives a dashboard after confirmation", async () => {
    const user = userEvent.setup();
    createStoredDashboard("待归档大屏", "archive");
    renderPage();

    await openCardMenu(user, "待归档大屏");
    await user.click(screen.getByRole("menuitem", { name: "归档" }));

    expect(await screen.findByRole("dialog", { name: "归档看板" })).toHaveTextContent(
      "归档“待归档大屏”？归档后它会从看板广场移除，当前版本没有自助恢复入口。"
    );
    await user.click(screen.getByRole("button", { name: "确认归档" }));
    expect(screen.queryByText("待归档大屏")).not.toBeInTheDocument();
    expect(createDashboardRepository(localStorage).list()).toHaveLength(0);
  });

  it("expands the persisted published version history", async () => {
    const user = userEvent.setup();
    createStoredDashboard("版本大屏", "version", true);
    renderPage();

    await openCardMenu(user, "版本大屏");
    await user.click(screen.getByRole("menuitem", { name: "版本" }));

    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回滚" })).toBeInTheDocument();
  });
});
