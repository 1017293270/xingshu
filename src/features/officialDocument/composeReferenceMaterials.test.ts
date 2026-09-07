import { describe, expect, it } from "vitest";
import {
  MAX_REFERENCE_MATERIALS_CHARS,
  MAX_REFERENCE_MATERIAL_CHARS
} from "@/services/officialDocumentFullDraft";
import {
  classifyMaterialFile,
  composeMaterialPayload,
  joinContentProfileBlocks,
  materialExtension,
  resolveComposeMaterials,
  type ComposeMaterial
} from "./composeReferenceMaterials";

function material(partial: Partial<ComposeMaterial> & { id: string }): ComposeMaterial {
  return { name: `${partial.id}.md`, size: 100, status: "ready", ...partial };
}

describe("classifyMaterialFile", () => {
  it("routes text formats, DOCX and everything else apart", () => {
    expect(classifyMaterialFile(new File([""], "台账.csv"))).toBe("text");
    expect(classifyMaterialFile(new File([""], "说明.MD"))).toBe("text");
    expect(classifyMaterialFile(new File([""], "材料.docx"))).toBe("docx");
    expect(classifyMaterialFile(new File([""], "扫描件.pdf"))).toBe("unsupported");
    expect(classifyMaterialFile(new File([""], "无后缀"))).toBe("unsupported");
  });

  it("reads the extension case-insensitively", () => {
    expect(materialExtension("A.DOCX")).toBe(".docx");
    expect(materialExtension("noext")).toBe("");
  });
});

describe("joinContentProfileBlocks", () => {
  it("puts blocks back in order and flattens tables into rows", () => {
    expect(joinContentProfileBlocks([
      { id: "b2", order: 1, kind: "TABLE", text: "", headingHint: "", columns: ["季度", "隐患"], rows: [["Q1", "18"]] },
      { id: "b1", order: 0, kind: "PARAGRAPH", text: "整改率 96%。", headingHint: "", columns: [], rows: [] }
    ])).toBe("整改率 96%。\n\n季度\t隐患\nQ1\t18");
  });
});

describe("resolveComposeMaterials", () => {
  it("only budgets material that finished reading", () => {
    const resolved = resolveComposeMaterials([
      material({ id: "a", content: "已读到的正文" }),
      material({ id: "b", status: "reading" }),
      material({ id: "c", status: "failed", message: "读取失败" })
    ]);

    expect(resolved.map((item) => item.budgetedContent)).toEqual(["已读到的正文", "", ""]);
    expect(resolved.every((item) => !item.truncated)).toBe(true);
    expect(composeMaterialPayload(resolved)).toEqual([{ name: "a.md", content: "已读到的正文" }]);
  });

  it("truncates a single oversized file and says so", () => {
    const [resolved] = resolveComposeMaterials([
      material({ id: "a", content: "字".repeat(MAX_REFERENCE_MATERIAL_CHARS + 500) })
    ]);

    expect(resolved.budgetedContent).toHaveLength(MAX_REFERENCE_MATERIAL_CHARS);
    expect(resolved.truncated).toBe(true);
  });

  it("spends the shared budget in order and leaves nothing for the overflow", () => {
    const full = "字".repeat(MAX_REFERENCE_MATERIAL_CHARS);
    const resolved = resolveComposeMaterials([
      material({ id: "a", content: full }),
      material({ id: "b", content: full }),
      material({ id: "c", content: full }),
      material({ id: "d", content: full })
    ]);

    const total = resolved.reduce((sum, item) => sum + item.budgetedContent.length, 0);
    expect(total).toBe(MAX_REFERENCE_MATERIALS_CHARS);
    expect(resolved[3].budgetedContent).toBe("");
    expect(resolved[3].truncated).toBe(true);
    expect(composeMaterialPayload(resolved)).toHaveLength(3);
  });
});
