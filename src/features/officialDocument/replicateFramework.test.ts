import { describe, expect, it } from "vitest";
import type { ParsedDocx } from "@/services/officialDocumentDocxParser";
import {
  buildOfficialDocumentReferenceWritingPlan,
  MAX_REFERENCE_MATERIAL_CHARS,
  parseOfficialDocumentReferenceGeneration
} from "@/services/officialDocumentFullDraft";
import type { OfficialDocumentStructureNode } from "@/types/officialDocument";
import {
  buildReplicateFramework,
  countReplicateLevels,
  insertReplicateSection,
  moveReplicateSection,
  readReplicateFramework,
  removeReplicateSection,
  replicateStyleContent,
  replicateWritingPlan,
  shiftReplicateSectionLevel,
  summarizeKeyPoints,
  updateReplicateSection
} from "./replicateFramework";

const speech: ParsedDocx = {
  title: "在年中工作会议上的讲话",
  paragraphCount: 9,
  tableCount: 1,
  headingCount: 3,
  blocks: [
    { kind: "PARAGRAPH", role: "META", text: "XX单位" },
    { kind: "PARAGRAPH", role: "TITLE", text: "在年中工作会议上的讲话" },
    { kind: "PARAGRAPH", role: "BODY", text: "同志们：" },
    { kind: "PARAGRAPH", role: "BODY", text: "今天召开年中工作会议。主要任务是总结上半年工作，安排下半年任务。" },
    { kind: "PARAGRAPH", role: "HEADING_1", text: "一、总结上半年工作", heading: "一、总结上半年工作" },
    {
      kind: "PARAGRAPH",
      role: "HEADING_2",
      text: "（一）主责主业抓得比较紧。重点任务按节点推进。",
      heading: "（一）主责主业抓得比较紧",
      runIn: "重点任务按节点推进。"
    },
    { kind: "TABLE", role: "BODY", text: "指标\t完成率\n收入\t96%", rows: [["指标", "完成率"], ["收入", "96%"]] },
    { kind: "PARAGRAPH", role: "HEADING_1", text: "二、安排下半年工作", heading: "二、安排下半年工作" },
    { kind: "PARAGRAPH", role: "BODY", text: "下半年时间紧、任务重，必须把任务盯紧。" },
    { kind: "PARAGRAPH", role: "META", text: "2026年8月14日" }
  ]
};

const file = { name: "年中讲话.docx", size: 20_480 };

const templateNodes: OfficialDocumentStructureNode[] = [
  {
    id: "title-node", order: 0, paragraphIndex: 0, slotId: "title-slot", slotType: "FIXED_TEXT",
    role: "TITLE", roleLabel: "标题", preview: "关于某事的通知", editable: true, dataBinding: false,
    required: true, styleSummary: [], variantId: "title-v1"
  },
  {
    id: "heading-node", order: 1, paragraphIndex: 1, slotType: "BODY_REGION", role: "HEADING_1",
    roleLabel: "一级标题", preview: "一、原章节", editable: true, dataBinding: false, required: false,
    styleSummary: [], variantId: "heading-v1"
  },
  {
    id: "body-node", order: 2, paragraphIndex: 2, endParagraphIndex: 8, slotType: "BODY_REGION", role: "BODY",
    roleLabel: "正文", preview: "正文", editable: true, dataBinding: false, required: true,
    styleSummary: [], variantId: "body-v1"
  }
];

