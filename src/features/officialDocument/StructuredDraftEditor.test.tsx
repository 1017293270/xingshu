import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as officialDocumentService from "@/services/officialDocumentService";
import type { OfficialDocumentDraft, OfficialDocumentStructureNode } from "@/types/officialDocument";
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

describe("StructuredDraftEditor", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
});
