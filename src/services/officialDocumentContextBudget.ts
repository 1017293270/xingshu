/** Matches the AI service limit, with room for its JSON serialization. */
export const MAX_WRITING_CONTEXT_CHARS = 95_000;
const OMITTED = "【内容已截断，未提供部分不得推断】";

type TextPart = { value: string; replace: (value: string) => void; wholeCell: boolean };

/** Keep protocol identifiers intact; only shorten readable source text, and say so explicitly. */
export function budgetOfficialDocumentWritingContext<T extends Record<string, unknown>>(input: T): T {
  if (JSON.stringify(input).length <= MAX_WRITING_CONTEXT_CHARS) return input;
  const context = structuredClone(input) as Record<string, unknown>;
  const truncated: string[] = [];
  context.contextTruncation = {
    message: "本轮上下文超过容量，以下资料已限量；只使用实际保留的完整事实，省略或截断部分不能推断，必要缺项标为【待补充】。原稿和原始资料未修改。",
    fields: truncated
  };
  // These are duplicate projections; the canonical sections and template roles stay intact.
  if (context.writingLogic && context.logicSections) {
    const { sections: _sections, ...logic } = context.writingLogic as Record<string, unknown>;
    context.writingLogic = logic;
  }
  if (context.structureRoles && context.templateOutline) delete context.templateOutline;

  const size = () => JSON.stringify(context).length;
  const shorten = (key: string, value: unknown, isRequirement = false) => {
    if (size() <= MAX_WRITING_CONTEXT_CHARS) return;
    const parts: TextPart[] = [];
    let rowsOmitted = false;
    const visit = (node: unknown, replace: (value: string) => void, field: string, cell = false) => {
      if (typeof node === "string") {
        if (node.length > OMITTED.length && !/^(?:id|.*Id|.*Ids|role|kind|status|sectionAnchor|fixedFieldAnchor)$/.test(field)) {
          parts.push({ value: node, replace, wholeCell: cell });
        }
      } else if (Array.isArray(node)) {
        if (field === "rows" && node.length > 1 && size() > MAX_WRITING_CONTEXT_CHARS) {
          const excess = size() - MAX_WRITING_CONTEXT_CHARS;
          const fraction = Math.max(0, 1 - excess / JSON.stringify(node).length);
          node.splice(Math.max(1, Math.floor(node.length * fraction)));
          rowsOmitted = true;
        }
        node.forEach((item, index) => visit(item, (text) => { node[index] = text; }, field, cell || field === "rows"));
      } else if (node && typeof node === "object") {
        const record = node as Record<string, unknown>;
        if (key === "sourceBlocks" && (record.headingHint === "USER_REQUIREMENT") !== isRequirement) return;
        Object.entries(record).forEach(([name, item]) => visit(item, (text) => { record[name] = text; }, name, cell));
      }
    };
    visit(value, (text) => { context[key] = text; }, key);
    const available = parts.reduce((sum, part) => sum + part.value.length - OMITTED.length, 0);
    if (rowsOmitted || available) truncated.push(isRequirement ? `${key}.USER_REQUIREMENT` : key);
    if (!available || size() <= MAX_WRITING_CONTEXT_CHARS) return;
    const ratio = Math.min(1, (size() - MAX_WRITING_CONTEXT_CHARS + parts.length * 8) / available);
    for (const part of parts) {
      const keep = Math.max(0, part.value.length - Math.ceil((part.value.length - OMITTED.length) * ratio) - OMITTED.length);
      // Never turn a truncated table cell into a different numeric value.
      const prefix = part.wholeCell ? "" : part.value.slice(0, keep).replace(/[^。！？；\n]*$/, "");
      part.replace(prefix + OMITTED);
    }
  };

  // Lowest priority first. The current editor text and explicit user requirements survive longest.
  for (const key of ["styleSamples", "structureRoles", "writingLogic", "researchResults", "referenceMaterials",
    "sourceBlocks", "referenceSections", "logicSections", "currentDraft", "fixedValues", "document", "referenceDraft", "fixedFields"]) {
    shorten(key, context[key]);
  }
  // Many short blocks can exceed the budget through JSON metadata alone. Retain an ordered
  // prefix of supporting entries instead of damaging their IDs or shortening numeric cells.
  for (const key of ["styleSamples", "researchResults", "referenceMaterials", "sourceBlocks", "currentDraft"]) {
    const entries = context[key];
    if (!Array.isArray(entries) || size() <= MAX_WRITING_CONTEXT_CHARS) continue;
    const required = (entry: unknown) => key === "sourceBlocks" && Boolean(entry && typeof entry === "object"
      && (entry as Record<string, unknown>).headingHint === "USER_REQUIREMENT");
    if (!truncated.includes(key)) truncated.push(key);
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const keep = Math.ceil((low + high) / 2);
      context[key] = entries.filter((entry, index) => index < keep || required(entry));
      if (size() <= MAX_WRITING_CONTEXT_CHARS) low = keep;
      else high = keep - 1;
    }
    context[key] = entries.filter((entry, index) => index < low || required(entry));
  }
  shorten("sourceBlocks", context.sourceBlocks, true);
  return context as T;
}
