import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import { DashboardEditorPage } from "./DashboardEditorPage";

vi.mock("@/features/dashboardStudio/DashboardDesignerIsland", () => ({
  DashboardDesignerIsland: ({
    record,
    onExit
  }: {
    record: { schema: { title: string } };
    onExit: () => void;
  }) => (
    <div aria-label="内部 Vue 大屏设计器">
      {record.schema.title}
      <button type="button" onClick={onExit}>返回编辑来源</button>
    </div>
  )
}));

function renderEditorPage(path = "/dashboard-editor") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard-editor" element={<DashboardEditorPage />} />
          <Route path="/analysis" element={<div>问数目标页</div>} />
          <Route path="/dashboard" element={<div>大屏库目标页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DashboardEditorPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates a blank full-hd dashboard without mounting an iframe", async () => {
    renderEditorPage();

    expect(await screen.findByLabelText("内部 Vue 大屏设计器")).toHaveTextContent("未命名大屏");
    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();
    expect(localStorage.getItem("xingshu.dashboard.records.v1")).toContain('"width":1920');
    expect(localStorage.getItem("xingshu.dashboard.records.v1")).toContain('"height":1080');
    expect(JSON.parse(localStorage.getItem("xingshu.dashboard.records.v1") ?? "[]")).toHaveLength(1);
  });

  it("opens a dashboard draft prepared by the ask-data handoff", async () => {
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "问数生成的区域大屏", idFactory: (prefix) => `${prefix}-ask` });
    repository.saveDraft(schema);

    renderEditorPage(`/dashboard-editor?draft=${schema.id}`);

    expect(await screen.findByLabelText("内部 Vue 大屏设计器")).toHaveTextContent("问数生成的区域大屏");
  });

  it("returns an ask-data dashboard to the analysis page", async () => {
    const user = userEvent.setup();
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "问数返回测试", idFactory: (prefix) => `${prefix}-return` });
    repository.saveDraft(schema);

    renderEditorPage(
      `/dashboard-editor?draft=${schema.id}&returnTo=${encodeURIComponent("/analysis")}`
    );

    await user.click(await screen.findByRole("button", { name: "返回编辑来源" }));
    expect(await screen.findByText("问数目标页")).toBeInTheDocument();
  });

  it("offers a safe recovery path for a missing draft", async () => {
    const user = userEvent.setup();
    renderEditorPage("/dashboard-editor?draft=missing");

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到这份看板草稿");
    await user.click(screen.getByRole("button", { name: "新建大屏" }));
    expect(await screen.findByLabelText("内部 Vue 大屏设计器")).toHaveTextContent("未命名大屏");
  });
});
