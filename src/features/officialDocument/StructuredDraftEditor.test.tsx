import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Blob as NodeBlob } from "node:buffer";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { readStructuredDraftRecovery, structuredDraftRecoveryKey, writeStructuredDraftRecovery } from "./structuredDraftRecovery";
import { createRef } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as officialDocumentService from "@/services/officialDocumentService";
import { setReducedMotion } from "@/test/setup";
import type { OfficialDocumentDraft, OfficialDocumentDraftContent, OfficialDocumentStructureNode } from "@/types/officialDocument";
import { OfficialDocumentAppShell } from "./OfficialDocumentAppShell";
import { StructuredDraftEditor, type StructuredDraftEditorHandle } from "./StructuredDraftEditor";

const draft: OfficialDocumentDraft = {
  id: "draft-1",
  title: "测试草稿",
  status: "READY",
  source: "LIVE",
  templateId: "template-1",
  templateVersionId: "version-1",
  templateName: "通知模板",
  currentFileVersionNo: 1,
  updatedAt: "2026-08-04T00:00:00Z",
  bindings: []
};

const nodes: OfficialDocumentStructureNode[] = [
  {
    id: "paragraph:0",
    order: 1,
    paragraphIndex: 0,
    slotId: "title-slot",
    role: "TITLE",
    roleLabel: "标题",
    preview: "原标题",
    editable: true,
    dataBinding: false,
    required: true,
    styleSummary: []
  },
  {
    id: "paragraph:1",
    order: 2,
    paragraphIndex: 1,
    slotId: "body-slot",
    variantId: "body-main",
    role: "BODY",
    roleLabel: "正文",
    preview: "原正文",
    editable: true,
    dataBinding: false,
    required: true,
    styleSummary: []
  }
];

type AnimateCall = { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: FakeAnimation };
type FakeAnimation = { onfinish: (() => void) | null; oncancel: (() => void) | null };

/** jsdom 没有 WAAPI，也没有真实布局：这里补一套可断言的替身。 */
function stubMotionEnvironment(cardHeight = 120) {
  const calls: AnimateCall[] = [];
  Element.prototype.animate = function stubAnimate(this: Element, keyframes, options) {
    const animation: FakeAnimation = { onfinish: null, oncancel: null };
    calls.push({
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      animation
    });
    return animation as unknown as Animation;
  } as Element["animate"];

  const rect = (top: number, height: number) => ({
    top,
    bottom: top + height,
    left: 0,
    right: 400,
    width: 400,
    height,
    x: 0,
    y: top,
    toJSON: () => ({})
  }) as DOMRect;

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const container = document.querySelector(".structured-draft-editor__blocks");
    if (!container) return rect(0, 0);
    if (this === container) return rect(0, 1000);
    const cards = Array.from(container.querySelectorAll("article[data-block-id]"));
    const index = cards.indexOf(this);
    return index < 0 ? rect(0, 0) : rect(index * cardHeight, cardHeight);
  });

  return calls;
}

function transformKeyframes(calls: AnimateCall[], element: Element) {
  return calls
    .filter((call) => call.element === element)
    .flatMap((call) => call.keyframes.map((frame) => String(frame.transform ?? "")));
}