describe("buildReplicateFramework", () => {
  it("turns the parsed outline into editable sections with excerpts and default key points", () => {
    const framework = buildReplicateFramework(speech, file);

    expect(framework.source).toEqual({
      name: "年中讲话.docx", size: 20_480, title: "在年中工作会议上的讲话", paragraphCount: 9, tableCount: 1
    });
    expect(framework.warnings).toEqual([]);
    expect(framework.sections.map((section) => [section.level, section.title])).toEqual([
      ["BODY", "开头"],
      ["HEADING_1", "一、总结上半年工作"],
      ["HEADING_2", "（一）主责主业抓得比较紧"],
      ["HEADING_1", "二、安排下半年工作"]
    ]);
    const [opening, parent, child, second] = framework.sections;
    // 红头、标题、落款日期都是版式，不进任何一节的摘录
    expect(opening.excerpt).toBe("同志们：\n今天召开年中工作会议。主要任务是总结上半年工作，安排下半年任务。");
    // 称呼语不算要点，默认要点是开头两句
    expect(opening.keyPoints).toEqual(["今天召开年中工作会议", "主要任务是总结上半年工作，安排下半年任务"]);
    expect(parent).toMatchObject({ excerpt: "", keyPoints: [], sourceTitle: "一、总结上半年工作" });
    // 同段正文和表格都归到这一节，要点只取正文句子
    expect(child.excerpt).toBe("重点任务按节点推进。\n指标\t完成率\n收入\t96%");
    expect(child.keyPoints).toEqual(["重点任务按节点推进"]);
    expect(child.purpose).toBe("参照原文「（一）主责主业抓得比较紧」一节的写法和内容安排");
    expect(second.keyPoints).toEqual(["下半年时间紧、任务重，必须把任务盯紧"]);
    expect(framework.sourceTextCondensed).toBe(false);
    expect(framework.sourceText).toContain("二、安排下半年工作\n下半年时间紧");
    expect(countReplicateLevels(framework)).toEqual({ HEADING_1: 2, HEADING_2: 1, HEADING_3: 0, BODY: 1 });
  });

  it("keeps a document without headings as one body-only section and says so", () => {
    const framework = buildReplicateFramework({
      paragraphCount: 2, tableCount: 0, headingCount: 0,
      blocks: [
        { kind: "PARAGRAPH", role: "BODY", text: "兹定于下周一召开专题会议。" },
        { kind: "PARAGRAPH", role: "BODY", text: "请准时参加。" }
      ]
    }, file);

    expect(framework.warnings).toEqual(["NO_HEADINGS"]);
    expect(framework.sections).toHaveLength(1);
    expect(framework.sections[0]).toMatchObject({
      level: "BODY",
      title: "全文",
      excerpt: "兹定于下周一召开专题会议。\n请准时参加。",
      purpose: "参照原文全文的写法和内容安排"
    });
  });

  it("still gives an empty framework to work in when nothing could be read", () => {
    const framework = buildReplicateFramework(undefined, file, "这份文件没法按 DOCX 读取");

    expect(framework.warnings).toEqual(["UNREADABLE"]);
    expect(framework.parseError).toBe("这份文件没法按 DOCX 读取");
    expect(framework.sections).toEqual([
      { id: "section-1", level: "BODY", title: "全文", purpose: "", keyPoints: [], excerpt: "" }
    ]);
    expect(framework.sourceText).toBe("");
  });

  it("condenses a long original section by section instead of cutting off the tail", () => {
    const longBody = "这是一段很长的正文。".repeat(600);
    const framework = buildReplicateFramework({
      paragraphCount: 6, tableCount: 0, headingCount: 3,
      blocks: ["一、第一部分", "二、第二部分", "三、第三部分"].flatMap((heading) => [
        { kind: "PARAGRAPH" as const, role: "HEADING_1" as const, text: heading, heading },
        { kind: "PARAGRAPH" as const, role: "BODY" as const, text: longBody }
      ])
    }, file);

    expect(framework.sourceTextCondensed).toBe(true);
    expect(framework.sourceText.length).toBeLessThanOrEqual(MAX_REFERENCE_MATERIAL_CHARS);
    expect(framework.sourceText).toContain("一、第一部分");
    expect(framework.sourceText).toContain("三、第三部分");
    // 摘录只给人对照，存储有上限
    expect(framework.sections[0].excerpt.length).toBeLessThanOrEqual(2_001);
  });
});

describe("summarizeKeyPoints", () => {
  it("takes the first one or two sentences and trims them", () => {
    expect(summarizeKeyPoints("第一句话讲目标。第二句讲措施！第三句不要。")).toEqual(["第一句话讲目标", "第二句讲措施"]);
    expect(summarizeKeyPoints("短。")).toEqual([]);
    const long = summarizeKeyPoints(`${"长".repeat(80)}。后面还有。`);
    expect(long).toHaveLength(1);
    expect(long[0]).toHaveLength(61);
  });
});

