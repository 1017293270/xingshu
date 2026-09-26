import { describeDataHubCondition } from "@/services/dataHubAskDataPresenter";
import { hasHanScript } from "@/services/dataHubFormat";
import type {
  DataHubBusinessConditionGroup,
  DataHubBusinessConditionNode,
  DataHubBusinessQuery,
  DataHubBusinessQueryBasis,
  DataHubBusinessTrace
} from "@/types/dataHub";

const PREAMBLE_MAX_QUERIES = 3;
const PREAMBLE_MAX_KNOWLEDGE_BASES = 3;

export type DataHubAnswerPreamble = {
  /** 每条查询一句，按查询先后排列，最多三句。 */
  queries: string[];
  /** 可说明的查询总数；多于展示条数时由展示层写成「等 N 条查询」。 */
  queryCount: number;
  /** 编排结果里引用到的知识库来源。 */
  knowledge?: string;
};

const granularityLabels: Record<string, string> = {
  second: "秒",
  minute: "分钟",
  hour: "小时",
  day: "日",
  week: "周",
  month: "月",
  quarter: "季度",
  year: "年"
};

/** 这些度量名本身就是「行数」，写成「对“记录数”计数」反而绕。 */
const rowCountLabel = /^(记录数|数量|条数|计数|总数|行数|count)$/i;

