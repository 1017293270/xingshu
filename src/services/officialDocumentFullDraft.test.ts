import { describe, expect, it } from "vitest";
import type { OfficialDocumentDraftContent, OfficialDocumentStructureNode } from "@/types/officialDocument";
import {
  buildOfficialDocumentReferenceWritingPlan,
  buildOfficialDocumentPreviewLines,
  mapResearchResultsToReferenceSections,
  parseOfficialDocumentReferenceGeneration,
  stripOfficialDocumentAnchors
} from "./officialDocumentFullDraft";

const templateNodes: OfficialDocumentStructureNode[] = [
  {
    id: "title-node",
    order: 0,
    paragraphIndex: 0,
    slotId: "title-slot",
    slotType: "FIXED_TEXT",
    role: "TITLE",
    roleLabel: "标题",
    preview: "关于某项工作的通知",
    editable: true,
    dataBinding: false,
    required: true,
    styleSummary: ["二号方正小标宋"],
    variantId: "title-v1"
  },
  {
    id: "heading-node",
    order: 1,
    paragraphIndex: 1,
    slotId: "heading-slot",
    slotType: "BODY_REGION",
    role: "HEADING_1",
    roleLabel: "一级标题",
    preview: "一、总体要求",
    editable: true,
    dataBinding: false,
    required: false,
    styleSummary: ["三号黑体"],
    variantId: "heading-v1"
  },
  {
    id: "body-node",
    order: 2,
    paragraphIndex: 2,
    endParagraphIndex: 8,
    slotId: "body-slot",
    slotType: "BODY_REGION",
    role: "BODY",
    roleLabel: "正文",
    preview: "正文区域",
    editable: true,
    dataBinding: false,
    required: true,
    styleSummary: ["三号仿宋"],
    variantId: "body-v1"
  }
];

function referenceContent(blocks: OfficialDocumentDraftContent["blocks"]): OfficialDocumentDraftContent {
  return {
    revision: 7,
    fixedValues: [{ slotId: "title-slot", value: "2025年旧标题" }],
    blocks,
    researchResults: []
  };
}

