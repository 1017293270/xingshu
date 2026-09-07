import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import type { OfficialDocumentWorkspaceSnapshot } from "@/types/officialDocument";
import { OfficialDocumentComposeView } from "./OfficialDocumentComposeView";

const FULL_DRAFT = [
  "[[XS_FIXED:title-slot]]",
  "关于开展2026年安全检查的通知",
  "[[XS_SECTION:reference-section-1]]",
  "# 一、检查安排",
  "各部门应按要求完成安全检查。",
  "",
  "检查范围覆盖生产、仓储、运输和外包作业四个环节，重点排查特种设备台账、消防通道占用、危化品存放以及外包人员资质四类问题，发现隐患应当场登记并明确整改责任人和完成时限。",
  "",
  "各单位应于本月底前完成自查并报送书面材料，公司将于下月上旬组织抽查复核，抽查结果纳入年度安全生产考核。对自查敷衍、隐患整改不到位的单位，按照有关规定追究相关责任人的管理责任。"
].join("\n");

const mocks = vi.hoisted(() => ({
  loadWorkspace: vi.fn(),
  getDraftContent: vi.fn(),
  createDraft: vi.fn(),
  updateDraftContent: vi.fn(),
  getDraftPreview: vi.fn(),
  getTransientPreview: vi.fn(),
  exportDraft: vi.fn(),
  exportTransient: vi.fn(),
  downloadExport: vi.fn(),
  analyzeContent: vi.fn(),
  executeResearchPlan: vi.fn(),
  uploadContentProfile: vi.fn(),
  getContentProfile: vi.fn(),
  uploadTemplate: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn()
}));

/**
 * 可推进的写作会话替身：send 推一轮 streaming，测试再自己 settle。
 * 组件现在是真多轮，固定返回一条 done 消息的旧替身没法覆盖流式、追问和停止。
 */
const chat = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    turns: [] as {
      id: string;
      question: string;
      status: "streaming" | "done" | "error" | "cancelled";
      error: string;
      purpose: string;
      ask: { done?: { summary: string }; assistantContent: string };
    }[],
    autoSettle: true,
    autoSettleContent: ""
  };
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const patch = (id: string, next: Partial<(typeof state.turns)[number]>) => {
    state.turns = state.turns.map((turn) => (turn.id === id ? { ...turn, ...next } : turn));
    notify();
  };
  return {
    listeners,
    state,
    notify,
    lastTurnId: () => state.turns[state.turns.length - 1]?.id ?? "",
    stream(id: string, content: string) {
      patch(id, { status: "streaming", ask: { assistantContent: content } });
    },
    settle(id: string, content: string) {
      patch(id, { status: "done", ask: { done: { summary: content }, assistantContent: content } });
    },
    fail(id: string, error: string) {
      patch(id, { status: "error", error, ask: { assistantContent: "" } });
    },
    cancel(id: string) {
      patch(id, { status: "cancelled", ask: { assistantContent: "" } });
    },
    reset() {
      state.turns = [];
      state.autoSettle = true;
      state.autoSettleContent = FULL_DRAFT;
    }
  };
});

const send = vi.fn((
  message: string,
  options?: { displayQuestion?: string; writingContext?: Record<string, unknown>; purpose?: string }
) => {
  const id = `turn-${chat.state.turns.length + 1}`;
  chat.state.turns = [...chat.state.turns, {
    id,
    question: options?.displayQuestion?.trim() || message,
    status: "streaming",
    error: "",
    purpose: "full-draft",
    ask: { assistantContent: "" }
  }];
  chat.notify();
  if (chat.state.autoSettle) {
    const content = chat.state.autoSettleContent;
    window.setTimeout(() => chat.settle(id, content), 0);
  }
  return id;
});

vi.mock("@/services/officialDocumentService", () => ({
  loadOfficialDocumentWorkspace: mocks.loadWorkspace,
  getOfficialDocumentDraftContent: mocks.getDraftContent,
  createOfficialDocumentDraft: mocks.createDraft,
  updateOfficialDocumentDraftContent: mocks.updateDraftContent,
  getOfficialDocumentDraftPreview: mocks.getDraftPreview,
  getOfficialDocumentTransientPreview: mocks.getTransientPreview,
  exportOfficialDocumentDraft: mocks.exportDraft,
  exportOfficialDocumentTransient: mocks.exportTransient,
  downloadOfficialDocumentExport: mocks.downloadExport,
  uploadOfficialDocumentContentProfile: mocks.uploadContentProfile,
  getOfficialDocumentContentProfile: mocks.getContentProfile,
  uploadOfficialDocumentTemplate: mocks.uploadTemplate
}));

vi.mock("@/services/writingContentAnalysisService", () => ({
  analyzeOfficialDocumentContent: mocks.analyzeContent
}));

vi.mock("@/services/officialDocumentResearchService", () => ({
  executeOfficialDocumentResearchPlan: mocks.executeResearchPlan,
  MAX_OFFICIAL_DOCUMENT_CHARTS: 3
}));

vi.mock("./useWritingChat", async () => {
  const { useEffect, useReducer } = await import("react");
  return {
    useWritingChat: () => {
      const [, force] = useReducer((tick: number) => tick + 1, 0);
      useEffect(() => {
        chat.listeners.add(force);
        return () => {
          chat.listeners.delete(force);
        };
      }, []);
      return {
        messages: chat.state.turns,
        busy: chat.state.turns.some((turn) => turn.status === "streaming"),
        send,
        stop: mocks.stop,
        reset: mocks.reset
      };
    }
  };
});

