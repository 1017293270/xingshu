import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { getDataHubKnowledgeAppLinks } from "@/services/dataHubKnowledgeApp";
import { listDataHubKnowledgeBases } from "@/services/dataHubKnowledgeService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeBase } from "@/types/dataHub";
import { CloudPage } from "./CloudPage";

vi.mock("@/services/dataHubKnowledgeApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeApp")>();
  return {
    ...actual,
    getDataHubKnowledgeAppLinks: vi.fn()
  };
});

vi.mock("@/services/dataHubKnowledgeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeService")>();
  return {
    ...actual,
    listDataHubKnowledgeBases: vi.fn()
  };
});

const listKnowledgeBases = vi.mocked(listDataHubKnowledgeBases);
const knowledgeAppLinks = vi.mocked(getDataHubKnowledgeAppLinks);

const sampleKnowledgeBases: DataHubKnowledgeBase[] = [
  {
    id: "kb-policy",
    title: "企业制度知识库",
    description: "合同、制度、报告统一入库",
    documentCount: 48,
    updatedAt: "2026-08-13 10:00"
  },
  {
    id: "kb-legal",
    title: "合同法务知识库",
    description: "支持问答、写作与分析引用",
    documentCount: 22,
    updatedAt: "2026-08-12 11:26"
  },
  {
    id: "kb-hr",
    title: "人力资源知识库",
    description: "按部门空间隔离资料范围",
    documentCount: 19,
    updatedAt: "2026-08-11 17:08"
  }
];

function disabledAppLinks() {
  return {
    manageUrl: null,
    canAdd: false,
    addDisabledReason: "无法从当前登录配置确定 DataHub 地址",
    detailUrlFor: () => null
  };
}

function enabledAppLinks() {
  return {
    manageUrl: "https://datahub.example.test/knowledge?space_id=7",
    canAdd: true,
    addDisabledReason: undefined,
    detailUrlFor: (kbId: string) => `https://datahub.example.test/knowledge/${kbId}?space_id=7`
  };
}

function renderCloudPage() {
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
      <MemoryRouter>
        <CloudPage />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("CloudPage", () => {
  beforeEach(() => {
    listKnowledgeBases.mockReset();
    knowledgeAppLinks.mockReset();
    knowledgeAppLinks.mockReturnValue(disabledAppLinks());
    listKnowledgeBases.mockResolvedValue(sampleKnowledgeBases);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders knowledge bases from DataHub and derived metrics", async () => {
    renderCloudPage();

    expect(await screen.findByRole("link", { name: "知识库：企业制度知识库" })).toHaveAttribute(
      "href",
      "/cloud/kb-policy"
    );
    expect(screen.getAllByRole("link", { name: /知识库：/ })).toHaveLength(3);
    expect(screen.getByText("合同、制度、报告统一入库")).toBeInTheDocument();
    expect(within(screen.getByLabelText("云盘概览指标")).getByText("3", { selector: ".sr-only" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("云盘概览指标")).getByText("89", { selector: ".sr-only" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("云盘概览指标")).getByText("2026-08-13 10:00")).toBeInTheDocument();
    expect(screen.queryByText(/模拟上传|模拟同步|预览企业资料/)).not.toBeInTheDocument();
  });

  it("shows knowledge-base timestamps without the ISO T separator", async () => {
    listKnowledgeBases.mockResolvedValue([
      {
        id: "kb-contract",
        title: "合同知识库",
        documentCount: 9,
        updatedAt: "2026-07-17T11:02:15"
      },
      {
        id: "kb-test",
        title: "测试知识库",
        documentCount: 16,
        updatedAt: "2026-07-16T10:11:55"
      }
    ]);
    renderCloudPage();

    expect(await screen.findByRole("link", { name: "知识库：合同知识库" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("云盘概览指标")).getByText("2026-07-17 11:02:15")).toBeInTheDocument();
    expect(screen.getByText("2026-07-16 10:11:55")).toBeInTheDocument();
    expect(screen.queryByText("2026-07-17T11:02:15")).not.toBeInTheDocument();
  });

  it("shows an empty state when the space has no knowledge bases", async () => {
    listKnowledgeBases.mockResolvedValue([]);
    renderCloudPage();

    expect(await screen.findByText("暂无知识库")).toBeInTheDocument();
    expect(screen.getByText("当前空间还没有知识库。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "去 DataHub 添加" })).not.toBeInTheDocument();
  });

  it("retries a failed knowledge-base list", async () => {
    const user = userEvent.setup();
    listKnowledgeBases
      .mockRejectedValueOnce(new Error("知识库列表加载失败"))
      .mockResolvedValueOnce(sampleKnowledgeBases);
    renderCloudPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("知识库列表加载失败");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("link", { name: "知识库：企业制度知识库" })).toBeInTheDocument();
  });

  it("disables add when the DataHub app origin is not configured", async () => {
    renderCloudPage();

    await screen.findByRole("link", { name: "知识库：企业制度知识库" });
    expect(screen.getByRole("button", { name: "添加知识库" })).toBeDisabled();
    expect(screen.getByText("无法从当前登录配置确定 DataHub 地址")).toBeInTheDocument();
  });

  it("opens DataHub only from add, and keeps knowledge-base cards inside Xingshu", async () => {
    const user = userEvent.setup();
    knowledgeAppLinks.mockReturnValue(enabledAppLinks());
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderCloudPage();

    await screen.findByRole("link", { name: "知识库：企业制度知识库" });
    await user.click(screen.getByRole("button", { name: "添加知识库" }));
    expect(open).toHaveBeenCalledWith(
      "https://datahub.example.test/knowledge?space_id=7",
      "_blank",
      "noopener,noreferrer"
    );

    open.mockClear();
    await user.click(screen.getByRole("link", { name: "知识库：企业制度知识库" }));
    expect(open).not.toHaveBeenCalled();
  });

  it("opens DataHub from the empty-state action", async () => {
    const user = userEvent.setup();
    knowledgeAppLinks.mockReturnValue(enabledAppLinks());
    listKnowledgeBases.mockResolvedValue([]);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderCloudPage();

    await user.click(await screen.findByRole("button", { name: "去 DataHub 添加" }));
    expect(open).toHaveBeenCalledWith(
      "https://datahub.example.test/knowledge?space_id=7",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("refetches knowledge bases when the window is focused again", async () => {
    listKnowledgeBases
      .mockResolvedValueOnce(sampleKnowledgeBases.slice(0, 1))
      .mockResolvedValueOnce(sampleKnowledgeBases);
    renderCloudPage();

    expect(await screen.findByRole("link", { name: "知识库：企业制度知识库" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "知识库：合同法务知识库" })).not.toBeInTheDocument();

    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByRole("link", { name: "知识库：合同法务知识库" })).toBeInTheDocument();
    expect(listKnowledgeBases).toHaveBeenCalledTimes(2);
  });
});
