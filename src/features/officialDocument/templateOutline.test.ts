import { describe, expect, it } from "vitest";
import type { OfficialDocumentRole, OfficialDocumentStructureNode } from "@/types/officialDocument";
import { summarizeOfficialDocumentTemplate } from "@/services/officialDocumentFullDraft";
import { buildTemplateOutline, flattenTemplateOutline } from "./templateOutline";

let sequence = 0;

function node(
  role: OfficialDocumentRole,
  preview: string,
  overrides: Partial<OfficialDocumentStructureNode> = {}
): OfficialDocumentStructureNode {
  sequence += 1;
  return {
    id: `node-${sequence}`,
    order: sequence,
    paragraphIndex: sequence - 1,
    role,
    roleLabel: role,
    preview,
    editable: role !== "PRESERVE",
    dataBinding: false,
    required: false,
    styleSummary: [],
    ...overrides
  };
}

describe("buildTemplateOutline", () => {
  it("把标题下的连续正文并成一条，而不是每段一行", () => {
    const outline = buildTemplateOutline([
      node("TITLE", "关于开展年度经营分析的通知"),
      node("HEADING_1", "一、总体情况"),
      node("BODY", "第一段正文"),
      node("BODY", "第二段正文"),
      node("BODY", "第三段正文")
    ]);

    const heading = outline.items.find((item) => item.kind === "heading");
    expect(heading?.children).toHaveLength(1);
    expect(heading?.children[0].kind).toBe("body");
    expect(heading?.children[0].nodes).toHaveLength(3);
    expect(heading?.children[0].preview).toContain("3 段正文");
  });

  it("二三级标题挂到最近的上级标题下并逐级缩进", () => {
    const outline = buildTemplateOutline([
      node("HEADING_1", "一、总体情况"),
      node("HEADING_2", "（一）收入"),
      node("BODY", "收入正文"),
      node("HEADING_3", "1. 主营业务"),
      node("BODY", "主营正文"),
      node("HEADING_1", "二、下一步安排"),
      node("BODY", "安排正文")
    ]);

    expect(outline.items.filter((item) => item.kind === "heading")).toHaveLength(2);
    const [first, second] = outline.items;
    const level2 = first.children.find((item) => item.kind === "heading");
    expect(level2?.depth).toBe(1);
    const level3 = level2?.children.find((item) => item.kind === "heading");
    expect(level3?.depth).toBe(2);
    expect(level3?.children[0].nodes[0].preview).toBe("主营正文");
    // 新的一级标题让更深的层级失效，正文不会错挂到上一节。
    expect(second.children[0].nodes[0].preview).toBe("安排正文");
  });

  it("缺上一级标题时，深层标题就近退到已有层级", () => {
    const outline = buildTemplateOutline([
      node("HEADING_1", "一、总体情况"),
      node("HEADING_3", "1. 直接跳到三级")
    ]);

    const deep = outline.items[0].children[0];
    expect(deep.kind).toBe("heading");
    expect(deep.depth).toBe(2);
  });

  it("没有任何标题时正文挂在根上", () => {
    const outline = buildTemplateOutline([node("BODY", "孤立正文"), node("BODY", "再来一段")]);

    expect(outline.items).toHaveLength(1);
    expect(outline.items[0].kind).toBe("body");
    expect(outline.items[0].depth).toBe(0);
    expect(outline.items[0].nodes).toHaveLength(2);
  });

  it("空段落与 PRESERVE 归并成一条，且不进文档预览", () => {
    const outline = buildTemplateOutline([
      node("TITLE", "标题"),
      node("PRESERVE", "", { empty: true }),
      node("PRESERVE", "", { empty: true }),
      node("BODY", "正文")
    ]);

    const preserve = outline.items.find((item) => item.kind === "preserve");
    expect(preserve?.nodes).toHaveLength(2);
    expect(preserve?.preview).toContain("2 段");
    expect(outline.documentNodes.map((item) => item.preview)).toEqual(["标题", "正文"]);
  });

  it("表格独立成项并保留问数绑定标记", () => {
    const outline = buildTemplateOutline([
      node("HEADING_1", "一、数据"),
      node("BODY", "表格前说明"),
      node("BODY", "表格占位", { paragraphIndex: undefined, tableIndex: 0, dataBinding: true })
    ]);

    const table = outline.items[0].children.find((item) => item.kind === "table");
    expect(table?.label).toBe("问数表格");
    // 表格切断了正文归并，前面的说明单独成条。
    expect(outline.items[0].children.filter((item) => item.kind === "body")).toHaveLength(1);
  });

  it("缺标题或正文时报出可读的缺失角色", () => {
    expect(buildTemplateOutline([node("BODY", "只有正文")]).missingRoles).toEqual(["标题"]);
    expect(buildTemplateOutline([node("TITLE", "只有标题")]).missingRoles).toEqual(["正文"]);
    expect(
      buildTemplateOutline([node("TITLE", "标题"), node("BODY", "正文")]).missingRoles
    ).toEqual([]);
  });

  it("flattenTemplateOutline 按树的先序展开", () => {
    const outline = buildTemplateOutline([
      node("HEADING_1", "一、总体"),
      node("HEADING_2", "（一）明细"),
      node("BODY", "正文")
    ]);

    expect(flattenTemplateOutline(outline.items).map((item) => item.kind))
      .toEqual(["heading", "heading", "body"]);
  });
});

describe("summarizeOfficialDocumentTemplate", () => {
  it("编号标题成体系时过滤被误标成标题的正文列表项", () => {
    const summary = summarizeOfficialDocumentTemplate([
      node("TITLE", "年度工作报告"),
      node("HEADING_1", "一、公司整体情况"),
      node("HEADING_2", "（一）重点工作"),
      node("HEADING_1", "教育客户43个；"),
      node("HEADING_1", "项目协同能力仍需提升。"),
      node("HEADING_3", "1.1 产品能力建设"),
      node("BODY", "正文区域", { slotType: "BODY_REGION", endParagraphIndex: 80 })
    ]);

    expect(summary.map((item) => item.preview)).toEqual([
      "年度工作报告",
      "一、公司整体情况",
      "（一）重点工作",
      "1.1 产品能力建设",
      "正文区域"
    ]);
  });
});
