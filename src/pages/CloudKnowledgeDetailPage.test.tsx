import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import {
  listDataHubKnowledgeBases,
  listDataHubKnowledgeDocuments,
  loadDataHubKnowledgeMarkdown,
  loadDataHubKnowledgeSource
} from "@/services/dataHubKnowledgeService";
import { listDataHubSpaces } from "@/services/dataHubSpaceService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeDocument, DataHubSpace } from "@/types/dataHub";
import { CloudKnowledgeDetailPage } from "./CloudKnowledgeDetailPage";

vi.mock("@/services/dataHubKnowledgeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeService")>();
  return {
    ...actual,
    listDataHubKnowledgeBases: vi.fn(),
    listDataHubKnowledgeDocuments: vi.fn(),
    loadDataHubKnowledgeMarkdown: vi.fn(),
    loadDataHubKnowledgeSource: vi.fn()
  };
});

vi.mock("@/services/dataHubSpaceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubSpaceService")>();
  return {
    ...actual,
    listDataHubSpaces: vi.fn()
  };
});

const listKnowledgeBases = vi.mocked(listDataHubKnowledgeBases);
const listSpaces = vi.mocked(listDataHubSpaces);
const listDocuments = vi.mocked(listDataHubKnowledgeDocuments);
const loadMarkdown = vi.mocked(loadDataHubKnowledgeMarkdown);
const loadSource = vi.mocked(loadDataHubKnowledgeSource);

/** 当前空间（id=7）里当前用户的角色列表，判定只认「超级管理员」这一条 */
function spacesWithRoles(myRoles: string[]): DataHubSpace[] {
  return [
    {
      id: 7,
      spaceName: "示例空间",
      ownerId: 1,
      myRoles,
      memberCount: 4,
      createdAt: "2026-08-01 09:00:00"
    }
  ];
}

const sampleDocuments: DataHubKnowledgeDocument[] = [
  {
    id: "doc-1",
    title: "合同管理办法.pdf",
    docId: "doc-1",
    docKey: "policy.pdf",
    status: "indexed",
    sizeBytes: 2048,
    sourceAvailable: true,
    markdownAvailable: true,
    chunkCount: 12
  },
  {
    id: "doc-2",
    title: "草稿.docx",
    status: "parsing",
    sourceAvailable: false,
    markdownAvailable: false
  },
  {
    id: "采购合同.pdf",
    title: "采购合同.pdf",
    docKey: "采购合同.pdf",
    status: "indexed",
    sourceAvailable: false,
    markdownAvailable: true
  }
];

/**
 * isAdmin 是 JWT 里的**系统管理员**；空间管理员看 myRoles 是否含「超级管理员」。
 */
