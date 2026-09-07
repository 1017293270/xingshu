import type { DataHubCitationDocument } from "@/types/dataHub";

export function citationDisplayTitle(citation: DataHubCitationDocument) {
  return citation.docName || citation.fileName || citation.docKey || citation.docId;
}

/** 章节/页码定位徽标：缺失的部分不显示，都缺时返回空串。 */
export function citationLocationText(citation: DataHubCitationDocument) {
  const chapter = citation.chapter?.trim();
  const rawPage = citation.pageNumber?.trim();
  const page = rawPage ? (/^\d+$/.test(rawPage) ? `第${rawPage}页` : rawPage) : "";
  const shortChapter = chapter && chapter.length > 24 ? `${chapter.slice(0, 24)}…` : chapter;
  return [shortChapter, page].filter(Boolean).join(" · ");
}