describe("StructuredDraftEditor", () => {
  beforeEach(() => { localStorage.clear(); useDataHubAuthStore.getState().clearAuthState(); });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useDataHubAuthStore.getState().clearAuthState();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Element.prototype, "animate");
    setReducedMotion(false);
  });

  it("loads authoritative content and saves the complete revision after 600ms", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 4,
      fixedValues: [{ slotId: "title-slot", value: "原标题" }],
      blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原正文" }]
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 5, fixedValues: input.fixedValues, blocks: input.blocks })
    );
    vi.useFakeTimers();

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByDisplayValue("原正文")).toBeInTheDocument();
    expect(screen.getByText("已保存").closest(".structured-draft-editor__canvas-head")).not.toBeNull();
    expect(screen.getByLabelText("结构化报告编辑器").querySelector(":scope > .ant-tag")).toBeNull();

    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "更新后的正文" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      expectedRevision: 4,
      fixedValues: [{ slotId: "title-slot", value: "原标题" }],
      blocks: [expect.objectContaining({ id: "body-1", order: 0, text: "更新后的正文" })]
    }));
    expect(screen.getByText("已保存")).toBeInTheDocument();
  });

  it.each(["save", "normalizeForExport"] as const)("%s rejects failed persistence and allows an explicit retry", async (action) => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 4, fixedValues: [],
      blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原正文" }]
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent")
      .mockRejectedValueOnce(new Error("正文保存失败"))
      .mockImplementation(async (_id, input) => ({ ...input, revision: 5 }));
    const onStatus = vi.fn();
    const ref = createRef<StructuredDraftEditorHandle>();
    vi.useFakeTimers();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={onStatus} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "新正文" } });
    expect(screen.getByText("保存中")).toBeInTheDocument();
    await act(async () => { await expect(ref.current![action]()).rejects.toThrow("正文保存失败"); });
    expect(screen.getByText("保存失败")).toBeInTheDocument();
    expect(onStatus).toHaveBeenCalledWith("error", "正文保存失败");
    await act(async () => { await ref.current!.save(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toMatchObject({ expectedRevision: 4, blocks: [expect.objectContaining({ text: "新正文" })] });
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(ref.current!.getContent()?.revision).toBe(5);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("an explicit save waits for the in-flight autosave and receives its failure", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 4, fixedValues: [], blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原正文" }]
    });
    let rejectSave!: (reason: Error) => void;
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent")
      .mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
    const ref = createRef<StructuredDraftEditorHandle>();
    vi.useFakeTimers();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "新正文" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const explicitSave = ref.current!.save();
    const rejected = expect(explicitSave).rejects.toThrow("在途保存失败");
    await act(async () => { rejectSave(new Error("在途保存失败")); await rejected; });
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByText("保存失败")).toBeInTheDocument();
  });

  it("an explicit save also persists edits made while the previous revision is saving", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 4, fixedValues: [], blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原正文" }]
    });
    let finish!: (content: Awaited<ReturnType<typeof officialDocumentService.updateOfficialDocumentDraftContent>>) => void;
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent")
      .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockImplementation(async (_id, input) => ({ ...input, revision: 6 }));
    const ref = createRef<StructuredDraftEditorHandle>();
    vi.useFakeTimers();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "第一版" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "第二版" } });
    const flushed = ref.current!.save();
    await act(async () => {
      finish({ ...save.mock.calls[0][1], revision: 5 });
      await vi.advanceTimersByTimeAsync(50);
      await flushed;
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toMatchObject({ expectedRevision: 5, blocks: [expect.objectContaining({ text: "第二版" })] });
    expect(ref.current!.getContent()?.revision).toBe(6);
    expect(screen.getByText("已保存")).toBeInTheDocument();
  });

  it("handles an autosave rejection after unmount without UI callbacks or retries", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({ revision: 1, fixedValues: [], blocks: [] });
    let rejectSave!: (reason: Error) => void;
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent")
      .mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
    const onStatus = vi.fn();
    const ref = createRef<StructuredDraftEditorHandle>();
    vi.useFakeTimers();
    const view = render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={onStatus} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => { ref.current!.appendText("待保存正文"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    view.unmount();
    await act(async () => { rejectSave(new Error("卸载后保存失败")); await vi.advanceTimersByTimeAsync(1000); });
    expect(save).toHaveBeenCalledOnce();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("turns assistant markdown headings into template-styled structure nodes", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: []
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 2, fixedValues: input.fixedValues, blocks: input.blocks })
    );
    const structuredNodes: OfficialDocumentStructureNode[] = [
      ...nodes,
      {
        id: "paragraph:2",
        order: 3,
        paragraphIndex: 2,
        variantId: "heading-1-main",
        role: "HEADING_1",
        roleLabel: "一级标题",
        preview: "一级标题",
        editable: true,
        dataBinding: false,
        required: false,
        styleSummary: []
      },
      {
        id: "paragraph:3",
        order: 4,
        paragraphIndex: 3,
        variantId: "heading-2-main",
        role: "HEADING_2",
        roleLabel: "二级标题",
        preview: "二级标题",
        editable: true,
        dataBinding: false,
        required: false,
        styleSummary: []
      },
      {
        id: "paragraph:4",
        order: 5,
        paragraphIndex: 4,
        endParagraphIndex: 20,
        slotType: "BODY_REGION",
        variantId: "body-region-main",
        role: "BODY",
        roleLabel: "正文区域",
        preview: "正文区域",
        editable: true,
        dataBinding: false,
        required: false,
        styleSummary: []
      }
    ];
    const ref = createRef<StructuredDraftEditorHandle>();

    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={structuredNodes} onStatus={vi.fn()} />);
    await screen.findByText("已保存");
    act(() => {
      expect(ref.current?.appendText("[[XS_SECTION:section-1]]\n# 完整章节\n\n正文内容")).toBe(0);
      expect(ref.current?.appendText("# 一级标题\n\n## 二级标题\n\n正文内容")).toBe(3);
    });

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith("draft-1", expect.objectContaining({
        blocks: [
          expect.objectContaining({ role: "HEADING_1", variantId: "heading-1-main", text: "一级标题" }),
          expect.objectContaining({ role: "HEADING_2", variantId: "heading-2-main", text: "二级标题" }),
          expect.objectContaining({ role: "BODY", variantId: "body-region-main", text: "正文内容" })
        ]
      }));
    });
  });

  it("normalizes plain numbered headings and body variants before export", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [
        { id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "（一）重点工作" },
        { id: "body-2", order: 1, role: "BODY", variantId: "body-main", text: "**1.1 产品能力建设**" },
        { id: "body-3", order: 2, role: "BODY", variantId: "body-main", text: "正文内容。" }
      ]
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({
        revision: input.expectedRevision + 1,
        fixedValues: input.fixedValues,
        blocks: input.blocks
      })
    );
    const structuredNodes: OfficialDocumentStructureNode[] = [
      ...nodes,
      { ...nodes[1], id: "heading-2", order: 3, role: "HEADING_2", roleLabel: "二级标题", variantId: "heading-2-main" },
      { ...nodes[1], id: "heading-3", order: 4, role: "HEADING_3", roleLabel: "三级标题", variantId: "heading-3-main" },
      {
        ...nodes[1], id: "body-region", order: 5, paragraphIndex: 4, endParagraphIndex: 20,
        slotType: "BODY_REGION", variantId: "body-region-main"
      }
    ];
    const ref = createRef<StructuredDraftEditorHandle>();

    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={structuredNodes} onStatus={vi.fn()} />);
    await screen.findByText("已保存");
    await act(async () => {
      expect(await ref.current?.normalizeForExport()).toBe(3);
    });

    const savedBlocks = save.mock.calls.at(-1)?.[1].blocks;
    expect(savedBlocks).toEqual([
      expect.objectContaining({ role: "HEADING_2", variantId: "heading-2-main", text: "（一）重点工作" }),
      expect.objectContaining({ role: "HEADING_3", variantId: "heading-3-main", text: "1.1 产品能力建设" }),
      expect.objectContaining({ role: "BODY", variantId: "body-region-main", text: "正文内容。" })
    ]);
  });

  it("keeps the save chip in the canvas header and portals PDF preview to the app bar", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [{ slotId: "title-slot", value: "原标题" }],
      blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原正文" }]
    });

    render(
      <MemoryRouter initialEntries={["/writing/drafts/draft-1"]}>
        <OfficialDocumentAppShell>
          <StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />
        </OfficialDocumentAppShell>
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("已保存").closest(".structured-draft-editor__canvas-head")).not.toBeNull();
    await waitFor(() => {
      expect(document.querySelector(".official-document-app__bar .official-document-app__actions")).toContainElement(
        screen.getByRole("button", { name: "模板 PDF 浏览" })
      );
    });
    expect(screen.getByLabelText("结构化报告编辑器").querySelector(":scope > .ant-btn")).toBeNull();
  });

  it("asks for a node type before inserting a new block", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原正文" }]
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 2, fixedValues: input.fixedValues, blocks: input.blocks })
    );

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    expect(await screen.findByLabelText("正文节点 1")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "新增节点" }));
    await user.click(await screen.findByRole("menuitem", { name: "二级标题" }));

    const added = await screen.findByLabelText("二级标题节点 2");
    expect(added).toHaveFocus();
    expect(added).toHaveAttribute("placeholder", "输入二级标题");
    expect(screen.getByText("已加入二级标题")).toBeInTheDocument();
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith("draft-1", expect.objectContaining({
        blocks: [
          expect.objectContaining({ id: "body-1", role: "BODY" }),
          expect.objectContaining({ role: "HEADING_2", text: "" })
        ]
      }));
    });
  });
  it("swaps the two cards with a lift when a node moves", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [
        { id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "第一段" },
        { id: "body-2", order: 1, role: "BODY", variantId: "body-main", text: "第二段" }
      ]
    });
    vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 2, fixedValues: input.fixedValues, blocks: input.blocks })
    );
    const calls = stubMotionEnvironment();

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    expect(await screen.findByDisplayValue("第一段")).toBeInTheDocument();

    const lead = document.querySelector('article[data-block-id="body-1"]')!;
    const partner = document.querySelector('article[data-block-id="body-2"]')!;
    fireEvent.click(screen.getAllByRole("button", { name: "下移节点" })[0]);

    /* 被点的那张抬起后落到下面一格，另一张从上一格滑到它原来的位置 */
    expect(transformKeyframes(calls, lead)).toEqual([
      "translateY(-120px)",
      "translateY(-50.4px) scale(1.02)",
      "translateY(0) scale(1)"
    ]);
    expect(transformKeyframes(calls, partner)).toEqual(["translateY(120px)", "translateY(0)"]);
    expect(document.querySelectorAll("article[data-block-id]")[0]).toBe(partner);
    /* 编辑期间不再改写 order，序号在写回时重排 */
    await waitFor(() => {
      expect(officialDocumentService.updateOfficialDocumentDraftContent).toHaveBeenCalledWith("draft-1", expect.objectContaining({
        blocks: [
          expect.objectContaining({ id: "body-2", order: 0 }),
          expect.objectContaining({ id: "body-1", order: 1 })
        ]
      }));
    });
  });

  it("names the role picker after the node it belongs to", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [
        { id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "第一段" },
        { id: "body-2", order: 1, role: "BODY", variantId: "body-main", text: "第二段" }
      ]
    });

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    expect(await screen.findByDisplayValue("第一段")).toBeInTheDocument();

    expect(screen.getByRole("combobox", { name: "节点 2 类型" })).toBeInTheDocument();
    expect(screen.getByLabelText("正文节点 2")).toHaveDisplayValue("第二段");
  });

  it("keeps a ghost card that shrinks into the delete button, then drops it", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [
        { id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "第一段" },
        { id: "body-2", order: 1, role: "BODY", variantId: "body-main", text: "第二段" }
      ]
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 2, fixedValues: input.fixedValues, blocks: input.blocks })
    );
    const calls = stubMotionEnvironment();

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    expect(await screen.findByDisplayValue("第一段")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "删除节点" })[0]);

    const ghost = document.querySelector<HTMLElement>(".structured-draft-editor__ghost")!;
    expect(ghost).toBeInTheDocument();
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost.style.top).toBe("0px");
    /* 残影不进可访问性树，不会和真实卡片抢同名控件 */
    expect(screen.getAllByRole("button", { name: "删除节点" })).toHaveLength(1);
    expect(document.querySelectorAll("article[data-block-id]")).toHaveLength(1);

    const exit = calls.find((call) => call.element === ghost)!;
    expect(exit.keyframes.at(-1)?.transform).toContain("scale(.08)");
    expect(exit.options.fill).toBe("forwards");
    /* 数据侧不等动画，删除立即落库 */
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith("draft-1", expect.objectContaining({
        blocks: [expect.objectContaining({ id: "body-2", order: 0 })]
      }));
    });

    act(() => exit.animation.onfinish?.());
    expect(document.querySelector(".structured-draft-editor__ghost")).toBeNull();
  });

  it("lets the neighbours open a slot before the new card settles in", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "第一段" }]
    });
    vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 2, fixedValues: input.fixedValues, blocks: input.blocks })
    );
    const calls = stubMotionEnvironment();

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    expect(await screen.findByDisplayValue("第一段")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "在下方新增节点" })[0]);
    await user.click(await screen.findByRole("menuitem", { name: "正文" }));

    const added = document.querySelectorAll<HTMLElement>("article[data-block-id]")[1];
    const enter = calls.find((call) => call.element === added)!;
    expect(enter.options.delay).toBe(90);
    expect(enter.options.fill).toBe("backwards");
    expect(enter.keyframes[0].opacity).toBe(0);
    expect(added).toHaveAttribute("data-just-added", "true");
  });

  it("skips ghosts and displacement when reduced motion is on", async () => {
    setReducedMotion(true);
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({
      revision: 1,
      fixedValues: [],
      blocks: [
        { id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "第一段" },
        { id: "body-2", order: 1, role: "BODY", variantId: "body-main", text: "第二段" }
      ]
    });
    vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(
      async (_draftId, input) => ({ revision: 2, fixedValues: input.fixedValues, blocks: input.blocks })
    );
    const calls = stubMotionEnvironment();

    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    expect(await screen.findByDisplayValue("第一段")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "下移节点" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "删除节点" })[0]);

    expect(calls).toHaveLength(0);
    expect(document.querySelector(".structured-draft-editor__ghost")).toBeNull();
    expect(document.querySelectorAll("article[data-block-id]")).toHaveLength(1);
  });
});


