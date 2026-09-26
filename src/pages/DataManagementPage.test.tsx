import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import {
  DATA_HUB_WEB_SPACE_ID_KEY,
  DATA_HUB_WEB_TOKEN_KEY,
  getDataHubWorkspaceLink
} from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { listDataHubSpaces } from "@/services/dataHubSpaceService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubSpace } from "@/types/dataHub";
import { DataManagementPage } from "./DataManagementPage";

vi.mock("@/services/dataHubKnowledgeApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeApp")>();
  // 默认走真实实现：测试环境按开发态处理，DataHub 界面与当前页同源
  return { ...actual, getDataHubWorkspaceLink: vi.fn(actual.getDataHubWorkspaceLink) };
});

vi.mock("@/services/dataHubKnowledgeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeService")>();
  return { ...actual, listDataHubKnowledgeBases: vi.fn() };
});

vi.mock("@/services/dataHubSpaceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubSpaceService")>();
  return { ...actual, listDataHubSpaces: vi.fn() };
});

const listKnowledgeBases = vi.mocked(listDataHubKnowledgeBases);
const listSpaces = vi.mocked(listDataHubSpaces);
const workspaceLink = vi.mocked(getDataHubWorkspaceLink);

const SPACE_ADMIN_ROLES = ["超级管理员"];
const MEMBER_ROLES = ["空间游客"];

/** 当前空间（id=7）里当前用户的角色；DataHub 只放「超级管理员」进工作台页面 */
function currentSpace(myRoles: string[]): DataHubSpace {
  return {
    id: 7,
    spaceName: "示例空间",
    ownerId: 1,
    myRoles,
    memberCount: 4,
    createdAt: "2026-08-01 09:00:00"
  };
}

/** "pending" 让空间列表一直不回来，停在角色未落定的那一刻 */
function renderPage(myRoles: string[] | "pending") {
  if (myRoles === "pending") {
    listSpaces.mockReturnValue(new Promise<DataHubSpace[]>(() => {}));
  } else {
    listSpaces.mockResolvedValue([currentSpace(myRoles)]);
  }
  useDataHubAuthStore.getState().clearAuthState();
  useDataHubAuthStore.getState().setAuth({
    token: "test-token",
    userId: 1,
    username: "zhangsan",
    isAdmin: false
  });
  useDataHubAuthStore.getState().setCurrentSpaceId(7);

  return render(
    <AppProviders>
      <MemoryRouter>
        <DataManagementPage />
      </MemoryRouter>
    </AppProviders>
  );
}

async function selectTab(user: ReturnType<typeof userEvent.setup>, name: string) {
  const tabs = screen.getByRole("radiogroup", { name: "资产管理类型" });
  await user.click(within(tabs).getByText(name));
  expect(within(tabs).getByRole("radio", { name })).toBeChecked();
}

function expectOpened(open: ReturnType<typeof vi.spyOn>, path: string) {
  expect(open).toHaveBeenLastCalledWith(
    `${window.location.origin}${path}?space_id=7`,
    "_blank",
    "noopener,noreferrer"
  );
}

