import {
  suggestParagraphRoles,
  type OfficialDocumentParagraphFact
} from "@/services/officialDocumentService";

/**
 * 浏览器本地解析 DOCX：只读正文段落与表格，文件不出浏览器，也不依赖 Word 引擎。
 * 上传参考资料和内容复刻都走这里，前者要纯文本，后者要带标题层级的段落结构。
 */

export type DocxBlockRole = "TITLE" | "HEADING_1" | "HEADING_2" | "HEADING_3" | "BODY" | "META";

export type DocxBlock = {
  kind: "PARAGRAPH" | "TABLE";
  /** META 是红头、文号、主送、落款、日期、抄送这类版式信息，不算正文也不算章节。 */
  role: DocxBlockRole;
  /** 段落原文；表格按行排，单元格之间用制表符。 */
  text: string;
  /** 标题段落里的标题本身：公文常把标题和正文写在同一段，这里只留标题。 */
  heading?: string;
  /** 同一段里跟在标题后面的正文。 */
  runIn?: string;
  rows?: string[][];
};

export type ParsedDocx = {
  title?: string;
  blocks: DocxBlock[];
  paragraphCount: number;
  tableCount: number;
  headingCount: number;
};

export type DocxParseErrorCode = "PDF" | "LEGACY_OR_ENCRYPTED" | "NOT_DOCX" | "LOADER";

export class DocxParseError extends Error {
  code: DocxParseErrorCode;

  constructor(message: string, code: DocxParseErrorCode) {
    super(message);
    this.name = "DocxParseError";
    this.code = code;
    Object.setPrototypeOf(this, DocxParseError.prototype);
  }
}

export const DOCX_PDF_UNSUPPORTED_MESSAGE = "暂不支持 PDF，可另存为 DOCX 后上传";
const NOT_DOCX_MESSAGE = "这份文件没法按 DOCX 读取，可能已损坏或只是改了扩展名。请在 Word 中另存为 .docx 后再上传";
const LEGACY_MESSAGE = "这份文件是旧版 Word（.doc）或设了打开密码，请在 Word 中另存为不加密的 .docx 后再上传";

/** 标题再长就是一段话了：带样式的标题也不能超过这个长度。 */
const MAX_HEADING_CHARS = 120;
/** 章节切得比这还碎，多半是把一长串「1.」条目当成了标题，最深的一层退回正文。 */
const MAX_HEADINGS = 80;

type CfbEntry = { content?: ArrayLike<number> | null };
type CfbContainer = { FullPaths: string[]; FileIndex: CfbEntry[] };
type CfbApi = {
  read(data: Uint8Array, options: { type: "array" }): CfbContainer;
  find(container: CfbContainer, path: string): CfbEntry | null;
};

type RawParagraph = {
  kind: "PARAGRAPH";
  text: string;
  styleName: string;
  outlineLevel?: number;
  alignment?: string;
  fontSizePoints?: number;
  bold?: boolean;
  color?: string;
};

type RawTable = { kind: "TABLE"; rows: string[][] };

type StyleInfo = { name: string; outlineLevel?: number; basedOn?: string };

type NumberingTier = "chapter" | "cn" | "cnParen" | "decimal" | "num" | "numParen";
type HeadingKey = NumberingTier | "style-1" | "style-2" | "style-3" | "style-4";

/* 公文结构层次序数依次是「一、」「（一）」「1.」「（1）」，带样式的标题按大纲级别对进同一把尺子。 */
const HEADING_RANK: Record<HeadingKey, number> = {
  chapter: 0,
  "style-1": 1,
  cn: 1,
  "style-2": 2,
  cnParen: 2,
  "style-3": 3,
  num: 3,
  decimal: 4,
  numParen: 5,
  "style-4": 6
};

const NUMBERING_PATTERNS: Array<[NumberingTier, RegExp]> = [
  ["chapter", /^第[一二三四五六七八九十百零〇两\d]+(?:章|节|篇|部分)/],
  ["cn", /^[一二三四五六七八九十百零〇两]+[、.]/],
  ["cnParen", /^\([一二三四五六七八九十百零〇两]+\)/],
  ["decimal", /^\d{1,2}(?:\.\d{1,2})+(?![\d.])/],
  ["num", /^\d{1,2}[.、](?!\d)/],
  ["numParen", /^\(\d{1,2}\)/]
];

