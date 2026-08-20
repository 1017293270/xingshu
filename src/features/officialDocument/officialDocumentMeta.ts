import { useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import type {
  DraftDataBinding,
  OfficialDocumentAnalysis,
  OfficialDocumentDraftStatus,
  OfficialDocumentMappingDefinition,
  OfficialDocumentMappingRole,
  OfficialDocumentRiskSeverity,
  OfficialDocumentStructureNode,
  OfficialDocumentTemplateStatus,
  OfficialDocumentWorkspaceSnapshot,
  QueryBindingCandidate
} from "@/types/officialDocument";

export const templateStatusLabel: Record<OfficialDocumentTemplateStatus, string> = {
  ANALYZING: "分析中",
  NEEDS_REVIEW: "可用",
  PUBLISHED: "可用",
  BLOCKED: "有错误",
  FAILED: "分析失败"
};

export const templateStatusColor: Record<OfficialDocumentTemplateStatus, string> = {
  ANALYZING: "processing",
  NEEDS_REVIEW: "success",
  PUBLISHED: "success",
  BLOCKED: "error",
  FAILED: "error"
};

export const riskLabel: Record<OfficialDocumentRiskSeverity, string> = {
  INFO: "提示",
  WARNING: "需确认",
  BLOCKING: "错误"
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
  BLOCKED: "有错误"
};

export const draftStatusColor: Record<OfficialDocumentDraftStatus, string> = {
  EDITING: "blue",
  VALIDATING: "processing",
  READY: "success",
  BLOCKED: "error"
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
  const fingerprint = node.styleSummary.filter((part) => !part.startsWith("颜色 "));
  let hash = 2166136261;
  for (const character of `${role}:${fingerprint.join("|")}`) {
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

export function draftStatusAllowsExport(status: OfficialDocumentDraftStatus) {
  return status === "READY" || status === "EDITING";
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}

export function operationErrorMessage(error: unknown) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : "操作失败，请稍后重试";
  if (code === "LIBREOFFICE_UNAVAILABLE" || message.includes("LIBREOFFICE") || message.includes("LibreOffice")) {
    return "PDF 暂时不能生成，请先导出 Word";
  }
  if (code === "DRAFT_NOT_READY" || message.includes("READY 状态") || message.includes("还不能导出")) {
    return "这篇草稿还不能导出。内容保存完成后即可导出 Word";
  }
  if (code === "EDITOR_SESSION_ACTIVE") {
    return "请先完成保存，再导出";
  }
  if (code === "FIDELITY_CHECK_FAILED" || message.includes("保真")) {
    return "导出文件没有通过版式检查。请先导出 Word，或调整正文后再试";
  }
  if (code === "SYNCFUSION_GENERATE_FAILED" || message.includes("failed to generate")) {
    return "按模板生成 Word 失败。请检查正文后重试";
  }
  if (code === "REQUEST_TIMEOUT" || message.includes("请求超时")) {
    return "处理时间较长，请稍后再试。导出 Word 通常比 PDF 更快";
  }
  if (message.includes("variantId") || message.includes("格式变体")) {
    return "模板结构还没保存成功，请再试一次创建草稿";
  }
  return message;
}

export const ANALYZING_POLL_INTERVAL_MS = 2000;

export function hasAnalyzingTemplate(templates: OfficialDocumentWorkspaceSnapshot["templates"]) {
  return templates.some((template) => template.status === "ANALYZING");
}

export function bindingsAreExportable(bindings: DraftDataBinding[]) {
  return bindings.every((binding) => binding.status === "ACTIVE" || binding.status === "MANUAL");
}

export function countBlockingRisks(analysis?: OfficialDocumentAnalysis) {
  return analysis?.risks.filter((risk) => risk.severity === "BLOCKING").length ?? 0;
}

export function templateIsUsable(status: OfficialDocumentTemplateStatus) {
  return status === "PUBLISHED" || status === "NEEDS_REVIEW";
}

export function buildOfficialDocumentMappings(
  nodes: OfficialDocumentStructureNode[],
  bodyRegionStart?: number,
  bodyRegionEnd?: number
): OfficialDocumentMappingDefinition[] {
  const mappedParagraphs = nodes.filter((node) => node.paragraphIndex !== undefined);
  const mappedTables = nodes.filter((node) => node.tableIndex !== undefined && node.dataBinding);
  const paragraphMappings: OfficialDocumentMappingDefinition[] = mappedParagraphs.map((node) => ({
    slotId: node.slotId!,
    nodeId: node.id,
    paragraphIndex: node.paragraphIndex!,
    role: node.role as OfficialDocumentMappingRole,
    variantId: styleVariantId(node, node.role as OfficialDocumentMappingRole),
    dataBinding: node.dataBinding,
    required: node.required,
    slotType: (node.role === "PRESERVE"
      ? "PRESERVE"
      : node.dataBinding
        ? "DATA_TEXT"
        : node.paragraphIndex === bodyRegionStart
          ? "BODY_REGION"
          : ["BODY", "HEADING_1", "HEADING_2", "HEADING_3"].includes(node.role)
            ? "BODY_REGION"
          : "FIXED_TEXT") as OfficialDocumentMappingDefinition["slotType"],
    endParagraphIndex: node.paragraphIndex === bodyRegionStart ? bodyRegionEnd : node.paragraphIndex,
    metadata: {}
  }));
  const tableMappings: OfficialDocumentMappingDefinition[] = mappedTables.map((node) => ({
    slotId: node.slotId!,
    nodeId: node.id,
    paragraphIndex: node.tableIndex!,
    role: "BODY",
    variantId: node.variantId ?? `table-${node.tableIndex! + 1}`,
    dataBinding: true,
    required: false,
    slotType: "DATA_TABLE",
    endParagraphIndex: node.tableIndex,
    metadata: { target: "table" }
  }));
  return [...paragraphMappings, ...tableMappings];
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
