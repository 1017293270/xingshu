import type { QueryExecutionOutput } from "@/types/analytics";
import { numericMetricColumns, parseNumericCell } from "./dashboardColumnSemantics";

/**
 * 用收藏时的回答原文认答案：回答里引用的数落在哪张结果表、哪一列，是单元格本身还是一列的合计。
 *
 * 收藏存着整轮问数的每一次 load_data，答案只在回答文本里。规则：
 * - 从回答里抽数：千分位、小数、负号、全角数字、「万 / 亿」量级与 %；年份、日期时间、列表序号、
 *   「第 N / 前 N」、引用角标、排名列与问题里出现过的数都不算；
 * - 每个数按显示精度给半个单位的容差（换到基本单位后比较）：「1,286.5 万元」= 12,865,000 ± 500；
 * - 单元格按 ×1 / ×1e4 / ×1e8 三种量级比较（列本身可能以万元、亿元为单位），百分数同时比较 v 与 v×100；
 * - 多行表某数值列的合计对得上、而任何表都没有单元格直接等于这个数时，记为「该列求和」；
 * - 表里非数值的文本（公司名、项目名…）出现在回答里，是排行 / 分组答案的佐证。
 * 输入的结果表须已清洗列名：列种类按短业务名判。
 */

export type DashboardAnswerNumber = {
  /** 换到基本单位后的值：「1,286.5 万元」是 12865000；百分数保持百分点，35.2% 是 35.2。 */
  value: number;
  /** 显示精度的半个单位，同样换到基本单位：「1,286.5 万元」是 500。 */
  tolerance: number;
  percent: boolean;
  /** 回答里的原文片段，只用于排查。 */
  text: string;
};

export type DashboardAnswerColumnEvidence = {
  key: string;
  /** cell：回答直接引用了这一列的单元格；sum：回答的数是这一列的合计。 */
  match: "cell" | "sum";
  score: number;
};

export type DashboardAnswerOutputEvidence = {
  outputKey: string;
  /** 命中的不同回答数，按精度加权求和。 */
  numberScore: number;
  /** 表里出现在回答中的不同名称个数。 */
  nameHits: number;
  score: number;
  /** 至少命中一个回答数，或至少两个名称。 */
  hasEvidence: boolean;
  /** 命中回答数的数值列：单元格命中在前，同类按得分从高到低。 */
  columns: DashboardAnswerColumnEvidence[];
};

/** 「万亿」要排在「万」「亿」前面，否则会被拆成两段。 */
const MAGNITUDES: Record<string, number> = { 万亿: 1e12, 千万: 1e7, 百万: 1e6, 亿: 1e8, 万: 1e4 };
const NUMBER_PATTERN =
  /(?<![\w.])(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?!\w)(?:\s*(万亿|千万|百万|亿|万))?(?:\s*(%))?/g;