describe("framework editing", () => {
  const base = buildReplicateFramework(speech, file);

  it("renames, re-levels and edits key points of one section only", () => {
    const edited = updateReplicateSection(base, "section-2", { title: "一、总结2026年上半年工作", keyPoints: ["成效", "问题"] });
    expect(edited.sections[1]).toMatchObject({ title: "一、总结2026年上半年工作", keyPoints: ["成效", "问题"] });
    expect(edited.sections[0]).toBe(base.sections[0]);

    const demoted = shiftReplicateSectionLevel(base, "section-2", 1);
    expect(demoted.sections[1].level).toBe("HEADING_2");
    expect(shiftReplicateSectionLevel(base, "section-2", -1).sections[1].level).toBe("HEADING_1");
    const deepest = updateReplicateSection(base, "section-3", { level: "HEADING_3" });
    expect(shiftReplicateSectionLevel(deepest, "section-3", 1).sections[2].level).toBe("HEADING_3");
    // 无标题段落不参与升降，改层级只能在选择器里改
    expect(shiftReplicateSectionLevel(base, "section-1", -1).sections[0].level).toBe("BODY");
    expect(updateReplicateSection(base, "section-1", { level: "HEADING_1" }).sections[0].level).toBe("HEADING_1");
  });

  it("moves sections within bounds", () => {
    const moved = moveReplicateSection(base, "section-4", -1);
    expect(moved.sections.map((section) => section.id)).toEqual(["section-1", "section-2", "section-4", "section-3"]);
    expect(moveReplicateSection(base, "section-1", -1)).toBe(base);
    expect(moveReplicateSection(base, "section-4", 1)).toBe(base);
  });

  it("inserts after a section at its level, or appends", () => {
    const { framework: inserted, sectionId } = insertReplicateSection(base, "section-3");
    expect(inserted.sections.map((section) => section.id)).toEqual(["section-1", "section-2", "section-3", sectionId, "section-4"]);
    expect(inserted.sections[3]).toMatchObject({ level: "HEADING_2", title: "", excerpt: "", keyPoints: [] });

    const appended = insertReplicateSection(base);
    expect(appended.framework.sections.at(-1)).toMatchObject({ id: appended.sectionId, level: "HEADING_1" });
    // 跟在无标题段落后面新增的节是一级标题
    expect(insertReplicateSection(base, "section-1").framework.sections[1].level).toBe("HEADING_1");
  });

  it("removes sections but always keeps one", () => {
    const removed = removeReplicateSection(base, "section-2");
    expect(removed.sections.map((section) => section.id)).toEqual(["section-1", "section-3", "section-4"]);
    const single = buildReplicateFramework(undefined, file);
    expect(removeReplicateSection(single, "section-1")).toBe(single);
  });
});