/* 一、（一）这两层的标题常写成一整句，末尾带句号也还是标题；1.（1）末尾带句号多半是条目。 */
const STRONG_TIERS = new Set<NumberingTier>(["chapter", "cn", "cnParen"]);
/* 冒号可以留在短标题里（「一、检查时间：3月」），同段正文才靠它和句号断开。 */
const SENTENCE_STOP = /[。！？；;!?]/;
const HEADING_STOP = /[。！？；;!?：:]/;
const TRAILING_STOP = /[。！？；;!?]$/;
const CJK = "\\u2e80-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u3000-\\u303f";
const CJK_GAP = new RegExp(`(?<=[${CJK}]) (?=[${CJK}])`, "g");

function isWordElement(element: Element) {
  return /wordprocessingml\/(?:2006\/)?main$/.test(element.namespaceURI ?? "");
}

function attr(element: Element | undefined | null, name: string) {
  if (!element) return undefined;
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === name) return attribute.value;
  }
  return undefined;
}

function child(element: Element | undefined | null, name: string) {
  if (!element) return undefined;
  return Array.from(element.children).find((item) => item.localName === name);
}

function outlineLevelOf(element: Element | undefined) {
  const value = Number(attr(element, "val"));
  /* 9 是「正文文本」级别，不是大纲标题。 */
  return Number.isInteger(value) && value >= 0 && value <= 8 ? value : undefined;
}

function toggleOn(element: Element | undefined) {
  if (!element) return false;
  const value = attr(element, "val");
  return value === undefined || !["0", "false", "off"].includes(value.toLocaleLowerCase());
}

function cleanText(value: string) {
  return value
    /* 零宽字符和 BOM */
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    /* 不换行空格、全角空格和制表换行都折成一个普通空格 */
    .replace(/[\t\n\r\u00A0\u3000 ]+/g, " ")
    .replace(CJK_GAP, "")
    .trim();
}

/** 只沿着正文会出现的节点往下走：删除修订、域代码、文本框和图形里的字都不算段落正文。 */
function runText(node: Element): string {
  let text = "";
  for (const item of Array.from(node.children)) {
    if (!isWordElement(item)) continue;
    switch (item.localName) {
      case "t":
        text += item.textContent ?? "";
        break;
      case "tab":
      case "br":
      case "cr":
        text += " ";
        break;
      case "noBreakHyphen":
        text += "-";
        break;
      case "pPr":
      case "rPr":
      case "del":
      case "moveFrom":
      case "delText":
      case "instrText":
      case "drawing":
      case "pict":
      case "object":
      case "txbxContent":
        break;
      default:
        text += runText(item);
    }
  }
  return text;
}

function readStyles(document: Document | undefined) {
  const styles = new Map<string, StyleInfo>();
  if (!document) return styles;
  for (const style of Array.from(document.getElementsByTagNameNS("*", "style"))) {
    const type = attr(style, "type");
    const id = attr(style, "styleId");
    if (!id || (type && type !== "paragraph")) continue;
    styles.set(id, {
      name: attr(child(style, "name"), "val") ?? id,
      outlineLevel: outlineLevelOf(child(child(style, "pPr"), "outlineLvl")),
      basedOn: attr(child(style, "basedOn"), "val")
    });
  }
  return styles;
}

/** 样式名取自己的，大纲级别沿 basedOn 往上找：自定义标题样式常常只继承了级别。 */
function resolveStyle(styles: Map<string, StyleInfo>, styleId: string | undefined) {
  let current = styleId ? styles.get(styleId) : undefined;
  const name = current?.name ?? styleId ?? "";
  for (let depth = 0; current && depth < 12; depth += 1) {
    if (current.outlineLevel !== undefined) return { name, outlineLevel: current.outlineLevel };
    current = current.basedOn ? styles.get(current.basedOn) : undefined;
  }
  return { name, outlineLevel: undefined };
}

