import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import {
  CURRENT_DASHBOARD_STORAGE_KEY,
  resolveCurrentDashboard
} from "@/features/dashboard/currentDashboard";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { DashboardPage } from "./DashboardPage";

/* 页面测试只验证"内联挂载了哪块看板"，Vue 运行时本身在 DashboardRuntimeIsland.test.tsx 里覆盖 */
vi.mock("@/features/dashboardStudio/DashboardRuntimeIsland", () => ({
  DashboardRuntimeIsland: ({ record, fullscreen }: { record: DashboardRecord; fullscreen?: boolean }) => (
    <div data-testid="dashboard-runtime" data-fullscreen={String(Boolean(fullscreen))}>
      {record.schema.title} 运行态
    </div>
  )
}));

function renderPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/square" element={<div>看板广场目标页</div>} />
          <Route path="/dashboard-editor" element={<div>编辑器目标页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

function createStoredDashboard(
  title: string,
  id: string,
  options: { published?: boolean; updatedAt?: string } = {}
) {
  const { published = false, updatedAt = "2026-07-15T08:00:00.000Z" } = options;
  const repository = createDashboardRepository(localStorage, { now: () => new Date(updatedAt) });
  const schema = createBlankDashboard({
    title,
    idFactory: (prefix) => `${prefix}-${id}`,
    now: new Date("2026-07-15T07:00:00.000Z")
  });
  repository.saveDraft(schema);
  if (published) repository.publish(schema.id);
  return repository.get(schema.id)!;
}

/**
 * 本地测试仓储不记归属，这里直接补写进 records JSON，模拟服务端列表把他人
 * 共享到空间的看板一起返回（后端 SQL：owner_user_id = ? OR visibility = 'SPACE'）。
 * 两块都写成 SPACE，逼判定只能靠 ownerUserId，从而验证页面确实把 userId 传下去了。
 */
function setStoredDashboardOwners(owners: Record<string, number>) {
  const storageKey = "xingshu.dashboard.records.v1";
  const records = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as DashboardRecord[];
  localStorage.setItem(
    storageKey,
    JSON.stringify(records.map((record) => ({
      ...record,
      ownerUserId: owners[record.id],
      visibility: "SPACE"
    })))
  );
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "当前看板设置" }));
}

