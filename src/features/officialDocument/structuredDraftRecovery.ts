import { readDataHubSession } from "@/services/dataHubSession";
import type { OfficialDocumentDraftContent } from "@/types/officialDocument";

export type StructuredDraftRecovery = {
  id: string;
  templateVersionId: string;
  content: OfficialDocumentDraftContent;
  updatedAt: string;
  serverContent?: OfficialDocumentDraftContent;
};

export function structuredDraftRecoveryKey(draftId: string) {
  const { token, user, spaceId } = readDataHubSession();
  if (!token || user?.userId == null || spaceId == null) return null;
  return `xingshu:structured-draft-recovery:${user.userId}:${spaceId}:${encodeURIComponent(draftId)}`;
}

function validContent(value: unknown): value is OfficialDocumentDraftContent {
  if (!value || typeof value !== "object") return false;
  const content = value as OfficialDocumentDraftContent;
  return Number.isInteger(content.revision) && content.revision >= 0
    && Array.isArray(content.fixedValues) && content.fixedValues.every(item => item && typeof item.slotId === "string" && typeof item.value === "string")
    && Array.isArray(content.blocks) && content.blocks.every(item => item && typeof item.id === "string" && typeof item.text === "string" && ["BODY", "HEADING_1", "HEADING_2", "HEADING_3", "TABLE", "CHART_IMAGE"].includes(item.role));
}

export function readStructuredDraftRecovery(key: string | null, templateVersionId: string): StructuredDraftRecovery | undefined {
  if (!key) return undefined;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as StructuredDraftRecovery | null;
    return value && value.templateVersionId === templateVersionId && typeof value.id === "string"
      && validContent(value.content) && (!value.serverContent || validContent(value.serverContent)) ? value : undefined;
  } catch { return undefined; }
}

export function writeStructuredDraftRecovery(key: string | null, templateVersionId: string, content: OfficialDocumentDraftContent, serverContent?: OfficialDocumentDraftContent) {
  if (!key) return undefined;
  const recovery: StructuredDraftRecovery = { id: crypto.randomUUID(), templateVersionId, content, serverContent, updatedAt: new Date().toISOString() };
  // 同步落盘：不能再防抖，否则600ms内离开仍会丢掉最后一次输入。
  localStorage.setItem(key, JSON.stringify(recovery));
  return recovery;
}

export function clearStructuredDraftRecovery(key: string | null, savedId?: string) {
  if (!key || !savedId) return;
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? "null") as StructuredDraftRecovery | null;
    if (current?.id === savedId) localStorage.removeItem(key);
  } catch { /* 不覆盖无法读取或更新的本地副本。 */ }
}

export function sameStructuredDraftContent(left: OfficialDocumentDraftContent, right: OfficialDocumentDraftContent) {
  const data = (value: OfficialDocumentDraftContent) => [value.fixedValues,
    value.blocks.map((block, order) => ({ ...block, order })), value.researchResults ?? [], value.factReview ?? null];
  return JSON.stringify(data(left)) === JSON.stringify(data(right));
}