function readParagraph(paragraph: Element, styles: Map<string, StyleInfo>): RawParagraph {
  const properties = child(paragraph, "pPr");
  const style = resolveStyle(styles, attr(child(properties, "pStyle"), "val"));
  const firstRun = Array.from(paragraph.getElementsByTagNameNS("*", "r"))
    .find((run) => isWordElement(run) && cleanText(runText(run)));
  const runProperties = child(firstRun, "rPr");
  const size = Number(attr(child(runProperties, "sz"), "val"));
  return {
    kind: "PARAGRAPH",
    text: cleanText(runText(paragraph)),
    styleName: style.name,
    outlineLevel: outlineLevelOf(child(properties, "outlineLvl")) ?? style.outlineLevel,
    alignment: attr(child(properties, "jc"), "val"),
    fontSizePoints: Number.isFinite(size) && size > 0 ? size / 2 : undefined,
    bold: toggleOn(child(runProperties, "b")),
    color: attr(child(runProperties, "color"), "val")
  };
}

function readTable(table: Element): RawTable {
  const rows: string[][] = [];
  const collectRows = (node: Element) => {
    for (const item of Array.from(node.children)) {
      if (!isWordElement(item)) continue;
      if (item.localName === "tr") {
        const cells: string[] = [];
        const collectCells = (row: Element) => {
          for (const cell of Array.from(row.children)) {
            if (!isWordElement(cell)) continue;
            if (cell.localName === "tc") {
              cells.push(Array.from(cell.getElementsByTagNameNS("*", "p"))
                .filter(isWordElement)
                .map((paragraph) => cleanText(runText(paragraph)))
                .filter(Boolean)
                .join(" "));
            } else if (["sdt", "sdtContent", "customXml"].includes(cell.localName)) {
              collectCells(cell);
            }
          }
        };
        collectCells(item);
        if (cells.some(Boolean)) rows.push(cells);
      } else if (["sdt", "sdtContent", "customXml", "ins", "moveTo"].includes(item.localName)) {
        collectRows(item);
      }
    }
  };
  collectRows(table);
  return { kind: "TABLE", rows };
}

function readBody(document: Document, styles: Map<string, StyleInfo>) {
  const body = Array.from(document.getElementsByTagNameNS("*", "body")).find(isWordElement);
  if (!body) throw new DocxParseError(NOT_DOCX_MESSAGE, "NOT_DOCX");
  const items: Array<RawParagraph | RawTable> = [];
  const walk = (node: Element) => {
    for (const item of Array.from(node.children)) {
      if (!isWordElement(item)) continue;
      if (item.localName === "p") items.push(readParagraph(item, styles));
      else if (item.localName === "tbl") items.push(readTable(item));
      /* 内容控件、修订插入这类容器里包着的仍是正文，删除修订和节属性不是。 */
      else if (["sdt", "sdtContent", "customXml", "ins", "moveTo", "smartTag"].includes(item.localName)) walk(item);
    }
  };
  walk(body);
  return items;
}

function parseXml(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new DocxParseError(NOT_DOCX_MESSAGE, "NOT_DOCX");
  }
  return document;
}

/* 不用 instanceof：测试环境和 iframe 里的类型数组可能来自另一个 realm。 */
async function toBytes(source: Blob | ArrayBuffer | Uint8Array) {
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  if (typeof (source as Blob).arrayBuffer === "function") return new Uint8Array(await (source as Blob).arrayBuffer());
  return new Uint8Array(source as ArrayBuffer);
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function assertDocxContainer(bytes: Uint8Array) {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) throw new DocxParseError(DOCX_PDF_UNSUPPORTED_MESSAGE, "PDF");
  /* 复合文档头：旧版 .doc，或者加了密码的 .docx（加密后同样装在复合文档里）。 */
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw new DocxParseError(LEGACY_MESSAGE, "LEGACY_OR_ENCRYPTED");
  if (!startsWith(bytes, [0x50, 0x4b])) throw new DocxParseError(NOT_DOCX_MESSAGE, "NOT_DOCX");
}

