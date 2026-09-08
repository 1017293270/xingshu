import { beforeEach, describe, expect, it } from "vitest";
import { clearStructuredDraftRecovery, readStructuredDraftRecovery, writeStructuredDraftRecovery } from "./structuredDraftRecovery";
import type { OfficialDocumentDraftContent } from "@/types/officialDocument";
const content: OfficialDocumentDraftContent = { revision: 4, fixedValues: [], blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body", text: "本地正文" }] };
describe("structured draft recovery storage", () => {
  beforeEach(() => localStorage.clear());
  it("does not remove newer local edits when an older save finishes", () => {
    const first = writeStructuredDraftRecovery("test-key", "v1", content)!;
    const latest = writeStructuredDraftRecovery("test-key", "v1", { ...content, blocks: [{ ...content.blocks[0], text: "更新的正文" }] })!;
    clearStructuredDraftRecovery("test-key", first.id);
    expect(readStructuredDraftRecovery("test-key", "v1")?.id).toBe(latest.id);
    clearStructuredDraftRecovery("test-key", latest.id);
    expect(localStorage.getItem("test-key")).toBeNull();
  });
  it("does not load incompatible or malformed local records", () => {
    writeStructuredDraftRecovery("test-key", "v1", content);
    expect(readStructuredDraftRecovery("test-key", "v2")).toBeUndefined();
    localStorage.setItem("test-key", JSON.stringify({ id: "bad", templateVersionId: "v1", content: { ...content, blocks: [null] } }));
    expect(readStructuredDraftRecovery("test-key", "v1")).toBeUndefined();
  });
});
