import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import type {
  OfficialDocumentTemplate,
  OfficialDocumentWorkspaceSnapshot
} from "@/types/officialDocument";
import { TemplateDetailView } from "./TemplateDetailView";

const mocks = vi.hoisted(() => ({
  loadOfficialDocumentWorkspace: vi.fn(),
  updateOfficialDocumentTemplateMapping: vi.fn(),
  publishOfficialDocumentTemplate: vi.fn(),
  createOfficialDocumentDraft: vi.fn()
}));

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试公文服务",
    message: "测试环境没有返回演示数据。"
  },
  loadOfficialDocumentWorkspace: mocks.loadOfficialDocumentWorkspace,
  updateOfficialDocumentTemplateMapping: mocks.updateOfficialDocumentTemplateMapping,
  publishOfficialDocumentTemplate: mocks.publishOfficialDocumentTemplate,
  createOfficialDocumentDraft: mocks.createOfficialDocumentDraft
}));

const emptyWorkspace: OfficialDocumentWorkspaceSnapshot = {
  source: "LIVE",
  templates: [],
  drafts: [],
  capabilities: {
    wordEngine: { available: false },
    queryAssets: { available: false },
    acceptedFileTypes: [".docx"],
    bindingKinds: ["SCALAR"],
    exportFormats: ["DOCX"],
    previewFormats: ["PDF"],
    editingMode: "STRUCTURED"
  },
  queryBindingCandidates: []
};

const reviewTemplate: OfficialDocumentTemplate = {
  id: "template-review",
  name: "请示（红头文件）",
  status: "NEEDS_REVIEW",
  source: "LIVE",
  updatedAt: "2026-08-16T15:52:00Z",
  currentVersion: {
    id: "version-review",
    versionNo: 1,
    fileName: "请示.docx",
    fileSize: 22 * 1024,
    createdAt: "2026-08-16T15:52:00Z",
    analysis: {
      templateVersionId: "version-review",
      sectionCount: 1,
      structureNodes: [
        {
          id: "paragraph:0",
          order: 1,
          paragraphIndex: 0,
          slotId: "11111111-1111-1111-1111-111111111111",
          role: "TITLE",
          roleLabel: "标题",
          preview: "关于示范项目的请示",
          editable: true,
          dataBinding: false,
          required: false,
          styleSummary: []
        },
        {
          id: "paragraph:1",
          order: 2,
          paragraphIndex: 1,
          slotId: "22222222-2222-2222-2222-222222222222",
          role: "BODY",
          roleLabel: "正文",
          preview: "现将有关事项请示如下。",
          editable: true,
          dataBinding: false,
          required: false,
          styleSummary: []
        }
      ],
      risks: [],
      capability: {
        engineName: "Syncfusion",
        engineVersion: "34.1.33",
        licenseMode: "FILE",
        onlineEditorCompatible: null,
        extractedFeatureCount: 2,
        fontSubstitutions: [],
        unsupportedWarnings: [],
        blockingReasons: []
      }
    }
  }
};

function TemplateDetailRoute() {
  const { templateId = "" } = useParams();
  return <TemplateDetailView templateId={templateId} />;
}

function renderTemplateDetail(templateId: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[`/writing/templates/${templateId}`]}>
        <Routes>
          <Route path="/writing/templates/:templateId" element={<TemplateDetailRoute />} />
          <Route path="/writing/drafts/:draftId" element={<div>草稿页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("TemplateDetailView", () => {
  beforeEach(() => {
    mocks.loadOfficialDocumentWorkspace.mockReset();
    mocks.updateOfficialDocumentTemplateMapping.mockReset();
    mocks.publishOfficialDocumentTemplate.mockReset();
    mocks.createOfficialDocumentDraft.mockReset();
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue(emptyWorkspace);
  });

  it("does not invent a demo template when the live workspace is empty", async () => {
    renderTemplateDetail("template-missing");

    expect(await screen.findByText("未找到该公文模板")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回模板库" })).toHaveAttribute("href", "/writing/templates");
    expect(screen.queryByText(/功能示例|演示/)).not.toBeInTheDocument();
  });

  it("lets an analyzed template create a draft without a calibration or publish step", async () => {
    mocks.loadOfficialDocumentWorkspace.mockResolvedValue({
      ...emptyWorkspace,
      templates: [reviewTemplate]
    });
    mocks.updateOfficialDocumentTemplateMapping.mockResolvedValue({
      id: "mapping-1",
      templateVersionId: "version-review",
      versionNo: 1,
      mappings: [],
      createdAt: "2026-08-16T15:52:00Z"
    });
    mocks.publishOfficialDocumentTemplate.mockResolvedValue(reviewTemplate.currentVersion);
    mocks.createOfficialDocumentDraft.mockResolvedValue({
      id: "draft-1",
      title: "请示 - 新草稿",
      status: "EDITING",
      source: "LIVE",
      templateId: reviewTemplate.id,
      templateVersionId: reviewTemplate.currentVersion.id,
      templateName: reviewTemplate.name,
      currentFileVersionNo: 1,
      updatedAt: "2026-08-16T16:00:00Z",
      bindings: []
    });

    renderTemplateDetail(reviewTemplate.id);
    const user = userEvent.setup();

    const createButton = await screen.findByRole("button", { name: "按模板新建草稿" });
    await waitFor(() => expect(createButton).toBeEnabled());
    expect(screen.queryByRole("button", { name: "保存角色映射" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布模板" })).not.toBeInTheDocument();

    await user.click(createButton);
    expect(await screen.findByRole("dialog", { name: "从模板创建公文草稿" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建草稿" }));

    await waitFor(() => {
      expect(mocks.updateOfficialDocumentTemplateMapping).toHaveBeenCalled();
      expect(mocks.publishOfficialDocumentTemplate).toHaveBeenCalledWith(
        reviewTemplate.id,
        reviewTemplate.currentVersion.id
      );
      expect(mocks.createOfficialDocumentDraft).toHaveBeenCalled();
    });
    expect(await screen.findByText("草稿页")).toBeInTheDocument();
  });
});