/** xlsx 已经在依赖里，它自带的 CFB 能读 zip；按需加载，不进首屏包。 */
async function loadCfb(): Promise<CfbApi> {
  let loaded: unknown;
  try {
    loaded = await import("xlsx");
  } catch {
    throw new DocxParseError("解析组件没有加载成功，请检查网络后重试", "LOADER");
  }
  const module = loaded as { CFB?: CfbApi; default?: { CFB?: CfbApi } };
  const cfb = module.CFB ?? module.default?.CFB;
  if (!cfb) throw new DocxParseError("解析组件没有加载成功，请刷新页面后重试", "LOADER");
  return cfb;
}

function openPackage(cfb: CfbApi, bytes: Uint8Array) {
  let container: CfbContainer;
  try {
    container = cfb.read(bytes, { type: "array" });
  } catch {
    throw new DocxParseError(NOT_DOCX_MESSAGE, "NOT_DOCX");
  }
  return (path: string) => {
    const normalized = path.replace(/^\/+/, "");
    /* CFB 读出来的路径都挂在根目录名下，按绝对路径找才找得到。 */
    let entry = cfb.find(container, `/${normalized}`);
    if (!entry) {
      const suffix = `/${normalized}`.toLocaleLowerCase();
      const index = container.FullPaths.findIndex((fullPath) => fullPath.toLocaleLowerCase().endsWith(suffix));
      entry = index >= 0 ? container.FileIndex[index] ?? null : null;
    }
    const content = entry?.content;
    if (!content || !content.length) return undefined;
    return new TextDecoder("utf-8").decode(ArrayBuffer.isView(content) ? content : Uint8Array.from(content));
  };
}

/** 主文档一般就是 word/document.xml，个别生成器会改名，以 _rels/.rels 声明的为准。 */
function mainDocumentPath(read: (path: string) => string | undefined) {
  const relations = read("_rels/.rels");
  if (relations) {
    try {
      const document = parseXml(relations);
      const target = Array.from(document.getElementsByTagName("Relationship"))
        .find((relation) => /\/officeDocument$/.test(relation.getAttribute("Type") ?? ""))
        ?.getAttribute("Target");
      if (target) return target.replace(/^\/+/, "");
    } catch {
      /* 关系文件坏了就按默认路径找 */
    }
  }
  return "word/document.xml";
}

function numberingTier(text: string): NumberingTier | undefined {
  const normalized = text.normalize("NFKC");
  return NUMBERING_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0];
}

function numberingPrefixLength(text: string, tier: NumberingTier) {
  const pattern = NUMBERING_PATTERNS.find(([key]) => key === tier)![1];
  return pattern.exec(text.normalize("NFKC"))?.[0].length ?? 0;
}

/**
 * 编号段落要么整段就是标题，要么是「标题。正文」写在同一段；
 * 两样都不像的（整句条目、长段落）就还是正文。
 */
function splitNumberedHeading(text: string, tier: NumberingTier) {
  const strong = STRONG_TIERS.has(tier);
  const trimmed = text.trim();
  const bare = trimmed.replace(/[。；;：:，,]+$/, "");
  const titleChars = (value: string) => value.length - numberingPrefixLength(value, tier);
  if (bare.length <= (strong ? 60 : 40) && !SENTENCE_STOP.test(bare)
    && (strong || !TRAILING_STOP.test(trimmed)) && titleChars(bare) > 0) {
    return { heading: bare, runIn: "" };
  }
  const stop = trimmed.search(HEADING_STOP);
  if (stop <= 0) return undefined;
  const lead = trimmed.slice(0, stop).trim();
  const rest = trimmed.slice(stop + 1).trim();
  if (!rest || lead.length > (strong ? 40 : 20) || titleChars(lead) <= 0) return undefined;
  return { heading: lead, runIn: rest };
}

function styleHeadingLevel(paragraph: RawParagraph) {
  if (paragraph.outlineLevel !== undefined) return paragraph.outlineLevel + 1;
  const match = /(?:heading|标题)\s*([1-9])(?!\d)/i.exec(paragraph.styleName);
  return match ? Number(match[1]) : undefined;
}

function headingCandidate(paragraph: RawParagraph, trustStyles: boolean) {
  if (!paragraph.text || paragraph.text.length > MAX_HEADING_CHARS) return undefined;
  const styleLevel = trustStyles ? styleHeadingLevel(paragraph) : undefined;
  if (styleLevel !== undefined) {
    const key = `style-${Math.min(styleLevel, 4)}` as HeadingKey;
    return { key, heading: paragraph.text.replace(/[。；;：:，,]+$/, ""), runIn: "" };
  }
  const tier = numberingTier(paragraph.text);
  if (!tier) return undefined;
  const split = splitNumberedHeading(paragraph.text, tier);
  return split ? { key: tier as HeadingKey, ...split } : undefined;
}