function renderDetailPage({
  isAdmin = false,
  myRoles
}: { isAdmin?: boolean; myRoles?: string[] } = {}) {
  if (myRoles) {
    listSpaces.mockResolvedValue(spacesWithRoles(myRoles));
  }
  localStorage.clear();
  useDataHubAuthStore.getState().clearAuthState();
  useDataHubAuthStore.getState().setAuth({
    token: "test-token",
    userId: 1,
    username: "zhangsan",
    isAdmin
  });
  useDataHubAuthStore.getState().setCurrentSpaceId(7);

  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/cloud/kb-policy"]}>
        <Routes>
          <Route path="/cloud" element={<div>云盘列表</div>} />
          <Route path="/cloud/:kbId" element={<CloudKnowledgeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("CloudKnowledgeDetailPage", () => {
  beforeEach(() => {
    listKnowledgeBases.mockReset();
    listSpaces.mockReset();
    listDocuments.mockReset();
    loadMarkdown.mockReset();
    loadSource.mockReset();
    // 默认：当前空间的普通成员
    listSpaces.mockResolvedValue(spacesWithRoles(["空间游客"]));
    listKnowledgeBases.mockResolvedValue([
      {
        id: "kb-policy",
        title: "企业制度知识库",
        description: "合同、制度、报告统一入库",
        documentCount: 48
      }
    ]);
    listDocuments.mockResolvedValue(sampleDocuments);
    loadMarkdown.mockResolvedValue({
      markdown: "# 采购合同\n\n甲方委托乙方提供咨询服务。"
    });
    loadSource.mockResolvedValue({
      url: "blob:xingshu-contract-pdf",
      contentType: "application/pdf",
      revoke: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders the knowledge-base document list inside Xingshu", async () => {
    renderDetailPage();

    expect(await screen.findByRole("heading", { name: "企业制度知识库", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回我的云盘" })).toHaveAttribute("href", "/cloud");
    expect(screen.getByRole("article", { name: "文档：合同管理办法.pdf" })).toBeInTheDocument();
    expect(screen.getAllByText("已入库")).toHaveLength(2);
    expect(screen.getByText("解析中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 草稿.docx 原文" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "打开 采购合同.pdf 原文" })).toBeEnabled();
    // 普通用户只看个人知识库
    expect(listKnowledgeBases.mock.calls.at(-1)).toEqual(["PERSONAL"]);
  });

  it("resolves the knowledge base from the space scope for a space admin", async () => {
    renderDetailPage({ myRoles: ["超级管理员"] });

    expect(await screen.findByRole("heading", { name: "企业制度知识库", level: 1 })).toBeInTheDocument();
    // 空间管理员走空间口径：知识库列表不带 scope_type
    expect(listKnowledgeBases.mock.calls.at(-1)).toEqual([undefined]);
  });

  it("keeps the space scope for a system admin whose space roles are empty", async () => {
    renderDetailPage({ isAdmin: true, myRoles: [] });

    expect(await screen.findByRole("heading", { name: "企业制度知识库", level: 1 })).toBeInTheDocument();
    expect(listKnowledgeBases.mock.calls.at(-1)).toEqual([undefined]);
    expect(listSpaces).not.toHaveBeenCalled();
  });

  it("falls back to the personal scope when the space list fails", async () => {
    listSpaces.mockRejectedValue(new Error("空间列表加载失败"));
    renderDetailPage();

    expect(await screen.findByRole("heading", { name: "企业制度知识库", level: 1 })).toBeInTheDocument();
    expect(listKnowledgeBases.mock.calls.at(-1)).toEqual(["PERSONAL"]);
  });

  it("holds the knowledge-base query until the space role resolves", async () => {
    let resolveSpaces: (spaces: DataHubSpace[]) => void = () => {};
    listSpaces.mockReturnValue(new Promise<DataHubSpace[]>((resolve) => {
      resolveSpaces = resolve;
    }));
    renderDetailPage();

    // 角色未落定：知识库列表一次都没请求（文档列表不吃口径，照常发）
    expect(listKnowledgeBases).not.toHaveBeenCalled();
    expect(await screen.findByRole("article", { name: "文档：合同管理办法.pdf" })).toBeInTheDocument();
    expect(listKnowledgeBases).not.toHaveBeenCalled();

    resolveSpaces(spacesWithRoles(["超级管理员"]));

    expect(await screen.findByRole("heading", { name: "企业制度知识库", level: 1 })).toBeInTheDocument();
    expect(listKnowledgeBases.mock.calls).toEqual([[undefined]]);
  });

  it("opens a contract PDF inside the Xingshu preview and never jumps outside", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open");
    renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "打开 采购合同.pdf 原文" }));

    const dialog = await screen.findByRole("dialog", { name: "采购合同.pdf" });
    expect(loadSource).toHaveBeenCalledWith("kb-policy", expect.objectContaining({
      docKey: "采购合同.pdf",
      sourceAvailable: false
    }));
    expect(loadMarkdown).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    const frame = dialog.querySelector("iframe");
    expect(frame).toHaveAttribute("title", "采购合同.pdf 原文预览");
    expect(frame).toHaveAttribute("src", "blob:xingshu-contract-pdf#toolbar=0&navpanes=0");
    expect(within(dialog).queryByRole("article", { name: "采购合同.pdf Markdown 预览" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "合同管理办法.pdf" })).toBeInTheDocument();
  });

  it("falls back to Markdown inside the same dialog when the original is not a PDF", async () => {
    const user = userEvent.setup();
    loadSource.mockRejectedValue(new Error("原文暂不可用"));
    renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "打开 采购合同.pdf 原文" }));

    const dialog = await screen.findByRole("dialog", { name: "采购合同.pdf" });
    expect(loadMarkdown).toHaveBeenCalledWith("kb-policy", expect.objectContaining({
      docKey: "采购合同.pdf"
    }));
    expect(dialog.querySelector("iframe")).toBeNull();
    expect(within(dialog).getByRole("article", { name: "采购合同.pdf Markdown 预览" }))
      .toHaveTextContent("甲方委托乙方提供咨询服务。");
  });

  it("lets the reader switch to the next knowledge document", async () => {
    const user = userEvent.setup();
    loadSource
      .mockResolvedValueOnce({
        url: "blob:xingshu-policy-pdf",
        contentType: "application/pdf",
        revoke: vi.fn()
      })
      .mockResolvedValueOnce({
        url: "blob:xingshu-contract-pdf",
        contentType: "application/pdf",
        revoke: vi.fn()
      });
    renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "打开 合同管理办法.pdf 原文" }));
    expect(await screen.findByTitle("合同管理办法.pdf 原文预览")).toHaveAttribute(
      "src",
      "blob:xingshu-policy-pdf#toolbar=0&navpanes=0"
    );

    await user.click(screen.getByRole("button", { name: "下一份文档" }));
    expect(await screen.findByTitle("采购合同.pdf 原文预览")).toHaveAttribute(
      "src",
      "blob:xingshu-contract-pdf#toolbar=0&navpanes=0"
    );
    expect(loadSource).toHaveBeenCalledTimes(2);
    expect(loadMarkdown).not.toHaveBeenCalled();
  });

  it("closes the in-app preview without jumping to DataHub", async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "打开 合同管理办法.pdf 原文" }));
    expect(await screen.findByRole("dialog", { name: "合同管理办法.pdf" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭原文预览" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
