import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import type { OfficialDocumentDraft, OfficialDocumentWorkspaceSnapshot } from "@/types/officialDocument";
import { DraftDetailView } from "./DraftDetailView";

const mocks = vi.hoisted(() => ({
  loadOfficialDocumentWorkspace: vi.fn(),
  getOfficialDocumentDraftContent: vi.fn(),
  updateOfficialDocumentDraftContent: vi.fn(),
  detachOfficialDocumentBinding: vi.fn()
}));

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试公文服务",
    message: "测试环境没有返回演示数据。"
  },
  loadOfficialDocumentWorkspace: mocks.loadOfficialDocumentWorkspace,
  getOfficialDocumentDraftContent: mocks.getOfficialDocumentDraftContent,
  updateOfficialDocumentDraftContent: mocks.updateOfficialDocumentDraftContent,
  detachOfficialDocumentBinding: mocks.detachOfficialDocumentBinding
}));

const emptyWorkspace: OfficialDocumentWorkspaceSnapshot = {
  source: "LIVE",
  templates: [],
  drafts: [],
  capabilities: {
    wordEngine: { available: false },
    queryAssets: { available: false },
    acceptedFileTypes: [".docx"],
    bindingKinds: ["SCALAR", "FACT_SUMMARY", "TABLE"],
    exportFormats: ["DOCX", "PDF"],
    previewFormats: ["PDF"],
    editingMode: "STRUCTURED"
  },
  queryBindingCandidates: []
};

function workspaceWithDraft(draft: OfficialDocumentDraft): OfficialDocumentWorkspaceSnapshot {
  return { ...emptyWorkspace, drafts: [draft] };
}

function liveDraft(bindings: OfficialDocumentDraft["bindings"]): OfficialDocumentDraft {
  return {
    id: "draft-ready",
    title: "通知草稿",
    status: "READY",
    source: "LIVE",
    templateId: "template-1",
    templateVersionId: "version-1",
    templateName: "通知模板",
    currentFileVersionNo: 1,
    updatedAt: "2026-08-14T00:00:00Z",
    bindings
  };
}

function DraftDetailRoute() {
  const { draftId = "" } = useParams();
  return <DraftDetailView draftId={draftId} />;
}

function renderDraftDetail(draftId: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[`/writing/drafts/${draftId}`]}>
        <Routes>
          <Route path="/writing/drafts/:draftId" element={<DraftDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DraftDetailView", () => {
  beforeEach(() => {
    mocks.loadOfficialDocumentWorkspace.mockReset();
    mocks.getOfficialDocumentDraftContent.mockReset();
    mocks.updateOfficialDocumentDraftContent.mockReset();
    mocks.detachOfficialDocumentBinding.mockReset();
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
    mocks.getOfficialDocumentDraftContent.mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: []
    });
  });

  it("does not invent a demo draft when the live workspace is empty", async () => {
    renderDraftDetail("draft-missing");

    expect(await screen.findByText("未找到该公文草稿")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回草稿箱" })).toHaveAttribute("href", "/writing/drafts");
    expect(screen.queryByText(/示例/)).not.toBeInTheDocument();
  });

  it("disables DOCX and PDF export while a binding is STALE", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([{
      id: "bind-stale",
      queryAssetId: "asset-1",
      queryAssetName: "订单汇总",
      queryVersionId: "version-1",
      outputKey: "result",
      targetSlotTag: "xs:binding:slot-1",
      rendering: "SCALAR",
      status: "STALE",
      persisted: true
    }])));

    renderDraftDetail("draft-ready");
    const user = userEvent.setup();

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /问数与导出/ }));
    expect(await screen.findByRole("button", { name: "转为普通文本" })).toBeDisabled();
  });

  it("offers detach for an ACTIVE binding", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([{
      id: "bind-active",
      queryAssetId: "asset-1",
      queryAssetName: "订单汇总",
      queryVersionId: "version-1",
      outputKey: "result",
      targetSlotTag: "xs:binding:slot-1",
      rendering: "SCALAR",
      status: "ACTIVE",
      persisted: true
    }])));

    renderDraftDetail("draft-ready");
    const user = userEvent.setup();

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /问数与导出/ }));
    expect(await screen.findByRole("button", { name: "转为普通文本" })).toBeEnabled();
  });
});
