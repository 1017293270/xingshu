import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import type { OfficialDocumentWorkspaceSnapshot } from "@/types/officialDocument";
import { DraftLibraryView } from "./DraftLibraryView";

const loadOfficialDocumentWorkspace = vi.fn();

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试公文服务",
    message: "测试环境未返回草稿数据。"
  },
  loadOfficialDocumentWorkspace: () => loadOfficialDocumentWorkspace()
}));

const emptyWorkspace: OfficialDocumentWorkspaceSnapshot = {
  source: "LIVE",
  capabilities: {
    wordEngine: { available: true },
    queryAssets: { available: true },
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
  drafts: [
    {
      id: "draft-1",
      title: "关于联调进展的通报",
      status: "READY",
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

function renderDraftBox() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/writing/drafts"]}>
        <DraftLibraryView />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DraftLibraryView", () => {
  beforeEach(() => {
    loadOfficialDocumentWorkspace.mockReset();
  });

  it("shows an empty draft box that points back to the template library", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
    renderDraftBox();

    expect(screen.getByLabelText("公文草稿箱")).toBeInTheDocument();
    expect(await screen.findByText("还没有公文草稿")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去模板库" })).toBeInTheDocument();
  });

  it("lists drafts only and keeps templates on their own page", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderDraftBox();

    const list = await screen.findByRole("list", { name: "公文草稿列表" });
    const row = within(list).getByRole("button", { name: "打开草稿 关于联调进展的通报" });
    expect(within(row).getByText("可导出")).toBeInTheDocument();
    expect(within(row).getByText("季度工作通知")).toBeInTheDocument();

    expect(screen.queryByRole("list", { name: "公文模板列表" })).not.toBeInTheDocument();
  });

  it("warns instead of navigating when no usable template exists", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderDraftBox();

    await screen.findByRole("list", { name: "公文草稿列表" });
    screen.getByRole("button", { name: /新建草稿/ }).click();

    expect(await screen.findByText(/还没有可用模板/)).toBeInTheDocument();
  });
});
