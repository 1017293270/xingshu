import type {
  OfficialDocumentContentProfile,
  OfficialDocumentDraftContent,
  OfficialDocumentResearchResult,
  OfficialDocumentRole,
  OfficialDocumentStructureNode,
  OfficialDocumentWritingLogicPlan
} from "@/types/officialDocument";

export type OfficialDocumentFullDraftPreview = {
  blocks: OfficialDocumentDraftContent["blocks"];
  sectionCount: number;
  bodyCount: number;
  preservedSourceBlockIds: string[];
  missingSourceBlockIds: string[];
  tableCount: number;
  chartCount: number;
  knowledgeSourceCount: number;
  pendingCount: number;
};

export type OfficialDocumentWritingAction = "DRAFT_ASSIST" | "FULL_DRAFT" | "REFERENCE_DRAFT";

type TextBlockRole = "HEADING_1" | "HEADING_2" | "HEADING_3" | "BODY";

type ParsedTextBlock = { role: TextBlockRole; text: string };

export type OfficialDocumentReferenceSection = {
  id: string;
  order: number;
  headingRole?: Exclude<TextBlockRole, "BODY">;
  title: string;
  bodyRequired: boolean;
  /** 来自已确认大纲：这一节要回答什么。提示词按它约束正文。 */
  purpose?: string;
  /** 来自已确认大纲：这一节必须落到的要点。 */
  keyPoints?: string[];
};

export type OfficialDocumentReferenceFixedField = {
  slotId: string;
  role: OfficialDocumentStructureNode["role"];
  roleLabel: string;
  required: boolean;
  preview: string;
};

export type OfficialDocumentReferenceWritingPlan = {
  sections: OfficialDocumentReferenceSection[];
  fixedFields: OfficialDocumentReferenceFixedField[];
  writingContext: Record<string, unknown>;
};

export type OfficialDocumentReferenceGeneration = {
  title: string;
  fixedValues: OfficialDocumentDraftContent["fixedValues"];
  blocks: OfficialDocumentDraftContent["blocks"];
};

export const MAX_REFERENCE_REQUIREMENT_CHARS = 20_000;
const MAX_REFERENCE_STYLE_CHARS = 6_000;
const MAX_REFERENCE_STYLE_SAMPLES = 8;

const textRoles = new Set<TextBlockRole>(["HEADING_1", "HEADING_2", "HEADING_3", "BODY"]);

/** 标题层级的数值，用来判断下一节是不是本节的子标题。 */
const HEADING_DEPTH: Record<Exclude<TextBlockRole, "BODY">, number> = {
  HEADING_1: 1,
  HEADING_2: 2,
  HEADING_3: 3
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").replace(/[“”‘’]/g, "").toLocaleLowerCase();
}

function bodyRegionSpan(node: OfficialDocumentStructureNode) {
  return node.role === "BODY"
    ? Math.max(0, (node.endParagraphIndex ?? node.paragraphIndex ?? 0) - (node.paragraphIndex ?? 0))
    : 0;
}

function isNumberedHeading(value: string) {
  return /^(?:[一二三四五六七八九十百零〇两]+[、.]|第[一二三四五六七八九十百零〇两\d]+[章节篇部分]|（[一二三四五六七八九十百零〇两\d]+）|\d+(?:\.\d+)+|\d+[、.]\s*)/.test(value);
}

function unwrapHeadingMarkup(value: string) {
  const text = value.trim();
  const bold = text.match(/^(?:\*\*|__)(.+)(?:\*\*|__)$/);
  return bold?.[1].trim() ?? text;
}

/** 公文编号的层级：只看行首编号，不管这一行末尾有没有句读。 */
function numberedHeadingRole(text: string): TextBlockRole | undefined {
  if (/^(?:[一二三四五六七八九十百零〇两]+[、.]|第[一二三四五六七八九十百零〇两\d]+[章节篇部分])/.test(text)) {
    return "HEADING_1";
  }
  if (/^\d+(?:\.\d+)+\s*/.test(text)) return "HEADING_3";
  if (/^(?:（[一二三四五六七八九十百零〇两\d]+）|\d+[、.]\s*)/.test(text)) return "HEADING_2";
  return undefined;
}

const TRAILING_PUNCTUATION = /[；;。！？!?，,：:]$/;

function plainHeadingRole(value: string): TextBlockRole | undefined {
  const text = unwrapHeadingMarkup(value);
  if (!text || text.length > 120 || TRAILING_PUNCTUATION.test(text)) return undefined;
  return numberedHeadingRole(text);
}

export function summarizeOfficialDocumentTemplate(structureNodes: OfficialDocumentStructureNode[]) {
  const ordered = [...structureNodes]
    .filter((node) => node.role !== "UNKNOWN")
    .sort((left, right) => left.order - right.order);
  const body = [...ordered]
    .filter((node) => node.role === "BODY")
    .sort((left, right) => bodyRegionSpan(right) - bodyRegionSpan(left))[0];
  const headings = ordered.filter((node) => (
    node.role.startsWith("HEADING_")
    && node.preview.trim().length > 0
    && node.preview.trim().length <= 120
    && !/[；;。！？!?，,：:]$/.test(node.preview.trim())
  ));
  const numberedHeadings = headings.filter((node) => isNumberedHeading(node.preview.trim()));
  const selected = ordered.filter((node) => (
    node.role === "TITLE" || (node.role === "BODY" && bodyRegionSpan(node) > 0)
  ));
  selected.push(...(numberedHeadings.length >= 2 ? numberedHeadings : headings));
  if (body && !selected.some((node) => node.id === body.id)) selected.push(body);
  const source = selected.length ? selected.sort((left, right) => left.order - right.order) : ordered;
  return source.slice(0, 100).map((node) => ({
    role: node.role,
    roleLabel: node.roleLabel,
    order: node.order,
    paragraphIndex: node.paragraphIndex,
    endParagraphIndex: node.endParagraphIndex,
    slotType: node.slotType,
    variantId: node.variantId ?? "",
    preview: node.preview.slice(0, 400),
    styleSummary: node.styleSummary.slice(0, 8)
  }));
}