describe("reference draft generation", () => {
  it("builds a structure-and-style context without copying fixed values or data blocks", () => {
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
        { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文采用简洁、正式的表达。" },
        { id: "table", order: 2, role: "TABLE", variantId: "", text: "旧数据表", table: { columns: ["指标"], rows: [["99"]], totalRows: 1 } }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知"
    });

    expect(plan.sections).toEqual([{
      id: "reference-section-1",
      order: 0,
      headingRole: "HEADING_1",
      title: "一、旧年度情况",
      bodyRequired: true
    }]);
    expect(plan.fixedFields[0]).toMatchObject({ slotId: "title-slot", role: "TITLE" });
    expect(JSON.stringify(plan.writingContext)).toContain("旧文采用简洁、正式的表达");
    expect(JSON.stringify(plan.writingContext)).not.toContain("2025年旧标题");
    expect(JSON.stringify(plan.writingContext)).not.toContain("旧数据表");
    expect(plan.writingContext).toMatchObject({ action: "REFERENCE_DRAFT" });
  });

  it("研究结果注入上下文并放开 allowResearch，图表 base64 不进上下文", () => {
    const research = [{
      taskId: "n1",
      sectionId: "reference-section-1",
      kind: "ASK_DATA" as const,
      question: "检查完成数量",
      required: true,
      preferredOutput: "TABLE" as const,
      status: "SUCCESS" as const,
      summary: "全年完成 120 次",
      chart: { mimeType: "image/png" as const, base64: "AAAA", widthPx: 10, heightPx: 10, altText: "图" },
      citations: []
    }];
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
        { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知",
      researchResults: research
    });
    const context = plan.writingContext as {
      researchResults?: Array<{ summary: string; chart?: { base64?: string } }>;
      outputRules: { allowResearch: boolean };
    };
    expect(context.outputRules.allowResearch).toBe(true);
    expect(context.researchResults?.[0]?.summary).toBe("全年完成 120 次");
    expect(context.researchResults?.[0]?.chart?.base64).toBeUndefined();
    // 未注入时保持关闭
    const bare = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "b1", order: 0, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知"
    });
    expect((bare.writingContext as { outputRules: { allowResearch: boolean } }).outputRules.allowResearch).toBe(false);
  });

  it("mapResearchResultsToReferenceSections 标题优先、序号兜底、无匹配保留原值", () => {
    const analyzed = [
      { id: "s1", order: 0, title: "一、检查安排" },
      { id: "s2", order: 1, title: "二、其他事项" },
      { id: "s3", order: 9, title: "完全对不上的" }
    ];
    const reference = [
      { id: "reference-section-1", order: 0, title: "1. 检查安排", bodyRequired: true },
      { id: "reference-section-2", order: 1, title: "工作要求", bodyRequired: true }
    ];
    const base = {
      kind: "ASK_DATA" as const,
      question: "q",
      required: false,
      preferredOutput: "" as const,
      status: "SUCCESS" as const,
      summary: "s",
      citations: []
    };
    const mapped = mapResearchResultsToReferenceSections([
      { ...base, taskId: "a", sectionId: "s1" },
      { ...base, taskId: "b", sectionId: "s2" },
      { ...base, taskId: "c", sectionId: "s3" },
      { ...base, taskId: "d", sectionId: "unknown" }
    ], analyzed, reference);
    expect(mapped.map((item) => item.sectionId)).toEqual([
      "reference-section-1", // 标题归一后相同（检查安排）
      "reference-section-2", // 标题不同但同序号
      "s3",                  // 序号也对不上，保留原值
      "unknown"              // 不在分析章节里，原样保留
    ]);
  });

  it("parses fixed fields and rewritten headings into template variants", () => {
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
        { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知"
    });
    const result = parseOfficialDocumentReferenceGeneration({
      markdown: [
        "[[XS_FIXED:title-slot]]",
        "关于加强2026年安全生产工作的通知",
        "",
        "测试〔2026〕1号    签发人：待补充",
        "[[XS_SECTION:reference-section-1]]",
        "# 一、工作要求",
        "各部门要压实责任，严格落实安全生产制度。"
      ].join("\n"),
      referenceDraftTitle: "旧草稿",
      sections: plan.sections,
      fixedFields: plan.fixedFields,
      templateNodes
    });

    expect(result.title).toBe("关于加强2026年安全生产工作的通知");
    expect(result.fixedValues).toEqual([{ slotId: "title-slot", value: "关于加强2026年安全生产工作的通知" }]);
    expect(result.blocks.map((block) => [block.role, block.variantId, block.text])).toEqual([
      ["HEADING_1", "heading-v1", "一、工作要求"],
      ["BODY", "body-v1", "各部门要压实责任，严格落实安全生产制度。"]
    ]);

    const lateFixed = parseOfficialDocumentReferenceGeneration({
      markdown: [
        "[[XS_SECTION:reference-section-1]]",
        "# 一、工作要求",
        "各部门要压实责任。",
        "[[XS_FIXED:title-slot]]",
        "关于加强2026年安全生产工作的通知"
      ].join("\n"),
      referenceDraftTitle: "旧草稿",
      sections: plan.sections,
      fixedFields: plan.fixedFields,
      templateNodes
    });
    expect(lateFixed.title).toBe("关于加强2026年安全生产工作的通知");
  });

  it("coalesces an identical repeated fixed-field anchor but rejects conflicting values", () => {
    const input = {
      referenceDraftTitle: "旧草稿",
      sections: [{
        id: "reference-section-1",
        order: 0,
        headingRole: "HEADING_1" as const,
        title: "一、旧年度情况",
        bodyRequired: true
      }],
      fixedFields: [{
        slotId: "title-slot",
        role: "TITLE" as const,
        roleLabel: "标题",
        required: true,
        preview: ""
      }],
      templateNodes
    };
    const repeated = parseOfficialDocumentReferenceGeneration({
      ...input,
      markdown: [
        "[[XS_FIXED:title-slot]]",
        "关于加强安全生产工作的通知",
        "[[XS_FIXED:title-slot]]",
        "关于加强安全生产工作的通知",
        "[[XS_SECTION:reference-section-1]]",
        "# 一、工作要求",
        "各部门要压实责任。"
      ].join("\n")
    });

    expect(repeated.fixedValues).toEqual([
      { slotId: "title-slot", value: "关于加强安全生产工作的通知" }
    ]);
    expect(() => parseOfficialDocumentReferenceGeneration({
      ...input,
      markdown: [
        "[[XS_FIXED:title-slot]]",
        "关于加强安全生产工作的通知",
        "[[XS_FIXED:title-slot]]",
        "关于开展消防检查的通知",
        "[[XS_SECTION:reference-section-1]]",
        "# 一、工作要求",
        "各部门要压实责任。"
      ].join("\n")
    })).toThrow("重复固定字段的值不一致");
  });

  it("keeps a body-only reference body-only even when the model emits markdown headings", () => {
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-body", title: "简短函件", templateName: "函模板" },
      content: referenceContent([{ id: "b1", order: 0, role: "BODY", variantId: "body-v1", text: "正文样本。" }]),
      templateNodes: templateNodes.filter((node) => node.role !== "HEADING_1"),
      userRequirement: "写一份简短回复函"
    });

    expect(plan.sections[0].headingRole).toBeUndefined();
    const generated = parseOfficialDocumentReferenceGeneration({
      markdown: "[[XS_SECTION:reference-body-1]]\n# 新增标题\n回复正文。",
      referenceDraftTitle: "简短函件",
      sections: plan.sections,
      fixedFields: [],
      templateNodes: templateNodes.filter((node) => node.role !== "HEADING_1")
    });
    expect(generated.blocks.map((block) => [block.role, block.text])).toEqual([
      ["BODY", "新增标题"],
      ["BODY", "回复正文。"]
    ]);
  });

  it("keeps generated fixed fields out of the title and body", () => {
    const result = parseOfficialDocumentReferenceGeneration({
      markdown: [
        "[[XS_FIXED:issuer-slot]]",
        "测试公司",
        "[[XS_FIXED:title-slot]]",
        "测试公司关于开展安全检查的通知",
        "[[XS_FIXED:attachment-slot]]",
        "附件：[待补充：附件清单]",
        "[[XS_SECTION:reference-body-1]]",
        "通知正文。",
        "",
        "附件：[待补充：附件清单]"
      ].join("\n"),
      referenceDraftTitle: "参考草稿",
      sections: [{ id: "reference-body-1", order: 0, title: "正文", bodyRequired: true }],
      fixedFields: [
        { slotId: "issuer-slot", role: "ISSUING_AUTHORITY", roleLabel: "发文机关", required: true, preview: "" },
        { slotId: "title-slot", role: "TITLE", roleLabel: "标题", required: true, preview: "" },
        { slotId: "attachment-slot", role: "ATTACHMENT_NOTE", roleLabel: "附件说明", required: false, preview: "" }
      ],
      templateNodes
    });

    expect(result.title).toBe("关于开展安全检查的通知");
    expect(result.fixedValues.find((value) => value.slotId === "title-slot")?.value)
      .toBe("关于开展安全检查的通知");
    expect(result.blocks.map((block) => block.text)).toEqual(["通知正文。"]);
  });
});

