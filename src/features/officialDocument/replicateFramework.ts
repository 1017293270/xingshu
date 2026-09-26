import { docxPlainText, type ParsedDocx } from "@/services/officialDocumentDocxParser";
import { MAX_REFERENCE_MATERIAL_CHARS } from "@/services/officialDocumentFullDraft";
import type { OfficialDocumentDraftContent, OfficialDocumentWritingLogicPlan } from "@/types/officialDocument";

/**
 * 内容复刻的「内容框架」：从原文读出的章节清单，左侧编辑，右侧生成时当已确认大纲用。
 * 字段沿用写作计划的章节（标题、目的、要点），这样能直接接上「大纲确认 → 生成全文」那条链路。
 */

type LogicSection = OfficialDocumentWritingLogicPlan["sections"][number];

/** BODY 是「无标题段落」：开头那几段、或整篇没有标题时的全文，只写正文不出标题。 */
export type ReplicateSectionLevel = LogicSection["headingRole"] | "BODY";

export type ReplicateFrameworkSection = Pick<LogicSection, "id" | "title" | "purpose" | "keyPoints"> & {
  level: ReplicateSectionLevel;
  /** 本节原文摘录，只读参考。 */
  excerpt: string;
  /** 原文里这一节的标题；手动新增的节没有。 */
  sourceTitle?: string;
};

export type ReplicateFrameworkWarning = "NO_HEADINGS" | "UNREADABLE";

export type ReplicateFramework = {
  source: {
    name: string;
    size: number;
    title?: string;
    paragraphCount: number;
    tableCount: number;
  };
  sections: ReplicateFrameworkSection[];
  /** 作为参考资料发给模型的原文：放得下就是全文，放不下按章节均匀节选。 */
  sourceText: string;
  sourceTextCondensed: boolean;
  warnings: ReplicateFrameworkWarning[];
  /** 没读出正文时的原因，原样给用户看。 */
  parseError?: string;
};

export const REPLICATE_LEVEL_LABELS: Record<ReplicateSectionLevel, string> = {
  HEADING_1: "一级标题",
  HEADING_2: "二级标题",
  HEADING_3: "三级标题",
  BODY: "无标题段落"
};

const HEADING_LEVELS: Array<LogicSection["headingRole"]> = ["HEADING_1", "HEADING_2", "HEADING_3"];
/** 摘录只是给人对照着看的，存太长既占会话存储也没人读得完。 */
const MAX_EXCERPT_CHARS = 2_000;
const MAX_KEY_POINT_CHARS = 60;
/** 节选时每节至少留这么多字，太短就看不出这一节在写什么。 */
const MIN_CONDENSED_SECTION_CHARS = 80;

