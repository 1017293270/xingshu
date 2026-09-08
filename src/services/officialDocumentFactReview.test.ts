import { expect, it } from "vitest";
import { officialDocumentContentText } from "./officialDocumentFactReview";
import type { OfficialDocumentDraftContent } from "@/types/officialDocument";

it("changing a table unit invalidates the text used for the previous fact review", () => {
  const content: OfficialDocumentDraftContent = { revision: 1, fixedValues: [], blocks: [{
    id: "table", order: 0, role: "TABLE", variantId: "body", text: "支出", table: { columns: ["万元"], rows: [["30"]], totalRows: 1 }
  }] };
  const before = officialDocumentContentText(content);
  content.blocks[0].table!.columns[0] = "元";
  expect(officialDocumentContentText(content)).not.toBe(before);
});
