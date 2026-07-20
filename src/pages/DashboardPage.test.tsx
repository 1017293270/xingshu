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

describe("DashboardPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores the original compact dashboard-library empty state", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "大屏库" })).toBeInTheDocument();
    expect(screen.getByText("暂无大屏")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "创建第一个大屏" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建大屏" })).toHaveLength(2);
    expect(screen.queryByText("去问数生成")).not.toBeInTheDocument();
  });

  it("renders saved dashboards in the original table-first management surface", () => {
    createStoredDashboard("运营草稿", "draft", false, "不应在大屏库中展示的问数摘要");
    createStoredDashboard("善治测试", "published", true);

    renderPage();

    const table = screen.getByRole("table");
    ["名称", "状态", "更新时间", "发布时间", "操作"].forEach((heading) => {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    });

    const draftRow = screen.getByRole("row", { name: /运营草稿/ });
    expect(within(draftRow).getByText("草稿")).toBeInTheDocument();
    expect(within(draftRow).getByText("运行态")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("不应在大屏库中展示的问数摘要")).not.toBeInTheDocument();

    const publishedRow = screen.getByRole("row", { name: /善治测试/ });
    expect(within(publishedRow).getByText("已发布")).toBeInTheDocument();
    expect(within(publishedRow).getByRole("link", { name: "运行态" })).toHaveAttribute(
      "href",
      "/dashboard-view?dashboard=dashboard-published"
    );
    ["复制", "版本", "分享", "归档"].forEach((action) => {
      expect(within(publishedRow).getByRole("button", { name: action })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "复制" }));

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

    await user.click(screen.getByRole("button", { name: "归档" }));

    expect(window.confirm).toHaveBeenCalledWith("归档“待归档大屏”？它会从大屏库中移除。");
    expect(screen.queryByText("待归档大屏")).not.toBeInTheDocument();
    expect(createDashboardRepository(localStorage).list()).toHaveLength(0);
  });

  it("expands the persisted published version history", async () => {
    const user = userEvent.setup();
    createStoredDashboard("版本大屏", "version", true);
    renderPage();

    await user.click(screen.getByRole("button", { name: "版本" }));

    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回滚" })).toBeInTheDocument();
  });
});