function clip(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** 默认要点：取原文前一两句，去掉句末标点，太长的截短。 */
export function summarizeKeyPoints(text: string) {
  const sentences = text
    .split(/\n|(?<=[。！？；!?;])/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    /* 「同志们：」「具体如下：」这类称呼和引子不是要点 */
    .filter((sentence) => !(sentence.length <= 10 && /[：:]$/.test(sentence)))
    .map((sentence) => sentence.replace(/[。！？；!?;，,：:]+$/, ""))
    .filter((sentence) => sentence.length >= 4);
  const points: string[] = [];
  for (const sentence of sentences) {
    points.push(clip(sentence, MAX_KEY_POINT_CHARS));
    if (points.length >= 2 || points.join("").length >= MAX_KEY_POINT_CHARS) break;
  }
  return points;
}

type SectionDraft = {
  level: ReplicateSectionLevel;
  heading?: string;
  lines: string[];
  paragraphs: string[];
};

function sectionPurpose(draft: SectionDraft, hasHeadings: boolean) {
  if (draft.heading) return `参照原文「${draft.heading}」一节的写法和内容安排`;
  return hasHeadings ? "参照原文开头段落的写法" : "参照原文全文的写法和内容安排";
}

/**
 * 原文超过参考资料上限时，不是只截前一万字——那样后面的章节模型一眼都看不到。
 * 每节留标题，正文按剩余额度平分，保证每一节都有样子可照。
 */
function condenseSource(title: string | undefined, drafts: SectionDraft[], budget: number) {
  const headings = drafts.map((draft) => draft.heading ?? "");
  const fixedChars = (title?.length ?? 0) + headings.reduce((total, heading) => total + heading.length + 1, 0);
  const share = Math.max(
    MIN_CONDENSED_SECTION_CHARS,
    Math.floor((budget - fixedChars - drafts.length * 2) / Math.max(1, drafts.length))
  );
  const parts = [
    ...(title ? [title] : []),
    ...drafts.map((draft) => [draft.heading, clip(draft.lines.join("\n"), share)].filter(Boolean).join("\n"))
  ];
  return parts.join("\n").slice(0, budget);
}

/**
 * 解析结果 → 内容框架。识别不出标题时整篇作为一节；什么都没读出来也给一节空框架，
 * 让用户留在左右结构里手动搭，而不是被一个报错挡在门外。
 */
export function buildReplicateFramework(
  parsed: ParsedDocx | undefined,
  file: { name: string; size: number },
  parseError?: string
): ReplicateFramework {
  const drafts: SectionDraft[] = [];
  const preamble: SectionDraft = { level: "BODY", lines: [], paragraphs: [] };
  let current: SectionDraft | undefined;
  for (const block of parsed?.blocks ?? []) {
    if (block.role === "TITLE" || block.role === "META") continue;
    if (block.role !== "BODY") {
      current = {
        level: block.role,
        heading: block.heading ?? block.text,
        lines: block.runIn ? [block.runIn] : [],
        paragraphs: block.runIn ? [block.runIn] : []
      };
      drafts.push(current);
      continue;
    }
    const target = current ?? preamble;
    target.lines.push(block.text);
    if (block.kind === "PARAGRAPH") target.paragraphs.push(block.text);
  }
  const hasHeadings = drafts.length > 0;
  if (preamble.lines.length || !hasHeadings) drafts.unshift(preamble);

  const sections = drafts.map((draft, index): ReplicateFrameworkSection => ({
    id: `section-${index + 1}`,
    level: draft.level,
    title: draft.heading ?? (hasHeadings ? "开头" : "全文"),
    purpose: draft.lines.length || draft.heading ? sectionPurpose(draft, hasHeadings) : "",
    keyPoints: summarizeKeyPoints(draft.paragraphs.join("\n")),
    excerpt: clip(draft.lines.join("\n"), MAX_EXCERPT_CHARS),
    ...(draft.heading ? { sourceTitle: draft.heading } : {})
  }));

  const fullText = parsed ? docxPlainText(parsed) : "";
  const condensed = fullText.length > MAX_REFERENCE_MATERIAL_CHARS;
  const readable = drafts.some((draft) => draft.lines.length || draft.heading);
  return {
    source: {
      name: file.name,
      size: file.size,
      ...(parsed?.title ? { title: parsed.title } : {}),
      paragraphCount: parsed?.paragraphCount ?? 0,
      tableCount: parsed?.tableCount ?? 0
    },
    sections,
    sourceText: condensed ? condenseSource(parsed?.title, drafts, MAX_REFERENCE_MATERIAL_CHARS) : fullText,
    sourceTextCondensed: condensed,
    warnings: !readable ? ["UNREADABLE"] : hasHeadings ? [] : ["NO_HEADINGS"],
    ...(parseError ? { parseError } : {})
  };
}

function withSections(framework: ReplicateFramework, sections: ReplicateFrameworkSection[]): ReplicateFramework {
  return { ...framework, sections };
}

export function updateReplicateSection(
  framework: ReplicateFramework,
  sectionId: string,
  changes: Partial<Pick<ReplicateFrameworkSection, "title" | "keyPoints" | "level">>
) {
  return withSections(framework, framework.sections.map((section) => (
    section.id === sectionId ? { ...section, ...changes } : section
  )));
}

/** 升一级是往一级标题走，降一级是往三级标题走；无标题段落不参与升降。 */
export function shiftReplicateSectionLevel(framework: ReplicateFramework, sectionId: string, delta: -1 | 1) {
  return withSections(framework, framework.sections.map((section) => {
    if (section.id !== sectionId || section.level === "BODY") return section;
    const index = HEADING_LEVELS.indexOf(section.level) + delta;
    return index < 0 || index >= HEADING_LEVELS.length ? section : { ...section, level: HEADING_LEVELS[index] };
  }));
}

export function moveReplicateSection(framework: ReplicateFramework, sectionId: string, direction: -1 | 1) {
  const sections = [...framework.sections];
  const index = sections.findIndex((section) => section.id === sectionId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sections.length) return framework;
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return withSections(framework, sections);
}

function newSectionId() {
  return `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 新增的节跟在指定那一节后面、沿用它的层级；不指定就追加到末尾。 */
export function insertReplicateSection(framework: ReplicateFramework, afterSectionId?: string) {
  const index = afterSectionId
    ? framework.sections.findIndex((section) => section.id === afterSectionId)
    : framework.sections.length - 1;
  const anchor = framework.sections[index];
  const section: ReplicateFrameworkSection = {
    id: newSectionId(),
    level: anchor && anchor.level !== "BODY" ? anchor.level : "HEADING_1",
    title: "",
    purpose: "",
    keyPoints: [],
    excerpt: ""
  };
  const sections = [...framework.sections];
  sections.splice(index + 1, 0, section);
  return { framework: withSections(framework, sections), sectionId: section.id };
}

/** 至少留一节：框架空了，下一次生成就没有章节可依。 */
export function removeReplicateSection(framework: ReplicateFramework, sectionId: string) {
  if (framework.sections.length <= 1) return framework;
  return withSections(framework, framework.sections.filter((section) => section.id !== sectionId));
}

/**
 * 框架 → 写作计划。无标题段落在写作计划里没有对应的层级，
 * 只好借一级标题占位，另外把它们的 id 单列出来，生成时按「只写正文」处理。
 */
export function replicateWritingPlan(framework: ReplicateFramework) {
  const plan: OfficialDocumentWritingLogicPlan = {
    summary: `按《${framework.source.name}》的内容框架复刻`,
    sections: framework.sections.map((section, order) => ({
      id: section.id,
      order,
      headingRole: section.level === "BODY" ? "HEADING_1" : section.level,
      title: section.title.trim(),
      purpose: section.purpose.trim(),
      keyPoints: section.keyPoints.map((point) => point.trim()).filter(Boolean),
      sourceBlockIds: []
    })),
    researchNeeds: [],
    unassignedSourceBlockIds: [],
    warnings: []
  };
  return {
    plan,
    bodyOnlySectionIds: framework.sections.filter((section) => section.level === "BODY").map((section) => section.id)
  };
}

/** 原文正文段落当文风样本：只给正文，不给标题，免得写作计划把它当成参考稿的章节。 */
export function replicateStyleContent(framework: ReplicateFramework): OfficialDocumentDraftContent {
  const paragraphs = framework.sections.flatMap((section) => section.excerpt.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("\t"));
  return {
    revision: 0,
    fixedValues: [],
    blocks: paragraphs.map((text, index) => ({
      id: `replicate-style-${index + 1}`,
      order: index,
      role: "BODY" as const,
      variantId: "",
      text
    }))
  };
}

export function countReplicateLevels(framework: Pick<ReplicateFramework, "sections">) {
  return framework.sections.reduce<Record<ReplicateSectionLevel, number>>((counts, section) => ({
    ...counts,
    [section.level]: counts[section.level] + 1
  }), { HEADING_1: 0, HEADING_2: 0, HEADING_3: 0, BODY: 0 });
}

const LEVELS = new Set<string>([...HEADING_LEVELS, "BODY"]);

/** 从会话存储里认回框架：形状不对就当没有，不连累同一份记录里的会话。 */
export function readReplicateFramework(value: unknown): ReplicateFramework | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ReplicateFramework>;
  const source = candidate.source;
  if (!source || typeof source.name !== "string" || typeof source.size !== "number"
    || !Array.isArray(candidate.sections) || !candidate.sections.length
    || typeof candidate.sourceText !== "string" || !Array.isArray(candidate.warnings)) return undefined;
  const valid = candidate.sections.every((section) => section
    && typeof section.id === "string" && section.id
    && typeof section.title === "string"
    && typeof section.purpose === "string"
    && typeof section.excerpt === "string"
    && LEVELS.has(section.level)
    && Array.isArray(section.keyPoints) && section.keyPoints.every((point) => typeof point === "string"));
  return valid ? candidate as ReplicateFramework : undefined;
}
