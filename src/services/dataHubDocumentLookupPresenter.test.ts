import { describe, expect, it } from "vitest";
import {
  getDataHubDocumentLookupResults,
  isDataHubDocumentLookupTurn
} from "@/services/dataHubDocumentLookupPresenter";

describe("dataHubDocumentLookupPresenter", () => {
  it("uses only the explicit final document lookup payload", () => {
    const done = {
      documentLookup: true,
      documentSelectionMode: "multiple",
      documentResults: [
        {
          docId: 7,
          docKey: "policy.pdf",
          kbId: "kb-policy",
          docName: " 销售管理制度 ",
          matchReason: " 这是最匹配的最新版制度。 ",
          sourceAvailable: true
        },
        {
          docId: 7,
          docKey: "policy.pdf",
          kbId: "kb-policy",
          docName: "重复项"
        },
        {
          docKey: "missing-id.pdf",
          kbId: "kb-policy"
        }
      ]
    };

    expect(isDataHubDocumentLookupTurn(done)).toBe(true);
    expect(getDataHubDocumentLookupResults(done)).toEqual([
      {
        docId: 7,
        docKey: "policy.pdf",
        kbId: "kb-policy",
        title: "销售管理制度",
        contentType: undefined,
        excerpt: "这是最匹配的最新版制度。",
        docStatus: undefined,
        sourceAvailable: true
      }
    ]);
  });

  it.each(["none", "uncertain"] as const)(
    "does not render candidates for %s selection",
    (documentSelectionMode) => {
      expect(
        getDataHubDocumentLookupResults({
          documentLookup: true,
          documentSelectionMode,
          documentResults: [
            { docId: "doc-1", docKey: "one.pdf", kbId: "kb-1" }
          ]
        })
      ).toEqual([]);
    }
  );

  it("does not turn citations or generic RAG results into lookup cards", () => {
    expect(
      getDataHubDocumentLookupResults({
        citationDocuments: [
          { docId: "doc-1", docKey: "one.pdf", kbId: "kb-1" }
        ]
      })
    ).toEqual([]);
  });
});
