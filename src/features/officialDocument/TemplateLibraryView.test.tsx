import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
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
    label: "测试报告服务",
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
        createdAt: "2026-08-01T02:00:00Z",
        analysis: {
          templateVersionId: "version-1",
          sectionCount: 4,
          pageCount: 3,
          structureNodes: [{
            id: "heading-1", order: 1, role: "HEADING_1", roleLabel: "一级标题",
            preview: "一、季度重点工作安排", editable: true, dataBinding: false,
            required: true, styleSummary: []
          }],
          risks: [],
          capability: {
            engineName: "test",
            engineVersion: "1",
            licenseMode: "FILE",
            onlineEditorCompatible: true,
            extractedFeatureCount: 1,
            fontSubstitutions: [],
            unsupportedWarnings: [],
            blockingReasons: []
          }
        }
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
        <Routes>
          <Route path="/writing/templates" element={<TemplateLibraryView />} />
          <Route path="/writing" element={<div aria-label="公文写作台">写作台</div>} />
          <Route path="/writing/templates/:templateId" element={<div aria-label="模板结构页">结构页</div>} />
        </Routes>
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

    expect(screen.getByLabelText("结构模板库")).toBeInTheDocument();
    expect(await screen.findByText("还没有可用的结构模板")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "上传结构 DOCX" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("请联系管理员上传并发布报告模板。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开模板/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/功能示例|演示/)).not.toBeInTheDocument();
  });

  it("opens the drag-and-drop upload dialog from the header button", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
    renderLibrary();

    await screen.findByText("还没有可用的结构模板");
    expect(screen.queryByText("把文件拖到这里")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "上传结构 DOCX" })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("把文件拖到这里")).toBeInTheDocument();
    expect(within(dialog).getByText("支持 .docx · 单个文件最大 25 MB")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "上传并分析" })).toBeDisabled();
  });

  it("lays templates out as cards that report their structure, not as a table", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderLibrary();

    const gallery = await screen.findByRole("region", { name: "结构模板列表" });
    expect(within(gallery).getByRole("button", { name: "打开模板 季度工作通知" })).toBeInTheDocument();
    expect(within(gallery).getByText("4 个章节 · 3 页")).toBeInTheDocument();
    expect(within(gallery).getByText("一、季度重点工作安排")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "结构模板列表" })).not.toBeInTheDocument();
    expect(screen.queryByText("关于联调进展的通报")).not.toBeInTheDocument();
  });

  it("hands the template back to the composer as this round's reference", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderLibrary();

    await userEvent.click(await screen.findByRole("button", { name: "使用模板 季度工作通知" }));
    expect(await screen.findByLabelText("公文写作台")).toBeInTheDocument();
  });

  it("combines filename search with status filters and recovers from no results", async () => {
    const original = populatedWorkspace.templates[0];
    loadOfficialDocumentWorkspace.mockResolvedValue({
      ...populatedWorkspace,
      templates: [original, {
        ...original,
        id: "template-blocked",
        name: "年度经营报告",
        status: "BLOCKED",
        currentVersion: { ...original.currentVersion, fileName: "AnnualReport.docx" }
      }, {
        ...original,
        id: "template-review",
        name: "会议纪要",
        status: "NEEDS_REVIEW"
      }]
    });
    const user = userEvent.setup();
    renderLibrary();

    expect(await screen.findByRole("button", { name: "使用模板 年度经营报告" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "使用模板 会议纪要" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /待处理/ }));
    expect(screen.getAllByRole("button", { name: /打开模板/ })).toHaveLength(1);
    await user.type(screen.getByRole("textbox", { name: "搜索模板" }), "  ANNUAL  ");
    expect(screen.getByRole("button", { name: "打开模板 年度经营报告" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /可用模板/ }));
    expect(screen.getByText("没有符合条件的模板")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getAllByRole("button", { name: /打开模板/ })).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "搜索模板" })).toHaveValue("");
  });

  it("opens the template structure page from the card body", async () => {
    loadOfficialDocumentWorkspace.mockResolvedValue(populatedWorkspace);
    renderLibrary();

    await userEvent.click(await screen.findByRole("button", { name: "打开模板 季度工作通知" }));
    expect(await screen.findByLabelText("模板结构页")).toBeInTheDocument();
  });
});
