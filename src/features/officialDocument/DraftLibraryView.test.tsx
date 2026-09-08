import { ConfigProvider } from "antd";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import type { OfficialDocumentWorkspaceSnapshot } from "@/types/officialDocument";
import { DraftLibraryView } from "./DraftLibraryView";

const { loadOfficialDocumentWorkspace, renameDraft, deleteDraft } = vi.hoisted(() => ({
  loadOfficialDocumentWorkspace: vi.fn(), renameDraft: vi.fn(), deleteDraft: vi.fn()
}));

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试报告服务",
    message: "测试环境未返回草稿数据。"
  },
  loadOfficialDocumentWorkspace: () => loadOfficialDocumentWorkspace(),
  renameOfficialDocumentDraft: (...args: unknown[]) => renameDraft(...args),
  deleteOfficialDocumentDraft: (...args: unknown[]) => deleteDraft(...args)
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

function Location() { return <output aria-label="当前路径">{useLocation().pathname}</output>; }

function renderDraftBox() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/writing/drafts"]}>
        <ConfigProvider theme={{ token: { motion: false } }}><DraftLibraryView /></ConfigProvider>
        <Location />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DraftLibraryView", () => {
  beforeEach(() => {
    loadOfficialDocumentWorkspace.mockReset();
    renameDraft.mockReset();
    deleteDraft.mockReset();
  });

  it("shows an empty draft box that points back to the template library", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
    renderDraftBox();

    expect(screen.getByLabelText("报告草稿箱")).toBeInTheDocument();
    expect(await screen.findByText("还没有报告草稿")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选格式模板" })).toBeInTheDocument();
  });

  it("lists drafts only and keeps templates on their own page", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderDraftBox();

    const list = await screen.findByRole("list", { name: "报告草稿列表" });
    expect(list).toHaveClass("official-document-templates__grid");
    expect(screen.getByRole("heading", { name: "草稿管理" })).toBeInTheDocument();
    expect(within(list).getByRole("listitem")).toHaveClass("official-document-template-card");
    const row = within(list).getByRole("button", { name: "打开草稿 关于联调进展的通报" });
    expect(within(row).getByText("可导出")).toBeInTheDocument();
    expect(within(row).getByText("季度工作通知")).toBeInTheDocument();

    expect(screen.queryByRole("list", { name: "结构模板列表" })).not.toBeInTheDocument();
  });

  it("warns instead of navigating when no usable template exists", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderDraftBox();

    await screen.findByRole("list", { name: "报告草稿列表" });
    screen.getByRole("button", { name: /新建草稿/ }).click();

    expect(await screen.findByText(/还没有可用格式模板/)).toBeInTheDocument();
  });
  it("orders drafts by actual update time, searches title or template, and opens editing", async () => {
    const user = userEvent.setup();
    loadOfficialDocumentWorkspace.mockResolvedValue({ ...populatedWorkspace, drafts: [
      populatedWorkspace.drafts[0],
      { ...populatedWorkspace.drafts[0], id: "draft-2", title: "最新工作计划", templateName: "年度工作模板", updatedAt: "2026-09-07T02:00:00Z", status: "EDITING" }
    ] });
    renderDraftBox();
    let list = await screen.findByRole("list", { name: "报告草稿列表" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("最新工作计划");
    expect(rows[0].querySelector("button button")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^编辑中/ }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await user.type(screen.getByRole("textbox", { name: "搜索草稿标题" }), "missing");
    expect(screen.getByText("没有符合条件的草稿")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByRole("button", { name: /^全部/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "搜索草稿标题" })).toHaveValue("");
    list = screen.getByRole("list", { name: "报告草稿列表" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await user.type(screen.getByRole("textbox", { name: "搜索草稿标题" }), "年度工作模板");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "打开草稿 最新工作计划" }));
    expect(screen.getByLabelText("当前路径")).toHaveTextContent("/writing/drafts/draft-2");
  });

  it("renames only after service success and keeps the template name", async () => {
    const user = userEvent.setup();
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renameDraft.mockResolvedValue({ ...populatedWorkspace.drafts[0], title: "更新的通报", templateName: "报告模板", updatedAt: "2026-09-07T02:00:00Z" });
    renderDraftBox();
    await user.click(await screen.findByRole("button", { name: "管理草稿 关于联调进展的通报" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    await user.clear(screen.getByRole("textbox", { name: "草稿名称" }));
    await user.type(screen.getByRole("textbox", { name: "草稿名称" }), "更新的通报");
    await user.click(screen.getByRole("button", { name: "保存名称" }));
    expect(renameDraft).toHaveBeenCalledWith("draft-1", "更新的通报");
    expect(await screen.findByRole("button", { name: "打开草稿 更新的通报" })).toHaveTextContent("季度工作通知");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("retains a failed rename and retries without losing the typed name", async () => {
    const user = userEvent.setup();
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renameDraft.mockRejectedValueOnce(new Error("名称保存失败"))
      .mockResolvedValueOnce({ ...populatedWorkspace.drafts[0], title: "重试通报" });
    renderDraftBox();
    await user.click(await screen.findByRole("button", { name: "管理草稿 关于联调进展的通报" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    await user.clear(screen.getByRole("textbox", { name: "草稿名称" }));
    await user.type(screen.getByRole("textbox", { name: "草稿名称" }), "重试通报");
    await user.click(screen.getByRole("button", { name: "保存名称" }));
    expect(await screen.findByText("名称保存失败")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "草稿名称" })).toHaveValue("重试通报");
    expect(screen.getByRole("button", { name: "打开草稿 关于联调进展的通报" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存名称" }));
    expect(await screen.findByRole("button", { name: "打开草稿 重试通报" })).toBeInTheDocument();
  });

  it("confirms deletion and preserves the row after failure until a successful retry", async () => {
    const user = userEvent.setup();
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    deleteDraft.mockRejectedValueOnce(new Error("删除失败，请重试")).mockResolvedValueOnce(undefined);
    renderDraftBox();
    await user.click(await screen.findByRole("button", { name: "管理草稿 关于联调进展的通报" }));
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("关于联调进展的通报");
    expect(dialog).toHaveTextContent("导出的文件链接也将无法访问");
    expect(deleteDraft).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "删除草稿" }));
    expect(await screen.findByText("删除失败，请重试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开草稿 关于联调进展的通报" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "删除草稿" }));
    expect(deleteDraft).toHaveBeenCalledTimes(2);
    expect(deleteDraft).toHaveBeenLastCalledWith("draft-1");
    await waitFor(() => expect(screen.queryByRole("button", { name: "打开草稿 关于联调进展的通报" })).not.toBeInTheDocument());
    expect(await screen.findByText("还没有报告草稿")).toBeInTheDocument();
  });

});