const workspace: OfficialDocumentWorkspaceSnapshot = {
  source: "LIVE",
  capabilities: {
    wordEngine: { available: true },
    queryAssets: { available: true },
    acceptedFileTypes: [".docx"],
    bindingKinds: ["SCALAR", "FACT_SUMMARY", "TABLE"],
    exportFormats: ["DOCX", "PDF"],
    previewFormats: ["PDF"],
    editingMode: "STRUCTURED"
  },
  templates: [{
    id: "template-1",
    name: "通知模板",
    status: "PUBLISHED",
    source: "LIVE",
    updatedAt: "2026-08-27T10:00:00Z",
    currentVersion: {
      id: "version-1",
      versionNo: 1,
      fileName: "通知模板.docx",
      fileSize: 1024,
      createdAt: "2026-08-27T10:00:00Z",
      analysis: {
        templateVersionId: "version-1",
        sectionCount: 1,
        structureNodes: [
          {
            id: "title-node",
            order: 0,
            paragraphIndex: 0,
            slotId: "title-slot",
            slotType: "FIXED_TEXT",
            role: "TITLE",
            roleLabel: "标题",
            preview: "通知标题",
            editable: true,
            dataBinding: false,
            required: true,
            styleSummary: [],
            variantId: "title-v1"
          },
          {
            id: "heading-node",
            order: 1,
            paragraphIndex: 1,
            slotId: "heading-slot",
            slotType: "BODY_REGION",
            role: "HEADING_1",
            roleLabel: "一级标题",
            preview: "一、原章节",
            editable: true,
            dataBinding: false,
            required: false,
            styleSummary: [],
            variantId: "heading-v1"
          },
          {
            id: "body-node",
            order: 2,
            paragraphIndex: 2,
            endParagraphIndex: 8,
            slotId: "body-slot",
            slotType: "BODY_REGION",
            role: "BODY",
            roleLabel: "正文",
            preview: "正文",
            editable: true,
            dataBinding: false,
            required: true,
            styleSummary: [],
            variantId: "body-v1"
          }
        ],
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
  }],
  drafts: [{
    id: "draft-reference",
    title: "季度通知草稿",
    status: "EDITING",
    source: "LIVE",
    templateId: "template-1",
    templateVersionId: "version-1",
    templateName: "通知模板",
    currentFileVersionNo: 2,
    updatedAt: "2026-08-27T12:00:00Z",
    bindings: []
  }],
  queryBindingCandidates: []
};

function renderView() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/writing"]}>
        <Routes>
          <Route path="/writing" element={<OfficialDocumentComposeView />} />
          <Route path="/writing/drafts/:draftId" element={<div aria-label="生成公文成品页">成品页</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

async function submitRequirement(user: ReturnType<typeof userEvent.setup>, requirement: string) {
  const input = await screen.findByRole("textbox", { name: "公文写作要求" });
  await user.type(input, requirement);
  await user.click(screen.getByRole("button", { name: "生成完整公文" }));
  return input;
}

async function openMentions(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByRole("textbox", { name: "公文写作要求" });
  await user.type(input, "@");
  const menu = await screen.findByRole("listbox", { name: "引用与动作" });
  return { input, menu };
}

async function pickReference(user: ReturnType<typeof userEvent.setup>) {
  const { input, menu } = await openMentions(user);
  await user.click(within(menu).getByRole("option", { name: /季度通知草稿/ }));
  return input;
}

describe("OfficialDocumentComposeView", () => {
  beforeEach(() => {
    chat.reset();
    send.mockClear();
    mocks.loadWorkspace.mockReset().mockResolvedValue(workspace);
    mocks.getDraftContent.mockReset().mockImplementation((draftId: string) => Promise.resolve(
      draftId === "draft-reference"
        ? {
          revision: 7,
          fixedValues: [{ slotId: "title-slot", value: "旧标题" }],
          blocks: [
            { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、原章节" },
            { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
          ]
        }
        : { revision: 0, fixedValues: [{ slotId: "title-slot", value: "" }], blocks: [] }
    ));
    mocks.createDraft.mockReset().mockResolvedValue({
      id: "draft-generated",
      title: "关于开展2026年安全检查的通知",
      status: "READY",
      source: "LIVE",
      templateId: "template-1",
      templateVersionId: "version-1",
      templateName: "报告模板",
      currentFileVersionNo: 1,
      updatedAt: "2026-08-27T13:00:00Z",
      bindings: []
    });
    mocks.updateDraftContent.mockReset().mockResolvedValue({ revision: 1, fixedValues: [], blocks: [] });
    mocks.getDraftPreview.mockReset().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    mocks.getTransientPreview.mockReset().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    mocks.exportDraft.mockReset().mockResolvedValue({
      id: "export-1",
      draftId: "draft-generated",
      status: "GENERATED",
      format: "DOCX",
      createdAt: "2026-08-27T13:01:00Z"
    });
    mocks.downloadExport.mockReset().mockResolvedValue(new Blob(["docx"]));
    mocks.exportTransient.mockReset().mockResolvedValue(new Blob(["docx"]));
    // 默认按「大纲分析不可用」走一步到位老路径，既有用例行为不变；大纲环用例单独改 mock
    mocks.analyzeContent.mockReset().mockRejectedValue(new Error("analysis unavailable"))
    mocks.executeResearchPlan.mockReset().mockResolvedValue([]);
    mocks.uploadContentProfile.mockReset();
    mocks.getContentProfile.mockReset();
    mocks.uploadTemplate.mockReset();
    mocks.stop.mockReset();
    mocks.reset.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:official-document")
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  it("keeps the entry page down to a centered title and the composer", async () => {
    renderView();

    expect(await screen.findByRole("heading", { name: "想写一篇什么公文？" })).toBeInTheDocument();
    // 模式 chip、模板浮层入口与文稿宫格都已下线，选参考草稿只走 @ Mentions
    expect(screen.queryByRole("button", { name: "公文写作：选择参考草稿" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("我的文稿")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /设为参考/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "公文写作要求" })).toBeInTheDocument();
    expect(screen.getByText("生成结果先保留在当前会话，确认后再保存到草稿箱。")).toBeInTheDocument();
  });

  it("keeps the mention menu closed after Escape keyup", async () => {
    const user = userEvent.setup();
    renderView();
    const input = await screen.findByRole("textbox", { name: "公文写作要求" });
    await user.type(input, "@");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /上传参考资料/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "引用与动作" })).not.toBeInTheDocument();
    expect(input).toHaveValue("@");
    expect(input).toHaveFocus();
  });

  it("keeps the generated document temporary until the user saves it to the draft box", async () => {
    const user = userEvent.setup();
    renderView();

    const input = await screen.findByRole("textbox", { name: "公文写作要求" });
    expect(screen.getByRole("button", { name: "生成完整公文" })).toBeDisabled();

    await pickReference(user);
    expect(screen.getByLabelText("本轮引用")).toHaveTextContent("@季度通知草稿");

    await submitRequirement(user, "撰写2026年安全检查通知");

    const artifact = await screen.findByRole("article", { name: "生成的公文文件" });
    expect(artifact).toHaveTextContent("关于开展2026年安全检查的通知");
    expect(artifact).toHaveTextContent("临时成稿");
    expect(artifact).toHaveTextContent("未保存");
    expect(screen.queryByLabelText("生成公文成品页")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(send).toHaveBeenCalledWith("撰写2026年安全检查通知", expect.objectContaining({
      writingContext: expect.objectContaining({ action: "REFERENCE_DRAFT" }),
      purpose: "full-draft"
    }));
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(mocks.updateDraftContent).not.toHaveBeenCalled();

    const saveButton = screen.getByRole("button", { name: "保存到草稿箱" });
    expect(saveButton).toHaveTextContent("");
    expect(saveButton).toHaveAttribute("title", "保存到草稿箱");
    await user.click(saveButton);

    expect(mocks.createDraft).toHaveBeenCalledWith({
      templateId: "template-1",
      templateVersionId: "version-1",
      title: "关于开展2026年安全检查的通知"
    });
    await waitFor(() => {
      expect(mocks.updateDraftContent).toHaveBeenCalledWith("draft-generated", expect.objectContaining({
        expectedRevision: 0,
        fixedValues: [{ slotId: "title-slot", value: "关于开展2026年安全检查的通知" }],
        blocks: expect.arrayContaining([
          expect.objectContaining({ role: "HEADING_1", text: "一、检查安排" }),
          expect.objectContaining({ role: "BODY", text: "各部门应按要求完成安全检查。" })
        ])
      }));
    });
    expect(mocks.updateDraftContent).not.toHaveBeenCalledWith("draft-reference", expect.anything());
    // 成稿可编辑是主路径：保存成功自动进入草稿编辑页
    await waitFor(() => expect(screen.getByLabelText("生成公文成品页")).toBeInTheDocument());
  });

  it("browses the generated file in a side panel and downloads it from there", async () => {
    const user = userEvent.setup();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    expect(screen.queryByRole("complementary", { name: "公文预览" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "浏览 关于开展2026年安全检查的通知" }));

    const panel = await screen.findByRole("complementary", { name: "公文预览" });
    expect(panel).toHaveTextContent("关于开展2026年安全检查的通知");
    expect(mocks.getTransientPreview).toHaveBeenCalledWith(expect.objectContaining({
      templateId: "template-1",
      title: "关于开展2026年安全检查的通知"
    }));
    expect(mocks.getDraftPreview).not.toHaveBeenCalled();
    // 对话没有被顶掉，仍然可以继续追问
    expect(screen.getByRole("region", { name: "公文生成对话" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "公文写作要求" })).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "下载" }));
    await user.click(await screen.findByText("下载 Word"));
    await waitFor(() => expect(mocks.exportTransient).toHaveBeenCalledWith(
      expect.objectContaining({ title: "关于开展2026年安全检查的通知" }),
      "DOCX"
    ));
    expect(mocks.downloadExport).not.toHaveBeenCalled();
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(screen.queryByLabelText("生成公文成品页")).not.toBeInTheDocument();
    anchorClick.mockRestore();
  });

  it("closes the side panel and gives the width back to the conversation", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await user.click(await screen.findByRole("button", { name: "浏览 关于开展2026年安全检查的通知" }));
    const panel = await screen.findByRole("complementary", { name: "公文预览" });

    await user.click(within(panel).getByRole("button", { name: "关闭预览" }));
    expect(screen.queryByRole("complementary", { name: "公文预览" })).not.toBeInTheDocument();
  });

  it("shows generation as a conversation while reading the reference draft", async () => {
    mocks.getDraftContent.mockReset().mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const conversation = await screen.findByRole("region", { name: "公文生成对话" });
    expect(conversation).toHaveTextContent("撰写2026年安全检查通知");
    expect(conversation).toHaveTextContent("正在读取“季度通知草稿”的结构与文风");
    expect(screen.queryByRole("heading", { name: "想写一篇什么公文？" })).not.toBeInTheDocument();
  });

  it("keeps earlier turns when the user follows up, and versions the new draft", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });

    await submitRequirement(user, "标题再短一点");
    await waitFor(() => expect(screen.getAllByRole("article", { name: "生成的公文文件" })).toHaveLength(2));

    const conversation = screen.getByRole("region", { name: "公文生成对话" });
    expect(conversation).toHaveTextContent("撰写2026年安全检查通知");
    expect(conversation).toHaveTextContent("标题再短一点");
    // 会话不再每轮重开，模型才能看到上一版
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("streams the draft into the conversation without leaking section anchors", async () => {
    chat.state.autoSettle = false;
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await waitFor(() => expect(send).toHaveBeenCalled());

    const turnId = chat.lastTurnId();
    act(() => chat.stream(turnId, "[[XS_SECTION:reference-section-1]]\n# 一、检查安排\n各部门应按要求"));

    const conversation = screen.getByRole("region", { name: "公文生成对话" });
    await waitFor(() => expect(conversation).toHaveTextContent("一、检查安排"));
    expect(conversation).not.toHaveTextContent("XS_SECTION");
    expect(screen.queryByRole("article", { name: "生成的公文文件" })).not.toBeInTheDocument();
  });

  it("lays the streaming draft out as an official document, not as markdown headings", async () => {
    chat.state.autoSettle = false;
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await waitFor(() => expect(send).toHaveBeenCalled());

    act(() => chat.stream(chat.lastTurnId(), FULL_DRAFT));

    const conversation = screen.getByRole("region", { name: "公文生成对话" });
    await waitFor(() => expect(conversation).toHaveTextContent("一、检查安排"));
    // 标题走固定字段锚点拿到 TITLE 角色，章节按公文分级，而不是 markdown 的 h1/h2
    const title = conversation.querySelector('[data-role="TITLE"]');
    expect(title).toHaveTextContent("关于开展2026年安全检查的通知");
    expect(conversation.querySelector('[data-role="HEADING_1"]')).toHaveTextContent("一、检查安排");
    expect(conversation.querySelector("h1, h2, h3")).toBeNull();
  });

  it("renders the side panel through the Word engine, and only on demand", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });

    // 展开内联全文不该触发服务端排版
    await user.click(screen.getByRole("button", { name: /展开全文/ }));
    expect(mocks.getTransientPreview).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "浏览 关于开展2026年安全检查的通知" }));
    await waitFor(() => expect(mocks.getTransientPreview).toHaveBeenCalledTimes(1));
    const frame = await screen.findByTitle("生成公文 PDF 预览");
    expect(frame).toHaveAttribute("src", "blob:official-document");
  });

  it("falls back to the structured preview in the panel when the Word engine fails", async () => {
    mocks.getTransientPreview.mockRejectedValue(new Error("排版服务不可用"));
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });
    await user.click(screen.getByRole("button", { name: "浏览 关于开展2026年安全检查的通知" }));

    const panel = await screen.findByRole("complementary", { name: "公文预览" });
    expect(within(panel).getByText(/Word 引擎渲染失败/)).toBeInTheDocument();
    expect(screen.queryByTitle("生成公文 PDF 预览")).not.toBeInTheDocument();
    // 兜底仍然按公文分级渲染，不是一个空白框
    expect(panel.querySelector('[data-role="HEADING_1"]')).toHaveTextContent("一、检查安排");
    expect(within(panel).getByRole("button", { name: "重新渲染" })).toBeInTheDocument();
  });

  it("collapses the finished draft and expands it on demand", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });

    const toggle = screen.getByRole("button", { name: /展开全文/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /收起全文/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("copies the answer text", async () => {
    const user = userEvent.setup();
    // userEvent.setup() 自己会替换 navigator.clipboard，替身必须压在它后面
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });

    await user.click(screen.getByRole("button", { name: "复制回答" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).not.toContain("XS_SECTION");
    expect(await screen.findByText("已复制回答")).toBeInTheDocument();
  });

  it("offers to continue after the user stops generation", async () => {
    chat.state.autoSettle = false;
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await waitFor(() => expect(send).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "停止" }));
    expect(mocks.stop).toHaveBeenCalled();
    act(() => chat.cancel(chat.lastTurnId()));

    chat.state.autoSettle = true;
    await user.click(await screen.findByRole("button", { name: "继续生成" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toBe("撰写2026年安全检查通知");
  });

  it("keeps an unparsable answer as plain text instead of a red error", async () => {
    chat.state.autoSettleContent = "标题可以改成《关于安全检查的通知》，其余章节保持不变。";
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "标题改一下");

    const note = await screen.findByText(/没能解析成公文结构/);
    expect(note).toBeInTheDocument();
    expect(screen.getByText(/关于安全检查的通知/)).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "生成的公文文件" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重出完整版" })).toBeInTheDocument();
  });

  it("keeps the conversation when the reference draft changes", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });

    await user.click(screen.getByRole("button", { name: "移除本轮引用" }));
    await pickReference(user);

    const conversation = screen.getByRole("region", { name: "公文生成对话" });
    expect(within(conversation).getByText("撰写2026年安全检查通知")).toBeInTheDocument();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("大纲确认环：确认后自动补资料并把研究结果映射进写作上下文", async () => {
    const user = userEvent.setup();
    mocks.analyzeContent.mockReset().mockResolvedValue({
      summary: "按参考结构梳理",
      sections: [{
        id: "s1",
        order: 0,
        headingRole: "HEADING_1",
        title: "一、原章节",
        purpose: "说明检查安排",
        keyPoints: ["范围", "时限"],
        sourceBlockIds: []
      }],
      researchNeeds: [{
        id: "n1",
        sectionId: "s1",
        kind: "ASK_DATA",
        question: "2026年检查完成数量",
        reason: "正文需要数量",
        required: true,
        preferredOutput: "TABLE"
      }],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    mocks.executeResearchPlan.mockReset().mockResolvedValue([{
      taskId: "n1",
      sectionId: "s1",
      kind: "ASK_DATA",
      question: "2026年检查完成数量",
      required: true,
      preferredOutput: "TABLE",
      status: "SUCCESS",
      summary: "全年共完成检查 120 次",
      citations: []
    }]);
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const outline = await screen.findByRole("region", { name: "写作大纲确认" });
    expect(within(outline).getByDisplayValue("一、原章节")).toBeInTheDocument();
    expect(within(outline).getByText("2026年检查完成数量")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();

    await user.click(within(outline).getByRole("button", { name: "确认大纲，补资料并生成" }));

    await waitFor(() => expect(mocks.executeResearchPlan).toHaveBeenCalledTimes(1));
    expect(mocks.executeResearchPlan.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: "n1", question: "2026年检查完成数量" })
    ]);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const context = send.mock.calls[0][1]?.writingContext as {
      referenceSections: Array<{ id: string }>;
      researchResults?: Array<{ sectionId: string; summary: string }>;
      outputRules: { allowResearch: boolean; sectionAnchors: string[] };
    };
    // 章节锚点即已确认大纲的 section id，研究结果挂在同一个 id 上随上下文注入
    expect(context.referenceSections.map((section) => section.id)).toEqual(["s1"]);
    expect(context.outputRules.sectionAnchors).toEqual(["[[XS_SECTION:s1]]"]);
    expect(context.researchResults).toEqual([
      expect.objectContaining({ sectionId: "s1", summary: "全年共完成检查 120 次" })
    ]);
    expect(context.outputRules.allowResearch).toBe(true);
  });

  it("大纲确认环：跳过大纲直接生成走老路径，不跑研究", async () => {
    const user = userEvent.setup();
    mocks.analyzeContent.mockReset().mockResolvedValue({
      summary: "",
      sections: [{
        id: "s1", order: 0, headingRole: "HEADING_1", title: "一、原章节",
        purpose: "", keyPoints: [], sourceBlockIds: []
      }],
      researchNeeds: [],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const outline = await screen.findByRole("region", { name: "写作大纲确认" });
    await user.click(within(outline).getByRole("button", { name: "跳过大纲直接生成" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(mocks.executeResearchPlan).not.toHaveBeenCalled();
    const context = send.mock.calls[0][1]?.writingContext as {
      researchResults?: unknown;
      outputRules: { allowResearch: boolean };
    };
    expect(context.researchResults).toBeUndefined();
    expect(context.outputRules.allowResearch).toBe(false);
  });

  it("大纲确认环：取消把要求放回输入框，不发起生成", async () => {
    const user = userEvent.setup();
    mocks.analyzeContent.mockReset().mockResolvedValue({
      summary: "",
      sections: [{
        id: "s1", order: 0, headingRole: "HEADING_1", title: "一、原章节",
        purpose: "", keyPoints: [], sourceBlockIds: []
      }],
      researchNeeds: [],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    renderView();

    await pickReference(user);
    const input = await submitRequirement(user, "撰写2026年安全检查通知");

    const outline = await screen.findByRole("region", { name: "写作大纲确认" });
    await user.click(within(outline).getByRole("button", { name: "取消" }));

    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "写作大纲确认" })).not.toBeInTheDocument();
    expect(input).toHaveValue("撰写2026年安全检查通知");
  });

  it("分析等待态给出耗时、参考骨架和两个出口", async () => {
    const user = userEvent.setup();
    // 分析挂着不返回：等待态是这个用例唯一要看的东西
    mocks.analyzeContent.mockReset().mockReturnValue(new Promise(() => undefined));
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const card = await screen.findByRole("region", { name: "写作大纲分析中" });
    expect(within(card).getByText("正在梳理写作大纲")).toBeInTheDocument();
    expect(within(card).getByText(/\d+ 秒/)).toBeInTheDocument();
    // 骨架来自参考模板真实的标题节点
    expect(within(card).getByText("《通知模板》· 1 个章节")).toBeInTheDocument();
    expect(within(card).getByText("一、原章节")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "跳过大纲直接生成" })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("分析等待态：取消作废在途分析并把要求放回输入框", async () => {
    const user = userEvent.setup();
    let resolveAnalysis: ((plan: unknown) => void) | undefined;
    mocks.analyzeContent.mockReset().mockReturnValue(new Promise((resolve) => {
      resolveAnalysis = resolve;
    }));
    renderView();

    await pickReference(user);
    const input = await submitRequirement(user, "撰写2026年安全检查通知");

    const card = await screen.findByRole("region", { name: "写作大纲分析中" });
    await user.click(within(card).getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("region", { name: "写作大纲分析中" })).not.toBeInTheDocument();
    expect(input).toHaveValue("撰写2026年安全检查通知");

    // 取消后迟到的分析结果必须被丢掉，不能反手弹出大纲卡
    resolveAnalysis?.({
      summary: "",
      sections: [{
        id: "s1", order: 0, headingRole: "HEADING_1", title: "一、原章节",
        purpose: "", keyPoints: [], sourceBlockIds: []
      }],
      researchNeeds: [],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    await waitFor(() => expect(screen.queryByRole("region", { name: "写作大纲确认" })).not.toBeInTheDocument());
    expect(send).not.toHaveBeenCalled();
  });

  it("分析等待态：跳过大纲直接生成走一步到位的老路径", async () => {
    const user = userEvent.setup();
    mocks.analyzeContent.mockReset().mockReturnValue(new Promise(() => undefined));
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const card = await screen.findByRole("region", { name: "写作大纲分析中" });
    await user.click(within(card).getByRole("button", { name: "跳过大纲直接生成" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(mocks.executeResearchPlan).not.toHaveBeenCalled();
  });

  it("大纲确认环：改过的标题和删掉的章节真正决定成稿骨架", async () => {
    const user = userEvent.setup();
    mocks.analyzeContent.mockReset().mockResolvedValue({
      summary: "",
      sections: [
        {
          id: "s1", order: 0, headingRole: "HEADING_1", title: "一、检查安排",
          purpose: "交代本次检查的范围", keyPoints: ["覆盖四个环节"], sourceBlockIds: []
        },
        {
          id: "s2", order: 1, headingRole: "HEADING_1", title: "二、工作要求",
          purpose: "提出整改时限", keyPoints: [], sourceBlockIds: []
        }
      ],
      researchNeeds: [],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const outline = await screen.findByRole("region", { name: "写作大纲确认" });
    const title = within(outline).getByDisplayValue("一、检查安排");
    await user.clear(title);
    await user.type(title, "一、检查安排（用户改过）");
    await user.click(within(outline).getByRole("button", { name: "删除章节：二、工作要求" }));
    await user.click(within(outline).getByRole("button", { name: "确认大纲并生成" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const context = send.mock.calls[0][1]?.writingContext as {
      referenceSections: Array<Record<string, unknown>>;
      outputRules: Record<string, unknown>;
    };
    // 章节骨架与 [[XS_SECTION]] 锚点全部来自用户拍板的那份大纲
    expect(context.referenceSections).toEqual([{
      id: "s1",
      order: 0,
      headingRole: "HEADING_1",
      title: "一、检查安排（用户改过）",
      bodyRequired: true,
      purpose: "交代本次检查的范围",
      keyPoints: ["覆盖四个环节"]
    }]);
    expect(context.outputRules.sectionAnchors).toEqual(["[[XS_SECTION:s1]]"]);
    expect(context.outputRules.confirmedOutline).toBe(true);
    // 删掉的章节和参考草稿自身的旧标题都不再进上下文
    expect(JSON.stringify(context)).not.toContain("二、工作要求");
    expect(JSON.stringify(context.referenceSections)).not.toContain("一、原章节");
  });

  it("大纲确认环：研究拿到的表格与图表随正文进这一轮临时成稿", async () => {
    const user = userEvent.setup();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    chat.state.autoSettleContent = [
      "[[XS_FIXED:title-slot]]",
      "关于开展2026年安全检查的通知",
      "[[XS_SECTION:s1]]",
      "# 一、检查安排",
      "各部门应按要求完成安全检查。"
    ].join("\n");
    mocks.analyzeContent.mockReset().mockResolvedValue({
      summary: "",
      sections: [{
        id: "s1", order: 0, headingRole: "HEADING_1", title: "一、检查安排",
        purpose: "交代检查安排", keyPoints: [], sourceBlockIds: []
      }],
      researchNeeds: [{
        id: "n1", sectionId: "s1", kind: "ASK_DATA",
        question: "2026年检查完成数量", reason: "正文需要数量",
        required: true, preferredOutput: "TABLE"
      }],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    const researchTable = { columns: ["季度", "次数"], rows: [["Q1", "30"]], totalRows: 1 };
    const researchChart = {
      mimeType: "image/png",
      base64: "iVBORw0KGgo=",
      widthPx: 640,
      heightPx: 360,
      altText: "各季度检查次数柱状图"
    };
    const researchSource = { kind: "QUERY_ASSET", queryAssetId: "qa-1", outputKey: "out-1" };
    mocks.executeResearchPlan.mockReset().mockResolvedValue([{
      taskId: "n1",
      sectionId: "s1",
      kind: "ASK_DATA",
      question: "2026年检查完成数量",
      required: true,
      preferredOutput: "TABLE",
      status: "SUCCESS",
      summary: "全年共完成检查 120 次",
      table: researchTable,
      chart: researchChart,
      querySource: researchSource,
      citations: []
    }]);
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const outline = await screen.findByRole("region", { name: "写作大纲确认" });
    await user.click(within(outline).getByRole("button", { name: "确认大纲，补资料并生成" }));

    const artifact = await screen.findByRole("article", { name: "生成的公文文件" });
    // 产物卡直接报数，用户不用打开预览就知道图表混排进去了
    await waitFor(() => expect(artifact).toHaveTextContent("1 表 1 图"));

    await user.click(within(artifact).getByRole("button", { name: "下载" }));
    await user.click(await screen.findByText("下载 Word"));
    await waitFor(() => expect(mocks.exportTransient).toHaveBeenCalledTimes(1));
    const exported = mocks.exportTransient.mock.calls[0][0] as {
      blocks: Array<{
        role: string;
        text: string;
        sourceTaskIds?: string[];
        table?: unknown;
        chart?: unknown;
        source?: unknown;
      }>;
    };
    expect(exported.blocks.map((block) => [block.role, block.text])).toEqual([
      ["HEADING_1", "一、检查安排"],
      ["BODY", "各部门应按要求完成安全检查。"],
      ["TABLE", "2026年检查完成数量"],
      ["CHART_IMAGE", "各季度检查次数柱状图"]
    ]);
    expect(exported.blocks[2].table).toEqual(researchTable);
    expect(exported.blocks[2].source).toEqual(researchSource);
    expect(exported.blocks[2].sourceTaskIds).toEqual(["n1"]);
    // 图表 base64 只在写作上下文里被剥掉，进成稿的必须是完整图
    expect(exported.blocks[3].chart).toEqual(researchChart);
    expect(exported.blocks[3].source).toEqual(researchSource);
    anchorClick.mockRestore();
  });

  it("保存到草稿箱时把这一轮研究材料一并落库", async () => {
    const user = userEvent.setup();
    chat.state.autoSettleContent = [
      "[[XS_FIXED:title-slot]]",
      "关于开展2026年安全检查的通知",
      "[[XS_SECTION:s1]]",
      "# 一、检查安排",
      "各部门应按要求完成安全检查。"
    ].join("\n");
    mocks.analyzeContent.mockReset().mockResolvedValue({
      summary: "",
      sections: [{
        id: "s1", order: 0, headingRole: "HEADING_1", title: "一、检查安排",
        purpose: "交代检查安排", keyPoints: [], sourceBlockIds: []
      }],
      researchNeeds: [
        {
          id: "n1", sectionId: "s1", kind: "ASK_DATA",
          question: "2026年检查完成数量", reason: "正文需要数量",
          required: true, preferredOutput: "TABLE"
        },
        {
          id: "n2", sectionId: "s1", kind: "ASK_KNOWLEDGE",
          question: "上级最新检查口径", reason: "正文需要依据",
          required: false, preferredOutput: "FACT"
        }
      ],
      unassignedSourceBlockIds: [],
      warnings: []
    });
    const roundResults = [
      {
        taskId: "n1",
        sectionId: "s1",
        kind: "ASK_DATA",
        question: "2026年检查完成数量",
        required: true,
        preferredOutput: "TABLE",
        status: "SUCCESS",
        summary: "全年共完成检查 120 次",
        table: { columns: ["季度", "次数"], rows: [["Q1", "30"]], totalRows: 1 },
        chart: {
          mimeType: "image/png",
          base64: "iVBORw0KGgo=",
          widthPx: 640,
          heightPx: 360,
          altText: "各季度检查次数柱状图"
        },
        querySource: { kind: "QUERY_ASSET", queryAssetId: "qa-1", outputKey: "out-1" },
        citations: []
      },
      {
        taskId: "n2",
        sectionId: "s1",
        kind: "ASK_KNOWLEDGE",
        question: "上级最新检查口径",
        required: false,
        preferredOutput: "FACT",
        status: "FAILED",
        summary: "",
        citations: []
      }
    ];
    mocks.executeResearchPlan.mockReset().mockResolvedValue(roundResults);
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    const outline = await screen.findByRole("region", { name: "写作大纲确认" });
    await user.click(within(outline).getByRole("button", { name: "确认大纲，补资料并生成" }));

    await screen.findByRole("article", { name: "生成的公文文件" });
    await user.click(screen.getByRole("button", { name: "保存到草稿箱" }));

    await waitFor(() => expect(mocks.updateDraftContent).toHaveBeenCalledTimes(1));
    // 图表 base64 与失败项都原样留在草稿里：资料面板要列全量任务，再生成要拿得到出处
    expect(mocks.updateDraftContent.mock.calls[0][1].researchResults).toEqual(roundResults);
  });

  it("跳过大纲的轮次保存时不带 researchResults", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");

    await screen.findByRole("article", { name: "生成的公文文件" });
    await user.click(screen.getByRole("button", { name: "保存到草稿箱" }));

    await waitFor(() => expect(mocks.updateDraftContent).toHaveBeenCalledTimes(1));
    expect(mocks.updateDraftContent.mock.calls[0][1]).not.toHaveProperty("researchResults");
  });
  it("@ 浮层按分组给出模板库入口、结构模板与参考草稿", async () => {
    const user = userEvent.setup();
    renderView();

    const { menu } = await openMentions(user);
    expect(within(menu).getByRole("group", { name: "添加" })).toBeInTheDocument();
    expect(within(menu).getByRole("option", { name: /模板库/ })).toBeInTheDocument();
    expect(within(menu).getByRole("option", { name: /上传参考资料/ })).toBeInTheDocument();
    const templateGroup = within(menu).getByRole("group", { name: "模板" });
    expect(within(templateGroup).getByRole("option", { name: /通知模板/ })).toHaveTextContent("v1 · 通知模板.docx");
    const draftGroup = within(menu).getByRole("group", { name: "参考草稿" });
    expect(within(draftGroup).getByRole("option", { name: /季度通知草稿/ })).toHaveTextContent("通知模板");
  });

  it("@ 关键字过滤只留下匹配项", async () => {
    const user = userEvent.setup();
    renderView();

    const input = await screen.findByRole("textbox", { name: "公文写作要求" });
    await user.type(input, "@季度");

    const menu = await screen.findByRole("listbox", { name: "引用与动作" });
    expect(within(menu).getByRole("option", { name: /季度通知草稿/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("option", { name: /模板库/ })).not.toBeInTheDocument();
  });

  it("直接 @ 一个结构模板就能成稿，不去读任何草稿正文", async () => {
    const user = userEvent.setup();
    renderView();

    const { input, menu } = await openMentions(user);
    const templateGroup = within(menu).getByRole("group", { name: "模板" });
    await user.click(within(templateGroup).getByRole("option", { name: /通知模板/ }));

    // 选中之后 @ 文本被摘掉，引用改由芯片承载
    expect(input).toHaveValue("");
    expect(screen.getByLabelText("本轮引用")).toHaveTextContent("@通知模板");

    await submitRequirement(user, "撰写2026年安全检查通知");

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(mocks.getDraftContent).not.toHaveBeenCalled();
    const context = send.mock.calls[0][1]?.writingContext as {
      referenceDraft: { id: string; title: string };
      referenceSections: Array<{ title: string }>;
    };
    expect(context.referenceDraft).toEqual({
      id: "template-1",
      title: "通知模板",
      templateName: "通知模板"
    });
    // 模板没有旧正文，章节骨架直接来自结构里的标题节点
    expect(context.referenceSections.map((section) => section.title)).toEqual(["一、原章节"]);

    const conversation = await screen.findByRole("region", { name: "公文生成对话" });
    expect(conversation).toHaveTextContent("@通知模板 · 结构模板");
    expect(await screen.findByRole("article", { name: "生成的公文文件" })).toBeInTheDocument();
  });

  it("没有引用就提交时提示先 @ 选择", async () => {
    const user = userEvent.setup();
    renderView();

    const input = await screen.findByRole("textbox", { name: "公文写作要求" });
    await user.type(input, "撰写2026年安全检查通知");
    expect(screen.getByRole("button", { name: "生成完整公文" })).toBeDisabled();

    await user.type(input, "{Enter}");
    expect(await screen.findByText("请先通过 @ 选择模板或参考草稿")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("模板界面盖在对话上，使用模板设为本轮引用并保留已有轮次", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    await submitRequirement(user, "撰写2026年安全检查通知");
    await screen.findByRole("article", { name: "生成的公文文件" });

    const { menu } = await openMentions(user);
    await user.click(within(menu).getByRole("option", { name: /模板库/ }));

    const gallery = await screen.findByRole("region", { name: "模板库" });
    expect(within(gallery).getByRole("heading", { name: "模板库" })).toBeInTheDocument();
    expect(within(gallery).getByRole("button", { name: "上传结构 DOCX" })).toBeInTheDocument();

    await user.click(within(gallery).getByRole("button", { name: "使用模板 通知模板" }));

    expect(screen.queryByRole("region", { name: "模板库" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("本轮引用")).toHaveTextContent("@通知模板");
    // 覆盖面板只是盖住对话，轮次状态一条都不能掉
    expect(screen.getByRole("region", { name: "公文生成对话" })).toHaveTextContent("撰写2026年安全检查通知");
    expect(screen.getByRole("article", { name: "生成的公文文件" })).toBeInTheDocument();
  });

  it("上传的文本参考资料按芯片列出并随写作上下文发出", async () => {
    const user = userEvent.setup();
    renderView();

    await pickReference(user);
    const file = new File(["上季度检查共发现隐患 18 处。"], "隐患台账.md", { type: "text/markdown" });
    await user.upload(screen.getByTestId("official-document-material-file"), file);

    await waitFor(() => expect(screen.getByText("隐患台账.md")).toBeInTheDocument());
    await submitRequirement(user, "撰写2026年安全检查通知");

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const context = send.mock.calls[0][1]?.writingContext as {
      referenceMaterials?: Array<{ name: string; content: string }>;
      outputRules: { referenceMaterialsRule?: string };
    };
    expect(context.referenceMaterials).toEqual([
      { name: "隐患台账.md", content: "上季度检查共发现隐患 18 处。" }
    ]);
    expect(context.outputRules.referenceMaterialsRule).toContain("referenceMaterials");
  });

  it("不支持的资料格式就地拒绝，不进写作上下文", async () => {
    // accept 只是系统选择器的过滤提示，用户仍能挑到别的格式，所以拒绝路径必须自己兜住
    const user = userEvent.setup({ applyAccept: false });
    renderView();

    await pickReference(user);
    const file = new File(["%PDF-1.7"], "扫描件.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("official-document-material-file"), file);

    const chip = await screen.findByTitle("暂不支持解析该格式，请转为 DOCX 或文本");
    expect(chip).toHaveTextContent("扫描件.pdf");
    expect(chip).toHaveTextContent("读取失败");

    await submitRequirement(user, "撰写2026年安全检查通知");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const context = send.mock.calls[0][1]?.writingContext as { referenceMaterials?: unknown };
    expect(context.referenceMaterials).toBeUndefined();
  });

  it("没有引用时上传 DOCX 资料要先选模板", async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByRole("textbox", { name: "公文写作要求" });
    const file = new File(["docx"], "参考材料.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    await user.upload(screen.getByTestId("official-document-material-file"), file);

    expect(
      await screen.findByTitle("请先 @ 选择模板或参考草稿，再上传 DOCX 资料")
    ).toHaveTextContent("参考材料.docx");
    expect(mocks.uploadContentProfile).not.toHaveBeenCalled();
  });

  it("DOCX 资料走内容方案抽取，拼好的正文进写作上下文", async () => {
    const user = userEvent.setup();
    mocks.uploadContentProfile.mockResolvedValue({
      id: "profile-1",
      status: "EXTRACTED",
      profile: {
        source: {
          sourceSha256: "sha",
          warnings: [],
          blocks: [
            { id: "b1", order: 0, kind: "PARAGRAPH", text: "上季度隐患整改率 96%。", headingHint: "", columns: [], rows: [] },
            { id: "b2", order: 1, kind: "TABLE", text: "", headingHint: "", columns: ["季度", "隐患"], rows: [["Q1", "18"]] }
          ]
        }
      }
    });
    renderView();

    await pickReference(user);
    const file = new File(["docx"], "参考材料.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    await user.upload(screen.getByTestId("official-document-material-file"), file);

    await waitFor(() => expect(mocks.uploadContentProfile).toHaveBeenCalledWith(
      "template-1",
      "version-1",
      file,
      "参考材料.docx"
    ));
    await submitRequirement(user, "撰写2026年安全检查通知");

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const context = send.mock.calls[0][1]?.writingContext as {
      referenceMaterials?: Array<{ name: string; content: string }>;
    };
    expect(context.referenceMaterials).toEqual([
      { name: "参考材料.docx", content: "上季度隐患整改率 96%。\n\n季度\t隐患\nQ1\t18" }
    ]);
  });
});
