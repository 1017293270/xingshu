import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { writeDashboardSmartHandoff } from "@/services/dashboardDesignHandoffService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import { DashboardEditorPage } from "./DashboardEditorPage";

vi.mock("@/features/dashboardStudio/DashboardDesignerIsland", () => ({
  DashboardDesignerIsland: ({
    record,
    initialResourcePanel,
    initialAssetId,
    initialSmartPanelOpen,
    onSmartPanelToggle,
    onExit
  }: {
    record: { schema: { title: string } };
    initialResourcePanel?: string;
    initialAssetId?: string;
    initialSmartPanelOpen?: boolean;
    onSmartPanelToggle?: (open: boolean) => void;
    onExit: () => void;
  }) => (
    <div
      aria-label="内部 Vue 大屏设计器"
      data-resource-panel={initialResourcePanel}
      data-asset-id={initialAssetId}
      data-smart-open={String(Boolean(initialSmartPanelOpen))}
    >
      {record.schema.title}
      <button type="button" onClick={onExit}>返回编辑来源</button>
      <button type="button" onClick={() => onSmartPanelToggle?.(true)}>打开智享</button>
    </div>
  )
}));

vi.mock("@/features/dashboardStudio/smart/SmartDashboardPanel", () => ({
  SmartDashboardPanel: ({
    initialBrief,
    initialAssetIds,
    onClose
  }: {
    initialBrief?: string;
    initialAssetIds?: string[];
    onClose: () => void;
  }) => (
    <aside aria-label="智享大屏" data-brief={initialBrief ?? ""} data-assets={(initialAssetIds ?? []).join(",")}>
      <button type="button" onClick={onClose}>关闭智享面板</button>
    </aside>
  )
}));

function renderEditorPage(path = "/dashboard-editor") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard-editor" element={<DashboardEditorPage />} />
          <Route path="/analysis" element={<div>问数目标页</div>} />
          <Route path="/ask-agent" element={<div>智能编排目标页</div>} />
          <Route path="/dashboard" element={<div>大屏库目标页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DashboardEditorPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  it("keeps an orchestration favorite selected and returns to the agent workspace", async () => {
    const user = userEvent.setup();

    renderEditorPage(
      `/dashboard-editor?source=favorites&asset=${encodeURIComponent("asset-agent-result")}&returnTo=${encodeURIComponent("/ask-agent")}`
    );

    const designer = await screen.findByLabelText("内部 Vue 大屏设计器");
    expect(designer).toHaveAttribute("data-resource-panel", "assets");
    expect(designer).toHaveAttribute("data-asset-id", "asset-agent-result");

    await user.click(screen.getByRole("button", { name: "返回编辑来源" }));
    expect(await screen.findByText("智能编排目标页")).toBeInTheDocument();
  });

  it("offers a safe recovery path for a missing draft", async () => {
    const user = userEvent.setup();
    renderEditorPage("/dashboard-editor?draft=missing");

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到这份看板草稿");
    await user.click(screen.getByRole("button", { name: "新建大屏" }));
    expect(await screen.findByLabelText("内部 Vue 大屏设计器")).toHaveTextContent("未命名大屏");
  });

  it("opens the smart panel from the entry-page handoff and hands over the brief once", async () => {
    const user = userEvent.setup();
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "智享草稿", idFactory: (prefix) => `${prefix}-smart` });
    repository.saveDraft(schema);
    writeDashboardSmartHandoff({
      version: 1,
      draftId: schema.id,
      brief: "面向经营例会的营收总览",
      assetIds: ["asset-total", "asset-revenue"],
      createdAt: "2026-09-03T00:00:00.000Z"
    });

    renderEditorPage(`/dashboard-editor?draft=${schema.id}&smart=1`);

    const panel = await screen.findByLabelText("智享大屏");
    expect(panel).toHaveAttribute("data-brief", "面向经营例会的营收总览");
    expect(panel).toHaveAttribute("data-assets", "asset-total,asset-revenue");
    expect(screen.getByLabelText("内部 Vue 大屏设计器")).toHaveAttribute("data-smart-open", "true");
    expect(sessionStorage.getItem("xingshu.dashboard.smart-handoff.v1")).toBeNull();

    await user.click(screen.getByRole("button", { name: "关闭智享面板" }));
    expect(screen.queryByLabelText("智享大屏")).not.toBeInTheDocument();
  });

  it("toggles the smart panel from the designer toolbar", async () => {
    const user = userEvent.setup();
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "工具栏草稿", idFactory: (prefix) => `${prefix}-toolbar` });
    repository.saveDraft(schema);

    renderEditorPage(`/dashboard-editor?draft=${schema.id}`);

    await screen.findByLabelText("内部 Vue 大屏设计器");
    expect(screen.queryByLabelText("智享大屏")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开智享" }));
    expect(await screen.findByLabelText("智享大屏")).toHaveAttribute("data-brief", "");
  });
});