describe("DataManagementPage review entries", () => {
  beforeEach(() => {
    listKnowledgeBases.mockReset();
    listKnowledgeBases.mockResolvedValue([
      { id: "kb-policy", title: "企业制度知识库", documentCount: 48, updatedAt: "2026-08-13 10:00" }
    ]);
    listSpaces.mockReset();
    // mockReset 会回到 vi.fn 包住的真实实现
    workspaceLink.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("opens the data source, table and metric tabs and keeps only data interfaces as a placeholder", async () => {
    renderPage(SPACE_ADMIN_ROLES);

    const tabs = screen.getByRole("radiogroup", { name: "资产管理类型" });
    expect(within(tabs).getByRole("radio", { name: "知识库管理" })).toBeChecked();
    expect(within(tabs).getByRole("radio", { name: "数据源管理" })).toBeEnabled();
    expect(within(tabs).getByRole("radio", { name: "数据表管理" })).toBeEnabled();
    expect(within(tabs).getByRole("radio", { name: "指标管理" })).toBeEnabled();
    expect(within(tabs).getByRole("radio", { name: "数据接口管理" })).toBeDisabled();
    expect(screen.getByText("数据接口管理即将开放。")).toBeInTheDocument();
    expect(await screen.findByText("企业制度知识库")).toBeInTheDocument();
  });

  it("sends a space admin from the data source tab to DataHub's data source list", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderPage(SPACE_ADMIN_ROLES);

    await selectTab(user, "数据源管理");

    const panel = screen.getByRole("region", { name: "核对数据源的首次构建结果" });
    expect(within(panel).getByText(/AI 会自动生成表注释、表间关系和语义说明/)).toBeInTheDocument();
    const entry = await within(panel).findByRole("button", { name: "打开 DataHub 数据源" });
    expect(entry).toHaveAccessibleDescription("将在新标签页打开 DataHub");
    // 知识库页签的列表和「添加知识库」不跟到别的页签
    expect(screen.queryByLabelText("知识库列表")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加知识库" })).not.toBeInTheDocument();

    await user.click(entry);

    expectOpened(open, "/platform/datasources");
    // 同源打开时沿用星数登录态，DataHub 不必再登录一次
    expect(localStorage.getItem(DATA_HUB_WEB_TOKEN_KEY)).toBe("test-token");
    expect(localStorage.getItem(DATA_HUB_WEB_SPACE_ID_KEY)).toBe("7");
  });

  it("points the table tab at the data source wizard and the metric tab at the catalog and glossary", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderPage(SPACE_ADMIN_ROLES);

    await selectTab(user, "数据表管理");
    const tablePanel = screen.getByRole("region", { name: "核对表注释与表间关系" });
    expect(within(tablePanel).getByText(/「选表」里的表注释.*「关系」里的表间关系/)).toBeInTheDocument();
    await user.click(await within(tablePanel).findByRole("button", { name: "打开 DataHub 数据源" }));
    expectOpened(open, "/platform/datasources");

    await selectTab(user, "指标管理");
    const metricPanel = screen.getByRole("region", { name: "核对指标与口语说法" });
    expect(within(metricPanel).getByText(/口语词典里补一条解释/)).toBeInTheDocument();
    await user.click(within(metricPanel).getByRole("button", { name: "打开指标目录" }));
    expectOpened(open, "/platform/metrics");
    await user.click(within(metricPanel).getByRole("button", { name: "打开口语词典" }));
    expectOpened(open, "/platform/glossary");
  });

  it("shows a member one grey line about the admin permission instead of a DataHub entry", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderPage(MEMBER_ROLES);

    const cases = [
      ["数据源管理", "核对数据源的首次构建结果"],
      ["数据表管理", "核对表注释与表间关系"],
      ["指标管理", "核对指标与口语说法"]
    ] as const;
    for (const [tab, title] of cases) {
      await selectTab(user, tab);
      const panel = screen.getByRole("region", { name: title });
      expect(await within(panel).findByText(/^需要空间管理员权限。/)).toBeInTheDocument();
      expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
      expect(within(panel).queryByText(/DataHub 里逐个核对|依次检查|可按数据源核对/)).not.toBeInTheDocument();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("waits for the space role before offering the DataHub entry", async () => {
    const user = userEvent.setup();
    renderPage("pending");

    await selectTab(user, "数据源管理");

    // 角色落定前既不给按钮，也不先下「需要管理员权限」的结论，免得管理员看到一闪而过的拒绝
    const panel = screen.getByRole("region", { name: "核对数据源的首次构建结果" });
    expect(within(panel).getByRole("status")).toHaveTextContent("正在确认空间管理员权限…");
    expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/^需要空间管理员权限。/)).not.toBeInTheDocument();
    expect(listSpaces).toHaveBeenCalledTimes(1);
  });

  it("disables the entry and says why when DataHub's address cannot be resolved", async () => {
    const user = userEvent.setup();
    workspaceLink.mockReturnValue({
      url: null,
      unavailableReason: "无法从当前登录配置确定 DataHub 地址"
    });
    renderPage(SPACE_ADMIN_ROLES);

    await selectTab(user, "数据源管理");

    const panel = screen.getByRole("region", { name: "核对数据源的首次构建结果" });
    const entry = await within(panel).findByRole("button", { name: "打开 DataHub 数据源" });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAccessibleDescription("无法从当前登录配置确定 DataHub 地址");
    expect(within(panel).getByText("无法从当前登录配置确定 DataHub 地址")).toBeVisible();
  });
});