function quote(text: string) {
  return `“${text}”`;
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function isGroup(node: DataHubBusinessConditionNode): node is DataHubBusinessConditionGroup {
  return "logic" in node;
}

/** 顶层 and 组与并列条件同义，摊平后才能按字段合并成一句。 */
function flattenAnd(node: DataHubBusinessConditionNode): DataHubBusinessConditionNode[] {
  return isGroup(node) && node.logic === "and" ? node.conditions.flatMap(flattenAnd) : [node];
}

function groupText(group: DataHubBusinessConditionGroup, nested = false): string {
  const parts = group.conditions
    .map((child) => (isGroup(child)
      ? groupText(child, true)
      : quote(`${child.field} ${describeDataHubCondition(child.operator, child.values)}`)))
    .filter(Boolean);
  const joined = parts.join(group.logic === "or" ? "或" : "且");
  return nested && parts.length > 1 ? `（${joined}）` : joined;
}

/** 对“金额”按“大于等于 10 且 小于 60”筛选；or 组写成 按“区域 等于 华东”或“金额 大于 5”筛选。 */
function conditionClauses(nodes: DataHubBusinessConditionNode[]) {
  const clauses: Array<{ field: string; phrases: string[] } | { text: string }> = [];
  for (const node of nodes.flatMap(flattenAnd)) {
    if (isGroup(node)) {
      const text = groupText(node);
      if (text) clauses.push({ text: `按${text}筛选` });
      continue;
    }
    const phrase = describeDataHubCondition(node.operator, node.values);
    const sameField = clauses.find(
      (clause): clause is { field: string; phrases: string[] } => "field" in clause && clause.field === node.field
    );
    if (!sameField) {
      clauses.push({ field: node.field, phrases: [phrase] });
    } else if (!sameField.phrases.includes(phrase)) {
      sameField.phrases.push(phrase);
    }
  }
  return clauses.map((clause) => ("text" in clause
    ? clause.text
    : `对${quote(clause.field)}按${quote(clause.phrases.join(" 且 "))}筛选`));
}

function measureClauses(measures: DataHubBusinessQueryBasis["measures"]) {
  const clauses: Array<{ aggregation: string; fields: string[] } | { rows: true }> = [];
  for (const measure of measures) {
    if (measure.aggregation === "计数" && rowCountLabel.test(measure.field)) {
      if (!clauses.some((clause) => "rows" in clause)) clauses.push({ rows: true });
      continue;
    }
    // 「订单数」本身就是个数，写成「对“订单数”计数」反而拗口，直接说统计它。
    const aggregation = measure.aggregation === "计数" && /数量?$/.test(measure.field) ? "" : measure.aggregation;
    const sameAggregation = clauses.find(
      (clause): clause is { aggregation: string; fields: string[] } =>
        "aggregation" in clause && clause.aggregation === aggregation
    );
    if (!sameAggregation) {
      clauses.push({ aggregation, fields: [measure.field] });
    } else if (!sameAggregation.fields.includes(measure.field)) {
      sameAggregation.fields.push(measure.field);
    }
  }
  return clauses.map((clause) => {
    if ("rows" in clause) return "统计记录数";
    const fields = clause.fields.map(quote).join("、");
    // 语义层没说明、SQL 与命名也看不出聚合方式时只说算了哪个指标，不替它编一个。
    return clause.aggregation ? `对${fields}${clause.aggregation}` : `统计${fields}`;
  });
}

function operationClauses(basis: DataHubBusinessQueryBasis) {
  const groups = basis.groups.map((group) => {
    const granularity = group.granularity
      ? granularityLabels[group.granularity.toLowerCase()] ?? group.granularity
      : "";
    return `${quote(group.field)}${granularity ? `（按${granularity}）` : ""}`;
  });
  const segments = unique(basis.segments.map((segment) => segment.field));
  // 没有度量的查询只是把这些字段列出来，写「分组」会让人以为做了汇总。
  const listsFields = basis.ungrouped === true || basis.measures.length === 0;
  const sorts = basis.sorts.map((sort) => `${quote(sort.field)}${sort.direction === "desc" ? "倒序" : "正序"}`);
  return [
    ...conditionClauses(basis.conditions),
    segments.length ? `按${segments.map(quote).join("、")}条件筛选` : "",
    groups.length ? (listsFields ? `列出${groups.join("、")}` : `按${groups.join("、")}分组`) : "",
    ...measureClauses(basis.measures),
    sorts.length ? `按${sorts.join("、")}排列` : "",
    basis.limit ? (basis.offset ? `跳过前 ${basis.offset} 条后取 ${basis.limit} 条` : `取前 ${basis.limit} 条`) : ""
  ].filter(Boolean);
}

/** 根据“X”数据源“Y”数据表；表名只来自语义层注解，物理表名一律不写。 */
function sourceClause(query: DataHubBusinessQuery) {
  const source = query.dataSource?.trim();
  const tables = query.basis
    ? unique(query.basis.tables.map((item) => item.table))
    : unique([query.table]).filter(hasHanScript);
  // 叫不出名字的表只计数，写成「等 N 张数据表」，免得读者以为只查了一张。
  const tableCount = tables.length + (query.basis?.tables.filter((item) => !item.table).length ?? 0);
  const tableText = tables.length
    ? `${tables.map(quote).join("、")}${tableCount > tables.length ? `等 ${tableCount} 张` : ""}数据表`
    : "";
  if (source) return `根据${quote(source)}数据源${tableText}`;
  return tableText ? `根据${tableText}` : "";
}

function querySentence(query: DataHubBusinessQuery) {
  const lead = sourceClause(query);
  const operations = query.basis ? operationClauses(query.basis) : [];
  if (!lead && !operations.length) return undefined;
  return {
    text: `${[lead, ...operations].filter(Boolean).join("，")}${operations.length ? "" : "查询"}。`,
    explainsOperations: operations.length > 0
  };
}

function knowledgeSentence(trace: DataHubBusinessTrace) {
  const knowledgeBases = unique(trace.documents.map((document) => document.kbName));
  if (!knowledgeBases.length) return undefined;
  const shown = knowledgeBases.slice(0, PREAMBLE_MAX_KNOWLEDGE_BASES).map(quote).join("、");
  const more = knowledgeBases.length > PREAMBLE_MAX_KNOWLEDGE_BASES ? `等 ${knowledgeBases.length} 个` : "";
  return `根据${shown}${more}知识库中的 ${trace.documents.length} 份文档。`;
}

/**
 * 回答末尾的查询依据：每条查询一句「根据“X”数据源“Y”数据表，对“字段”按“小于 60”筛选，
 * 按“字段”分组，对“字段”求和，按“字段”倒序排列，取前 N 条。」
 *
 * 只面向问数与编排结果（问知已有「依据《文档》第X章第N页」来源行，不重复）。
 * 名字全部来自查询结果携带的语义层注解与事件：叫不出数据源名就从数据表说起，
 * 叫不出表名就直接说操作，绝不硬造。只剩来源、说不出任何操作时，若模型答案已以
 * 「根据 / 依据 / 基于」开头，就不再叠一句同义的来源。
 */
export function buildDataHubAnswerPreamble(
  kind: "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT",
  trace: DataHubBusinessTrace | undefined,
  answerText: string
): DataHubAnswerPreamble | null {
  if (kind !== "ASK_DATA" && kind !== "AGENT") {
    return null;
  }
  if (!trace || !answerText.trim()) {
    return null;
  }

  const sentences = Array.from(
    new Map(
      (trace.queries ?? [])
        .map(querySentence)
        .filter((sentence): sentence is NonNullable<typeof sentence> => Boolean(sentence))
        .map((sentence) => [sentence.text, sentence] as const)
    ).values()
  );
  const knowledge = kind === "AGENT" ? knowledgeSentence(trace) : undefined;
  if (!sentences.length && !knowledge) {
    return null;
  }
  if (
    !sentences.some((sentence) => sentence.explainsOperations)
    && /^\s*[（(【[]?(根据|依据|基于)/.test(answerText)
  ) {
    return null;
  }

  return {
    queries: sentences.slice(0, PREAMBLE_MAX_QUERIES).map((sentence) => sentence.text),
    queryCount: sentences.length,
    ...(knowledge ? { knowledge } : {})
  };
}
