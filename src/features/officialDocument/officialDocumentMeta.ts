import { useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import type {
  DraftDataBinding,
  OfficialDocumentAnalysis,
  OfficialDocumentDraftStatus,
  OfficialDocumentMappingRole,
  OfficialDocumentRiskSeverity,
  OfficialDocumentStructureNode,
  OfficialDocumentTemplateStatus,
  OfficialDocumentWorkspaceSnapshot,
  QueryBindingCandidate
} from "@/types/officialDocument";

export const templateStatusLabel: Record<OfficialDocumentTemplateStatus, string> = {
  ANALYZING: "分析中",
  NEEDS_REVIEW: "待校准",
  PUBLISHED: "已发布",
  BLOCKED: "已阻断",
  FAILED: "分析失败",
  DEMO: "功能示例"
};

export const templateStatusColor: Record<OfficialDocumentTemplateStatus, string> = {
  ANALYZING: "processing",
  NEEDS_REVIEW: "warning",
  PUBLISHED: "success",
  BLOCKED: "error",
  FAILED: "error",
  DEMO: "blue"
};

export const riskLabel: Record<OfficialDocumentRiskSeverity, string> = {
  INFO: "提示",
  WARNING: "需确认",
  BLOCKING: "阻断"
};

export const riskColor: Record<OfficialDocumentRiskSeverity, string> = {
  INFO: "blue",
  WARNING: "warning",
  BLOCKING: "error"
};

export const renderingLabel: Record<DraftDataBinding["rendering"], string> = {
  SCALAR: "单值指标",
  TABLE: "二维表格",
  FACT_SUMMARY: "事实摘要"
};

export const draftStatusLabel: Record<OfficialDocumentDraftStatus, string> = {
  EDITING: "编辑中",
  VALIDATING: "校验中",
  READY: "可导出",
  BLOCKED: "已阻断",
  DEMO: "草稿示例"
};

export const draftStatusColor: Record<OfficialDocumentDraftStatus, string> = {
  EDITING: "blue",
  VALIDATING: "processing",
  READY: "success",
  BLOCKED: "error",
  DEMO: "blue"
};

export const calibrationRoleLabel: Record<OfficialDocumentMappingRole, string> = {
  TITLE: "标题",
  BODY: "正文",
  HEADING_1: "一级标题",
  HEADING_2: "二级标题",
  HEADING_3: "三级标题",
  RECIPIENT: "主送机关",
  ATTACHMENT_NOTE: "附件说明",
  SIGNATURE: "落款",
  DATE: "日期",
  IMPRINT: "版记",
  PRESERVE: "原样保留"
};

export const calibrationRoleOptions = (Object.entries(calibrationRoleLabel) as Array<[OfficialDocumentMappingRole, string]>)
  .map(([value, label]) => ({ value, label }));

export type QueryBindingOutput = QueryBindingCandidate["outputs"][number];
export type BindingSlotType = NonNullable<OfficialDocumentStructureNode["slotType"]>;

export function styleVariantId(node: OfficialDocumentStructureNode, role: OfficialDocumentMappingRole) {
  let hash = 2166136261;
  for (const character of `${role}:${node.styleSummary.join("|")}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${role.toLocaleLowerCase()}-${(hash >>> 0).toString(36)}`;
}

export function formatDate(value?: string) {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp);
}

export function formatFileSize(bytes: number) {
  if (bytes <= 0) return "示例文件";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function operationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

export function countBlockingRisks(analysis?: OfficialDocumentAnalysis) {
  return analysis?.risks.filter((risk) => risk.severity === "BLOCKING").length ?? 0;
}

export function useOfficialDocumentWorkspaceKey() {
  const sessionScope = useSessionQueryScope();
  return sessionQueryKey(sessionScope, "officialDocument", "workspace");
}

/** 把变更后的模板/草稿合并回共享的 workspace 查询缓存，保证列表页与详情页看到同一份数据。 */
export function useUpdateOfficialDocumentWorkspaceCache() {
  const queryClient = useQueryClient();
  const workspaceKey = useOfficialDocumentWorkspaceKey();
  return (updater: (current: OfficialDocumentWorkspaceSnapshot) => OfficialDocumentWorkspaceSnapshot) => {
    queryClient.setQueryData<OfficialDocumentWorkspaceSnapshot>(workspaceKey, (current) =>
      current ? updater(current) : current
    );
  };
}
