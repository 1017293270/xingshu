import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  detachOfficialDocumentBinding: vi.fn(),
  refreshOfficialDocumentBindings: vi.fn(),
  listOfficialDocumentDraftContentVersions: vi.fn(),
  listOfficialDocumentDraftExports: vi.fn()
}));

vi.mock("@/services/officialDocumentService", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/officialDocumentService")>(),
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试报告服务",
    message: "测试环境没有返回演示数据。"
  },
  loadOfficialDocumentWorkspace: mocks.loadOfficialDocumentWorkspace,
  getOfficialDocumentDraftContent: mocks.getOfficialDocumentDraftContent,
  updateOfficialDocumentDraftContent: mocks.updateOfficialDocumentDraftContent,
  detachOfficialDocumentBinding: mocks.detachOfficialDocumentBinding,
  refreshOfficialDocumentBindings: mocks.refreshOfficialDocumentBindings,
  listOfficialDocumentDraftContentVersions: mocks.listOfficialDocumentDraftContentVersions,
  listOfficialDocumentDraftExports: mocks.listOfficialDocumentDraftExports
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
    mocks.refreshOfficialDocumentBindings.mockReset();
    mocks.listOfficialDocumentDraftContentVersions.mockResolvedValue([]);
    mocks.listOfficialDocumentDraftExports.mockResolvedValue([]);
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
    mocks.getOfficialDocumentDraftContent.mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: []
    });
  });

  it("saves current edits before restoring history with the new expected revision", async () => {
    let current = { revision: 1, fixedValues: [], blocks: [{ id: "body", order: 0, role: "BODY", variantId: "", text: "原始正文" }] };
    const historical = { revision: 0, fixedValues: [], blocks: [{ ...current.blocks[0], text: "历史正文" }] };
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([])));
    mocks.getOfficialDocumentDraftContent.mockImplementation(async () => current);
    mocks.listOfficialDocumentDraftContentVersions.mockResolvedValue([{ revision: 0, savedAt: "2026-09-07T00:00:00Z", content: historical }]);
    mocks.updateOfficialDocumentDraftContent.mockImplementation(async (_id, input) => {
      current = { ...(input.restoreRevision === 0 ? historical : input), revision: input.expectedRevision + 1 };
      return current;
    });
    renderDraftDetail("draft-ready");
    fireEvent.change(await screen.findByDisplayValue("原始正文"), { target: { value: "未保存的新修改" } });
    fireEvent.click(screen.getByRole("button", { name: "正文与导出历史" }));
    fireEvent.click(await screen.findByRole("button", { name: "恢复此版为新版本" }));
    await waitFor(() => expect(mocks.updateOfficialDocumentDraftContent).toHaveBeenCalledWith("draft-ready", expect.objectContaining({ restoreRevision: 0 })));
    const calls = mocks.updateOfficialDocumentDraftContent.mock.calls;
    const restoreIndex = calls.findIndex((call) => call[1].restoreRevision === 0);
    expect(restoreIndex).toBeGreaterThan(0);
    expect(calls[restoreIndex - 1][1]).toMatchObject({ blocks: [expect.objectContaining({ text: "未保存的新修改" })] });
    expect(calls[restoreIndex][1].expectedRevision).toBe(calls[restoreIndex - 1][1].expectedRevision + 1);
    expect(await screen.findByDisplayValue("历史正文")).toBeInTheDocument();
  });

  it("shows stale fact review without blocking export and saves explicit user source review", async () => {
    const content = { revision: 1, fixedValues: [], blocks: [{ id: "body", order: 0, role: "BODY", variantId: "", text: "本次新增 3 个项目" }],
      factReview: { reviewedAt: "2026-09-07T00:00:00Z", confirmedAt: "2026-09-07T00:01:00Z", textSnapshot: "旧正文",
        issues: [{ sentence: "原句", additions: ["3 个"] }] } };
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([])));
    mocks.getOfficialDocumentDraftContent.mockResolvedValue(content);
    mocks.updateOfficialDocumentDraftContent.mockImplementation(async (_id, input) => ({ ...content, ...input, revision: input.expectedRevision + 1 }));
    renderDraftDetail("draft-ready");
    await screen.findByDisplayValue("本次新增 3 个项目");
    fireEvent.click(screen.getByRole("button", { name: "事实校对" }));
    expect(await screen.findByText("正文已修改，需重新核对；下方为上次校对记录。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "我已核对当前正文来源" }));
    await waitFor(() => expect(mocks.updateOfficialDocumentDraftContent).toHaveBeenCalledWith("draft-ready", expect.objectContaining({
      factReview: expect.objectContaining({ textSnapshot: "本次新增 3 个项目", confirmedAt: expect.any(String) })
    })));
    expect(await screen.findByText("当前正文的来源已由你标记为核对完成。")).toBeInTheDocument();
  });

  it("does not invent a demo draft when the live workspace is empty", async () => {
    renderDraftDetail("draft-missing");

    expect(await screen.findByText("未找到该报告草稿")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回草稿箱" })).toHaveAttribute("href", "/writing/drafts");
    expect(screen.queryByText(/示例/)).not.toBeInTheDocument();
  });

  it("disables export and detach when a stale binding has no frozen snapshot", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([{
      id: "bind-stale",
      queryAssetId: "asset-1",
      queryAssetName: "订单汇总",
      queryVersionId: "version-1",
      outputKey: "result",
      targetSlotTag: "xs:binding:slot-1",
      rendering: "SCALAR",
      status: "STALE",
      resolvedValue: 42,
      persisted: true
    }])));

    renderDraftDetail("draft-ready");
    const user = userEvent.setup();

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /导出检查/ }));
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
      snapshotId: "snapshot-1",
      resolvedValue: 42,
      persisted: true
    }])));

    renderDraftDetail("draft-ready");
    const user = userEvent.setup();

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /导出检查/ }));
    expect(await screen.findByRole("button", { name: "转为普通文本" })).toBeEnabled();
  });

  it.each([42, 0, false])("keeps a frozen value %s usable after refresh fails and the user detaches it", async (value) => {
    const binding: OfficialDocumentDraft["bindings"][number] = {
      id: "bind-frozen", queryAssetId: "asset-1", queryAssetName: "订单汇总",
      queryVersionId: "version-1", outputKey: "result", targetSlotTag: "xs:binding:slot-1",
      rendering: "SCALAR", status: "ACTIVE", persisted: true,
      executionId: "execution-old", snapshotId: "snapshot-old", cutoffAt: "2026-09-08T00:00:00Z", resolvedValue: value
    };
    const failed = { ...binding, status: "SCHEMA_DRIFT" as const };
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([binding])));
    mocks.getOfficialDocumentDraftContent.mockResolvedValue({ revision: 1, fixedValues: [],
      blocks: [{ id: "body-frozen", order: 0, role: "BODY", variantId: "body", text: `保留的原文 ${value}` }] });
    mocks.refreshOfficialDocumentBindings.mockResolvedValue([failed]);
    mocks.detachOfficialDocumentBinding.mockResolvedValue({ ...failed, status: "MANUAL" });
    const user = userEvent.setup();
    renderDraftDetail("draft-ready");
    await screen.findByDisplayValue(`保留的原文 ${value}`);
    await user.click(screen.getByRole("button", { name: "刷新绑定快照" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeDisabled());
    await user.click(screen.getByRole("button", { name: /导出检查/ }));
    const detach = await screen.findByRole("button", { name: "转为普通文本" });
    expect(detach).toBeEnabled();
    expect(screen.getByText("暂不可导出")).toBeInTheDocument();
    await user.click(detach);
    await waitFor(() => expect(mocks.detachOfficialDocumentBinding).toHaveBeenCalledWith("draft-ready", "bind-frozen"));
    expect(await screen.findByText("MANUAL")).toBeInTheDocument();
    expect(screen.getByText("snapshot-old")).toBeInTheDocument();
    expect(screen.getByText("execution-old")).toBeInTheDocument();
    expect(screen.getByDisplayValue(`保留的原文 ${value}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeEnabled();
    expect(screen.getByText("可导出", { exact: true })).toBeInTheDocument();
  });

  it("does not detach a failed binding with a snapshot ID but no preserved value", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([{
      id: "bind-empty", queryAssetId: "asset-1", queryVersionId: "version-1", outputKey: "result",
      targetSlotTag: "xs:binding:slot-1", rendering: "SCALAR", status: "SCHEMA_DRIFT", persisted: true,
      snapshotId: "snapshot-empty", resolvedValue: null
    }])));
    const user = userEvent.setup();
    renderDraftDetail("draft-ready");
    await screen.findByText("已保存");
    await user.click(screen.getByRole("button", { name: /导出检查/ }));
    expect(await screen.findByRole("button", { name: "转为普通文本" })).toBeDisabled();
    expect(mocks.detachOfficialDocumentBinding).not.toHaveBeenCalled();
  });

  it("keeps the failed binding and export restriction when detach is rejected", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([{
      id: "bind-conflict", queryAssetId: "asset-1", queryVersionId: "version-1", outputKey: "result",
      targetSlotTag: "xs:binding:slot-1", rendering: "SCALAR", status: "SCHEMA_DRIFT", persisted: true,
      snapshotId: "snapshot-old", resolvedValue: 42
    }])));
    mocks.detachOfficialDocumentBinding.mockRejectedValue(new Error("绑定已发生变化，请重新打开草稿"));
    const user = userEvent.setup();
    renderDraftDetail("draft-ready");
    await screen.findByText("已保存");
    await user.click(screen.getByRole("button", { name: /导出检查/ }));
    await user.click(await screen.findByRole("button", { name: "转为普通文本" }));
    expect(await screen.findByText("绑定已发生变化，请重新打开草稿")).toBeInTheDocument();
    expect(screen.getByText("SCHEMA_DRIFT")).toBeInTheDocument();
    expect(screen.getByText("snapshot-old")).toBeInTheDocument();
    expect(screen.queryByText("MANUAL")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeDisabled();
    const retryDetach = screen.getByRole("button", { name: /转为普通文本/ });
    expect(retryDetach).toBeEnabled();
    await user.click(retryDetach);
    await waitFor(() => expect(mocks.detachOfficialDocumentBinding).toHaveBeenCalledTimes(2));
  });

  it("allows Word export while a structured draft is still marked editing", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft({
      ...liveDraft([]),
      status: "EDITING"
    }));

    renderDraftDetail("draft-ready");

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
    });
  });

  it("keeps Word export available when PDF rendering is unavailable", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue({
      ...workspaceWithDraft(liveDraft([])),
      capabilities: {
        ...emptyWorkspace.capabilities,
        exportFormats: ["DOCX"],
        wordEngine: { available: true, detail: "LIBREOFFICE_UNAVAILABLE: PDF preview/export is disabled" }
      }
    });

    renderDraftDetail("draft-ready");

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();
  });

  it("explicitly saves edited content and supports retry after a failed save", async () => {
    const content = {
      revision: 1,
      fixedValues: [],
      blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body", text: "原正文" }]
    };
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(workspaceWithDraft(liveDraft([])));
    mocks.getOfficialDocumentDraftContent.mockResolvedValue(content);
    // 网络在用户重试前持续失败，避免600ms自动保存先消费一次性故障。
    mocks.updateOfficialDocumentDraftContent.mockRejectedValue(new Error("暂时无法保存"));
    const user = userEvent.setup();
    renderDraftDetail("draft-ready");

    const input = await screen.findByRole("textbox", { name: "正文节点 1" });
    fireEvent.change(input, { target: { value: "编辑后的正文" } });
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(await screen.findByText("保存失败：暂时无法保存")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeDisabled();
    expect(input).toHaveValue("编辑后的正文");

    mocks.updateOfficialDocumentDraftContent.mockImplementation(async (_id, saved) => ({ ...saved, revision: 2 }));
    await user.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(await screen.findByText("草稿已保存")).toBeInTheDocument();
    expect(mocks.updateOfficialDocumentDraftContent).toHaveBeenLastCalledWith("draft-ready", expect.objectContaining({
      expectedRevision: 1,
      blocks: [expect.objectContaining({ text: "编辑后的正文" })]
    }));
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeEnabled();
  });
});