describe("framework → writing plan", () => {
  it("maps sections onto the confirmed-outline plan and lists body-only ones", () => {
    const framework = updateReplicateSection(buildReplicateFramework(speech, file), "section-4", {
      keyPoints: ["  下半年重点  ", "", "保障措施"]
    });
    const { plan, bodyOnlySectionIds } = replicateWritingPlan(framework);

    expect(plan.summary).toBe("按《年中讲话.docx》的内容框架复刻");
    expect(plan.researchNeeds).toEqual([]);
    expect(plan.sections.map((section) => [section.id, section.order, section.headingRole, section.title])).toEqual([
      ["section-1", 0, "HEADING_1", "开头"],
      ["section-2", 1, "HEADING_1", "一、总结上半年工作"],
      ["section-3", 2, "HEADING_2", "（一）主责主业抓得比较紧"],
      ["section-4", 3, "HEADING_1", "二、安排下半年工作"]
    ]);
    expect(plan.sections[3].keyPoints).toEqual(["下半年重点", "保障措施"]);
    expect(bodyOnlySectionIds).toEqual(["section-1"]);
  });

  it("feeds the full-draft plan: body-only sections lose their heading and the replicate rule is added", () => {
    const framework = buildReplicateFramework(speech, file);
    const { plan, bodyOnlySectionIds } = replicateWritingPlan(framework);
    const writing = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "template-1", title: "通知模板", templateName: "通知模板" },
      content: replicateStyleContent(framework),
      templateNodes,
      userRequirement: "按这个框架写2026年版本",
      referenceMaterials: [{ name: framework.source.name, content: framework.sourceText }],
      confirmedPlan: plan,
      bodyOnlySectionIds,
      replicateSourceName: framework.source.name
    });

    expect(writing.sections.map((section) => [section.id, section.headingRole, section.bodyRequired])).toEqual([
      ["section-1", undefined, true],
      // 下一节是它的下级标题，这一节只出标题
      ["section-2", "HEADING_1", false],
      ["section-3", "HEADING_2", true],
      ["section-4", "HEADING_1", true]
    ]);
    const context = writing.writingContext as {
      styleSamples: string[];
      referenceMaterials: Array<{ name: string }>;
      outputRules: Record<string, unknown>;
    };
    expect(context.outputRules.confirmedOutline).toBe(true);
    expect(context.outputRules.replicateRule).toContain("《年中讲话.docx》");
    // 开头那一节没有 headingRole：要明说它只写正文，压过「锚点后第一行是标题」那条通则
    expect(context.outputRules.replicateRule).toContain("没有 headingRole 的节只写正文");
    expect(context.outputRules.sectionAnchors).toEqual([
      "[[XS_SECTION:section-1]]", "[[XS_SECTION:section-2]]", "[[XS_SECTION:section-3]]", "[[XS_SECTION:section-4]]"
    ]);
    expect(context.referenceMaterials).toEqual([{ name: "年中讲话.docx", content: framework.sourceText }]);
    // 原文正文当文风样本，表格行不算
    expect(context.styleSamples).toContain("今天召开年中工作会议。主要任务是总结上半年工作，安排下半年任务。");
    expect(context.styleSamples.some((sample) => sample.includes("\t"))).toBe(false);

    const generated = parseOfficialDocumentReferenceGeneration({
      markdown: [
        "[[XS_FIXED:title-slot]]", "在2026年年中工作会议上的讲话",
        "[[XS_SECTION:section-1]]", "同志们：今天召开2026年年中工作会议。",
        "[[XS_SECTION:section-2]]", "一、总结2026年上半年工作",
        "[[XS_SECTION:section-3]]", "（一）主责主业抓得更紧", "重点任务全部按节点推进。",
        "[[XS_SECTION:section-4]]", "二、安排下半年工作", "下半年要把任务盯紧。"
      ].join("\n"),
      referenceDraftTitle: "通知模板",
      sections: writing.sections,
      fixedFields: writing.fixedFields,
      templateNodes
    });
    expect(generated.recoveredAsText).toBeUndefined();
    expect(generated.blocks.map((block) => [block.role, block.text])).toEqual([
      ["BODY", "同志们：今天召开2026年年中工作会议。"],
      ["HEADING_1", "一、总结2026年上半年工作"],
      ["HEADING_2", "（一）主责主业抓得更紧"],
      ["BODY", "重点任务全部按节点推进。"],
      ["HEADING_1", "二、安排下半年工作"],
      ["BODY", "下半年要把任务盯紧。"]
    ]);
  });

  it("does not treat a body-only first section as the document title", () => {
    const framework = buildReplicateFramework({
      paragraphCount: 1, tableCount: 0, headingCount: 0,
      blocks: [{ kind: "PARAGRAPH", role: "BODY", text: "关于某事的通知" }]
    }, file);
    const { plan, bodyOnlySectionIds } = replicateWritingPlan(updateReplicateSection(framework, "section-1", {
      title: "关于某事的通知"
    }));
    const writing = buildOfficialDocumentReferenceWritingPlan({
      referenceDraft: { id: "template-1", title: "通知模板", templateName: "通知模板" },
      content: replicateStyleContent(framework),
      templateNodes,
      userRequirement: "写一份新的",
      confirmedPlan: plan,
      bodyOnlySectionIds
    });

    expect(writing.sections).toEqual([
      expect.objectContaining({ id: "section-1", title: "关于某事的通知", bodyRequired: true })
    ]);
    expect(writing.sections[0].headingRole).toBeUndefined();
    expect((writing.writingContext.outputRules as Record<string, unknown>).documentTitleRule).toBeUndefined();
  });
});

describe("readReplicateFramework", () => {
  it("accepts a stored framework and rejects malformed ones", () => {
    const framework = buildReplicateFramework(speech, file);
    expect(readReplicateFramework(JSON.parse(JSON.stringify(framework)))).toEqual(framework);
    expect(readReplicateFramework(null)).toBeUndefined();
    expect(readReplicateFramework({ ...framework, sections: [] })).toBeUndefined();
    expect(readReplicateFramework({ ...framework, sections: [{ ...framework.sections[0], level: "HEADING_4" }] })).toBeUndefined();
    expect(readReplicateFramework({ ...framework, source: { name: 1 } })).toBeUndefined();
  });
});
