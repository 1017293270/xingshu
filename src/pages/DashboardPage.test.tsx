import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import { DashboardPage } from "./DashboardPage";

function renderPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
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
  await user.click(screen.getByRole("button", { name: `${title} 更多操作` }));
}

describe("DashboardPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows favorite-question entry points in the dashboard-library empty state", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "大屏库" })).toBeInTheDocument();
    expect(screen.getByText("暂无大屏")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "创建第一个大屏" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建大屏" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "从收藏问数创建" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择收藏问数" })).toBeInTheDocument();
    expect(screen.queryByText("去问数生成")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入为静态看板" })).not.toBeInTheDocument();
    expect(screen.queryByText(/旧本地看板/)).not.toBeInTheDocument();
  });

  it("renders saved dashboards as management cards", async () => {
    const user = userEvent.setup();
    createStoredDashboard("运营草稿", "draft", false, "不应在大屏库中展示的问数摘要");
    createStoredDashboard("善治测试", "published", true);

    renderPage();

    const draftCard = cardOf("运营草稿");
    expect(within(draftCard).getByText("草稿")).toBeInTheDocument();
    expect(within(draftCard).getByRole("link", { name: "运行态" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("不应在大屏库中展示的问数摘要")).not.toBeInTheDocument();

    const publishedCard = cardOf("善治测试");
    expect(within(publishedCard).getByText("已发布")).toBeInTheDocument();
    expect(within(publishedCard).getByRole("link", { name: "运行态" })).toHaveAttribute(
      "href",
      "/dashboard-view?dashboard=dashboard-published"
    );

    await openCardMenu(user, "善治测试");
    ["复制", "版本", "分享", "归档"].forEach((action) => {
      expect(screen.getByRole("menuitem", { name: action })).toBeInTheDocument();
    });
  });

  it("creates an untitled draft and enters the editor", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "新建大屏" })[0]);

    expect(await screen.findByText("编辑器目标页")).toBeInTheDocument();
    const records = createDashboardRepository(localStorage).list();
    expect(records).toHaveLength(1);
    expect(records[0]?.schema.title).toBe("未命名大屏");
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await openCardMenu(user, "待归档大屏");
    await user.click(screen.getByRole("menuitem", { name: "归档" }));

    expect(window.confirm).toHaveBeenCalledWith("归档“待归档大屏”？它会从大屏库中移除。");
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