const TITLE_STYLE = /^(?:title|标题|主标题|文档标题|document title)$/i;
const TITLE_SUFFIX = /(?:报告|请示|通知|决定|通报|函|批复|公告|意见|方案|计划|总结|讲话|纪要|规定|办法|细则|要点|规划)$/;

function titleLike(paragraph: RawParagraph) {
  const text = paragraph.text;
  return text.length > 0 && text.length <= 80 && !/[。；;！？!?：:]$/.test(text);
}

/**
 * 标题只在第一个章节之前找：先认标题样式；再认红头区域最后一行居中的短句；
 * 都没有时，开头几段里像「关于……的通知」的那一段才算。
 */
function findTitleIndex(
  paragraphs: RawParagraph[],
  leadCount: number,
  suggested: Map<number, string>
) {
  const lead = paragraphs.slice(0, Math.min(leadCount, 8));
  const styled = lead.findIndex((paragraph) => TITLE_STYLE.test(paragraph.styleName.trim()) && titleLike(paragraph));
  if (styled >= 0) return styled;
  const firstLeft = lead.findIndex((paragraph) => paragraph.alignment !== "center");
  const centeredBlock = firstLeft < 0 ? lead.length : firstLeft;
  for (let index = centeredBlock - 1; index >= 0; index -= 1) {
    const role = suggested.get(index);
    if (titleLike(lead[index]) && role !== "PRESERVE" && role !== "DATE") return index;
  }
  return lead.slice(0, 3).findIndex((paragraph, index) => (
    titleLike(paragraph)
    && suggested.get(index) !== "PRESERVE"
    && (TITLE_SUFFIX.test(paragraph.text) || suggested.get(index) === "TITLE" && index === 0 && paragraph.text.length <= 40)
  ));
}

const TAIL_META_ROLES = new Set(["DATE", "SIGNATURE"]);
const ANYWHERE_META_ROLES = new Set(["IMPRINT", "ATTACHMENT_NOTE"]);
const LEAD_META_ROLES = new Set(["PRESERVE", "ISSUING_AUTHORITY"]);

/* 主送机关是一行短名单；「现将有关事项通知如下：」这种带逗号的整句是开头正文。 */
function looksLikeRecipient(text: string) {
  return text.length <= 40 && !/[，,。；;]/.test(text.slice(0, -1));
}
/** 落款和日期只在文末认，正文中间单独一行的日期不能被当成版式信息吞掉。 */
const TAIL_WINDOW = 6;