describe("DashboardPage", () => {
  beforeEach(() => {
    useDataHubAuthStore.getState().clearAuthState();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("guides to creation and the dashboard square when nothing is saved yet", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "我的看板" })).toBeInTheDocument();
    expect(screen.getByLabelText("我的看板空状态")).toBeInTheDocument();
    expect(screen.getByText("暂无看板")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "创建第一个看板" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建看板" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "看板广场" })).toHaveLength(2);
    expect(screen.queryByTestId("dashboard-runtime")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "当前看板设置" })).not.toBeInTheDocument();
  });

  it("opens the dashboard square from the header toolbar", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "看板广场" })[0]);

    expect(await screen.findByText("看板广场目标页")).toBeInTheDocument();
  });

  it("mounts the stored current dashboard inline instead of full screen", async () => {
    createStoredDashboard("经营驾驶舱", "cockpit", { published: true, updatedAt: "2026-07-15T08:00:00.000Z" });
    createStoredDashboard("库存周转", "stock", { updatedAt: "2026-07-16T08:00:00.000Z" });
    localStorage.setItem(CURRENT_DASHBOARD_STORAGE_KEY, "dashboard-cockpit");

    renderPage();

    expect(await screen.findByRole("region", { name: "当前看板：经营驾驶舱" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-runtime")).toHaveAttribute("data-fullscreen", "false");
    expect(screen.getByTestId("dashboard-runtime")).toHaveTextContent("经营驾驶舱 运行态");
    expect(screen.getByRole("combobox", { name: "切换当前看板" })).toBeInTheDocument();
    expect(screen.getByText("已发布")).toBeInTheDocument();
  });

  /* 页面只留一条 meta 行：状态 / 来源 / 更新时间都在这里，运行态里不再有第二份 */
  it("collapses status, source and update time into a single meta row", async () => {
    createStoredDashboard("经营驾驶舱", "cockpit", { published: true, updatedAt: "2026-07-15T08:00:00.000Z" });
    localStorage.setItem(CURRENT_DASHBOARD_STORAGE_KEY, "dashboard-cockpit");

    renderPage();
    await screen.findByRole("region", { name: "当前看板：经营驾驶舱" });

    // 空白看板走的是手动配置分支，问数生成的才是"智能问数"
    expect(screen.getAllByText("已发布")).toHaveLength(1);
    expect(screen.getByText("手动配置")).toBeInTheDocument();
    expect(screen.getAllByText(/^更新于 /)).toHaveLength(1);
  });

  it("falls back to the most recently updated dashboard when the stored id is stale", async () => {
    createStoredDashboard("旧的经营驾驶舱", "cockpit", { updatedAt: "2026-07-15T08:00:00.000Z" });
    createStoredDashboard("最近更新的库存看板", "stock", { updatedAt: "2026-07-18T08:00:00.000Z" });
    localStorage.setItem(CURRENT_DASHBOARD_STORAGE_KEY, "dashboard-已被归档");

    renderPage();

    expect(await screen.findByRole("region", { name: "当前看板：最近更新的库存看板" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "当前看板：旧的经营驾驶舱" })).not.toBeInTheDocument();
  });

  it("falls back to the user's own dashboard, not a newer one shared into the space", async () => {
    useDataHubAuthStore.getState().setAuth({ token: "token", userId: 7, username: "我", isAdmin: false });
    createStoredDashboard("我的经营驾驶舱", "mine", { updatedAt: "2026-07-15T08:00:00.000Z" });
    createStoredDashboard("同事共享的测试", "shared", { updatedAt: "2026-07-20T08:00:00.000Z" });
    setStoredDashboardOwners({ "dashboard-mine": 7, "dashboard-shared": 42 });

    renderPage();

    expect(await screen.findByRole("region", { name: "当前看板：我的经营驾驶舱" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "当前看板：同事共享的测试" })).not.toBeInTheDocument();
  });

  it("resolves the current dashboard from the stored id and falls back by update time", () => {
    const older = { id: "a", updatedAt: "2026-07-15T08:00:00.000Z" } as DashboardRecord;
    const newer = { id: "b", updatedAt: "2026-07-18T08:00:00.000Z" } as DashboardRecord;

    expect(resolveCurrentDashboard([older, newer], "a")).toBe(older);
    expect(resolveCurrentDashboard([older, newer], "missing")).toBe(newer);
    expect(resolveCurrentDashboard([older, newer], null)).toBe(newer);
    expect(resolveCurrentDashboard([], "a")).toBeNull();
  });

  it("persists the switched dashboard as the new current one", async () => {
    const user = userEvent.setup();
    createStoredDashboard("经营驾驶舱", "cockpit", { updatedAt: "2026-07-18T08:00:00.000Z" });
    createStoredDashboard("库存周转", "stock", { updatedAt: "2026-07-15T08:00:00.000Z" });

    renderPage();

    expect(await screen.findByRole("region", { name: "当前看板：经营驾驶舱" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "切换当前看板" }));
    await user.click(await screen.findByTitle("库存周转"));

    expect(await screen.findByRole("region", { name: "当前看板：库存周转" })).toBeInTheDocument();
    expect(localStorage.getItem(CURRENT_DASHBOARD_STORAGE_KEY)).toBe("dashboard-stock");
  });

  it("keeps archive and delete apart in the settings menu", async () => {
    const user = userEvent.setup();
    createStoredDashboard("经营驾驶舱", "cockpit", { published: true });

    renderPage();
    await openSettings(user);

    ["编辑", "复制", "版本回滚", "分享", "归档"].forEach((action) => {
      expect(screen.getByRole("menuitem", { name: action })).toBeInTheDocument();
    });
    // 服务层只有 archiveDashboard，没有真删除接口，菜单里就不该出现"删除"
    expect(screen.queryByRole("menuitem", { name: "删除" })).not.toBeInTheDocument();
  });

  it("archives the current dashboard after an archive-worded confirmation", async () => {
    const user = userEvent.setup();
    createStoredDashboard("待归档看板", "archive");

    renderPage();
    await openSettings(user);
    await user.click(screen.getByRole("menuitem", { name: "归档" }));

    expect(await screen.findByRole("dialog", { name: "归档看板" })).toHaveTextContent(
      "归档“待归档看板”？归档后它会从看板广场移除，当前版本没有自助恢复入口。"
    );
    await user.click(screen.getByRole("button", { name: "确认归档" }));

    expect(await screen.findByLabelText("我的看板空状态")).toBeInTheDocument();
    expect(createDashboardRepository(localStorage).list()).toHaveLength(0);
  });

  it("edits the current dashboard from the settings menu", async () => {
    const user = userEvent.setup();
    createStoredDashboard("经营驾驶舱", "cockpit");

    renderPage();
    await openSettings(user);
    await user.click(screen.getByRole("menuitem", { name: "编辑" }));

    expect(await screen.findByText("编辑器目标页")).toBeInTheDocument();
  });

  it("rolls back to a published version from the settings menu", async () => {
    const user = userEvent.setup();
    const record = createStoredDashboard("版本看板", "version", { published: true });

    renderPage();
    await openSettings(user);
    await user.click(screen.getByRole("menuitem", { name: "版本回滚" }));

    const dialog = await screen.findByRole("dialog", { name: "版本回滚" });
    expect(dialog).toHaveTextContent("v1");

    await user.click(screen.getByRole("button", { name: "回滚" }));

    await waitFor(() => {
      expect(createDashboardRepository(localStorage).get(record.id)?.revision).toBe(record.revision + 1);
    });
  });

  it("creates a dashboard from the header toolbar", async () => {
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
});
