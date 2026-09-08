import type { OfficialDocumentDraftContent } from "@/types/officialDocument";

/** 校对只与这份正文对应，编辑后不会沿用旧的确认状态。 */
export function officialDocumentContentText(content: Pick<OfficialDocumentDraftContent, "fixedValues" | "blocks">) {
  return [...content.fixedValues.map((field) => field.value), ...content.blocks.map((block) => (
    [block.text, ...(block.table ? [block.table.columns.join("\t"), ...block.table.rows.map((row) => row.join("\t"))] : []),
      block.chart?.altText ?? ""].filter(Boolean).join("\n")
  ))].join("\n");
}
