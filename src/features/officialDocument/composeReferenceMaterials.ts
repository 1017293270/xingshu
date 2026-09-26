import {
  MAX_REFERENCE_MATERIALS_CHARS,
  MAX_REFERENCE_MATERIAL_CHARS
} from "@/services/officialDocumentFullDraft";

/** 浏览器直接读成文本的格式；再大就不是「参考资料」而是数据文件了。 */
export const TEXT_MATERIAL_EXTENSIONS = [".txt", ".md", ".csv", ".json"];
export const MAX_TEXT_MATERIAL_BYTES = 2 * 1024 * 1024;
/** DOCX 在浏览器里本地解析，上限跟模板上传一致。 */
export const MAX_DOCX_MATERIAL_BYTES = 25 * 1024 * 1024;

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

/** PDF 单列出来：它不是「不认识的格式」，用户需要的是一句怎么转的提示。 */
export function classifyMaterialFile(file: File): "text" | "docx" | "pdf" | "unsupported" {
  const extension = materialExtension(file.name);
  if (TEXT_MATERIAL_EXTENSIONS.includes(extension)) return "text";
  if (extension === ".docx") return "docx";
  if (extension === ".pdf") return "pdf";
  return "unsupported";
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
