import { clarificationAnswerOf } from "@/services/dataHubClarification";
import { DataHubServiceError, requestDataHub } from "@/services/dataHubClient";
import { formatDataHubColumnTitle } from "@/services/dataHubFormat";
import { readDataHubSession } from "@/services/dataHubSession";
import type { DataHubAskTurn, DataHubClarification, DataHubTableResult } from "@/types/dataHub";

/**
 * 智能制表·表格模板：后端 ai-service /ai/table-templates（网关路径 /api/v1/table-templates）。
 * 模板 = 制表提示词 + 确认后的表结构快照；结构生成仍走 ask_table 对话链路。
 */
export type DataHubTableTemplate = {
  id: number;
  name: string;
  prompt: string;
  structureJson?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TableTemplateInput = {
  name: string;
  prompt: string;
  structureJson?: string | null;
};

export type TableTemplateColumn = {
  title: string;
  type?: string;
};

function requireSpaceId() {
  const { spaceId } = readDataHubSession();
  if (!spaceId) {
    throw new DataHubServiceError("请先登录 DataHub 并选择空间");
  }
  return spaceId;
}

export async function listTableTemplates(): Promise<DataHubTableTemplate[]> {
  const { spaceId } = readDataHubSession();
  if (!spaceId) {
    return [];
  }
  return requestDataHub<DataHubTableTemplate[]>("/api/v1/table-templates", { spaceId });
}

export async function createTableTemplate(input: TableTemplateInput): Promise<DataHubTableTemplate> {
  const spaceId = requireSpaceId();
  return requestDataHub<DataHubTableTemplate>("/api/v1/table-templates", {
    method: "POST",
    body: JSON.stringify(input),
    spaceId
  });
}

export async function updateTableTemplate(
  id: number,
  input: TableTemplateInput
): Promise<DataHubTableTemplate> {
  const spaceId = requireSpaceId();
  return requestDataHub<DataHubTableTemplate>(`/api/v1/table-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
    spaceId
  });
}

export async function deleteTableTemplate(id: number): Promise<void> {
  const spaceId = requireSpaceId();
  await requestDataHub<unknown>(`/api/v1/table-templates/${id}`, {
    method: "DELETE",
    spaceId
  });
}

/** 结果表列 → 结构快照 JSON（只存展示列名与类型，不存行数据）。 */
export function buildTableStructureJson(columns: DataHubTableResult["columns"]): string {
  return JSON.stringify({
    columns: columns.map((column) => ({
      title: formatDataHubColumnTitle(column.title, column.key),
      ...(column.type ? { type: column.type } : {})
    }))
  });
}

/** 结构快照 JSON → 列清单；格式不合法时按无结构处理，不抛错。 */
export function parseTableStructureColumns(
  structureJson?: string | null
): TableTemplateColumn[] {
  if (!structureJson?.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(structureJson);
    const columns =
      typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { columns?: unknown }).columns)
        ? ((parsed as { columns: unknown[] }).columns)
        : [];
    return columns.flatMap((column) => {
      if (typeof column !== "object" || column === null) {
        return [];
      }
      const { title, type } = column as { title?: unknown; type?: unknown };
      if (typeof title !== "string" || !title.trim()) {
        return [];
      }
      return [{ title: title.trim(), ...(typeof type === "string" && type ? { type } : {}) }];
    });
  } catch {
    return [];
  }
}

/** 模板发起时拼在首轮提示词后面的结构参考行，空一行接在原话之后。 */
const STRUCTURE_REFERENCE_LABEL = "表结构参考（按以下列生成）：";
/** 认尾巴只看前五个字：后端会话标题截断时，标签后半截可能已经被截掉。 */
const STRUCTURE_REFERENCE_HEAD = STRUCTURE_REFERENCE_LABEL.slice(0, 5);
/** 后端会话标题超过 50 字时截断并补的记号。 */
const SESSION_TITLE_TRUNCATION = "...";

/**
 * 从模板发起制表的首轮输入：提示词 + 结构参考行。
 * 结构以自然语言注入首轮上下文，由 ask_table 链路照常生成，后端零改动。
 */
export function buildTemplateLaunchPrompt(template: DataHubTableTemplate): string {
  const columns = parseTableStructureColumns(template.structureJson);
  if (columns.length === 0) {
    return template.prompt;
  }
  return `${template.prompt}\n\n${STRUCTURE_REFERENCE_LABEL}${columns.map((column) => column.title).join("、")}`;
}

/**
 * buildTemplateLaunchPrompt 的逆操作：去掉结构参考尾巴，还原模板（用户）的原话。
 * 后端会话标题是首条消息截 50 字再补「...」，截断点可能落在尾巴中间，
 * 只剩「\n\n表结...」这种半截时也要认出来，否则列表里会挂着一段残句。
 */
export function stripTemplateLaunchReference(text: string): string {
  const referenceStart = text.indexOf(`\n\n${STRUCTURE_REFERENCE_HEAD}`);
  if (referenceStart >= 0) {
    return text.slice(0, referenceStart).trim();
  }

  if (text.endsWith(SESSION_TITLE_TRUNCATION)) {
    const body = text.slice(0, -SESSION_TITLE_TRUNCATION.length);
    for (let length = STRUCTURE_REFERENCE_HEAD.length - 1; length >= 0; length -= 1) {
      const partialReference = `\n\n${STRUCTURE_REFERENCE_HEAD.slice(0, length)}`;
      if (body.endsWith(partialReference)) {
        return body.slice(0, -partialReference.length).trim();
      }
    }
    if (body.endsWith("\n")) {
      return body.trim();
    }
  }

  return text.trim();
}

/* ---------- 存为模板：名称与提示词的建议值 ---------- */

export type TableTemplateDraftContext = {
  /** 从第一轮到正在看的那张表所属轮次，按对话顺序；之后的追问与这张表无关。 */
  turns: ReadonlyArray<Pick<DataHubAskTurn, "question" | "clarifications">>;
  /** 正在看的那张表。本地实现只拿标题兜底名称，AI 版可以连列一起读。 */
  table?: Pick<DataHubTableResult, "title" | "columns">;
};

export type TableTemplateDraft = Pick<TableTemplateInput, "name" | "prompt">;

/** 名称控制在一行读得完的长度；后端上限是 100，建议值远在上限之内。 */
const TEMPLATE_NAME_TARGET = 30;
/** 按分句截名称时，截出来至少要有这么长，否则宁可在目标长度处硬截。 */
const TEMPLATE_NAME_MIN_CLAUSE = 8;
const TEMPLATE_NAME_FALLBACK = "制表模板";

/*
 * 名称开头要剥掉的套话，按顺序反复剥到不再命中：寒暄与礼貌语、「给我 / 帮我」、
 * 「查询一下」这类虚动作、「做一张 / 生成一份」这类造表套话，最后是列出 / 统计这类泛动词。
 * 剩下的就是这张表本身的名字，例如「帮我统计一下各部门人数」→「各部门人数」。
 */
const NAME_FILLER_PREFIXES: RegExp[] = [
  /^(?:你好|您好)/,
  /^(?:请问|请你|请帮我|请帮忙|麻烦你|麻烦|劳驾|请)/,
  /^(?:帮我|帮忙|给我|替我|为我)/,
  /^(?:我想要|我想|我要|我需要|想要|需要)/,
  /^(?:能不能|能否|可不可以|可以)/,
  /* 单个「能」只在后面跟着求助时才是口头语，否则会剥坏「能源消耗」这类名字 */
  /^能(?=帮|给|替)/,
  /^(?:查询|查看|查|看看|看|统计|整理|汇总|列|梳理|导出)一下/,
  /* 量词不收「下」：「生成下月计划表」里的「下」是下个月 */
  /^(?:做|生成|出|制作|整理|创建|建|来|拉)一?(?:张|份|个)(?:表格|报表|表)?/,
  /^(?:列出|统计|查询|查看|看看|导出|生成|整理|汇总|制作)/
];
const NAME_LEADING_NOISE = /^[\s，,。．.！!？?；;：:、~～]+/;
const NAME_TRAILING_NOISE = /(?:[\s，,。．.！!？?；;：:、~～…]|吧|吗|呢|啊|呀|哈|嘛|谢谢|多谢|感谢)+$/;
/** 分句边界。顿号不算：它连的是并列项，截在那里会把「2023、2024」这类枚举拦腰截断。 */
const NAME_CLAUSE_BOUNDARY = /[\s，,。！!？?；;]/;

function stripNameFillers(text: string) {
  let current = text.replace(NAME_LEADING_NOISE, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of NAME_FILLER_PREFIXES) {
      const next = current.replace(pattern, "").replace(NAME_LEADING_NOISE, "");
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
  }
  return current.replace(NAME_TRAILING_NOISE, "");
}

/** 超过目标长度时优先截在最后一个分句边界上，截不出像样的一句再硬截。 */
function clipTemplateName(text: string) {
  const chars = Array.from(text);
  if (chars.length <= TEMPLATE_NAME_TARGET) {
    return text;
  }

  for (let index = TEMPLATE_NAME_TARGET; index >= TEMPLATE_NAME_MIN_CLAUSE; index -= 1) {
    if (NAME_CLAUSE_BOUNDARY.test(chars[index])) {
      return chars.slice(0, index).join("").replace(NAME_TRAILING_NOISE, "");
    }
  }
  return chars.slice(0, TEMPLATE_NAME_TARGET).join("").replace(NAME_TRAILING_NOISE, "");
}

/**
 * 名称 = 第一轮提问的精简版。逐行找第一句剥完套话还有内容的，
 * 这样「帮我做个表：」换行再写需求的写法也能取到真正的表名。
 */
function suggestTemplateName(context: TableTemplateDraftContext) {
  const firstQuestion = stripTemplateLaunchReference(context.turns[0]?.question ?? "");
  for (const line of firstQuestion.split(/\r?\n/)) {
    const condensed = stripNameFillers(line.trim().replace(/\s+/g, " "));
    if (Array.from(condensed).length >= 2) {
      return clipTemplateName(condensed);
    }
  }

  const tableTitle = context.table?.title?.trim();
  return tableTitle ? clipTemplateName(tableTitle) : TEMPLATE_NAME_FALLBACK;
}

/** 已确认的澄清写成「问题：选择」。原生卡回显选项文字，与对话流里「已选择」那一行读法一致。 */
function describeConfirmedClarification(clarification: DataHubClarification) {
  const answer = clarification.selectedAnswer?.trim();
  if (!answer) {
    return [];
  }

  const label = clarification.interactionId
    ? clarification.options.find((option) => clarificationAnswerOf(option) === answer)?.label
    : undefined;
  const question = clarification.question.trim().replace(/[\s？?：:。]+$/, "");
  return [question ? `${question}：${label ?? answer}` : label ?? answer];
}

function uniqueLines(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.replace(/\s+/g, " ");
    if (!line || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function numberedSection(heading: string, items: string[]) {
  return [`${heading}：`, ...items.map((item, index) => `${index + 1}. ${item}`)].join("\n");
}

/**
 * 提示词 = 第一轮原话 + 已确认的澄清 + 后续补充要求，拿去新开一次会话能把这张表原样做出来。
 * 澄清排在补充要求前面：澄清多发生在出第一张表之前，追问在后，读到后面的以后面为准，与对话先后一致。
 * 重试生成会原样重发同一句，按文本去重，免得同一条要求出现两次。
 */
function suggestTemplatePrompt(context: TableTemplateDraftContext) {
  const [original = "", ...supplements] = uniqueLines(
    context.turns.map((turn) => stripTemplateLaunchReference(turn.question))
  );
  const confirmations = uniqueLines(
    context.turns.flatMap((turn) => turn.clarifications.flatMap(describeConfirmedClarification))
  );

  return [
    original,
    ...(confirmations.length > 0 ? [numberedSection("已确认", confirmations)] : []),
    ...(supplements.length > 0 ? [numberedSection("补充要求", supplements)] : [])
  ].filter(Boolean).join("\n");
}

/**
 * 「存为模板」的默认名称与制表提示词，弹窗打开时先填上，用户可以直接改。
 * 现在是前端按整段会话上下文本地合成的；后端 AI 总结接口就绪后替换这里的本地实现，
 * 保留签名与返回形状，调用方（生成中状态、用户改过不覆盖）不用动。
 */
export async function suggestTableTemplateDraft(
  context: TableTemplateDraftContext
): Promise<TableTemplateDraft> {
  return {
    name: suggestTemplateName(context),
    prompt: suggestTemplatePrompt(context)
  };
}