/** 字母和数字连写的是编号、版本、季度、TOP10 这类记号，不是金额。 */
const IDENTIFIER_TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_.-]*/g;
const DATE_SPAN_PATTERNS = [
  /(?:19|20|21)\d{2}[-/]\d{1,2}(?:[-/]\d{1,2})?(?:[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?/g,
  /(?:19|20|21)\d{2}\.\d{1,2}\.\d{1,2}/g,
  /(?:19|20|21)\d{2}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?/g,
  /\d{1,2}\s*月\s*\d{1,2}\s*[日号]/g,
  /\d{1,2}:\d{2}(?::\d{2})?/g,
  /\d{1,4}\s*[-~～—–至到]\s*\d{1,4}\s*(?:年|月|日|号)/g
];
/** 紧跟这些字的整数是日期或时长的一部分：「2025 年」「3 月」「12 日」「第 2 季度」。 */
const DATE_UNIT_AFTER = /^\s*(?:年|个月|月|日|号|季度)/;
/** 「前 10」是名次，「目前 3 家」「之前 2 个」不是。 */
const ORDINAL_BEFORE = /(?:第|(?<![目之此以提当面事空眼跟门生向日年月天先从])前|top|no\.?|#)\s*$/i;
const LIST_MARKER_BEFORE = /^[\s>+-]*$/;
const LIST_MARKER_AFTER = /^[.、)](?!\d)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RANK_HEADER = /^(?:排名|名次|排序|序号|序|#|no\.?|rank)$/i;
/** 汇总行、空值这类占位文本出现在回答里不说明任何事。 */
const GENERIC_NAME = /^(?:合计|总计|小计|共计|汇总|其他|其它|未知|全部|暂无|null|none|undefined|true|false|-+)$/i;

/** 一个数最多算这么重；最轻也要有点分量，否则「4」这种数永远不算证据。 */
const MAX_NUMBER_WEIGHT = 6;
const MIN_NUMBER_WEIGHT = 0.3;
/** 名称是辅证：一个名称抵半个低精度的数。 */
const NAME_WEIGHT = 0.5;
const MIN_NAME_EVIDENCE = 2;
/** 单元格比对与名称比对的扫描窗口：回答引用的数和名称都在表头部，几万行的明细没必要全扫。 */
const CELL_SCAN_LIMIT = 1_000;
const NAME_SCAN_LIMIT = 200;
const MAGNITUDE_SCALES = [1, 1e4, 1e8];
const PERCENT_SCALES = [1, 100];

/**
 * 回答的公共预处理：全角逗号只在全角数字之间才是千分位，其余是中文逗号；
 * 再 NFKC 折半角，去掉代码块、链接地址、HTML 与强调符号，免得「**1,286.5** 万元」的单位被星号隔开。
 */
function normalizeAnswerText(text: string) {
  return text
    .replace(/(?<=[０-９])，(?=[０-９]{3}(?![０-９]))/g, ",")
    .replace(/，/g, "、")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/−/g, "-")
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*+|~~|`/g, "");
}

/** markdown 表格里「排名 / 序号」列的单元格范围：那一列的 1、2、3 是名次。 */
function rankColumnSpans(text: string) {
  const spans: Array<[number, number]> = [];
  const lines: Array<{ line: string; offset: number }> = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    lines.push({ line, offset });
    offset += line.length + 1;
  }
  const cellsOf = (line: string) => {
    const cells: Array<{ text: string; start: number; end: number }> = [];
    let start = 0;
    for (let index = 0; index <= line.length; index += 1) {
      if (index < line.length && line[index] !== "|") continue;
      cells.push({ text: line.slice(start, index), start, end: index });
      start = index + 1;
    }
    if (line.trimStart().startsWith("|")) cells.shift();
    if (line.trimEnd().endsWith("|")) cells.pop();
    return cells;
  };

  for (let index = 0; index + 1 < lines.length; index += 1) {
    const header = lines[index]!.line;
    if (!header.includes("|") || !TABLE_SEPARATOR.test(lines[index + 1]!.line)) continue;
    const rankIndexes = cellsOf(header)
      .map((cell, cellIndex) => (RANK_HEADER.test(cell.text.trim()) ? cellIndex : -1))
      .filter((cellIndex) => cellIndex >= 0);
    if (rankIndexes.length === 0) continue;
    for (let row = index + 2; row < lines.length && lines[row]!.line.includes("|"); row += 1) {
      const cells = cellsOf(lines[row]!.line);
      for (const cellIndex of rankIndexes) {
        const cell = cells[cellIndex];
        if (cell) spans.push([lines[row]!.offset + cell.start, lines[row]!.offset + cell.end]);
      }
    }
  }
  return spans;
}

function dateSpans(text: string) {
  return DATE_SPAN_PATTERNS.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match): [number, number] => [match.index, match.index + match[0].length])
  );
}

function withinSpans(spans: Array<[number, number]>, start: number, end: number) {
  return spans.some(([spanStart, spanEnd]) => start < spanEnd && end > spanStart);
}

function lineBefore(text: string, start: number) {
  return text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
}

/** 序号、名次与引用角标：行首的「1.」「2、」，「第 1」「前 10」「TOP 3」，「[1]」「【2】」「(3)」。 */
function isOrdinal(text: string, start: number, end: number, integer: boolean) {
  if (!integer) return false;
  const before = lineBefore(text, start);
  const after = text.slice(end, end + 3);
  if (LIST_MARKER_BEFORE.test(before) && LIST_MARKER_AFTER.test(after)) return true;
  if (ORDINAL_BEFORE.test(before)) return true;
  return /[[【(^]\s*$/.test(before) && /^\s*[\]】)]/.test(after);
}

/** raw：问题里的数原样收下（「前 10」「2025 年」都要），只给回答做排除。 */
function scanNumbers(rawText: string, options: { questionValues?: number[]; raw?: boolean } = {}) {
  const text = normalizeAnswerText(rawText).replace(IDENTIFIER_TOKEN_PATTERN, (token) => " ".repeat(token.length));
  const excluded = options.raw ? [] : [...dateSpans(text), ...rankColumnSpans(text)];
  const numbers: DashboardAnswerNumber[] = [];

  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const [whole, minus, integerPart, decimals = "", magnitudeWord, percentSign] = match;
    const start = match.index;
    const digitsEnd = start + (minus?.length ?? 0) + integerPart!.length + (decimals ? decimals.length + 1 : 0);
    const integer = decimals.length === 0;
    if (!options.raw) {
      if (withinSpans(excluded, start, digitsEnd)) continue;
      if (integer && !magnitudeWord && !percentSign && DATE_UNIT_AFTER.test(text.slice(digitsEnd, digitsEnd + 4))) continue;
      if (isOrdinal(text, start, digitsEnd, integer)) continue;
    }

    const magnitude = magnitudeWord ? MAGNITUDES[magnitudeWord]! : 1;
    const shown = Number(`${integerPart!.replace(/,/g, "")}${decimals ? `.${decimals}` : ""}`);
    if (!Number.isFinite(shown) || shown === 0) continue;
    const value = (minus ? -shown : shown) * magnitude;
    const tolerance = 0.5 * 10 ** -decimals.length * magnitude;
    if (options.questionValues?.some((questionValue) => Math.abs(questionValue - value) <= tolerance)) continue;
    numbers.push({ value, tolerance, percent: Boolean(percentSign), text: whole.trim() });
  }
  return numbers;
}

/**
 * 回答里可能是答案的数，按出现顺序、同值去重。
 * 「0」对得上任何空值与零值单元格，不算证据；问题里出现过的数（「前 10」「超过 100 万」）是查询条件，也不算。
 */
export function extractDashboardAnswerNumbers(answerText: string, questions: string[] = []): DashboardAnswerNumber[] {
  const questionValues = questions.flatMap((question) => scanNumbers(question, { raw: true }).map((item) => item.value));
  const seen = new Set<string>();
  return scanNumbers(answerText, { questionValues }).filter((item) => {
    const key = `${item.value}|${item.tolerance}|${item.percent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 精度越高的数越不可能撞上：「1,286.5 万元」远比「4」可信，权重取 log10(|值| / 容差)。 */
function numberWeight(item: DashboardAnswerNumber) {
  const weight = Math.log10(Math.abs(item.value) / item.tolerance);
  return Math.min(MAX_NUMBER_WEIGHT, Math.max(MIN_NUMBER_WEIGHT, weight));
}

/** 正负号不比：回答常写「下降 5.2%」，表里存的是 -5.2。 */
function numberMatches(item: DashboardAnswerNumber, candidate: number) {
  const target = Math.abs(item.value);
  const slack = item.tolerance + target * 1e-9;
  const base = Math.abs(candidate);
  return (item.percent ? PERCENT_SCALES : MAGNITUDE_SCALES).some((scale) => Math.abs(base * scale - target) <= slack);
}

type TableHits = {
  outputKey: string;
  cellHits: Map<string, Set<number>>;
  sumHits: Map<string, Set<number>>;
  nameHits: number;
  columnOrder: Map<string, number>;
};

function addHit(hits: Map<string, Set<number>>, key: string, index: number) {
  const set = hits.get(key) ?? new Set<number>();
  set.add(index);
  hits.set(key, set);
}

function collectTableHits(
  output: QueryExecutionOutput,
  numbers: DashboardAnswerNumber[],
  nameText: string,
  questionText: string
): TableHits {
  const hits: TableHits = {
    outputKey: output.outputKey,
    cellHits: new Map(),
    sumHits: new Map(),
    nameHits: 0,
    columnOrder: new Map(output.columns.map((column, index) => [column.key, index]))
  };
  if (output.rows.length === 0) return hits;

  const numericColumns = numericMetricColumns(output.columns, output.rows);
  const numericKeys = new Set(numericColumns.map((column) => column.key));
  for (const column of numericColumns) {
    const values = output.rows
      .map((row) => parseNumericCell(row[column.key]))
      .filter((value): value is number => value !== null);
    for (const value of values.slice(0, CELL_SCAN_LIMIT)) {
      numbers.forEach((item, index) => {
        if (numberMatches(item, value)) addHit(hits.cellHits, column.key, index);
      });
    }
    if (output.rows.length < 2 || values.length < 2) continue;
    const sum = values.reduce((total, value) => total + value, 0);
    numbers.forEach((item, index) => {
      if (!item.percent && numberMatches(item, sum)) addHit(hits.sumHits, column.key, index);
    });
  }

  const names = new Set<string>();
  const textColumns = output.columns.filter((column) => !numericKeys.has(column.key));
  for (const row of output.rows.slice(0, NAME_SCAN_LIMIT)) {
    for (const column of textColumns) {
      const cell = row[column.key];
      if (typeof cell !== "string") continue;
      const name = cell.normalize("NFKC").trim();
      if (name.length < 2 || names.has(name)) continue;
      names.add(name);
      if (GENERIC_NAME.test(name) || parseNumericCell(name) !== null || questionText.includes(name)) continue;
      if (nameText.includes(name)) hits.nameHits += 1;
    }
  }
  return hits;
}

function sumWeights(indexes: Iterable<number>, weights: number[]) {
  let total = 0;
  for (const index of indexes) total += weights[index] ?? 0;
  return total;
}

/**
 * 每张结果表的答案证据，顺序与入参一致。
 * 某个回答数只要有任何一张表的单元格直接等于它，各表的「列求和」就不再算它：直接引用比凑出来的合计可信。
 */
export function dashboardAnswerEvidence(
  answerText: string,
  outputs: QueryExecutionOutput[],
  questions: string[] = []
): DashboardAnswerOutputEvidence[] {
  const numbers = extractDashboardAnswerNumbers(answerText, questions);
  const weights = numbers.map(numberWeight);
  const nameText = normalizeAnswerText(answerText);
  const questionText = questions.map((question) => question.normalize("NFKC")).join(" ");
  const tables = outputs.map((output) => collectTableHits(output, numbers, nameText, questionText));
  const quoted = new Set<number>();
  for (const table of tables) for (const indexes of table.cellHits.values()) indexes.forEach((index) => quoted.add(index));

  return tables.map((table) => {
    const matched = new Set<number>();
    const columns: Array<DashboardAnswerColumnEvidence & { order: number }> = [];
    for (const [key, indexes] of table.cellHits) {
      indexes.forEach((index) => matched.add(index));
      columns.push({ key, match: "cell", score: sumWeights(indexes, weights), order: table.columnOrder.get(key) ?? 0 });
    }
    for (const [key, indexes] of table.sumHits) {
      const derived = [...indexes].filter((index) => !quoted.has(index));
      if (derived.length === 0) continue;
      derived.forEach((index) => matched.add(index));
      columns.push({ key, match: "sum", score: sumWeights(derived, weights), order: table.columnOrder.get(key) ?? 0 });
    }
    columns.sort((left, right) =>
      Number(left.match === "sum") - Number(right.match === "sum")
      || right.score - left.score
      || left.order - right.order
    );
    const numberScore = sumWeights(matched, weights);
    return {
      outputKey: table.outputKey,
      numberScore,
      nameHits: table.nameHits,
      score: numberScore + table.nameHits * NAME_WEIGHT,
      hasEvidence: numberScore > 0 || table.nameHits >= MIN_NAME_EVIDENCE,
      columns: columns.map(({ key, match, score }) => ({ key, match, score }))
    };
  });
}

/**
 * 回答原文转纯文本，给收藏列表与详情展示：去掉 markdown 的标题、引用、列表、表格与强调符号，
 * 保留换行；没有回答时返回空串。
 */
export function dashboardAnswerPlainText(answerText?: string | null) {
  if (typeof answerText !== "string") return "";
  return answerText
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```.*$/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => (TABLE_SEPARATOR.test(line) ? "" : line)
      .replace(/^\s*(?:(?:#{1,6}|>+)\s*)+/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/\s*\|\s*/g, " ")
      .replace(/\*\*|__|\*|~~|`/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean)
    .join("\n");
}
