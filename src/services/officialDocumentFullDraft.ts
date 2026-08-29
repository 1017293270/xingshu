import type {
  OfficialDocumentContentProfile,
  OfficialDocumentDraftContent,
  OfficialDocumentResearchResult,
  OfficialDocumentRole,
  OfficialDocumentStructureNode
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

export type OfficialDocumentReferenceSection = {
  id: string;
  order: number;
  headingRole?: Exclude<TextBlockRole, "BODY">;
  title: string;
  bodyRequired: boolean;
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

function plainHeadingRole(value: string): TextBlockRole | undefined {
  const text = unwrapHeadingMarkup(value);
  if (!text || text.length > 120 || /[；;。！？!?，,：:]$/.test(text)) return undefined;
  if (/^(?:[一二三四五六七八九十百零〇两]+[、.]|第[一二三四五六七八九十百零〇两\d]+[章节篇部分])/.test(text)) {
    return "HEADING_1";
  }
  if (/^\d+(?:\.\d+)+\s*/.test(text)) return "HEADING_3";
  if (/^(?:（[一二三四五六七八九十百零〇两\d]+）|\d+[、.]\s*)/.test(text)) return "HEADING_2";
  return undefined;
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
  if (headingIndexes.length) {
    const leadingBody = orderedBlocks.slice(0, headingIndexes[0].index)
      .some((block) => block.role === "BODY" && block.text.trim());
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
      templateOutline,
      structureRoles: templateOutline,
      outputRules: {
        fixedFieldAnchor: "[[XS_FIXED:slot-id]]",
        sectionAnchor: "[[XS_SECTION:section-id]]",
        keepSectionOrder: true,
        allowHeadingRewrite: true,
        copyReferenceFacts: false,
        allowResearch: false
      }
    }
  };
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
  const blocks: Array<{ role: TextBlockRole; text: string }> = [];
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
  const markers = [...input.markdown.matchAll(markerPattern)].map((match) => ({
    kind: match[1] as "FIXED" | "SECTION",
    id: match[2].trim(),
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
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
    if (!allowed) throw new Error(`生成结果包含未知的${marker.kind === "FIXED" ? "固定字段" : "章节"}锚点`);
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
  input.sections.forEach((section) => {
    const parsed = parseOfficialDocumentAssistantText(sectionValues.get(section.id) ?? "", true);
    if (section.headingRole) {
      const heading = parsed[0];
      if (!heading?.role.startsWith("HEADING_")) throw new Error(`章节“${section.title}”缺少标题`);
      if (parsed.slice(1).some((block) => block.role.startsWith("HEADING_"))) {
        throw new Error(`章节“${section.title}”生成了额外标题`);
      }
      const body = parsed.slice(1).filter((block) => block.role === "BODY");
      if (section.bodyRequired && !body.length) throw new Error(`章节“${section.title}”没有生成正文`);
      blocks.push({
        id: crypto.randomUUID(),
        order: order++,
        role: section.headingRole,
        variantId: officialDocumentVariantId(input.templateNodes, section.headingRole, heading.text),
        sectionId: section.id,
        sourceTaskIds: [],
        text: heading.text
      });
      body.forEach((item) => blocks.push({
        id: crypto.randomUUID(),
        order: order++,
        role: "BODY",
        variantId: officialDocumentVariantId(input.templateNodes, "BODY"),
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
