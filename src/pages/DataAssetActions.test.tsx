import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { AppRoutes } from "@/app/AppRoutes";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import * as dataAssetService from "@/services/dataAssetService";
import { getDataHubKnowledgeAppLinks } from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import type { DataHubKnowledgeBase } from "@/types/dataHub";

vi.mock("@/services/dataHubKnowledgeApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeApp")>();
  return { ...actual, getDataHubKnowledgeAppLinks: vi.fn() };
});

vi.mock("@/services/dataHubKnowledgeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeService")>();
  return { ...actual, listDataHubKnowledgeBases: vi.fn() };
});

const listKnowledgeBases = vi.mocked(listDataHubKnowledgeBases);
const knowledgeAppLinks = vi.mocked(getDataHubKnowledgeAppLinks);

const spaceKnowledgeBases: DataHubKnowledgeBase[] = [
  {
    id: "kb-policy",
    title: "企业制度知识库",
    description: "制度、流程与规范文件",
    documentCount: 48,
    updatedAt: "2026-08-13 10:00"
  },
  {
    id: "kb-contract",
    title: "合同与法务文件库",
    documentCount: 12,
    updatedAt: "2026-08-11 09:30"
  }
];

const ROUTE_LOAD_TIMEOUT_MS = 5_000;

function renderRoute(path: string) {
  localStorage.clear();
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
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("data asset actions", () => {
  beforeEach(() => {
    listKnowledgeBases.mockReset();
    knowledgeAppLinks.mockReset();
    listKnowledgeBases.mockResolvedValue(spaceKnowledgeBases);
    knowledgeAppLinks.mockReturnValue({
      manageUrl: null,
      canAdd: false,
      addDisabledReason: "无法从当前登录配置确定 DataHub 地址",
      usesSameOriginUi: false,
      detailUrlFor: () => null
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows the current user's real overview mapping without detail placeholders", async () => {
    const user = userEvent.setup();
    const overviewSpy = vi.spyOn(dataAssetService, "getDataAssetOverview").mockResolvedValue({
      updatedAt: "2026-08-11T08:00:00Z",
      range: "30D",
      kpis: {
        assetCount: 6,
        dataVolumeBytes: 1024,
        unstructuredCount: 2,
        tableCount: 4,
        dataSourceCount: 1,
        serviceCallCount: 3
      },
      typeDistribution: [{ type: "STRUCTURED", count: 4 }, { type: "DOCUMENT", count: 2 }],
      growth: [{ date: "2026-08-11", assetCount: 6, dataVolumeBytes: 1024 }],
      sourceDistribution: [{ type: "DATABASE", count: 1 }],
      usageByScenario: [{ scenario: "ASK_DATA", count: 3 }],
      hotAssets: [{ assetId: "asset-1", assetName: "订单表", assetType: "STRUCTURED", callCount: 3 }]
    });
    renderRoute("/data-dashboard");

    expect((await screen.findAllByText("本人一级资产", {}, { timeout: ROUTE_LOAD_TIMEOUT_MS })).length).toBeGreaterThan(0);
    expect(screen.getByText("非结构化数据资产数量")).toBeInTheDocument();
    expect(screen.getByText("数据源数量")).toBeInTheDocument();
    expect(screen.getByText(/数据更新于/)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "统计范围" })).toBeInTheDocument();
    expect(screen.queryByText(/演示数据|查看明细|即将开放/)).not.toBeInTheDocument();
    const hotAssetsTable = screen.getByRole("table", { name: "按调用次数排序的热门数据资产" });
    expect(within(hotAssetsTable).getByRole("columnheader", { name: "资产名称" })).toHaveAttribute("scope", "col");
    expect(within(hotAssetsTable).getByRole("columnheader", { name: "调用次数" })).toBeInTheDocument();
    expect(within(hotAssetsTable).getByText("订单表")).toBeInTheDocument();
    expect(within(hotAssetsTable).queryByRole("columnheader", { name: "存储量" })).not.toBeInTheDocument();

    await user.click(screen.getByText("近7天"));
    await waitFor(() => expect(overviewSpy).toHaveBeenLastCalledWith("7D"));
  });

  it("shows an error instead of demo or cached metrics when aggregation fails", async () => {
    vi.spyOn(dataAssetService, "getDataAssetOverview").mockRejectedValue(new Error("document summary unavailable"));

    renderRoute("/data-dashboard");

    expect(await screen.findByRole("alert")).toHaveTextContent("数据资产看板加载失败");
    expect(screen.getByText(/检查 DPS 和文档元数据汇总接口/)).toBeInTheDocument();
    expect(screen.queryByLabelText("数据资产指标")).not.toBeInTheDocument();
    expect(screen.queryByText("客户基础信息表")).not.toBeInTheDocument();
  });

  it("lists the space's real knowledge bases and keeps unimplemented asset categories disabled", async () => {
    renderRoute("/data-management");

    await screen.findByRole("heading", { name: "数据资产管理" }, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    const assetTabs = screen.getByRole("radiogroup", { name: "资产管理类型" });
    expect(within(assetTabs).getByRole("radio", { name: "知识库管理" })).toBeChecked();
    expect(within(assetTabs).getByRole("radio", { name: "数据源管理" })).toBeDisabled();
    expect(within(assetTabs).getByRole("radio", { name: "数据表管理" })).toBeDisabled();
    expect(within(assetTabs).getByRole("radio", { name: "数据接口管理" })).toBeDisabled();
    expect(within(assetTabs).getByRole("radio", { name: "指标管理" })).toBeDisabled();
    expect(screen.getByText(/当前仅开放知识库管理.*即将开放/)).toBeInTheDocument();

    // 知识库来自 DataHub，而不是演示数据
    expect(await screen.findByText("企业制度知识库")).toBeInTheDocument();
    expect(screen.getByText("合同与法务文件库")).toBeInTheDocument();
    expect(screen.queryByText("财务审计知识库")).not.toBeInTheDocument();
    expect(screen.queryByText("12,846")).not.toBeInTheDocument();

    // 统计只由真实列表派生
    expect(screen.getByText("知识库总数")).toBeInTheDocument();
    expect(screen.getByText("文档总数")).toBeInTheDocument();
    expect(screen.getByText("最近更新")).toBeInTheDocument();
    expect(screen.queryByText("解析完成")).not.toBeInTheDocument();
    expect(screen.queryByText("今日新增")).not.toBeInTheDocument();

    // 详情不再是禁用占位，而是站内知识库详情页；卡片本身就是入口
    expect(screen.getByRole("link", { name: "知识库：企业制度知识库" })).toHaveAttribute(
      "href",
      "/cloud/kb-policy"
    );
    expect(screen.queryByText(/新增与知识库详情即将开放/)).not.toBeInTheDocument();
  });

  it("disables adding a knowledge base when DataHub's address cannot be resolved", async () => {
    renderRoute("/data-management");

    await screen.findByRole("heading", { name: "数据资产管理" }, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    expect(screen.getByRole("button", { name: "添加知识库" })).toBeDisabled();
    expect(screen.getByText("无法从当前登录配置确定 DataHub 地址")).toBeInTheDocument();
  });

  it("exposes the real dashboard creation workflow instead of unavailable placeholders", async () => {
    renderRoute("/dashboard");

    await screen.findByRole("heading", { name: "大屏库" }, { timeout: ROUTE_LOAD_TIMEOUT_MS });
    expect(await screen.findByRole("heading", { name: "创建第一个大屏" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "新建大屏" })).toHaveLength(2);
    screen.getAllByRole("button", { name: "新建大屏" }).forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByText("去问数生成")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "看板市场" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "切换看板" })).not.toBeInTheDocument();
  });

  it("creates a blank dashboard and opens its full-screen editor", async () => {
    const user = userEvent.setup();
    renderRoute("/dashboard");

    await user.click((await screen.findAllByRole("button", { name: "新建大屏" }))[0]);
    await user.type(await screen.findByLabelText("大屏名称"), "数据资产经营看板");
    await user.click(screen.getByRole("button", { name: "创建并进入编辑器" }));

    expect(await screen.findByLabelText("看板编辑器工作区")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "星数主导航" })).not.toBeInTheDocument();
    expect(localStorage.getItem("xingshu.dashboard.records.v1")).toContain('"width":1920');
  });
});
