import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import {
  createDashboard,
  publishDashboard,
  saveDashboard
} from "@/services/dashboardAnalyticsService";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";
import { DashboardEditorPage } from "./DashboardEditorPage";

const RECORDS_KEY = "xingshu.dashboard.records.v1";

/* 每次（重新）挂载 Vue 设计器记一笔 record.id，用来断言 URL 换参数时设计器没有重挂。 */
const designerMounts = vi.hoisted(() => [] as string[]);

vi.mock("@/services/dashboardAnalyticsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dashboardAnalyticsService")>();
  return {
    ...actual,
    createDashboard: vi.fn(actual.createDashboard),
    saveDashboard: vi.fn(actual.saveDashboard),
    publishDashboard: vi.fn(actual.publishDashboard)
  };
});

vi.mock("@/features/dashboardStudio/DashboardDesignerIsland", async () => {
  const React = await import("react");
  type Persist = (
    schema: DashboardSchema,
    expectedRevision: number,
    visibility: "PRIVATE" | "SPACE"
  ) => Promise<DashboardRecord>;

  function MockDashboardDesignerIsland({
    record,
    saveDraft,
    publishDashboard: publish,
    initialResourcePanel,
    initialAssetId,
    initialSmartPanelOpen,
    onSmartPanelToggle,
    onExit
  }: {
    record: DashboardRecord;
    saveDraft: Persist;
    publishDashboard: Persist;
    initialResourcePanel?: string;
    initialAssetId?: string;
    initialSmartPanelOpen?: boolean;
    onSmartPanelToggle?: (open: boolean) => void;
    onExit: () => void;
  }) {
    /* 与真实设计器岛一致：record.id 或这几个初始参数变化才会重挂 Vue 应用。 */
    React.useEffect(() => {
      designerMounts.push(record.id);
    }, [record.id, initialResourcePanel, initialAssetId, initialSmartPanelOpen]);
    /* Vue 设计器只在挂载时读一次修订号，之后跟着保存结果走。 */
    const revisionRef = React.useRef(record.revision);
    const [lastSaved, setLastSaved] = React.useState("");

    async function persist(action: Persist) {
      const saved = await action(record.schema, revisionRef.current, record.visibility ?? "PRIVATE");
      revisionRef.current = saved.revision;
      setLastSaved(`${saved.status}:${saved.revision}`);
    }

    return (
      <div
        aria-label="内部 Vue 大屏设计器"
        data-record-id={record.id}
        data-canvas={`${record.schema.canvas.width}x${record.schema.canvas.height}`}
        data-last-saved={lastSaved}
        data-resource-panel={initialResourcePanel}
        data-asset-id={initialAssetId}
        data-smart-open={String(Boolean(initialSmartPanelOpen))}
      >
        {record.schema.title}
        <button type="button" onClick={onExit}>返回编辑来源</button>
        <button type="button" onClick={() => onSmartPanelToggle?.(true)}>打开智享</button>
        <button type="button" onClick={() => void persist(saveDraft)}>保存草稿</button>
        <button type="button" onClick={() => void persist(publish)}>发布看板</button>
      </div>
    );
  }

  return { DashboardDesignerIsland: MockDashboardDesignerIsland };
});

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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="editor-location">{`${location.pathname}${location.search}`}</output>;
}

function currentEditorUrl() {
  return new URL(screen.getByTestId("editor-location").textContent ?? "", "http://localhost");
}

