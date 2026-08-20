import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as officialDocumentService from "@/services/officialDocumentService";
import { setReducedMotion } from "@/test/setup";
import type { OfficialDocumentDraft, OfficialDocumentStructureNode } from "@/types/officialDocument";
import { OfficialDocumentAppShell } from "./OfficialDocumentAppShell";
import { StructuredDraftEditor } from "./StructuredDraftEditor";

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
  afterEach(() => {
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
    expect(screen.getByLabelText("结构化公文编辑器").querySelector(":scope > .ant-tag")).toBeNull();

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
        screen.getByRole("button", { name: "PDF 预览" })
      );
    });
    expect(screen.getByLabelText("结构化公文编辑器").querySelector(":scope > .ant-btn")).toBeNull();
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
