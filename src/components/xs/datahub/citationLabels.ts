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

/** 文档与知识库身份一同保留，同名或同 key 的跨库文档不能合并。 */
export function citationIdentity(citation: DataHubCitationDocument) {
  return JSON.stringify([citation.kbId, citation.docId, citation.docKey ?? ""]);
}

export function citationKnowledgeBaseLabel(citation: Pick<DataHubCitationDocument, "kbId" | "kbName">) {
  return citation.kbName?.trim() || (citation.kbId ? "来源知识库" : "知识库信息未提供");
}