function storedRecords(): DashboardRecord[] {
  return JSON.parse(localStorage.getItem(RECORDS_KEY) ?? "[]") as DashboardRecord[];
}

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
        <LocationProbe />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DashboardEditorPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    designerMounts.length = 0;
    vi.mocked(createDashboard).mockClear();
    vi.mocked(saveDashboard).mockClear();
    vi.mocked(publishDashboard).mockClear();
  });

  it("opens a blank full-hd dashboard without saving it or mounting an iframe", async () => {
    renderEditorPage("/dashboard-editor?smart=1");

    const designer = await screen.findByLabelText("内部 Vue 大屏设计器");
    expect(designer).toHaveTextContent("未命名大屏");
    expect(designer).toHaveAttribute("data-canvas", "1920x1080");
    expect(screen.queryByTitle("看板编辑器子应用")).not.toBeInTheDocument();
    expect(createDashboard).not.toHaveBeenCalled();
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(publishDashboard).not.toHaveBeenCalled();
    expect(localStorage.getItem(RECORDS_KEY)).toBeNull();
    expect(currentEditorUrl().searchParams.get("draft")).toBeNull();
  });

  it("creates the dashboard on the first draft save and keeps the designer mounted", async () => {
    const user = userEvent.setup();
    renderEditorPage(
      `/dashboard-editor?source=favorites&asset=${encodeURIComponent("asset-agent-result")}&smart=1&returnTo=${encodeURIComponent("/ask-agent")}`
    );

    const designer = await screen.findByLabelText("内部 Vue 大屏设计器");
    const dashboardId = designer.getAttribute("data-record-id")!;
    expect(dashboardId).toBeTruthy();
    const mountsBeforeSave = designerMounts.length;

    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(currentEditorUrl().searchParams.get("draft")).toBe(dashboardId));
    const params = currentEditorUrl().searchParams;
    expect(params.get("source")).toBe("favorites");
    expect(params.get("asset")).toBe("asset-agent-result");
    expect(params.get("smart")).toBe("1");
    expect(params.get("returnTo")).toBe("/ask-agent");
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    expect(saveDashboard).toHaveBeenCalledWith(expect.objectContaining({ id: dashboardId }), 0, "PRIVATE");
    expect(publishDashboard).not.toHaveBeenCalled();
    expect(storedRecords()).toEqual([expect.objectContaining({ id: dashboardId, revision: 1, status: "draft" })]);

    const savedDesigner = screen.getByLabelText("内部 Vue 大屏设计器");
    expect(savedDesigner).toHaveAttribute("data-record-id", dashboardId);
    expect(savedDesigner).toHaveAttribute("data-last-saved", "draft:1");
    expect(designerMounts).toHaveLength(mountsBeforeSave);

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(savedDesigner).toHaveAttribute("data-last-saved", "draft:2"));
    expect(saveDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ id: dashboardId }), 1, "PRIVATE");
    expect(storedRecords()).toEqual([expect.objectContaining({ id: dashboardId, revision: 2 })]);
    expect(currentEditorUrl().searchParams.get("draft")).toBe(dashboardId);
    expect(designerMounts).toHaveLength(mountsBeforeSave);
  });

  it("reopens the same dashboard from the url written by the first save", async () => {
    const user = userEvent.setup();
    const view = renderEditorPage("/dashboard-editor?smart=1");
    const dashboardId = (await screen.findByLabelText("内部 Vue 大屏设计器")).getAttribute("data-record-id")!;

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(currentEditorUrl().searchParams.get("draft")).toBe(dashboardId));
    const savedUrl = currentEditorUrl();
    view.unmount();

    renderEditorPage(`${savedUrl.pathname}${savedUrl.search}`);
    expect(await screen.findByLabelText("内部 Vue 大屏设计器")).toHaveAttribute("data-record-id", dashboardId);
    expect(screen.getByLabelText("智享大屏")).toBeInTheDocument();
    expect(storedRecords()).toHaveLength(1);
  });

  it("creates the dashboard only once when the first action is publish", async () => {
    const user = userEvent.setup();
    renderEditorPage("/dashboard-editor?smart=1");

    const designer = await screen.findByLabelText("内部 Vue 大屏设计器");
    const dashboardId = designer.getAttribute("data-record-id")!;
    const mountsBeforePublish = designerMounts.length;

    await user.click(screen.getByRole("button", { name: "发布看板" }));

    await waitFor(() => expect(currentEditorUrl().searchParams.get("draft")).toBe(dashboardId));
    expect(currentEditorUrl().searchParams.get("smart")).toBe("1");
    expect(publishDashboard).toHaveBeenCalledTimes(1);
    expect(publishDashboard).toHaveBeenCalledWith(expect.objectContaining({ id: dashboardId }), 0, "PRIVATE");
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(createDashboard).not.toHaveBeenCalled();
    expect(storedRecords()).toEqual([expect.objectContaining({ id: dashboardId, status: "published" })]);
    expect(screen.getByLabelText("内部 Vue 大屏设计器")).toHaveAttribute("data-record-id", dashboardId);
    expect(designerMounts).toHaveLength(mountsBeforePublish);
  });

  it("saves an existing draft in place without touching the url", async () => {
    const user = userEvent.setup();
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "已有草稿", idFactory: (prefix) => `${prefix}-existing` });
    const existing = repository.saveDraft(schema);
    const path = `/dashboard-editor?draft=${schema.id}&returnTo=${encodeURIComponent("/analysis")}`;

    renderEditorPage(path);
    const designer = await screen.findByLabelText("内部 Vue 大屏设计器");
    expect(designer).toHaveTextContent("已有草稿");

    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(designer).toHaveAttribute("data-last-saved", `draft:${existing.revision + 1}`));
    expect(saveDashboard).toHaveBeenCalledWith(expect.objectContaining({ id: schema.id }), existing.revision, "PRIVATE");
    expect(screen.getByTestId("editor-location")).toHaveTextContent(path);
    expect(storedRecords()).toHaveLength(1);
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
    expect(currentEditorUrl().search).toBe("");
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(localStorage.getItem(RECORDS_KEY)).toBeNull();
  });

  it("opens the smart panel from the smart=1 entry without any brief handoff", async () => {
    const user = userEvent.setup();
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "智享草稿", idFactory: (prefix) => `${prefix}-smart` });
    repository.saveDraft(schema);

    renderEditorPage(`/dashboard-editor?draft=${schema.id}&smart=1`);

    const panel = await screen.findByLabelText("智享大屏");
    expect(panel).toHaveAttribute("data-brief", "");
    expect(panel).toHaveAttribute("data-assets", "");
    expect(screen.getByLabelText("内部 Vue 大屏设计器")).toHaveAttribute("data-smart-open", "true");

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
