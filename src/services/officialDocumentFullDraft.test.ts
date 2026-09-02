import { describe, expect, it } from "vitest";
import type { OfficialDocumentDraftContent, OfficialDocumentStructureNode } from "@/types/officialDocument";
import type {
  OfficialDocumentReferenceFixedField,
  OfficialDocumentReferenceSection
} from "./officialDocumentFullDraft";
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

  it("已确认大纲决定章节骨架：改过的标题、删掉的节、purpose/keyPoints 都进上下文", () => {
    const confirmedPlan = {
      summary: "",
      sections: [
        {
          id: "s1", order: 0, headingRole: "HEADING_1" as const, title: "一、总体安排（用户改过）",
          purpose: "交代本次检查的范围与目标", keyPoints: ["覆盖四个环节", "明确责任人"], sourceBlockIds: []
        },
        {
          id: "s2", order: 1, headingRole: "HEADING_2" as const, title: "（一）生产环节",
          purpose: "", keyPoints: [], sourceBlockIds: []
        },
        {
          id: "s3", order: 2, headingRole: "HEADING_1" as const, title: "二、工作要求",
          purpose: "提出整改时限", keyPoints: [], sourceBlockIds: []
        }
      ],
      researchNeeds: [],
      unassignedSourceBlockIds: [],
      warnings: []
    };
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
        { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" },
        { id: "h2", order: 2, role: "HEADING_1", variantId: "heading-v1", text: "二、被用户删掉的旧章节" },
        { id: "b2", order: 3, role: "BODY", variantId: "body-v1", text: "这一节不该再出现。" }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知",
      confirmedPlan
    });

    expect(plan.sections).toEqual([
      {
        id: "s1",
        order: 0,
        headingRole: "HEADING_1",
        title: "一、总体安排（用户改过）",
        // 下一节是更深一层的标题，本节是父级，只出标题
        bodyRequired: false,
        purpose: "交代本次检查的范围与目标",
        keyPoints: ["覆盖四个环节", "明确责任人"]
      },
      { id: "s2", order: 1, headingRole: "HEADING_2", title: "（一）生产环节", bodyRequired: true },
      { id: "s3", order: 2, headingRole: "HEADING_1", title: "二、工作要求", bodyRequired: true, purpose: "提出整改时限" }
    ]);
    // 锚点跟着大纲 id 走，参考稿里被删掉的旧章节不再出现
    const { outputRules, referenceSections } = plan.writingContext as {
      outputRules: Record<string, unknown>;
      referenceSections: unknown;
    };
    expect(outputRules.sectionAnchors).toEqual([
      "[[XS_SECTION:s1]]",
      "[[XS_SECTION:s2]]",
      "[[XS_SECTION:s3]]"
    ]);
    expect(referenceSections).toEqual(plan.sections);
    expect(JSON.stringify(plan.writingContext)).not.toContain("被用户删掉的旧章节");
    expect(outputRules.confirmedOutline).toBe(true);
    expect(outputRules.followConfirmedOutline).toContain("用户已确认的写作大纲");
    expect(outputRules.followConfirmedOutline).toContain("必须直接回答该节的 purpose 与 keyPoints");
    expect(outputRules.followConfirmedOutline).toContain("不得增删或调换章节");
  });

  it("有大纲时仍为参考稿首个标题前的引言留一格无标题正文节", () => {
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "lead", order: 0, role: "BODY", variantId: "body-v1", text: "为落实安全生产责任制，现将有关事项通知如下。" },
        { id: "h1", order: 1, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
        { id: "b1", order: 2, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知",
      confirmedPlan: {
        summary: "",
        sections: [{
          id: "s1", order: 0, headingRole: "HEADING_1" as const, title: "一、检查安排",
          purpose: "", keyPoints: [], sourceBlockIds: []
        }],
        researchNeeds: [],
        unassignedSourceBlockIds: [],
        warnings: []
      }
    });

    expect(plan.sections).toEqual([
      { id: "reference-body-1", order: 0, title: "正文", bodyRequired: true },
      { id: "s1", order: 1, headingRole: "HEADING_1", title: "一、检查安排", bodyRequired: true }
    ]);
    // 引言那一格没有 headingRole，模型据此只写正文、不多出标题
    expect(plan.sections[0].headingRole).toBeUndefined();
  });

  it("没有 confirmedPlan 时章节骨架与从前一字不差", () => {
    const content = referenceContent([
      { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
      { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
    ]);
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content,
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
    const { outputRules } = plan.writingContext as { outputRules: Record<string, unknown> };
    expect(outputRules.confirmedOutline).toBeUndefined();
    expect(outputRules.followConfirmedOutline).toBeUndefined();
    // 空大纲同样退回旧路径，不是「有 confirmedPlan 这个键」就换骨架
    const emptyOutline = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content,
      templateNodes,
      userRequirement: "撰写2026年安全生产通知",
      confirmedPlan: {
        summary: "",
        sections: [],
        researchNeeds: [],
        unassignedSourceBlockIds: [],
        warnings: []
      }
    });
    expect(emptyOutline.sections).toEqual(plan.sections);
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

  it("mapResearchResultsToReferenceSections 在锚点即大纲 id 时是恒等的", () => {
    // 已确认大纲直接当章节骨架后两边 id 相同，标题被改空、序号有偏移都不该改判
    const analyzed = [{ id: "s1", order: 0, title: "" }, { id: "s2", order: 1, title: "二、工作要求" }];
    const reference = [
      { id: "reference-body-1", order: 0, title: "正文", bodyRequired: true },
      { id: "s1", order: 1, title: "第 1 部分", bodyRequired: true },
      { id: "s2", order: 2, title: "二、工作要求", bodyRequired: true }
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
      { ...base, taskId: "b", sectionId: "s2" }
    ], analyzed, reference);
    expect(mapped.map((item) => item.sectionId)).toEqual(["s1", "s2"]);
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

  describe("固定字段锚点的保守修复", () => {
    const headFields: OfficialDocumentReferenceFixedField[] = [
      { slotId: "issuer-slot", role: "ISSUING_AUTHORITY", roleLabel: "发文机关", required: true, preview: "" },
      { slotId: "title-slot", role: "TITLE", roleLabel: "标题", required: true, preview: "" },
      { slotId: "date-slot", role: "DATE", roleLabel: "成文日期", required: false, preview: "" }
    ];
    const parseHead = (head: string[], fixedFields: OfficialDocumentReferenceFixedField[] = headFields) => parseOfficialDocumentReferenceGeneration({
      markdown: [...head, "[[XS_SECTION:reference-body-1]]", "通知正文。"].join("\n"),
      referenceDraftTitle: "参考草稿",
      sections: [{ id: "reference-body-1", order: 0, title: "正文", bodyRequired: true }],
      fixedFields,
      templateNodes
    });
    const valueOf = (result: { fixedValues: Array<{ slotId: string; value: string }> }, slotId: string) =>
      result.fixedValues.find((value) => value.slotId === slotId)?.value;

    it("单个字面 slot-id 补到第一个未被认领的声明字段", () => {
      const result = parseHead(["[[XS_FIXED:slot-id]]", "测试公司"]);
      expect(valueOf(result, "issuer-slot")).toBe("测试公司");
      expect(valueOf(result, "title-slot")).toBe("[待补充：标题]");
      expect(valueOf(result, "date-slot")).toBe("");
    });

    it("全部字面 slot-id 按声明顺序逐个补位，且不被重复锚点判定拦下", () => {
      const result = parseHead([
        "[[XS_FIXED:slot-id]]", "测试公司",
        "[[XS_FIXED:slot-id]]", "关于开展安全检查的通知",
        "[[XS_FIXED:slot-id]]", "2026年8月29日"
      ]);
      expect(result.fixedValues).toEqual([
        { slotId: "issuer-slot", value: "测试公司" },
        { slotId: "title-slot", value: "关于开展安全检查的通知" },
        { slotId: "date-slot", value: "2026年8月29日" }
      ]);
      expect(result.title).toBe("关于开展安全检查的通知");
    });

    it("与合法锚点混排时跳过已被认领的字段", () => {
      const result = parseHead([
        "[[XS_FIXED:slot-id]]", "测试公司",
        "[[XS_FIXED:title-slot]]", "关于开展安全检查的通知",
        "[[XS_FIXED:slot-id]]", "2026年8月29日"
      ]);
      expect(result.fixedValues).toEqual([
        { slotId: "issuer-slot", value: "测试公司" },
        { slotId: "title-slot", value: "关于开展安全检查的通知" },
        { slotId: "date-slot", value: "2026年8月29日" }
      ]);
    });

    it("大小写与空白变体归一后命中声明 slotId", () => {
      const result = parseHead([
        "[[XS_FIXED: Title-Slot ]]", "关于开展安全检查的通知",
        "[[XS_FIXED:DATE-SLOT]]", "2026年8月29日"
      ]);
      expect(valueOf(result, "title-slot")).toBe("关于开展安全检查的通知");
      expect(valueOf(result, "date-slot")).toBe("2026年8月29日");
    });

    it("字段显示名命中对应 slotId", () => {
      const result = parseHead([
        "[[XS_FIXED:标题]]", "关于开展安全检查的通知",
        "[[XS_FIXED:成文日期]]", "2026年8月29日"
      ]);
      expect(valueOf(result, "title-slot")).toBe("关于开展安全检查的通知");
      expect(valueOf(result, "date-slot")).toBe("2026年8月29日");
    });

    it("同名显示名有多个字段时不猜，仍按未知锚点抛错", () => {
      expect(() => parseHead(["[[XS_FIXED:固定字段]]", "测试公司"], [
        { slotId: "a-slot", role: "UNKNOWN", roleLabel: "固定字段", required: false, preview: "" },
        { slotId: "b-slot", role: "UNKNOWN", roleLabel: "固定字段", required: false, preview: "" }
      ])).toThrow("生成结果包含未知的固定字段锚点：固定字段");
    });

    it("自创 id 仍然抛错，且错误信息带上具体 id", () => {
      expect(() => parseHead(["[[XS_FIXED:signer-slot]]", "张三"]))
        .toThrow("生成结果包含未知的固定字段锚点：signer-slot");
    });

    it("占位符数量超过声明字段时拒绝修复", () => {
      expect(() => parseHead(["[[XS_FIXED:slot-id]]", "测试公司", "[[XS_FIXED:slot-id]]", "关于开展安全检查的通知"], [
        { slotId: "issuer-slot", role: "ISSUING_AUTHORITY", roleLabel: "发文机关", required: true, preview: "" }
      ])).toThrow("生成结果包含未知的固定字段锚点：slot-id");
    });

    it("未知章节锚点的错误信息同样带 id", () => {
      expect(() => parseOfficialDocumentReferenceGeneration({
        markdown: ["[[XS_SECTION:section-id]]", "通知正文。"].join("\n"),
        referenceDraftTitle: "参考草稿",
        sections: [{ id: "reference-body-1", order: 0, title: "正文", bodyRequired: true }],
        fixedFields: [],
        templateNodes
      })).toThrow("生成结果包含未知的章节锚点：section-id");
    });
  });

  describe("章节标题的修复阶梯", () => {
    const twoSections: OfficialDocumentReferenceSection[] = [
      { id: "reference-section-1", order: 0, headingRole: "HEADING_1", title: "一、总体要求", bodyRequired: true },
      { id: "reference-section-2", order: 1, headingRole: "HEADING_2", title: "（二）主要任务", bodyRequired: true }
    ];
    const oneSection = (title: string, headingRole: "HEADING_1" | "HEADING_2" = "HEADING_2") => ([{
      id: "reference-section-1", order: 0, headingRole, title, bodyRequired: true
    }] satisfies OfficialDocumentReferenceSection[]);
    const parseSections = (sections: OfficialDocumentReferenceSection[], lines: string[]) =>
      parseOfficialDocumentReferenceGeneration({
        markdown: lines.join("\n"),
        referenceDraftTitle: "参考草稿",
        sections,
        fixedFields: [],
        templateNodes
      });
    const shape = (result: { blocks: Array<{ role: string; sectionId?: string; text: string }> }) =>
      result.blocks.map((block) => [block.role, block.sectionId, block.text]);

    it("阶梯 a：标题写在锚点之前时从上一节尾部回捞，上一节不再多出标题", () => {
      const result = parseSections(twoSections, [
        "[[XS_SECTION:reference-section-1]]",
        "# 一、总体要求",
        "各部门要压实安全生产责任。",
        "（二）主要任务",
        "[[XS_SECTION:reference-section-2]]",
        "推进重点工程建设。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_1", "reference-section-1", "一、总体要求"],
        ["BODY", "reference-section-1", "各部门要压实安全生产责任。"],
        ["HEADING_2", "reference-section-2", "（二）主要任务"],
        ["BODY", "reference-section-2", "推进重点工程建设。"]
      ]);
    });

    it("阶梯 a：标题被并进上一节末段的末行时同样回捞", () => {
      const result = parseSections(twoSections, [
        "[[XS_SECTION:reference-section-1]]",
        "# 一、总体要求",
        "各部门要压实安全生产责任。",
        "（二）主要任务：",
        "[[XS_SECTION:reference-section-2]]",
        "推进重点工程建设。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_1", "reference-section-1", "一、总体要求"],
        ["BODY", "reference-section-1", "各部门要压实安全生产责任。"],
        ["HEADING_2", "reference-section-2", "（二）主要任务"],
        ["BODY", "reference-section-2", "推进重点工程建设。"]
      ]);
    });

    it("阶梯 a：挪走会把上一节掏空时不回捞，转由后面的阶梯兜底", () => {
      const result = parseSections([
        { ...twoSections[0], bodyRequired: false },
        twoSections[1]
      ], [
        "[[XS_SECTION:reference-section-1]]",
        "# 一、总体要求",
        "[[XS_SECTION:reference-section-2]]",
        "推进重点工程建设。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_1", "reference-section-1", "一、总体要求"],
        ["HEADING_2", "reference-section-2", "（二）主要任务"],
        ["BODY", "reference-section-2", "推进重点工程建设。"]
      ]);
    });

    it("阶梯 b：标题和首句写在同一行时按句末标点拆开，标题被改写也照拆", () => {
      const result = parseSections(oneSection("（一）总体思路"), [
        "[[XS_SECTION:reference-section-1]]",
        "（一）指导思想。以习近平新时代中国特色社会主义思想为指导，全面落实安全生产责任。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_2", "reference-section-1", "（一）指导思想"],
        ["BODY", "reference-section-1", "以习近平新时代中国特色社会主义思想为指导，全面落实安全生产责任。"]
      ]);
    });

    it("阶梯 b：整行以冒号收尾、正文另起一行时按换行拆", () => {
      const result = parseSections(oneSection("（一）指导思想"), [
        "[[XS_SECTION:reference-section-1]]",
        "（一）指导思想：",
        "以习近平新时代中国特色社会主义思想为指导。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_2", "reference-section-1", "（一）指导思想"],
        ["BODY", "reference-section-1", "以习近平新时代中国特色社会主义思想为指导。"]
      ]);
    });

    it("阶梯 b：拆不出正文就不拆，标题自带句号时交给后面的阶梯", () => {
      const result = parseSections(oneSection("（一）指导思想"), [
        "[[XS_SECTION:reference-section-1]]",
        "（一）指导思想。",
        "",
        "以习近平新时代中国特色社会主义思想为指导。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_2", "reference-section-1", "（一）指导思想"],
        ["BODY", "reference-section-1", "以习近平新时代中国特色社会主义思想为指导。"]
      ]);
    });

    it("阶梯 c：正文里存在与大纲标题一致的块时升格，其余按原序作正文", () => {
      const result = parseSections(oneSection("（一）指导思想"), [
        "[[XS_SECTION:reference-section-1]]",
        "本节说明如下。",
        "",
        "（一）指导思想",
        "",
        "坚持稳中求进工作总基调。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_2", "reference-section-1", "（一）指导思想"],
        ["BODY", "reference-section-1", "本节说明如下。"],
        ["BODY", "reference-section-1", "坚持稳中求进工作总基调。"]
      ]);
    });

    it("阶梯 d：完全没写标题时用已确认大纲的标题合成，正文原样保留", () => {
      const result = parseSections(oneSection("一、工作要求", "HEADING_1"), [
        "[[XS_SECTION:reference-section-1]]",
        "各部门要压实责任，严格落实安全生产制度。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_1", "reference-section-1", "一、工作要求"],
        ["BODY", "reference-section-1", "各部门要压实责任，严格落实安全生产制度。"]
      ]);
      expect(result.blocks[0].variantId).toBe("heading-v1");
    });

    it("合成标题后 bodyRequired 校验仍然有效，且不再出现「缺少标题」", () => {
      const call = () => parseSections(twoSections, [
        "[[XS_SECTION:reference-section-1]]",
        "# 一、总体要求",
        "各部门要压实安全生产责任。",
        "[[XS_SECTION:reference-section-2]]"
      ]);

      expect(call).toThrow("章节“（二）主要任务”没有生成正文");
      expect(call).not.toThrow("缺少标题");
    });

    it("章节内多写的下级标题按真实层级保留，不再整版拒绝", () => {
      const result = parseSections(oneSection("一、总体要求", "HEADING_1"), [
        "[[XS_SECTION:reference-section-1]]",
        "# 一、总体要求",
        "总体要求如下。",
        "## （一）指导思想",
        "坚持稳中求进工作总基调。"
      ]);

      expect(shape(result)).toEqual([
        ["HEADING_1", "reference-section-1", "一、总体要求"],
        ["BODY", "reference-section-1", "总体要求如下。"],
        ["HEADING_2", "reference-section-1", "（一）指导思想"],
        ["BODY", "reference-section-1", "坚持稳中求进工作总基调。"]
      ]);
    });
  });

  it("outputRules 列出合法锚点全集，旧键原样保留", () => {
    const plan = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "draft-old", title: "旧草稿", templateName: "通知模板" },
      content: referenceContent([
        { id: "h1", order: 0, role: "HEADING_1", variantId: "heading-v1", text: "一、旧年度情况" },
        { id: "b1", order: 1, role: "BODY", variantId: "body-v1", text: "旧文风格样本。" }
      ]),
      templateNodes,
      userRequirement: "撰写2026年安全生产通知"
    });
    const { outputRules } = plan.writingContext as { outputRules: Record<string, unknown> };

    expect(outputRules.fixedFieldAnchors).toEqual(
      plan.fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]`)
    );
    expect(outputRules.sectionAnchors).toEqual(
      plan.sections.map((section) => `[[XS_SECTION:${section.id}]]`)
    );
    expect(outputRules.fixedFieldAnchors).toContain("[[XS_FIXED:title-slot]]");
    expect(outputRules.sectionAnchors).toContain("[[XS_SECTION:reference-section-1]]");
    expect(outputRules.sectionHeadingFirstLine).toContain("锚点后的第一行必须是该章节标题");
    expect(outputRules.sectionHeadingFirstLine).toContain("必须独立成行、行尾不带句号冒号等标点");
    expect(outputRules).toMatchObject({
      fixedFieldAnchor: "[[XS_FIXED:slot-id]]",
      sectionAnchor: "[[XS_SECTION:section-id]]",
      keepSectionOrder: true,
      allowHeadingRewrite: true,
      copyReferenceFacts: false,
      allowResearch: false
    });
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