describe("structured draft recovery and current preview", () => {
  const initial = (revision = 4, text = "原正文"): OfficialDocumentDraftContent => ({ revision, fixedValues: [],
    blocks: [{ id: "body-1", order: 0, role: "BODY" as const, variantId: "body-main", text }] });
  const signIn = (userId = 1, spaceId = 7) => useDataHubAuthStore.getState().setSession({ token: `token-${userId}`, userId, username: `user-${userId}`, isAdmin: false }, spaceId);
  beforeEach(() => { localStorage.clear(); signIn(); });
  afterEach(() => {
    cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    useDataHubAuthStore.getState().clearAuthState(); localStorage.clear();
  });
  const ready = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  it("backs up the last keystroke synchronously and restores it after immediate navigation and a failed leave save", async () => {
    vi.useFakeTimers();
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue(initial());
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent")
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (_id, input) => ({ ...input, revision: 5 }));
    const first = render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "最后一次输入" } });
    const key = structuredDraftRecoveryKey(draft.id);
    expect(readStructuredDraftRecovery(key, draft.templateVersionId)?.content.blocks[0].text).toBe("最后一次输入");
    first.unmount();
    expect(save).toHaveBeenCalledOnce();
    await ready();
    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    expect(screen.getByLabelText("正文节点 1")).toHaveValue("最后一次输入");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(readStructuredDraftRecovery(key, draft.templateVersionId)).toBeUndefined();
    expect(screen.getByText("已保存")).toBeInTheDocument();
  });

  it("keeps an offline copy across refresh and never loads it for another account or space", async () => {
    const key = structuredDraftRecoveryKey(draft.id);
    writeStructuredDraftRecovery(key, draft.templateVersionId, initial(4, "A的未保存正文"));
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockRejectedValue(new Error("offline"));
    const view = render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    expect(screen.getByLabelText("正文节点 1")).toHaveValue("A的未保存正文");
    await act(async () => { signIn(2); });
    await ready();
    expect(screen.queryByDisplayValue("A的未保存正文")).not.toBeInTheDocument();
    expect(readStructuredDraftRecovery(structuredDraftRecoveryKey(draft.id), draft.templateVersionId)).toBeUndefined();
    expect(readStructuredDraftRecovery(key, draft.templateVersionId)?.content.blocks[0].text).toBe("A的未保存正文");
    view.unmount();
    signIn(1, 8);
    expect(readStructuredDraftRecovery(structuredDraftRecoveryKey(draft.id), draft.templateVersionId)).toBeUndefined();
  });

  it("keeps both sides of a revision conflict without overwriting the server", async () => {
    const key = structuredDraftRecoveryKey(draft.id);
    writeStructuredDraftRecovery(key, draft.templateVersionId, initial(4, "本地修改"));
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue(initial(5, "服务器新正文"));
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockResolvedValue(initial(6, "本地修改"));
    const ref = createRef<StructuredDraftEditorHandle>();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    expect(screen.getByLabelText("正文节点 1")).toHaveValue("本地修改");
    await act(async () => { await expect(ref.current!.save()).rejects.toThrow("服务器已有新版本"); });
    expect(save).not.toHaveBeenCalled();
    expect(readStructuredDraftRecovery(key, draft.templateVersionId)?.serverContent?.blocks[0].text).toBe("服务器新正文");
    fireEvent.click(screen.getByRole("button", { name: "使用服务器版本" }));
    expect(screen.getByLabelText("正文节点 1")).toHaveValue("服务器新正文");
    const archived = readStructuredDraftRecovery(`${key}:conflict`, draft.templateVersionId);
    expect(archived?.content.blocks[0].text).toBe("本地修改");
    expect(archived?.serverContent?.blocks[0].text).toBe("服务器新正文");
  });

  it("does not show cached content after permission is revoked", async () => {
    writeStructuredDraftRecovery(structuredDraftRecoveryKey(draft.id), draft.templateVersionId, initial(4, "保密正文"));
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockRejectedValue(new officialDocumentService.OfficialDocumentServiceError("无权查看", { status: 403 }));
    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    expect(screen.queryByDisplayValue("保密正文")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("无权查看");
  });

  it("saves before requesting current-draft PDF and removes old preview on a failed refresh", async () => {
    let server = initial();
    const calls: string[] = [];
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockImplementation(async () => { calls.push("read"); return server; });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(async (_id, input) => {
      calls.push("save"); server = { ...input, revision: 5 }; return server;
    });
    const pdf = vi.spyOn(officialDocumentService, "getOfficialDocumentDraftPreview").mockImplementation(async () => {
      calls.push("preview"); return new NodeBlob(["%PDF-1.7 fixture"]) as unknown as Blob;
    });
    const originalUrl = URL;
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends originalUrl { static createObjectURL = vi.fn(() => "blob:current-draft"); static revokeObjectURL = revoke; });
    render(<MemoryRouter><OfficialDocumentAppShell><StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} /></OfficialDocumentAppShell></MemoryRouter>);
    await ready();
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "预览正文" } });
    fireEvent.click(screen.getByRole("button", { name: "预览当前稿" }));
    await waitFor(() => expect(screen.getByLabelText("当前稿 PDF · 内容修订 5")).toHaveAttribute("data", "blob:current-draft"));
    expect(calls).toEqual(["read", "save", "preview", "read"]);
    expect(pdf).toHaveBeenCalledWith("draft-1");
    save.mockRejectedValueOnce(new Error("保存失败，网络断开"));
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "第二次修改" } });
    fireEvent.click(screen.getByRole("button", { name: "预览当前稿" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败，网络断开"));
    expect(screen.queryByLabelText("当前稿 PDF · 内容修订 5")).not.toBeInTheDocument();
    expect(pdf).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:current-draft");
  });

  it("preserves the factual review but expires its confirmation when text changes", async () => {
    const factReview = { reviewedAt: "2026-09-07T00:00:00Z", confirmedAt: "2026-09-07T01:00:00Z", textSnapshot: "原正文", issues: [{ sentence: "原正文", additions: ["数量"] }] };
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue({ ...initial(), factReview });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(async (_id, input) => ({ ...input, revision: 5 }));
    const ref = createRef<StructuredDraftEditorHandle>();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "新正文" } });
    await act(async () => { await ref.current!.save(); });
    expect(save.mock.calls[0][1].factReview).toEqual({ ...factReview, confirmedAt: undefined });
  });
  it("does not create a content revision for a clean save and saves review metadata once", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue(initial());
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockImplementation(async (_id, input) => ({ ...input, revision: 5 }));
    const ref = createRef<StructuredDraftEditorHandle>();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    await act(async () => { await ref.current!.save(); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { await ref.current!.saveFactReview({ reviewedAt: "2026-09-07T01:00:00Z", issues: [], textSnapshot: "原正文" }); });
    expect(save).toHaveBeenCalledOnce();
    expect(ref.current!.getContent()?.factReview?.textSnapshot).toBe("原正文");
  });

  it("pagehide attempts to save without preventing navigation and retains its backup on failure", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValue(initial());
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent").mockRejectedValue(new Error("断网"));
    render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "刷新前最后输入" } });
    const event = new Event("pagehide", { cancelable: true });
    await act(async () => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(save).toHaveBeenCalledOnce();
    expect(readStructuredDraftRecovery(structuredDraftRecoveryKey(draft.id), draft.templateVersionId)?.content.blocks[0].text).toBe("刷新前最后输入");
  });

  it("rejects a PDF when the server revision changed while it was rendering", async () => {
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockResolvedValueOnce(initial()).mockResolvedValue(initial(5, "他人新修改"));
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftPreview").mockResolvedValue(new NodeBlob(["%PDF-1.7 fixture"]) as unknown as Blob);
    const originalUrl = URL;
    const create = vi.fn(() => "blob:must-not-show");
    vi.stubGlobal("URL", class extends originalUrl { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
    render(<MemoryRouter><OfficialDocumentAppShell><StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} /></OfficialDocumentAppShell></MemoryRouter>);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "预览当前稿" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("服务器版本已变化"));
    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector("object[data]")).toBeNull();
  });

  it.each([false, true])("accepts an already saved snapshot after navigation without a false conflict (newer typing: %s)", async (newerTyping) => {
    vi.useFakeTimers();
    let server = initial();
    let finishOld!: (content: OfficialDocumentDraftContent) => void;
    let finishRead!: (content: OfficialDocumentDraftContent) => void;
    let reads = 0;
    vi.spyOn(officialDocumentService, "getOfficialDocumentDraftContent").mockImplementation(() => {
      reads++;
      if (newerTyping && reads === 3) return new Promise(resolve => { finishRead = resolve; });
      return Promise.resolve(server);
    });
    const save = vi.spyOn(officialDocumentService, "updateOfficialDocumentDraftContent");
    save.mockImplementation((_id, input) => {
      if (save.mock.calls.length === 1) return new Promise(resolve => { finishOld = resolve; });
      if (input.expectedRevision !== server.revision) return Promise.reject(new officialDocumentService.OfficialDocumentServiceError("草稿版本冲突", { status: 409 }));
      server = { ...input, revision: server.revision + 1 };
      return Promise.resolve(server);
    });
    const first = render(<StructuredDraftEditor draft={draft} templateNodes={nodes} onStatus={vi.fn()} />);
    await ready();
    fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "本地修改" } });
    first.unmount();
    expect(save).toHaveBeenCalledOnce();
    const ref = createRef<StructuredDraftEditorHandle>();
    const onStatus = vi.fn();
    render(<StructuredDraftEditor ref={ref} draft={draft} templateNodes={nodes} onStatus={onStatus} />);
    await ready();
    expect(screen.getByLabelText("正文节点 1")).toHaveValue("本地修改");
    server = initial(5, "本地修改");
    await act(async () => { finishOld(server); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(save).toHaveBeenCalledTimes(2);
    if (newerTyping) {
      fireEvent.change(screen.getByLabelText("正文节点 1"), { target: { value: "继续编辑的新内容" } });
      await act(async () => { finishRead(server); });
      await act(async () => { await vi.advanceTimersByTimeAsync(650); });
      expect(save).toHaveBeenCalledTimes(3);
      expect(save.mock.calls[2][1]).toMatchObject({ expectedRevision: 5, blocks: [expect.objectContaining({ text: "继续编辑的新内容" })] });
    }
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(ref.current!.getContent()?.revision).toBe(newerTyping ? 6 : 5);
    expect(screen.getByLabelText("正文节点 1")).toHaveValue(newerTyping ? "继续编辑的新内容" : "本地修改");
    expect(screen.queryByRole("button", { name: "使用服务器版本" })).not.toBeInTheDocument();
    expect(onStatus).not.toHaveBeenCalledWith("error", expect.anything());
    expect(readStructuredDraftRecovery(structuredDraftRecoveryKey(draft.id), draft.templateVersionId)).toBeUndefined();
  });

});
