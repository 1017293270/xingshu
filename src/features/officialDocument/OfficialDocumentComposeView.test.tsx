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
  downloadOfficialDocumentExport: mocks.downloadExport
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

async function pickReference(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByRole("textbox", { name: "公文写作要求" });
  await user.type(input, "@");
  // 选参考草稿只剩 Mentions 一条路径，必须在它自己的浮层容器内点选
  const dropdown = await waitFor(() => {
    const element = document.querySelector(".official-document-compose-mentions");
    if (!element) throw new Error("mentions dropdown not open");
    return element as HTMLElement;
  });
  await user.click(within(dropdown).getByText("季度通知草稿"));
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

    expect(await screen.findByRole("heading", { name: "公文写作" })).toBeInTheDocument();
    // 模式 chip、模板浮层入口与文稿宫格都已下线，选参考草稿只走 @ Mentions
    expect(screen.queryByRole("button", { name: "公文写作：选择参考草稿" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("我的文稿")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /设为参考/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "公文写作要求" })).toBeInTheDocument();
    expect(screen.getByText("生成结果先保留在当前会话，确认后再保存到草稿箱。")).toBeInTheDocument();
  });

  it("keeps the generated document temporary until the user saves it to the draft box", async () => {
    const user = userEvent.setup();
    renderView();

    const input = await screen.findByRole("textbox", { name: "公文写作要求" });
    expect(screen.getByRole("button", { name: "生成完整公文" })).toBeDisabled();

    await pickReference(user);
    expect(screen.getByLabelText("已选择参考草稿")).toHaveTextContent("@季度通知草稿");

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
    expect(screen.queryByRole("heading", { name: "公文写作" })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "移除参考草稿" }));
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
      researchResults?: Array<{ sectionId: string; summary: string }>;
      outputRules: { allowResearch: boolean };
    };
    // 研究结果按标题映射到参考章节锚点，材料随上下文注入
    expect(context.researchResults).toEqual([
      expect.objectContaining({ sectionId: "reference-section-1", summary: "全年共完成检查 120 次" })
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
});
