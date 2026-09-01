import { DataHubServiceError, requestDataHub } from "@/services/dataHubClient";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";
import { readDataHubSession } from "@/services/dataHubSession";
import type { DataHubTableResult } from "@/types/dataHub";

/**
 * 智能制表·表格模板：后端 ai-service /ai/table-templates（网关路径 /api/v1/table-templates）。
 * 模板 = 制表提示词 + 确认后的表结构快照；结构生成仍走 ask_table 对话链路。
 */
export type DataHubTableTemplate = {
  id: number;
  name: string;
  prompt: string;
  structureJson?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TableTemplateInput = {
  name: string;
  prompt: string;
  structureJson?: string | null;
};

export type TableTemplateColumn = {
  title: string;
  type?: string;
};

function requireSpaceId() {
  const { spaceId } = readDataHubSession();
  if (!spaceId) {
    throw new DataHubServiceError("请先登录 DataHub 并选择空间");
  }
  return spaceId;
}

export async function listTableTemplates(): Promise<DataHubTableTemplate[]> {
  const { spaceId } = readDataHubSession();
  if (!spaceId) {
    return [];
  }
  return requestDataHub<DataHubTableTemplate[]>("/api/v1/table-templates", { spaceId });
}

export async function createTableTemplate(input: TableTemplateInput): Promise<DataHubTableTemplate> {
  const spaceId = requireSpaceId();
  return requestDataHub<DataHubTableTemplate>("/api/v1/table-templates", {
    method: "POST",
    body: JSON.stringify(input),
    spaceId
  });
}

export async function updateTableTemplate(
  id: number,
  input: TableTemplateInput
): Promise<DataHubTableTemplate> {
  const spaceId = requireSpaceId();
  return requestDataHub<DataHubTableTemplate>(`/api/v1/table-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
    spaceId
  });
}

export async function deleteTableTemplate(id: number): Promise<void> {
  const spaceId = requireSpaceId();
  await requestDataHub<unknown>(`/api/v1/table-templates/${id}`, {
    method: "DELETE",
    spaceId
  });
}

/** 结果表列 → 结构快照 JSON（只存展示列名与类型，不存行数据）。 */
export function buildTableStructureJson(columns: DataHubTableResult["columns"]): string {
  return JSON.stringify({
    columns: columns.map((column) => ({
      title: formatDataHubColumnTitle(column.title, column.key),
      ...(column.type ? { type: column.type } : {})
    }))
  });
}

/** 结构快照 JSON → 列清单；格式不合法时按无结构处理，不抛错。 */
export function parseTableStructureColumns(
  structureJson?: string | null
): TableTemplateColumn[] {
  if (!structureJson?.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(structureJson);
    const columns =
      typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { columns?: unknown }).columns)
        ? ((parsed as { columns: unknown[] }).columns)
        : [];
    return columns.flatMap((column) => {
      if (typeof column !== "object" || column === null) {
        return [];
      }
      const { title, type } = column as { title?: unknown; type?: unknown };
      if (typeof title !== "string" || !title.trim()) {
        return [];
      }
      return [{ title: title.trim(), ...(typeof type === "string" && type ? { type } : {}) }];
    });
  } catch {
    return [];
  }
}

/**
 * 从模板发起制表的首轮输入：提示词 + 结构参考行。
 * 结构以自然语言注入首轮上下文，由 ask_table 链路照常生成，后端零改动。
 */
export function buildTemplateLaunchPrompt(template: DataHubTableTemplate): string {
  const columns = parseTableStructureColumns(template.structureJson);
  if (columns.length === 0) {
    return template.prompt;
  }
  return `${template.prompt}\n\n表结构参考（按以下列生成）：${columns.map((column) => column.title).join("、")}`;
}
