import { describe, expect, it } from "vitest";
import { canBrowseKnowledgeDocument } from "./CloudDocumentPreview";

describe("canBrowseKnowledgeDocument", () => {
  it("lets documents with a doc key be browsed as Markdown", () => {
    expect(canBrowseKnowledgeDocument({
      id: "采购合同.pdf",
      title: "采购合同.pdf",
      docKey: "采购合同.pdf",
      status: "indexed",
      sourceAvailable: false
    })).toBe(true);
  });

  it("skips documents that have no parsed Markdown", () => {
    expect(canBrowseKnowledgeDocument({
      id: "draft",
      title: "草稿.docx",
      docKey: "draft.docx",
      status: "parsing",
      sourceAvailable: false,
      markdownAvailable: false
    })).toBe(false);
  });
});
