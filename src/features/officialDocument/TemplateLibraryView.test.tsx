import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type { OfficialDocumentWorkspaceSnapshot } from "@/types/officialDocument";
import { TemplateLibraryView } from "./TemplateLibraryView";

const loadOfficialDocumentWorkspace = vi.fn();

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试公文服务",
    message: "测试环境未返回模板数据。"
  },
  loadOfficialDocumentWorkspace: () => loadOfficialDocumentWorkspace(),
  uploadOfficialDocumentTemplate: vi.fn()
}));

const emptyWorkspace: OfficialDocumentWorkspaceSnapshot = {
  source: "LIVE",
  capabilities: {
    wordEngine: { available: false },
    queryAssets: { available: false },
    acceptedFileTypes: [".docx"],
    bindingKinds: ["SCALAR"],
    exportFormats: ["DOCX"],
    previewFormats: ["PDF"],
    editingMode: "STRUCTURED"
  },
  templates: [],
  drafts: [],
  queryBindingCandidates: []
};

const populatedWorkspace: OfficialDocumentWorkspaceSnapshot = {
  ...emptyWorkspace,
  capabilities: { ...emptyWorkspace.capabilities, wordEngine: { available: true } },
  templates: [
    {
      id: "template-1",
      name: "季度工作通知",
      status: "PUBLISHED",
      source: "LIVE",
      updatedAt: "2026-08-05T09:38:00Z",
      currentVersion: {
        id: "version-1",
        versionNo: 2,
        fileName: "季度工作通知.docx",
        fileSize: 38 * 1024,
        createdAt: "2026-08-01T02:00:00Z"
      }
    }
  ],
  drafts: [
    {
      id: "draft-1",
      title: "关于联调进展的通报",
      status: "EDITING",
      source: "LIVE",
      templateId: "template-1",
      templateVersionId: "version-1",
      templateName: "季度工作通知",
      currentFileVersionNo: 1,
      updatedAt: "2026-08-06T01:20:00Z",
      bindings: []
    }
  ]
};

function renderLibrary() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/writing/templates"]}>
        <TemplateLibraryView />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("TemplateLibraryView", () => {
  beforeEach(() => {
    useDataHubAuthStore.getState().clearAuthState();
    loadOfficialDocumentWorkspace.mockReset();
  });

  it("shows the live empty state without demo templates", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
    renderLibrary();

    expect(screen.getByLabelText("公文模板库")).toBeInTheDocument();
    expect(await screen.findByText("还没有可用的公文模板")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "上传 DOCX 模板" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("请联系管理员上传并发布公文模板。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开模板/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/功能示例|演示/)).not.toBeInTheDocument();
  });

  it("lets a signed-in member see unpublished templates and upload", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue({
      ...emptyWorkspace,
      templates: [
        {
          id: "template-review",
          name: "待校准通知",
          status: "NEEDS_REVIEW",
          source: "LIVE",
          updatedAt: "2026-08-16T09:38:00Z",
          currentVersion: {
            id: "version-review",
            versionNo: 1,
            fileName: "待校准通知.docx",
            fileSize: 12 * 1024,
            createdAt: "2026-08-16T09:00:00Z"
          }
        }
      ]
    });
    renderLibrary();

    const row = await screen.findByRole("button", { name: "打开模板 待校准通知" });
    expect(within(row).getByText("待校准")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "上传 DOCX 模板" }).length).toBeGreaterThan(0);
  });

  it("lists templates only and keeps drafts on their own page", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderLibrary();

    const list = await screen.findByRole("list", { name: "公文模板列表" });
    const row = within(list).getByRole("button", { name: "打开模板 季度工作通知" });
    expect(within(row).getByText("已发布")).toBeInTheDocument();
    expect(within(row).getByText("v2 · 季度工作通知.docx")).toBeInTheDocument();

    expect(screen.queryByRole("list", { name: "公文草稿列表" })).not.toBeInTheDocument();
    expect(screen.queryByText("关于联调进展的通报")).not.toBeInTheDocument();
  });
});