function classify(items: Array<RawParagraph | RawTable>): ParsedDocx {
  const paragraphs: RawParagraph[] = [];
  const positions: number[] = [];
  items.forEach((item, position) => {
    if (item.kind === "PARAGRAPH" && item.text) {
      paragraphs.push(item);
      positions.push(position);
    }
  });
  const facts: OfficialDocumentParagraphFact[] = paragraphs.map((paragraph, index) => ({
    index,
    text: paragraph.text,
    format: { styleName: paragraph.styleName, outlineLevel: paragraph.outlineLevel },
    runs: [{
      index: 0,
      text: paragraph.text,
      format: { fontSizePoints: paragraph.fontSizePoints, bold: paragraph.bold, color: paragraph.color }
    }]
  }));
  const suggested = suggestParagraphRoles(facts) as Map<number, string>;
  /* 样式把大半段落都标成了大纲级别，说明是样式本身设错了，这时只信编号。 */
  const styledCount = paragraphs.filter((paragraph) => styleHeadingLevel(paragraph) !== undefined).length;
  const trustStyles = !(paragraphs.length >= 10 && styledCount / paragraphs.length > 0.6);
  const candidates = paragraphs.map((paragraph) => headingCandidate(paragraph, trustStyles));
  const firstHeading = candidates.findIndex(Boolean);
  const leadCount = firstHeading < 0 ? paragraphs.length : firstHeading;
  const titleIndex = findTitleIndex(paragraphs, leadCount, suggested);

  const usedRanks = [...new Set(candidates.flatMap((candidate) => candidate ? [HEADING_RANK[candidate.key]] : []))]
    .sort((left, right) => left - right);
  let levelRanks = usedRanks.slice(0, 3);
  const countHeadings = (ranks: number[]) => candidates
    .filter((candidate) => candidate && ranks.includes(HEADING_RANK[candidate.key])).length;
  while (levelRanks.length > 1 && countHeadings(levelRanks) > MAX_HEADINGS) levelRanks = levelRanks.slice(0, -1);

  const paragraphRoles = paragraphs.map((paragraph, index): DocxBlockRole => {
    if (index === titleIndex) return "TITLE";
    const candidate = candidates[index];
    const level = candidate ? levelRanks.indexOf(HEADING_RANK[candidate.key]) + 1 : 0;
    if (level > 0) return `HEADING_${level}` as DocxBlockRole;
    const role = suggested.get(index) ?? "BODY";
    if (index < leadCount && (index < titleIndex || LEAD_META_ROLES.has(role)
      || (role === "RECIPIENT" && looksLikeRecipient(paragraph.text)))) return "META";
    if (ANYWHERE_META_ROLES.has(role)) return "META";
    if (TAIL_META_ROLES.has(role) && index >= paragraphs.length - TAIL_WINDOW) return "META";
    return "BODY";
  });

  const roleByPosition = new Map(positions.map((position, index) => [position, index]));
  const titlePosition = titleIndex >= 0 ? positions[titleIndex] : -1;
  const firstHeadingPosition = firstHeading >= 0 ? positions[firstHeading] : Number.POSITIVE_INFINITY;
  const blocks: DocxBlock[] = [];
  items.forEach((item, position) => {
    if (item.kind === "TABLE") {
      if (!item.rows.length) return;
      /* 标题之前的表格是红头版式表，不是正文。 */
      const beforeTitle = position < titlePosition && position < firstHeadingPosition;
      blocks.push({
        kind: "TABLE",
        role: beforeTitle ? "META" : "BODY",
        text: item.rows.map((row) => row.join("\t")).join("\n"),
        rows: item.rows
      });
      return;
    }
    const index = roleByPosition.get(position);
    if (index === undefined) return;
    const role = paragraphRoles[index];
    const candidate = candidates[index];
    blocks.push({
      kind: "PARAGRAPH",
      role,
      text: item.text,
      ...(role.startsWith("HEADING_") && candidate
        ? { heading: candidate.heading, ...(candidate.runIn ? { runIn: candidate.runIn } : {}) }
        : {})
    });
  });

  return {
    ...(titleIndex >= 0 ? { title: paragraphs[titleIndex].text } : {}),
    blocks,
    paragraphCount: paragraphs.length,
    tableCount: blocks.filter((block) => block.kind === "TABLE").length,
    headingCount: paragraphRoles.filter((role) => role.startsWith("HEADING_")).length
  };
}

/** 读出整篇 DOCX 的段落结构。解析失败抛 DocxParseError，文案可以直接给用户看。 */
export async function parseDocx(source: Blob | ArrayBuffer | Uint8Array): Promise<ParsedDocx> {
  const bytes = await toBytes(source);
  assertDocxContainer(bytes);
  const read = openPackage(await loadCfb(), bytes);
  const documentXml = read(mainDocumentPath(read));
  if (!documentXml) throw new DocxParseError(NOT_DOCX_MESSAGE, "NOT_DOCX");
  const stylesXml = read("word/styles.xml");
  let styles: Document | undefined;
  try {
    styles = stylesXml ? parseXml(stylesXml) : undefined;
  } catch {
    /* 样式表坏了只是少了标题样式这条线索，正文照读 */
    styles = undefined;
  }
  return classify(readBody(parseXml(documentXml), readStyles(styles)));
}

/** 整篇纯文本：段落一行一段，表格一行一行用制表符分列，给参考资料用。 */
export function docxPlainText(parsed: Pick<ParsedDocx, "blocks">) {
  return parsed.blocks.map((block) => block.text).filter(Boolean).join("\n");
}
