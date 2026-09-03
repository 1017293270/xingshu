import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { createDashboard } from "@/services/dashboardAnalyticsService";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { listQueryAssets } from "@/services/queryAssetService";
import type { QueryAsset } from "@/types/analytics";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { SmartDashboardPage } from "./SmartDashboardPage";

vi.mock("@/services/queryAssetService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/queryAssetService")>();
  return { ...actual, listQueryAssets: vi.fn() };
});

vi.mock("@/services/dashboardAnalyticsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dashboardAnalyticsService")>();
  return { ...actual, createDashboard: vi.fn() };
});

const listQueryAssetsMock = vi.mocked(listQueryAssets);
const createDashboardMock = vi.mocked(createDashboard);

function createAsset(id: string, name: string, rowCount: number): QueryAsset {
  return {
    id,
    name,
    originalQuestion: `${name}原话`,
    resolvedQuestion: `${name}的澄清问法`,
    ownerUserId: 1,
    visibility: "PRIVATE",
    stableVersionId: `${id}-v1`,
    status: "ACTIVE",
    stableVersion: {
      id: `${id}-v1`,
      versionNo: 1,
      resolvedQuestion: `${name}的澄清问法`,
      engine: "CUBE",
      parameters: [],
      outputs: [
        {
          outputKey: "main",
          label: "结果表",
          rowCount,
          columns: [
            { columnId: "c1", key: "month", label: "月份" },
            { columnId: "c2", key: "amount", label: "营收" }
          ]
        }
      ],
      schemaHash: "hash",
      status: "VALIDATED",
      createdAt: "2026-09-01T00:00:00.000Z"
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  };
}

function createRecord(id: string, title: string): DashboardRecord {
  const nowIso = "2026-09-03T00:00:00.000Z";
  return {
    id,
    schema: {
      ...createBlankDashboard({ title, idFactory: () => id, now: new Date(nowIso) }),
      id
    },
    status: "draft",
    revision: 1,
    versions: [],
    visibility: "PRIVATE",
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function EditorProbe() {
  const [params] = useSearchParams();
  return <div aria-label="编辑器目标页">{`draft=${params.get("draft")}&smart=${params.get("smart")}`}</div>;
}

function renderPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/dashboard/smart"]}>
        <Routes>
          <Route path="/dashboard/smart" element={<SmartDashboardPage />} />
          <Route path="/dashboard-editor" element={<EditorProbe />} />
          <Route path="/analysis" element={<div>问数目标页</div>} />
          <Route path="/dashboard" element={<div>我的看板目标页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("SmartDashboardPage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    listQueryAssetsMock.mockReset();
    createDashboardMock.mockReset();
    listQueryAssetsMock.mockResolvedValue([
      createAsset("asset-revenue", "月度营收", 12),
      createAsset("asset-stock", "库存周转", 34)
    ]);
    createDashboardMock.mockResolvedValue(createRecord("dashboard-smart-1", "面向经营例会的营收总览"));
  });

  it("lists favorite query assets with their result-table shape", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "智享大屏", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /月度营收/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /库存周转/ })).toBeInTheDocument();
    expect(screen.getByText("结果表 12 行 × 2 列")).toBeInTheDocument();
    expect(screen.getByText("至少选 1 份")).toBeInTheDocument();
  });

  it("hands the brief and the picked asset to the editor", async () => {
    const user = userEvent.setup();
    renderPage();

    const startButton = screen.getByRole("button", { name: /开始设计/ });
    expect(startButton).toBeDisabled();

    await user.click(await screen.findByRole("button", { name: /月度营收/ }));
    expect(screen.getByText("已选 1 份")).toBeInTheDocument();
    expect(startButton).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "大屏需求" }), "面向经营例会的营收总览，突出趋势");
    expect(startButton).toBeEnabled();

    await user.click(startButton);

    expect(createDashboardMock).toHaveBeenCalledTimes(1);
    expect(createDashboardMock.mock.calls[0]?.[0]).toMatchObject({ title: "面向经营例会的营收总览，突出趋势" });

    const handoff = JSON.parse(sessionStorage.getItem("xingshu.dashboard.smart-handoff.v1") ?? "{}");
    expect(handoff).toMatchObject({
      version: 1,
      draftId: "dashboard-smart-1",
      brief: "面向经营例会的营收总览，突出趋势",
      assetIds: ["asset-revenue"]
    });

    expect(await screen.findByLabelText("编辑器目标页")).toHaveTextContent("draft=dashboard-smart-1&smart=1");
  });

  it("fills the composer from an example brief", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "给领导看的区域销售对比，深色主题" }));

    expect(screen.getByRole("textbox", { name: "大屏需求" })).toHaveValue("给领导看的区域销售对比，深色主题");
  });

  it("guides to the ask workspace when nothing is favorited yet", async () => {
    const user = userEvent.setup();
    listQueryAssetsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByLabelText("收藏问数空状态")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "先去问数里收藏一份结果" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "去问数收藏" }));
    expect(await screen.findByText("问数目标页")).toBeInTheDocument();
  });

  it("reports a failed draft creation without leaving the page", async () => {
    const user = userEvent.setup();
    createDashboardMock.mockRejectedValue(new Error("看板服务暂不可用"));
    renderPage();

    await user.click(await screen.findByRole("button", { name: /月度营收/ }));
    await user.type(screen.getByRole("textbox", { name: "大屏需求" }), "营收总览");
    await user.click(screen.getByRole("button", { name: /开始设计/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("看板服务暂不可用");
    expect(screen.queryByLabelText("编辑器目标页")).not.toBeInTheDocument();
  });
});