describe("stripOfficialDocumentAnchors", () => {
  it("removes whole anchor lines without leaving blank gaps", () => {
    const markdown = [
      "[[XS_FIXED:title-slot]]",
      "关于开展安全检查的通知",
      "  [[XS_SECTION:reference-section-1]]",
      "# 一、检查安排",
      "各部门应按要求完成安全检查。"
    ].join("\n");

    expect(stripOfficialDocumentAnchors(markdown)).toBe([
      "关于开展安全检查的通知",
      "# 一、检查安排",
      "各部门应按要求完成安全检查。"
    ].join("\n"));
  });

  it("swallows the half-written anchor at the end of a stream", () => {
    expect(stripOfficialDocumentAnchors("正文第一段。\n[[XS_SEC")).toBe("正文第一段。\n");
    expect(stripOfficialDocumentAnchors("正文第一段。\n[[")).toBe("正文第一段。\n");
    expect(stripOfficialDocumentAnchors("正文第一段。\n[[XS_SECTION:reference-sect")).toBe("正文第一段。\n");
  });

  it("leaves ordinary brackets in the body alone", () => {
    expect(stripOfficialDocumentAnchors("见附件[[1]]与说明")).toBe("见附件[[1]]与说明");
    expect(stripOfficialDocumentAnchors("参考资料[[附件三")).toBe("参考资料[[附件三");
  });

  it("drops an inline anchor without eating the surrounding text", () => {
    expect(stripOfficialDocumentAnchors("标题[[XS_FIXED:title-slot]]正文")).toBe("标题正文");
  });
});

describe("buildOfficialDocumentPreviewLines", () => {
  const fixedFields = [
    { slotId: "title-slot", role: "TITLE" as const, roleLabel: "标题", required: true, preview: "" },
    { slotId: "date-slot", role: "DATE" as const, roleLabel: "成文日期", required: false, preview: "" }
  ];

  it("maps fixed-field anchors to their document roles", () => {
    const lines = buildOfficialDocumentPreviewLines([
      "[[XS_FIXED:title-slot]]",
      "关于开展安全检查的通知",
      "[[XS_FIXED:date-slot]]",
      "2026年8月29日",
      "[[XS_SECTION:reference-section-1]]",
      "# 一、检查安排",
      "各部门应按要求完成安全检查。"
    ].join("\n"), fixedFields);

    expect(lines).toEqual([
      { role: "TITLE", text: "关于开展安全检查的通知" },
      { role: "DATE", text: "2026年8月29日" },
      { role: "HEADING_1", text: "一、检查安排" },
      { role: "BODY", text: "各部门应按要求完成安全检查。" }
    ]);
  });

  it("infers plain Chinese numbered headings instead of leaving them as body", () => {
    const lines = buildOfficialDocumentPreviewLines([
      "[[XS_SECTION:reference-section-1]]",
      "一、总体要求",
      "（一）指导思想",
      "坚持稳中求进工作总基调。"
    ].join("\n"));

    expect(lines.map((line) => line.role)).toEqual(["HEADING_1", "HEADING_2", "BODY"]);
  });

  it("shows the leading text even before the first section anchor arrives", () => {
    const lines = buildOfficialDocumentPreviewLines("[[XS_FIXED:title-slot]]\n关于开展安全检查的通知", fixedFields);
    expect(lines).toEqual([{ role: "TITLE", text: "关于开展安全检查的通知" }]);
  });

  it("returns nothing for an empty stream", () => {
    expect(buildOfficialDocumentPreviewLines("", fixedFields)).toEqual([]);
  });
});
