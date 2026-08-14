import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import {
  listDataHubKnowledgeBases,
  listDataHubKnowledgeDocuments,
  loadDataHubKnowledgeMarkdown
} from "@/services/dataHubKnowledgeService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { DataHubKnowledgeDocument } from "@/types/dataHub";
import { CloudKnowledgeDetailPage } from "./CloudKnowledgeDetailPage";

vi.mock("@/services/dataHubKnowledgeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/dataHubKnowledgeService")>();
  return {
    ...actual,
    listDataHubKnowledgeBases: vi.fn(),
    listDataHubKnowledgeDocuments: vi.fn(),
    loadDataHubKnowledgeMarkdown: vi.fn()
  };
});

const listKnowledgeBases = vi.mocked(listDataHubKnowledgeBases);
const listDocuments = vi.mocked(listDataHubKnowledgeDocuments);
const loadMarkdown = vi.mocked(loadDataHubKnowledgeMarkdown);

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

function renderDetailPage() {
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
    listDocuments.mockReset();
    loadMarkdown.mockReset();
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
  });

  it("opens a contract as Markdown in an in-app preview even when source_available is false", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open");
    renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "打开 采购合同.pdf 原文" }));

    const dialog = await screen.findByRole("dialog", { name: "采购合同.pdf" });
    expect(loadMarkdown).toHaveBeenCalledWith("kb-policy", expect.objectContaining({
      docKey: "采购合同.pdf",
      sourceAvailable: false
    }));
    expect(open).not.toHaveBeenCalled();
    expect(dialog.querySelector("iframe")).toBeNull();
    expect(within(dialog).getByRole("article", { name: "采购合同.pdf Markdown 预览" }))
      .toHaveTextContent("甲方委托乙方提供咨询服务。");
    expect(within(dialog).getByRole("button", { name: "合同管理办法.pdf" })).toBeInTheDocument();
  });

  it("lets the reader switch to the next knowledge document", async () => {
    const user = userEvent.setup();
    loadMarkdown
      .mockResolvedValueOnce({ markdown: "# 合同管理办法\n\n制度正文。" })
      .mockResolvedValueOnce({ markdown: "# 采购合同\n\n合同正文。" });
    renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "打开 合同管理办法.pdf 原文" }));
    expect(await screen.findByRole("article", { name: "合同管理办法.pdf Markdown 预览" }))
      .toHaveTextContent("制度正文。");

    await user.click(screen.getByRole("button", { name: "下一份文档" }));
    expect(await screen.findByRole("article", { name: "采购合同.pdf Markdown 预览" }))
      .toHaveTextContent("合同正文。");
    expect(loadMarkdown).toHaveBeenCalledTimes(2);
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
