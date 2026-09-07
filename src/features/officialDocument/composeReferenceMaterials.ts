import {
  MAX_REFERENCE_MATERIALS_CHARS,
  MAX_REFERENCE_MATERIAL_CHARS
} from "@/services/officialDocumentFullDraft";
import type { OfficialDocumentContentSourceBlock } from "@/types/officialDocument";

/** 浏览器直接读成文本的格式；再大就不是「参考资料」而是数据文件了。 */
export const TEXT_MATERIAL_EXTENSIONS = [".txt", ".md", ".csv", ".json"];
export const MAX_TEXT_MATERIAL_BYTES = 2 * 1024 * 1024;

export type ComposeMaterialStatus = "reading" | "ready" | "failed";

export type ComposeMaterial = {
  id: string;
  name: string;
  size: number;
  status: ComposeMaterialStatus;
  content?: string;
  message?: string;
};

export type ResolvedComposeMaterial = ComposeMaterial & {
  /** 受单文件与总量两道上限约束后，真正会进写作上下文的正文。 */
  budgetedContent: string;
  truncated: boolean;
};

export function materialExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLocaleLowerCase();
}

export function classifyMaterialFile(file: File): "text" | "docx" | "unsupported" {
  const extension = materialExtension(file.name);
  if (TEXT_MATERIAL_EXTENSIONS.includes(extension)) return "text";
  if (extension === ".docx") return "docx";
  return "unsupported";
}

/** 内容方案抽取出来的块拼回一篇纯文本，表格按行用制表符分列。 */
export function joinContentProfileBlocks(blocks: OfficialDocumentContentSourceBlock[]) {
  return [...blocks]
    .sort((left, right) => left.order - right.order)
    .map((block) => {
      if (block.kind === "TABLE") {
        const header = block.columns.length ? [block.columns.join("\t")] : [];
        return [...header, ...block.rows.map((row) => row.join("\t"))].join("\n");
      }
      return block.text;
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 两道上限一起算：单文件超了自己截断，总量超了后面的文件只拿到剩余额度。
 * 芯片上的「已截断」直接读这个结果，避免界面说的和真正发出去的对不上。
 */
export function resolveComposeMaterials(materials: ComposeMaterial[]): ResolvedComposeMaterial[] {
  let remaining = MAX_REFERENCE_MATERIALS_CHARS;
  return materials.map((material) => {
    const content = material.content ?? "";
    const perFile = content.slice(0, MAX_REFERENCE_MATERIAL_CHARS);
    const budgeted = material.status === "ready" ? perFile.slice(0, Math.max(0, remaining)) : "";
    remaining -= budgeted.length;
    return {
      ...material,
      budgetedContent: budgeted,
      truncated: material.status === "ready" && budgeted.length < content.length
    };
  });
}

/** 进 writingContext 的载荷：只带真正读出内容的资料。 */
export function composeMaterialPayload(resolved: ResolvedComposeMaterial[]) {
  return resolved
    .filter((material) => material.budgetedContent.trim().length > 0)
    .map((material) => ({ name: material.name, content: material.budgetedContent }));
}