export function buildOfficialDocumentReferenceWritingPlan(input: {
  referenceDraft: { id: string; title: string; templateName: string };
  content: OfficialDocumentDraftContent;
  templateNodes: OfficialDocumentStructureNode[];
  userRequirement: string;
  /** 前端已执行的资料研究结果；提供时注入 writingContext 并放开 allowResearch。 */
  researchResults?: OfficialDocumentResearchResult[];
  /**
   * 用户在大纲确认环里改完并拍板的写作大纲。提供时章节骨架以它为准——
   * 改过的标题、删掉的章节、每节的 purpose/keyPoints 都由此进入成稿；
   * 不提供时完全按参考草稿自身的标题推断，行为与从前一致。
   */
  confirmedPlan?: OfficialDocumentWritingLogicPlan;
}): OfficialDocumentReferenceWritingPlan {
  const userRequirement = input.userRequirement.trim();
  if (!userRequirement) throw new Error("请描述要生成的公文内容");
  if (userRequirement.length > MAX_REFERENCE_REQUIREMENT_CHARS) {
    throw new Error(`写作要求不能超过 ${MAX_REFERENCE_REQUIREMENT_CHARS.toLocaleString()} 字`);
  }

  const orderedBlocks = [...input.content.blocks].sort((left, right) => left.order - right.order);
  const headingIndexes = orderedBlocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.role === "HEADING_1" || block.role === "HEADING_2" || block.role === "HEADING_3");
  const sections: OfficialDocumentReferenceSection[] = [];
  const confirmedSections = [...(input.confirmedPlan?.sections ?? [])].sort((left, right) => left.order - right.order);
  const leadingBody = headingIndexes.length > 0
    && orderedBlocks.slice(0, headingIndexes[0].index)
      .some((block) => block.role === "BODY" && block.text.trim());

  if (confirmedSections.length) {
    /*
     * 参考稿第一个标题之前的引言（主送语之后的发文缘由那一段）不是大纲里的章节，
     * 大纲卡也没有「新增章节」这个动作。它属于参考稿的版式而不是章节安排，
     * 所以已确认大纲仍然只决定「有哪些标题、什么顺序、写什么」，引言照旧留一格。
     * 这一格没有 headingRole，模型据此只写正文、不多出任何标题。
     */
    if (leadingBody) {
      sections.push({ id: "reference-body-1", order: sections.length, title: "正文", bodyRequired: true });
    }
    confirmedSections.forEach((section, index) => {
      const next = confirmedSections[index + 1];
      const title = section.title.trim();
      const purpose = section.purpose.trim();
      sections.push({
        id: section.id,
        order: sections.length,
        headingRole: section.headingRole,
        title: title || `第 ${index + 1} 部分`,
        // 下一节更深一层时本节是父级标题，只出标题、不强加正文
        bodyRequired: !next || HEADING_DEPTH[next.headingRole] <= HEADING_DEPTH[section.headingRole],
        ...(purpose ? { purpose } : {}),
        ...(section.keyPoints.length ? { keyPoints: [...section.keyPoints] } : {})
      });
    });
  } else if (headingIndexes.length) {
    if (leadingBody) {
      sections.push({ id: "reference-body-1", order: sections.length, title: "正文", bodyRequired: true });
    }
    headingIndexes.forEach(({ block, index }, headingIndex) => {
      const nextIndex = headingIndexes[headingIndex + 1]?.index ?? orderedBlocks.length;
      const bodyRequired = orderedBlocks.slice(index + 1, nextIndex)
        .some((candidate) => candidate.role === "BODY" && candidate.text.trim());
      sections.push({
        id: `reference-section-${headingIndex + 1}`,
        order: sections.length,
        headingRole: block.role as Exclude<TextBlockRole, "BODY">,
        title: block.text.trim() || `第 ${headingIndex + 1} 部分`,
        bodyRequired
      });
    });
  } else {
    const templateHeadings = summarizeOfficialDocumentTemplate(input.templateNodes)
      .filter((node): node is typeof node & { role: Exclude<TextBlockRole, "BODY"> } => (
        node.role === "HEADING_1" || node.role === "HEADING_2" || node.role === "HEADING_3"
      ));
    if (templateHeadings.length) {
      templateHeadings.forEach((node, index) => sections.push({
        id: `reference-section-${index + 1}`,
        order: index,
        headingRole: node.role,
        title: node.preview.trim() || `第 ${index + 1} 部分`,
        bodyRequired: true
      }));
    } else {
      sections.push({ id: "reference-body-1", order: 0, title: "正文", bodyRequired: true });
    }
  }

  const nodesBySlot = new Map(
    input.templateNodes.filter((node) => node.slotId).map((node) => [node.slotId!, node])
  );
  const fixedSlotIds = [
    ...input.templateNodes
      .filter((node) => node.slotId && node.editable && !node.dataBinding
        && ["FIXED_TEXT", "FIXED_TABLE_TEXT", "FIXED_HEADER_FOOTER_TEXT"].includes(node.slotType ?? ""))
      .sort((left, right) => left.order - right.order)
      .map((node) => node.slotId!),
    ...input.content.fixedValues.map((value) => value.slotId)
  ].filter((slotId, index, values) => values.indexOf(slotId) === index);
  const fixedFields = fixedSlotIds.map((slotId) => {
    const node = nodesBySlot.get(slotId);
    return {
      slotId,
      role: node?.role ?? "UNKNOWN",
      roleLabel: node?.roleLabel || "固定字段",
      required: node?.required ?? false,
      preview: (node?.preview ?? "").slice(0, 160)
    } satisfies OfficialDocumentReferenceFixedField;
  });

  const styleCandidates = orderedBlocks
    .filter((block) => block.role === "BODY" && block.text.trim())
    .map((block) => block.text.trim());
  const stride = Math.max(1, Math.ceil(styleCandidates.length / MAX_REFERENCE_STYLE_SAMPLES));
  const styleSamples: string[] = [];
  let styleChars = 0;
  // ponytail: bounded samples keep the writing context below DataHub's 100k guard.
  for (let index = 0; index < styleCandidates.length && styleSamples.length < MAX_REFERENCE_STYLE_SAMPLES; index += stride) {
    const sample = styleCandidates[index].slice(0, 1_000);
    if (!sample || styleChars + sample.length > MAX_REFERENCE_STYLE_CHARS) break;
    styleSamples.push(sample);
    styleChars += sample.length;
  }

  const templateOutline = summarizeOfficialDocumentTemplate(input.templateNodes);
  // 研究由前端在生成前执行并注入（图表 base64 不进上下文，占位引用即可）；
  // 有注入材料时 allowResearch 表示「本轮已带研究材料」，模型仍不得自行发起检索。
  const researchResults = (input.researchResults ?? []).map((result) => ({
    ...result,
    chart: result.chart ? { ...result.chart, base64: undefined } : undefined
  }));
  return {
    sections,
    fixedFields,
    writingContext: {
      action: "REFERENCE_DRAFT",
      referenceDraft: input.referenceDraft,
      referenceSections: sections,
      fixedFields,
      styleSamples,
      sourceBlocks: [{
        id: "user-requirement",
        order: 0,
        kind: "PARAGRAPH",
        text: userRequirement,
        headingHint: "USER_REQUIREMENT",
        columns: [],
        rows: []
      }],
      ...(researchResults.length ? { researchResults } : {}),
      templateOutline,
      structureRoles: templateOutline,
      outputRules: {
        fixedFieldAnchor: "[[XS_FIXED:slot-id]]",
        sectionAnchor: "[[XS_SECTION:section-id]]",
        // 合法锚点的显式全集：提示词只给格式，模型会照抄占位符或自创 id，
        // 把可用锚点逐字列出来才有东西可抄。
        fixedFieldAnchors: fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]`),
        sectionAnchors: sections.map((section) => `[[XS_SECTION:${section.id}]]`),
        // 标题和首句写在同一行时整行会被当成正文，只能靠解析阶梯事后补救；
        // 这条规则和 sectionAnchors 一样随 writingContext 原样注入提示词，加了即刻生效。
        sectionHeadingFirstLine: "每个 [[XS_SECTION:section-id]] 锚点后的第一行必须是该章节标题，标题文字可以按本次主题改写，但必须独立成行、行尾不带句号冒号等标点，不得与正文写在同一行",
        // 走过大纲确认环时，referenceSections 已经是用户拍板的方案而不是参考稿的推断结果，
        // 这条规则和 sectionHeadingFirstLine 一样随 writingContext 原样注入提示词。
        ...(confirmedSections.length ? {
          confirmedOutline: true,
          followConfirmedOutline: "referenceSections 是用户已确认的写作大纲：章节标题按 title 输出，可按本次主题微调措辞但不得改变含义；正文必须直接回答该节的 purpose 与 keyPoints；不得增删或调换章节；与参考草稿旧正文冲突时以已确认大纲为准"
        } : {}),
        keepSectionOrder: true,
        allowHeadingRewrite: true,
        copyReferenceFacts: false,
        allowResearch: researchResults.length > 0
      }
    }
  };
}

/**
 * 把按「内容大纲」标注的研究结果映射到参考草稿的实际章节锚点上：
 * 标题相同（去空白/标点差异）优先，其次同序号，都对不上时保留原 sectionId
 * 让模型按语义就近安放。写作提示词按 sectionId 分配材料，映射错位只降低精度不丢材料。
 */
export function mapResearchResultsToReferenceSections(
  results: OfficialDocumentResearchResult[],
  analyzedSections: Array<{ id: string; order: number; title: string }>,
  referenceSections: OfficialDocumentReferenceSection[]
): OfficialDocumentResearchResult[] {
  const normalize = (value: string) => value.replace(/[\s、，。：:.\-·（）()一二三四五六七八九十\d]/g, "");
  const byTitle = new Map(referenceSections.map((section) => [normalize(section.title), section.id]));
  const analyzedById = new Map(analyzedSections.map((section) => [section.id, section]));
  const referenceIds = new Set(referenceSections.map((section) => section.id));

  return results.map((result) => {
    // 章节骨架直接由已确认大纲生成时两边 id 相同，无需也不该再按标题或序号改判。
    if (referenceIds.has(result.sectionId)) return result;
    const analyzed = analyzedById.get(result.sectionId);
    if (!analyzed) {
      return result;
    }
    const titleMatch = byTitle.get(normalize(analyzed.title));
    if (titleMatch) {
      return { ...result, sectionId: titleMatch };
    }
    const orderMatch = referenceSections.find((section) => section.order === analyzed.order);
    return orderMatch ? { ...result, sectionId: orderMatch.id } : result;
  });
}

export function officialDocumentVariantId(
  structureNodes: OfficialDocumentStructureNode[],
  role: TextBlockRole,
  text = ""
) {
  const candidates = structureNodes
    .filter((node) => node.role === role && node.variantId)
    .sort((left, right) => (
      role === "BODY"
        ? bodyRegionSpan(right) - bodyRegionSpan(left) || left.order - right.order
        : left.order - right.order
    ));
  const normalized = normalizeText(text);
  return (role === "BODY" ? undefined : candidates.find((node) => normalized && normalizeText(node.preview) === normalized)?.variantId)
    ?? candidates[0]?.variantId
    ?? "";
}

export function parseOfficialDocumentAssistantText(text: string, inferPlainHeadings = false) {
  const blocks: ParsedTextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const value = paragraph.join("\n").trim();
    if (value) blocks.push({ role: "BODY", text: value });
    paragraph = [];
  };
  text.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (/^\[\[XS_SECTION:[^\]\r\n]+\]\]$/.test(trimmed)) {
      flush();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flush();
      const pending = heading[2].search(/(?:\[|【)待补充[：:]/);
      const title = (pending >= 0 ? heading[2].slice(0, pending) : heading[2]).trim();
      if (title) blocks.push({ role: `HEADING_${heading[1].length}` as TextBlockRole, text: title });
      if (pending >= 0) blocks.push({ role: "BODY", text: heading[2].slice(pending).trim() });
      return;
    }
    const inferredText = unwrapHeadingMarkup(trimmed);
    const inferredRole = inferPlainHeadings ? plainHeadingRole(inferredText) : undefined;
    if (inferredRole) {
      flush();
      blocks.push({ role: inferredRole, text: inferredText });
      return;
    }
    if (!trimmed) flush();
    else paragraph.push(trimmed);
  });
  flush();
  return blocks;
}

export function normalizeOfficialDocumentDraftBlocks(
  blocks: OfficialDocumentDraftContent["blocks"],
  structureNodes: OfficialDocumentStructureNode[]
) {
  let changedCount = 0;
  const normalized = blocks.flatMap((block) => {
    if (!textRoles.has(block.role as TextBlockRole)) return [block];
    const containsMarkup = /(^|\n)\s*(?:\[\[XS_SECTION:|#{1,3}\s+)/.test(block.text);
    if (!containsMarkup) {
      const headingText = unwrapHeadingMarkup(block.text);
      const role = block.role === "BODY" ? plainHeadingRole(headingText) ?? "BODY" : block.role as TextBlockRole;
      const text = role === "BODY" ? block.text : headingText;
      const variantId = officialDocumentVariantId(structureNodes, role, text);
      if (role === block.role && text === block.text && variantId === block.variantId) return [block];
      changedCount += 1;
      return [{ ...block, role, variantId, text }];
    }
    const parsed = parseOfficialDocumentAssistantText(block.text);
    if (!parsed.length) return [block];
    changedCount += 1;
    return parsed.map((item, index) => ({
      ...block,
      id: index ? crypto.randomUUID() : block.id,
      role: item.role,
      variantId: officialDocumentVariantId(structureNodes, item.role, item.text),
      text: item.text,
      source: index ? undefined : block.source
    }));
  });
  return {
    changedCount,
    blocks: normalized.map((block, order) => ({ ...block, order }))
  };
}

function normalizedHeadingLine(value: string) {
  return normalizeText(unwrapHeadingMarkup(value.trim().replace(/^#{1,3}\s+/, "")));
}

function splitAnchoredSections(markdown: string, sections: Array<{ id: string; title: string }>) {
  const sectionIds = sections.map((section) => section.id);
  const anchors = [...markdown.matchAll(/\[\[XS_SECTION:([^\]\r\n]+)\]\]/g)];
  if (anchors.length) {
    if (anchors.length !== sectionIds.length) throw new Error("生成结果的章节锚点数量与已确认方案不一致");
    const values = new Map<string, string>();
    anchors.forEach((match, index) => {
      const id = match[1].trim();
      if (!sectionIds.includes(id) || values.has(id)) throw new Error("生成结果包含无效或重复的章节锚点");
      const start = (match.index ?? 0) + match[0].length;
      const end = anchors[index + 1]?.index ?? markdown.length;
      values.set(id, markdown.slice(start, end).trim());
    });
    return sectionIds.map((id) => values.get(id) ?? "");
  }

  let offset = 0;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n").map((text) => {
    const line = { text, start: offset, end: offset + text.length };
    offset = line.end + 1;
    return line;
  });
  let lineCursor = 0;
  const titleLines = sections.map((section) => {
    const target = normalizeText(section.title);
    const index = lines.findIndex((line, lineIndex) => (
      lineIndex >= lineCursor && normalizedHeadingLine(line.text) === target
    ));
    if (index < 0) return undefined;
    lineCursor = index + 1;
    return lines[index];
  });
  const matchedTitleLines = titleLines.filter((line): line is { text: string; start: number; end: number } => Boolean(line));
  if (matchedTitleLines.length === sections.length) {
    return matchedTitleLines.map((line, index) => markdown.slice(
      Math.min(markdown.length, line.end + 1),
      matchedTitleLines[index + 1]?.start ?? markdown.length
    ).trim());
  }

  const headings = [...markdown.matchAll(/^#{1,3}\s+.+$/gm)];
  if (headings.length !== sectionIds.length) {
    throw new Error("模型漏写章节锚点，且标题数量与已确认方案不一致，不能应用");
  }
  return headings.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    return markdown.slice(start, end).trim();
  });
}

/** 提示词里描述锚点格式用的占位符，模型逐字照抄时命中这里而不是当成真 slotId。 */
const PLACEHOLDER_FIXED_ANCHOR_IDS = new Set(["slot-id", "slotid", "<slot-id>", "<slotid>"]);

/**
 * 把 FIXED 锚点上的 id 尽量修回声明过的 slotId。模型常见的两种跑偏——
 * 逐字抄提示词里的占位符、给红头里没声明成 slot 的字段（如签发人）自创 id——
 * 过去都会让整版成稿被拒，用户只能展开原文重出一遍。按保守优先级修：
 * 1) 归一化（去空白、小写）后等于某个声明 slotId；
 * 2) 归一化后等于某个声明字段的显示名 roleLabel（同名字段多于一个时视为对不上，不猜）；
 * 3) 字面就是占位符时，按文档顺序补到「没被任何合法锚点认领」的声明字段上。
 * 都对不上就原样返回，由调用方抛出带 id 的错误——宁可拒绝，也不把值写进错字段。
 */
function resolveFixedAnchorIds(
  markers: Array<{ kind: "FIXED" | "SECTION"; id: string }>,
  fixedFields: OfficialDocumentReferenceFixedField[]
) {
  const bySlotId = new Map(fixedFields.map((field) => [normalizeText(field.slotId), field.slotId]));
  const byRoleLabel = new Map<string, string | undefined>();
  fixedFields.forEach((field) => {
    const label = normalizeText(field.roleLabel);
    // 同一个显示名对应多个字段时存 undefined：宁可不修，也不赌是哪一个。
    if (label) byRoleLabel.set(label, byRoleLabel.has(label) ? undefined : field.slotId);
  });
  const matched = markers.map((marker) => {
    if (marker.kind !== "FIXED") return undefined;
    const normalized = normalizeText(marker.id);
    return bySlotId.get(normalized) ?? byRoleLabel.get(normalized);
  });
  // 先把所有能直接认出来的字段登记掉，占位符才不会抢走模型写对的那个字段。
  const claimed = new Set(matched.filter((slotId): slotId is string => Boolean(slotId)));
  let cursor = 0;
  return markers.map((marker, index) => {
    const direct = matched[index];
    if (direct) return direct;
    if (marker.kind !== "FIXED" || !PLACEHOLDER_FIXED_ANCHOR_IDS.has(normalizeText(marker.id))) return marker.id;
    while (cursor < fixedFields.length && claimed.has(fixedFields[cursor].slotId)) cursor += 1;
    const slotId = fixedFields[cursor]?.slotId;
    if (!slotId) return marker.id;
    claimed.add(slotId);
    cursor += 1;
    return slotId;
  });
}

/** 把一行按「标题」的写法规整：去掉加粗标记和行尾句读，再抹平空白，用来和大纲标题比对。 */
function headingLineKey(value: string) {
  return normalizeText(unwrapHeadingMarkup(value).replace(TRAILING_PUNCTUATION, ""));
}

/** 章节内容还站不站得住：声明了 headingRole 就得有首块标题，bodyRequired 就得留下正文。 */
function sectionStaysValid(section: OfficialDocumentReferenceSection, parsed: ParsedTextBlock[]) {
  if (!section.headingRole) return parsed.length > 0;
  if (!parsed[0]?.role.startsWith("HEADING_")) return false;
  return !section.bodyRequired || parsed.slice(1).some((block) => block.role === "BODY");
}

/**
 * 阶梯 1：模型把标题写在 [[XS_SECTION:…]] 锚点之前，标题落进上一节切片的尾部——
 * 本节缺标题、上一节多出一个标题。上一节挪走之后仍然完整时才回捞，
 * 绝不为了救本节把上一节掏空。
 */
function reclaimHeadingFromPreviousSection(
  section: OfficialDocumentReferenceSection,
  parsed: ParsedTextBlock[],
  previousSection: OfficialDocumentReferenceSection | undefined,
  previousParsed: ParsedTextBlock[] | undefined
) {
  if (!section.headingRole || !previousSection || !previousParsed?.length) return false;
  const tail = previousParsed[previousParsed.length - 1];
  const remainder = previousParsed.slice(0, -1);
  if (tail.role.startsWith("HEADING_")) {
    if (!sectionStaysValid(previousSection, remainder)) return false;
    previousParsed.pop();
    parsed.unshift(tail);
    return true;
  }
  // 标题被并进上一节最后一段的末行：只有规整后正好等于本节标题才敢挪走，避免切掉真正文。
  const lines = tail.text.split("\n");
  const last = lines[lines.length - 1] ?? "";
  if (headingLineKey(last) !== normalizeText(section.title)) return false;
  const kept = lines.slice(0, -1).join("\n").trim();
  const previousAfter = kept ? [...remainder, { ...tail, text: kept }] : remainder;
  if (!sectionStaysValid(previousSection, previousAfter)) return false;
  previousParsed.splice(0, previousParsed.length, ...previousAfter);
  parsed.unshift({
    role: section.headingRole,
    text: unwrapHeadingMarkup(last).replace(TRAILING_PUNCTUATION, "")
  });
  return true;
}

/**
 * 阶梯 2：标题和首句写在同一行（「（一）指导思想。以……」），整行被判成正文。
 * 首行带公文编号时在第一个句末标点处拆开；整行只以冒号/分号收尾、后面还有正文时按换行拆。
 * 拆不出正文就不拆——那说明是标题自带句号，交给后面的阶梯处理。
 */
function splitGluedHeading(section: OfficialDocumentReferenceSection, parsed: ParsedTextBlock[]) {
  const first = parsed[0];
  if (!section.headingRole || first?.role !== "BODY") return false;
  const [firstLine, ...restLines] = first.text.split("\n");
  const stop = firstLine.search(/[。！？!?]/);
  const glued = stop >= 0
    ? { heading: firstLine.slice(0, stop), body: [firstLine.slice(stop + 1), ...restLines] }
    : /[：:；;]$/.test(firstLine.trim()) && restLines.length
      ? { heading: firstLine.trim().replace(/[：:；;]$/, ""), body: restLines }
      : undefined;
  if (!glued) return false;
  const heading = unwrapHeadingMarkup(glued.heading.trim());
  const role = heading && heading.length <= 120 ? numberedHeadingRole(heading) : undefined;
  const body = glued.body.map((line) => line.trim()).filter(Boolean).join("\n").trim();
  if (!role || !body) return false;
  parsed.splice(0, 1, { role, text: heading }, { role: "BODY", text: body });
  return true;
}

/**
 * 阶梯 3：标题写了却没被判成标题（行尾带句读、或被挪到了中间）。
 * 已确认大纲的 title 是权威，去掉行尾句读后规整相等就升格为标题，其余块按原序留作正文。
 */
function promoteMatchingTitle(section: OfficialDocumentReferenceSection, parsed: ParsedTextBlock[]) {
  const target = normalizeText(section.title);
  if (!section.headingRole || !target) return false;
  const index = parsed.findIndex((block) => headingLineKey(block.text) === target);
  if (index < 0) return false;
  const [match] = parsed.splice(index, 1);
  parsed.unshift({
    role: match.role.startsWith("HEADING_") ? match.role : section.headingRole,
    text: unwrapHeadingMarkup(match.text).replace(TRAILING_PUNCTUATION, "")
  });
  return true;
}

/**
 * 章节身份由锚点决定、标题由已确认大纲决定，模型漏写／改写／粘连标题都不该让整版成稿被拒。
 * 按保守优先级修，越靠前越贴近模型真的写出来的文字：
 * 1) 跨切片回捞——标题写在了锚点之前，落进上一节尾部；
 * 2) 粘连拆分——标题和首句写在同一行；
 * 3) 标题匹配——正文里存在与大纲标题一致的块；
 * 4) 兜底合成——直接用已确认大纲的 title 造一个标题，这一步永远成功。
 * 因此「章节缺少标题」这一类整版拒绝在这里被彻底消化掉，下游不再需要那条校验。
 */
function repairSectionHeadings(
  sections: OfficialDocumentReferenceSection[],
  parsedBySection: ParsedTextBlock[][]
) {
  sections.forEach((section, index) => {
    const parsed = parsedBySection[index];
    if (!section.headingRole || parsed[0]?.role.startsWith("HEADING_")) return;
    if (reclaimHeadingFromPreviousSection(section, parsed, sections[index - 1], parsedBySection[index - 1])) return;
    if (splitGluedHeading(section, parsed)) return;
    if (promoteMatchingTitle(section, parsed)) return;
    parsed.unshift({ role: section.headingRole, text: section.title });
  });
}

export function parseOfficialDocumentReferenceGeneration(input: {
  markdown: string;
  referenceDraftTitle: string;
  sections: OfficialDocumentReferenceSection[];
  fixedFields: OfficialDocumentReferenceFixedField[];
  templateNodes: OfficialDocumentStructureNode[];
}): OfficialDocumentReferenceGeneration {
  const markerPattern = /\[\[XS_(FIXED|SECTION):([^\]\r\n]+)\]\]/g;
  const fixedFieldValue = (value: string | undefined) => value
    ?.replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  const rawMarkers = [...input.markdown.matchAll(markerPattern)].map((match) => ({
    kind: match[1] as "FIXED" | "SECTION",
    id: match[2].trim(),
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
  // 改写必须发生在下面的重复/未知判定之前：照抄的占位符会重复出现，
  // 先补位成不同字段，才不会被当成「重复固定字段的值不一致」拒掉。
  const resolvedIds = resolveFixedAnchorIds(rawMarkers, input.fixedFields);
  const markers = rawMarkers.map((marker, index) => ({
    ...marker,
    id: resolvedIds[index],
    rawId: marker.id
  }));
  const firstSectionIndex = markers.findIndex((marker) => marker.kind === "SECTION");
  if (firstSectionIndex < 0) throw new Error("生成结果缺少章节锚点");
  const lastSectionIndex = markers.reduce(
    (last, marker, index) => marker.kind === "SECTION" ? index : last,
    -1
  );
  if (markers.some((marker, index) => marker.kind === "FIXED"
    && index > firstSectionIndex && index < lastSectionIndex)) {
    throw new Error("生成结果的固定字段不能夹在章节之间");
  }

  const fixedIds = new Set(input.fixedFields.map((field) => field.slotId));
  const sectionIds = input.sections.map((section) => section.id);
  const fixedValues = new Map<string, string>();
  const sectionValues = new Map<string, string>();
  markers.forEach((marker, index) => {
    const value = input.markdown.slice(marker.end, markers[index + 1]?.index ?? input.markdown.length).trim();
    const target = marker.kind === "FIXED" ? fixedValues : sectionValues;
    const allowed = marker.kind === "FIXED" ? fixedIds.has(marker.id) : sectionIds.includes(marker.id);
    if (!allowed) {
      throw new Error(`生成结果包含未知的${marker.kind === "FIXED" ? "固定字段" : "章节"}锚点：${marker.rawId}`);
    }
    if (target.has(marker.id)) {
      if (marker.kind === "FIXED"
        && fixedFieldValue(target.get(marker.id)) === fixedFieldValue(value)) return;
      throw new Error(marker.kind === "FIXED"
        ? "生成结果中重复固定字段的值不一致"
        : "生成结果包含重复的章节锚点");
    }
    target.set(marker.id, value);
  });

  const generatedSectionIds = markers.filter((marker) => marker.kind === "SECTION").map((marker) => marker.id);
  if (generatedSectionIds.length !== sectionIds.length
    || generatedSectionIds.some((id, index) => id !== sectionIds[index])) {
    throw new Error("生成结果的章节数量或顺序与参考草稿不一致");
  }

  const blocks: OfficialDocumentDraftContent["blocks"] = [];
  let order = 0;
  const parsedBySection = input.sections.map((section) => (
    parseOfficialDocumentAssistantText(sectionValues.get(section.id) ?? "", true)
  ));
  repairSectionHeadings(input.sections, parsedBySection);
  input.sections.forEach((section, index) => {
    const parsed = parsedBySection[index];
    if (section.headingRole) {
      // 修复阶梯保证首块一定是标题；这里的兜底只是防御，任何情况下都不再整版拒绝。
      const heading = parsed[0] ?? { role: section.headingRole, text: section.title };
      const rest = parsed.slice(1);
      // 标题层级仍按参考草稿声明的 headingRole 落库，模型多写出来的下级标题按各自层级保留：
      // blocks 是一条扁平有序链，编辑器、导出和预览都不假设一个 sectionId 只有一个标题，
      // 降级成正文反而会丢掉公文分级。
      if (section.bodyRequired && !rest.some((block) => block.role === "BODY")) {
        throw new Error(`章节“${section.title}”没有生成正文`);
      }
      blocks.push({
        id: crypto.randomUUID(),
        order: order++,
        role: section.headingRole,
        variantId: officialDocumentVariantId(input.templateNodes, section.headingRole, heading.text),
        sectionId: section.id,
        sourceTaskIds: [],
        text: heading.text
      });
      rest.forEach((item) => blocks.push({
        id: crypto.randomUUID(),
        order: order++,
        role: item.role,
        variantId: officialDocumentVariantId(input.templateNodes, item.role, item.text),
        sectionId: section.id,
        sourceTaskIds: [],
        text: item.text
      }));
      return;
    }

    if (!parsed.length) throw new Error("生成结果没有正文");
    parsed.forEach((item) => blocks.push({
      id: crypto.randomUUID(),
      order: order++,
      role: "BODY",
      variantId: officialDocumentVariantId(input.templateNodes, "BODY"),
      sectionId: section.id,
      sourceTaskIds: [],
      text: item.text
    }));
  });

  let normalizedFixedValues = input.fixedFields.map((field) => ({
    slotId: field.slotId,
    value: fixedFieldValue(fixedValues.get(field.slotId))
      || (field.required ? `[待补充：${field.roleLabel}]` : "")
  }));
  const fixedFieldBySlot = new Map(input.fixedFields.map((field) => [field.slotId, field]));
  const normalizedValueBySlot = new Map(normalizedFixedValues.map((value) => [value.slotId, value.value]));
  const titleField = input.fixedFields.find((field) => field.role === "TITLE");
  const issuerField = input.fixedFields.find((field) => field.role === "ISSUING_AUTHORITY");
  const issuer = issuerField ? normalizedValueBySlot.get(issuerField.slotId)?.trim() ?? "" : "";
  let generatedTitle = titleField ? normalizedValueBySlot.get(titleField.slotId)?.trim() ?? "" : "";
  if (issuer && generatedTitle.startsWith(issuer)) generatedTitle = generatedTitle.slice(issuer.length).trim();
  if (titleField && generatedTitle) {
    normalizedFixedValues = normalizedFixedValues.map((value) => (
      value.slotId === titleField.slotId ? { ...value, value: generatedTitle } : value
    ));
  }
  const fixedBodyDuplicates = new Set(normalizedFixedValues
    .filter((value) => fixedFieldBySlot.get(value.slotId)?.role !== "TITLE" && value.value.trim())
    .map((value) => normalizeText(value.value)));
  const deduplicatedBlocks = blocks
    .filter((block) => block.role !== "BODY" || !fixedBodyDuplicates.has(normalizeText(block.text)))
    .map((block, blockOrder) => ({ ...block, order: blockOrder }));
  const title = generatedTitle && !/^\[待补充[：:]/.test(generatedTitle)
    ? generatedTitle.slice(0, 200)
    : `${input.referenceDraftTitle.replace(/\s*-\s*生成稿$/, "")} - 生成稿`.slice(0, 200);

  return { title, fixedValues: normalizedFixedValues, blocks: deduplicatedBlocks };
}

export function buildOfficialDocumentWritingContext(input: {
  action?: OfficialDocumentWritingAction;
  profile?: OfficialDocumentContentProfile;
  content: OfficialDocumentDraftContent;
  templateNodes: OfficialDocumentStructureNode[];
  document?: { title: string; templateName: string };
}) {
  const action = input.action ?? "FULL_DRAFT";
  const plan = input.profile?.profile.confirmedPlan;
  const source = input.profile?.profile.source;
  if (action === "FULL_DRAFT" && (!plan || !source)) {
    throw new Error("内容方案尚未确认或原始内容不可用");
  }
  const templateOutline = summarizeOfficialDocumentTemplate(input.templateNodes);
  return {
    action,
    document: input.document,
    contentProfileId: input.profile?.id,
    structureRoles: templateOutline,
    templateOutline,
    writingLogic: plan,
    logicSections: plan?.sections ?? [],
    sourceBlocks: source?.blocks ?? [],
    researchResults: (input.content.researchResults ?? []).map((result) => ({
      ...result,
      chart: result.chart ? { ...result.chart, base64: undefined } : undefined
    })),
    fixedValues: input.content.fixedValues,
    currentDraft: input.content.blocks.map((block) => ({
      role: block.role,
      sectionId: block.sectionId,
      text: block.text,
      table: block.table,
      chart: block.chart ? { ...block.chart, base64: undefined } : undefined,
      source: block.source
    })),
    outputRules: action === "FULL_DRAFT"
      ? {
          sectionAnchor: "[[XS_SECTION:section-id]]",
          keepSectionOrder: true,
          privateSourcesOnly: true
        }
      : {
          sectionAnchor: false,
          answerRequestedTaskOnly: true,
          privateSourcesOnly: true
        }
  };
}

export function parseOfficialDocumentFullDraft(input: {
  markdown: string;
  profile: OfficialDocumentContentProfile;
  results: OfficialDocumentResearchResult[];
  templateNodes: OfficialDocumentStructureNode[];
  currentBlocks?: OfficialDocumentDraftContent["blocks"];
}): OfficialDocumentFullDraftPreview {
  const plan = input.profile.profile.confirmedPlan;
  const source = input.profile.profile.source;
  if (!plan || !source) throw new Error("内容方案尚未确认或原始内容不可用");
  const orderedSections = [...plan.sections].sort((left, right) => left.order - right.order);
  const generatedSections = splitAnchoredSections(input.markdown, orderedSections);
  const sourceById = new Map(source.blocks.map((block) => [block.id, block]));
  const standaloneQueryAssets = (input.currentBlocks ?? []).filter((block) => (
    ["TABLE", "CHART_IMAGE"].includes(block.role)
    && block.source?.kind === "QUERY_ASSET"
    && !(block.sourceTaskIds?.length)
  ));
  const restoredAssetIds = new Set<string>();
  const blocks: OfficialDocumentDraftContent["blocks"] = [];
  let order = 0;

  orderedSections.forEach((section, sectionIndex) => {
    const research = input.results.filter((result) => result.sectionId === section.id);
    const knowledgeTaskIds = research
      .filter((result) => result.kind === "ASK_KNOWLEDGE" && result.status === "SUCCESS")
      .map((result) => result.taskId);
    blocks.push({
      id: crypto.randomUUID(),
      order: order++,
      role: section.headingRole,
      variantId: officialDocumentVariantId(input.templateNodes, section.headingRole, section.title),
      sectionId: section.id,
      sourceTaskIds: knowledgeTaskIds,
      text: section.title,
      source: section.sourceBlockIds.length ? {
        kind: "CONTENT_PROFILE",
        contentProfileId: input.profile.id,
        sourceBlockIds: section.sourceBlockIds
      } : undefined
    });
    const generated = parseOfficialDocumentAssistantText(generatedSections[sectionIndex], true);
    const sectionBlocks = generated[0]?.role.startsWith("HEADING_") ? generated.slice(1) : generated;
    if (!sectionBlocks.some((block) => block.role === "BODY")) {
      throw new Error(`章节“${section.title}”没有生成正文，不能应用`);
    }
    sectionBlocks.forEach((generatedBlock) => blocks.push({
      id: crypto.randomUUID(),
      order: order++,
      role: generatedBlock.role,
      variantId: officialDocumentVariantId(input.templateNodes, generatedBlock.role, generatedBlock.text),
      sectionId: section.id,
      sourceTaskIds: knowledgeTaskIds,
      text: generatedBlock.text
    }));
    section.sourceBlockIds
      .map((id) => sourceById.get(id))
      .filter((block) => block?.kind === "TABLE")
      .forEach((block) => blocks.push({
        id: crypto.randomUUID(),
        order: order++,
        role: "TABLE",
        variantId: "",
        sectionId: section.id,
        sourceTaskIds: [],
        text: block!.text,
        table: {
          columns: block!.columns,
          rows: block!.rows,
          totalRows: block!.rows.length
        },
        source: {
          kind: "CONTENT_PROFILE",
          contentProfileId: input.profile.id,
          sourceBlockIds: [block!.id]
        }
      }));
    research.forEach((result) => {
      if (result.status === "SKIPPED") {
        blocks.push({
          id: crypto.randomUUID(), order: order++, role: "BODY",
          variantId: officialDocumentVariantId(input.templateNodes, "BODY"), sectionId: section.id,
          sourceTaskIds: [result.taskId], text: `【待补充】${result.question}`
        });
      }
      if (result.status !== "SUCCESS" || !result.querySource) return;
      if (result.table) {
        blocks.push({
          id: crypto.randomUUID(), order: order++, role: "TABLE", variantId: "",
          sectionId: section.id, sourceTaskIds: [result.taskId], text: result.question,
          table: result.table, source: result.querySource
        });
      }
      if (result.chart) {
        blocks.push({
          id: crypto.randomUUID(), order: order++, role: "CHART_IMAGE", variantId: "",
          sectionId: section.id, sourceTaskIds: [result.taskId], text: result.chart.altText,
          chart: result.chart, source: result.querySource
        });
      }
    });
    standaloneQueryAssets
      .filter((block) => block.sectionId === section.id)
      .forEach((block) => {
        blocks.push({ ...block, order: order++ });
        restoredAssetIds.add(block.id);
      });
  });

  standaloneQueryAssets
    .filter((block) => !restoredAssetIds.has(block.id))
    .forEach((block) => blocks.push({ ...block, order: order++ }));

  const normalizedGenerated = normalizeText(input.markdown);
  const sourceFacts = source.blocks.filter((block) => block.headingHint !== "USER_REQUIREMENT");
  const preservedSourceBlockIds = sourceFacts
    .filter((block) => block.text.trim() && normalizedGenerated.includes(normalizeText(block.text)))
    .map((block) => block.id);
  const missingSourceBlockIds = sourceFacts
    .map((block) => block.id)
    .filter((id) => !preservedSourceBlockIds.includes(id));
  return {
    blocks,
    sectionCount: orderedSections.length,
    bodyCount: blocks.filter((block) => block.role === "BODY").length,
    preservedSourceBlockIds,
    missingSourceBlockIds,
    tableCount: blocks.filter((block) => block.role === "TABLE").length,
    chartCount: blocks.filter((block) => block.role === "CHART_IMAGE").length,
    knowledgeSourceCount: new Set(input.results.flatMap((result) => result.citations.map((citation) => citation.docId))).size,
    pendingCount: input.results.filter((result) => result.status === "SKIPPED").length
  };
}

export type OfficialDocumentPreviewLine = {
  role: OfficialDocumentRole;
  text: string;
};

/**
 * 把生成中的原始 markdown 变成按角色标注的公文行，交给文档排版渲染。
 * 直接渲染 markdown 会把「一、总体要求」按 `#` 顶成巨号标题，和公文的分级完全对不上；
 * 这里复用落库时那套 parseOfficialDocumentAssistantText，保证预览和最终成稿的分级一致。
 * 固定字段（标题、主送、落款、日期）从 [[XS_FIXED:…]] 锚点后的第一行取，
 * 角色查 plan.fixedFields，所以流式到一半也能把标题居中、落款靠右。
 */
export function buildOfficialDocumentPreviewLines(
  markdown: string,
  fixedFields: OfficialDocumentReferenceFixedField[] = []
): OfficialDocumentPreviewLine[] {
  const text = markdown.replace(/\r\n/g, "\n");
  const roleBySlot = new Map(fixedFields.map((field) => [field.slotId, field.role]));
  const lines: OfficialDocumentPreviewLine[] = [];
  const firstSection = text.search(/\[\[XS_SECTION:/);
  const head = firstSection < 0 ? text : text.slice(0, firstSection);
  const body = firstSection < 0 ? "" : text.slice(firstSection);

  const seenSlots = new Set<string>();
  const headPattern = /\[\[XS_FIXED:([^\]\n]*)\]\]([^]*?)(?=\[\[XS_FIXED:|$)/g;
  for (const match of head.matchAll(headPattern)) {
    const slotId = match[1].trim();
    const value = match[2].split("\n").map((line) => line.trim()).find(Boolean) ?? "";
    if (!value || seenSlots.has(slotId)) continue;
    seenSlots.add(slotId);
    lines.push({ role: roleBySlot.get(slotId) ?? "UNKNOWN", text: value });
  }

  /* 还没流到第一个章节锚点时，头部可能只是没有锚点的裸文字，照样先展示出来。 */
  if (!lines.length && !body) {
    const leading = stripOfficialDocumentAnchors(head).trim();
    if (leading) {
      return parseOfficialDocumentAssistantText(leading, true)
        .map((block) => ({ role: block.role as OfficialDocumentRole, text: block.text }));
    }
  }

  lines.push(...parseOfficialDocumentAssistantText(stripOfficialDocumentAnchors(body), true)
    .map((block) => ({ role: block.role as OfficialDocumentRole, text: block.text })));

  return lines;
}

const ANCHOR_PATTERN = /\[\[XS_(?:FIXED|SECTION):[^\]\n]*\]\]/g;
const ANCHOR_ONLY_LINE = /^[^\S\n]*\[\[XS_(?:FIXED|SECTION):[^\]\n]*\]\][^\S\n]*$/;
const ANCHOR_OPENINGS = ["[[XS_FIXED:", "[[XS_SECTION:"];

/** 流式的最后一段可能只写了半个锚点，结尾碎片要一起吞掉，否则会闪出 `[[XS_SEC`。 */
function stripTrailingAnchorFragment(value: string) {
  const start = value.lastIndexOf("[[");
  if (start < 0) return value;
  const tail = value.slice(start);
  if (tail.includes("]]") || tail.includes("\n")) return value;
  const partial = ANCHOR_OPENINGS.some((opening) => (
    opening.startsWith(tail) || tail.startsWith(opening)
  ));
  return partial ? value.slice(0, start) : value;
}

/**
 * 把 `[[XS_FIXED:…]]` / `[[XS_SECTION:…]]` 锚点从要展示给人看的文本里摘掉。
 * 独占一行的锚点连同那一行一起删——留下空行会在正文里凭空多出段落间距。
 * 对话里流式渲染和「复制回答」都用它，落库解析仍然走 parseOfficialDocumentReferenceGeneration。
 */
export function stripOfficialDocumentAnchors(value: string) {
  const withoutAnchors = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !ANCHOR_ONLY_LINE.test(line))
    .join("\n")
    .replace(ANCHOR_PATTERN, "");
  return stripTrailingAnchorFragment(withoutAnchors).replace(/^\n+/, "");
}
