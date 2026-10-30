import { splitDataHubThinkingEnvelope, cleanDataHubThinkingText, cleanDataHubAnswerBlocks } from "./dataHubThinkingEnvelope";
import type {
  DataHubAskDataStatus,
  AskArtifactRef,
  DataHubAskTurn,
  DataHubBusinessConditionNode,
  DataHubBusinessField,
  DataHubBusinessMeasure,
  DataHubBusinessQuery,
  DataHubBusinessQueryBasis,
  DataHubBusinessQueryContext,
  DataHubBusinessTrace,
  DataHubCitationDocument,
  DataHubContentBlock,
  DataHubDataSourceSelected,
  DataHubDoneData,
  DataHubProcessNote,
  DataHubReactStepData,
  DataHubRoutingDecomposeData,
  DataHubStreamEvent,
  DataHubTableColumn,
  DataHubTableResult,
  DataHubToolCallData,
  DataHubToolResultData
} from "@/types/dataHub";
import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import {
  dedupeDataHubAnswerBlocks,
  hasDataHubTextRoles,
  mergeRepeatedAnswerChunk,
  splitDataHubRoleAnswer
} from "@/services/dataHubAnswerDedupe";
import {
  appendDataHubClarification,
  applyDataHubClarificationResponse,
  normalizeDataHubClarification,
  normalizeDataHubClarificationResponse
} from "@/services/dataHubClarification";
import {
  formatDataHubCitationFragment,
  formatDataHubColumnTitle,
  formatDataHubDateTime,
  extractChineseTableName,
  hasHanScript,
  pickHanLabel
} from "@/services/dataHubFormat";

type UnknownRecord = Record<string, unknown>;

const actionLabels: Record<string, string> = {
  route_intent: "意图路由",
  locate_datasource: "定位数据源",
  plan_with_datasource_skill: "查看数据源 Skill 并规划",
  match_skill: "匹配业务语义",
  load_cube_meta: "加载语义模型",
  generate_query: "生成查询",
  execute_query: "执行查询",
  nl2sql_fallback: "SQL 兜底",
  finalize: "完成总结",
  decompose: "问题拆解",
  llm_decision: "Agent 决策"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const text = value.trim();
  if (!text) {
    return value;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function unwrapEventData(value: unknown): unknown {
  const parsed = parseJsonMaybe(value);

  if (isRecord(parsed) && "data" in parsed && typeof parsed.type === "string") {
    return parseJsonMaybe(parsed.data);
  }

  return parsed;
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const data = unwrapEventData(value);

  if (isRecord(data)) {
    return asString(data.text) || asString(data.content) || asString(data.message) || asString(data.summary);
  }

  return "";
}

function readError(value: unknown): { code?: number; message: string } | undefined {
  const data = unwrapEventData(value);

  if (typeof data === "string") {
    return { message: data };
  }

  if (isRecord(data)) {
    const code = typeof data.code === "number" ? data.code : undefined;
    const message =
      asString(data.message) || asString(data.error) || asString(data.errorMsg) || asString(data.summary);

    if (message) {
      return { code, message };
    }
  }

  return undefined;
}

function normalizeColumns(columns: unknown, rows: unknown, annotation?: UnknownRecord): DataHubTableColumn[] {
  const parsedColumns = parseJsonMaybe(columns);
  const parsedRows = parseJsonMaybe(rows);

  if (Array.isArray(parsedColumns) && parsedColumns.length > 0) {
    return parsedColumns.map((column, index) => {
      if (typeof column === "string") {
        const meta = annotationMember(annotation, column);
        const title = asString(meta?.shortTitle).trim() || asString(meta?.fieldComment).trim() || column;
        return { key: column, title: formatDataHubColumnTitle(title, column) };
      }

      if (isRecord(column)) {
        const key =
          asString(column.name) ||
          asString(column.key) ||
          asString(column.field) ||
          asString(column.title) ||
          `col_${index + 1}`;
        const meta = annotationMember(annotation, key);
        const rawTitle =
          asString(column.shortTitle).trim() || asString(meta?.shortTitle).trim() ||
          asString(column.fieldComment).trim() || asString(meta?.fieldComment).trim() ||
          pickHanLabel([
            asString(column.comment),
            asString(column.alias),
            asString(column.label),
            asString(column.shortTitle),
            asString(column.title),
            asString(column.tableTitle),
            asString(column.name)
          ]) ||
          asString(column.label) ||
          asString(column.title) ||
          asString(column.name) ||
          key;
        const title = formatDataHubColumnTitle(rawTitle, key);
        const type = asString(column.type) || undefined;
        return { key, title, type };
      }

      const key = `col_${index + 1}`;
      return { key, title: key };
    });
  }

  if (Array.isArray(parsedRows) && parsedRows.length > 0) {
    if (isRecord(parsedRows[0])) {
      return Object.keys(parsedRows[0]).map((key) => ({
        key,
        title: formatDataHubColumnTitle(key, key)
      }));
    }

    if (Array.isArray(parsedRows[0])) {
      return parsedRows[0].map((_, index) => {
        const key = `col_${index + 1}`;
        return { key, title: key };
      });
    }
  }

  return [];
}

function normalizeRows(rows: unknown, columns: DataHubTableColumn[]): Record<string, unknown>[] {
  const parsedRows = parseJsonMaybe(rows);

  if (!Array.isArray(parsedRows)) {
    return [];
  }

  return parsedRows.map((row) => {
    if (Array.isArray(row)) {
      const effectiveColumns =
        columns.length > 0
          ? columns
          : row.map((_, index) => {
              const key = `col_${index + 1}`;
              return { key, title: key };
            });

      return effectiveColumns.reduce<Record<string, unknown>>((result, column, index) => {
        result[column.key] = row[index];
        return result;
      }, {});
    }

    if (isRecord(row)) {
      return row;
    }

    return { value: row };
  });
}

function recordFromJson(value: unknown): UnknownRecord | undefined {
  const parsed = parseJsonMaybe(value);
  return isRecord(parsed) ? parsed : undefined;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function findNestedRecord(value: unknown, keys: string[]): UnknownRecord | undefined {
  const record = recordFromJson(value);
  if (!record) return undefined;
  for (const key of keys) {
    const nested = recordFromJson(record[key]);
    if (nested) return nested;
  }
  const result = recordFromJson(record.result) ?? recordFromJson(record.output);
  return result ? findNestedRecord(result, keys) : undefined;
}

function findQueryRecord(value: unknown): UnknownRecord | undefined {
  const record = recordFromJson(value);
  if (!record) return undefined;
  if (["measures", "dimensions", "timeDimensions", "filters"].some((key) => key in record)) {
    return record;
  }
  const direct = findNestedRecord(record, ["query", "cubeQuery", "cube_query", "cubeQueryJson"]);
  if (direct) return direct;
  const result = recordFromJson(record.result) ?? recordFromJson(record.output);
  return result ? findQueryRecord(result) : undefined;
}

function annotationFor(value: unknown): UnknownRecord | undefined {
  return findNestedRecord(value, ["annotation"]);
}

function annotationMember(
  annotation: UnknownRecord | undefined,
  member: string
): UnknownRecord | undefined {
  for (const key of ["measures", "dimensions", "timeDimensions"]) {
    const bucket = recordFromJson(annotation?.[key]);
    const meta = recordFromJson(bucket?.[member]);
    if (meta) return meta;
  }
  return undefined;
}

/** 「合同主数据清单，记录…。合同甲方单位名称」这类带表注释的标题，末段才是字段名。 */
function trailingFieldName(value: string | undefined) {
  const text = value?.trim();
  if (!text) return undefined;
  const tail = text.split(/[。;；]/).map((part) => part.trim()).filter(Boolean).pop();
  return tail && tail !== text && tail.length <= 24 && hasHanScript(tail) ? tail : undefined;
}

/**
 * 取字段的业务名。宁可返回空让调用方整条省略，
 * 也不要写出「业务字段 1」这种读者无法核对的占位名。
 */
function friendlyMemberLabel(
  member: string,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord
) {
  const column = columns.find((candidate) => candidate.key === member);
  const meta = annotationMember(annotation, member);
  const titles = [
    asString(meta?.shortTitle),
    asString(meta?.title),
    asString(meta?.label),
    column?.title
  ];
  const candidate =
    pickHanLabel(titles) ||
    titles.map(trailingFieldName).find(Boolean) ||
    column?.title ||
    asString(meta?.shortTitle) ||
    asString(meta?.title);
  const formatted = candidate ? formatDataHubColumnTitle(candidate, member) : "";
  if (formatted && !/[._]/.test(formatted)) return formatted;
  const mapped = formatDataHubColumnTitle(member, member);
  return mapped && !/[._]/.test(mapped) ? mapped : "";
}

function stringMembers(value: unknown) {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

/** 与后端 BusinessColumnLabels.memberKeyFallback 一致：叫不出业务名时去掉 cube 前缀。 */
function memberKeyFallback(member: string) {
  const text = member.trim();
  const dot = text.lastIndexOf(".");
  return dot >= 0 && dot < text.length - 1 ? text.slice(dot + 1) : text;
}

/** 与后端 BusinessColumnLabels.shorten 一致：首个句读之前是名称，之后是说明。 */
function shortBusinessName(label: string) {
  const text = label.trim();
  return text.split(/[，。；;,.]/)[0].trim() || text;
}

/**
 * 查询依据里的字段名。和叙事不同，这里宁可露出成员名也不丢条件：
 * 读者要核对的正是「按什么筛、按什么算」，少一条就说不清数字从哪来。
 */
function basisField(
  member: string,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord,
  aliases: string[] = []
): DataHubBusinessField {
  const label = [...aliases, member]
    .map((key) => friendlyMemberLabel(key, columns, annotation))
    .find(Boolean);
  return { member, field: label ? shortBusinessName(label) : memberKeyFallback(member) };
}

function segmentField(member: string, annotation?: UnknownRecord): DataHubBusinessField {
  const meta = recordFromJson(recordFromJson(annotation?.segments)?.[member]);
  const label = pickHanLabel([asString(meta?.shortTitle), asString(meta?.title)])
    || asString(meta?.shortTitle).trim();
  return { member, field: label ? shortBusinessName(label) : memberKeyFallback(member) };
}

/** Cube 过滤操作符的中文说法；{v} 处放值，没有 {v} 的操作符不带值。 */
const conditionTemplates: Record<string, string> = {
  equals: "等于{v}",
  notEquals: "不等于{v}",
  contains: "包含{v}",
  notContains: "不包含{v}",
  startsWith: "以{v}开头",
  notStartsWith: "不以{v}开头",
  endsWith: "以{v}结尾",
  notEndsWith: "不以{v}结尾",
  gt: "大于{v}",
  gte: "大于等于{v}",
  lt: "小于{v}",
  lte: "小于等于{v}",
  set: "不为空",
  notSet: "为空",
  inDateRange: "在{v}之间",
  notInDateRange: "不在{v}之间",
  beforeDate: "早于{v}",
  beforeOrOnDate: "不晚于{v}",
  afterDate: "晚于{v}",
  afterOrOnDate: "不早于{v}",
  measureFilter: "满足指标预设条件"
};

const relativeDateRanges: Record<string, string> = {
  today: "今天",
  yesterday: "昨天",
  tomorrow: "明天",
  "this week": "本周",
  "this month": "本月",
  "this quarter": "本季度",
  "this year": "今年",
  "last week": "上周",
  "last month": "上月",
  "last quarter": "上季度",
  "last year": "去年",
  "next week": "下周",
  "next month": "下月",
  "next quarter": "下季度",
  "next year": "明年"
};

const relativeDateUnits: Record<string, string> = {
  day: "天",
  week: "周",
  month: "个月",
  quarter: "个季度",
  year: "年"
};

/** Cube 的相对区间（this month、last 30 days）换成中文；认不出就返回 undefined。 */
function relativeDateRange(value: string) {
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (relativeDateRanges[text]) return relativeDateRanges[text];
  const rolling = text.match(/^(last|next) (\d+) (day|week|month|quarter|year)s?$/);
  return rolling
    ? `${rolling[1] === "last" ? "最近" : "未来"} ${rolling[2]} ${relativeDateUnits[rolling[3]]}`
    : undefined;
}

/** 整日边界只留日期：「2026-03-31T23:59:59.999」读作 3 月 31 日当天。 */
function readableConditionValue(value: string) {
  const text = value.trim();
  const endOfDay = text.match(/^(\d{4}-\d{2}-\d{2})[T ]23:59:59(?:\.9+)?$/);
  return endOfDay ? endOfDay[1] : formatDataHubDateTime(text);
}

/**
 * 把一条 Cube 条件翻成中文短语。plain 给回答末尾的查询依据（「小于 60」「以 采购 开头」），
 * quoted 是查询过程面板沿用的写法（「小于“60”」），前面直接接字段名。
 */
export function describeDataHubCondition(
  operator: string,
  values: string[],
  style: "plain" | "quoted" = "plain"
) {
  const plain = style === "plain";
  const items = values
    .map((value) => (plain ? readableConditionValue(value) : value.trim()))
    .filter(Boolean);
  const isDateRange = operator === "inDateRange" || operator === "notInDateRange";
  const negated = operator === "notInDateRange";
  let text: string;
  if (isDateRange && items.length === 1) {
    const relative = relativeDateRange(items[0]);
    if (relative) {
      if (plain) return negated ? `${relative}以外` : relative;
      return `${negated ? "不在" : "在"}“${relative}”内`;
    }
    const fromTo = items[0].match(/^from\s+(.+?)\s+to\s+(.+)$/i);
    if (!fromTo) {
      return plain
        ? `${negated ? "不在" : "在"} ${items[0]} 范围内`
        : `${negated ? "不在" : "在"}“${items[0]}”范围内`;
    }
    const [, from, to] = fromTo;
    text = plain
      ? `${readableConditionValue(from)} 至 ${readableConditionValue(to)}`
      : `${from} 至 ${to}`;
  } else if (isDateRange && items.length > 1) {
    text = `${items[0]} 至 ${items[1]}`;
  } else {
    const shown = items.slice(0, plain ? 5 : 6).join("、");
    text = plain && items.length > 5 ? `${shown} 等 ${items.length} 个值` : shown;
  }
  const template = conditionTemplates[operator] ?? "符合{v}";
  if (!template.includes("{v}") || !text) return template.replace("{v}", "");
  return plain
    ? template.replace("{v}", ` ${text} `).replace(/\s+/g, " ").trim()
    : template.replace("{v}", `“${text}”`);
}

function filterDescriptions(
  value: unknown,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => filterDescriptions(item, columns, annotation));
  }
  const record = recordFromJson(value);
  if (!record) return [];
  for (const key of ["and", "or"]) {
    if (Array.isArray(record[key])) {
      const children = filterDescriptions(record[key], columns, annotation);
      return children.length
        ? [`${key === "and" ? "同时满足" : "满足任一"}：${children.join("；")}`]
        : [];
    }
  }
  const member = asString(record.member) || asString(record.dimension);
  if (!member) return [];
  const label = friendlyMemberLabel(member, columns, annotation);
  // 查询过程面板要的是人话：叫不出业务名的条件写出来也没法核对，整条省略。
  if (!label) return [];
  return [`${label}${describeDataHubCondition(asString(record.operator), filterValues(record), "quoted")}`];
}

function filterValues(record: UnknownRecord) {
  return Array.isArray(record.values)
    ? record.values.map(asString).filter(Boolean)
    : [asString(record.value)].filter(Boolean);
}

/** 查询依据要的是每一条条件，连同 and / or 的嵌套关系一起保留。 */
function basisConditions(
  value: unknown,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord
): DataHubBusinessConditionNode[] {
  const parsed = parseJsonMaybe(value);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => basisConditions(item, columns, annotation));
  }
  const record = recordFromJson(parsed);
  if (!record) return [];
  for (const logic of ["and", "or"] as const) {
    if (Array.isArray(record[logic])) {
      const conditions = basisConditions(record[logic], columns, annotation);
      return conditions.length ? [{ logic, conditions }] : [];
    }
  }
  const member = asString(record.member) || asString(record.dimension);
  const operator = asString(record.operator);
  if (!member || !operator) return [];
  return [{ ...basisField(member, columns, annotation), operator, values: filterValues(record) }];
}

function conditionMembers(nodes: DataHubBusinessConditionNode[]): string[] {
  return nodes.flatMap((node) => ("logic" in node ? conditionMembers(node.conditions) : [node.member]));
}

const aggregationLabels: Record<string, string> = {
  count: "计数",
  countdistinct: "去重计数",
  countdistinctapprox: "去重计数",
  sum: "求和",
  avg: "计算平均值",
  min: "取最小值",
  max: "取最大值",
  runningtotal: "累计求和"
};

/** 注解里明写的聚合类型（aggType；旧夹具直接写在 type 上）。Cube 默认只回 type: number。 */
function declaredAggregation(meta?: UnknownRecord) {
  return [meta?.aggType, meta?.aggregation, meta?.type]
    .map((value) => aggregationLabels[asString(value).toLowerCase().replace(/[\s_-]/g, "")])
    .find(Boolean) ?? "";
}

/** 只认 count、sum、total 这类命名约定，猜不出宁可返回空串。 */
function guessedAggregation(member: string) {
  const name = member.slice(member.lastIndexOf(".") + 1).toLowerCase();
  if (/countdistinct|count_distinct|distinct/.test(name)) return "去重计数";
  if (/count/.test(name)) return "计数";
  if (/sum|total/.test(name)) return "求和";
  if (/avg|average|mean/.test(name)) return "计算平均值";
  if (/\bmin\b|minimum/.test(name)) return "取最小值";
  if (/\bmax\b|maximum/.test(name)) return "取最大值";
  return "";
}

/** Cube 的 SQL 别名是「cube__member」（驼峰转下划线、点号换成双下划线），比较前两边都去掉下划线。 */
function normalizedMemberKey(member: string) {
  const [cube = "", name = ""] = member.split(".");
  return `${cube}.${name}`.replace(/_/g, "").toLowerCase();
}

/** 别名前面、同一层括号里的那段表达式，也就是这个成员在 SELECT 里的算法。 */
function selectExpressionBefore(sql: string, end: number) {
  let depth = 0;
  let start = end;
  for (; start > 0; start -= 1) {
    const char = sql[start - 1];
    if (char === ")") {
      depth += 1;
    } else if (char === "(") {
      if (depth === 0) break;
      depth -= 1;
    } else if (char === "," && depth === 0) {
      break;
    }
  }
  const expression = sql.slice(start, end);
  const lastSelect = expression.match(/\bselect\b(?:\s+distinct\b)?(?![\s\S]*\bselect\b)/i);
  return (lastSelect?.index === undefined
    ? expression
    : expression.slice(lastSelect.index + lastSelect[0].length))
    .replace(/\s+as\s*$/i, "")
    .trim();
}

/** 表达式整体就是一次聚合（外面至多套 round/coalesce/类型转换）时返回它的种类，否则返回 undefined。 */
function singleAggregation(expression: string) {
  const calls = Array.from(expression.matchAll(/\b(count|sum|avg|min|max)\s*\(\s*(distinct\b)?/gi));
  if (calls.length !== 1) return undefined;
  const [call] = calls;
  const start = call.index ?? 0;
  let depth = 0;
  let end = start + call[0].length - 1;
  for (; end < expression.length; end += 1) {
    if (expression[end] === "(") depth += 1;
    else if (expression[end] === ")" && --depth === 0) break;
  }
  // sum(a) / sum(b)、sum(x) * 100 这类计算指标已不是单纯的求和，交给其他线索判断。
  const outside = `${expression.slice(0, start)} ${expression.slice(end + 1)}`;
  if (/[-+*/%]|\|\||\bcase\b/i.test(outside)) return undefined;
  const name = call[1].toLowerCase();
  return name === "count" && call[2] ? "countdistinct" : name;
}

/**
 * 从 Cube 生成的 SQL 里读出每个度量真正用的聚合函数：注解只回 type: number，
 * 名字又未必带 sum/count，而 SQL 是实际执行的算法。表达式整体是一次聚合才采信；
 * 比率、混算等计算指标记成空串，表示 SQL 已说明它不是单一聚合，也不再按名字猜。
 */
function sqlMeasureAggregations(sql: string) {
  const found = new Map<string, Set<string>>();
  const aliases = /(?:"([A-Za-z_]\w*?__\w+)"|`([A-Za-z_]\w*?__\w+)`|\b([A-Za-z_]\w*?__\w+)\b)(?=\s*(?:,|\bfrom\b))/gi;
  for (const match of sql.matchAll(aliases)) {
    const alias = match[1] ?? match[2] ?? match[3] ?? "";
    const expression = selectExpressionBefore(sql, match.index ?? 0);
    if (/\b(?:from|where|group|order|having|join|union)\b/i.test(expression)) continue;
    if (!/\b(?:count|sum|avg|min|max)\s*\(/i.test(expression)) continue;
    const separator = alias.indexOf("__");
    const key = normalizedMemberKey(`${alias.slice(0, separator)}.${alias.slice(separator + 2)}`);
    const known = found.get(key) ?? new Set<string>();
    // 认不出的也占一个位置，同一成员的别名多次出现时不会被另一处的单一聚合盖过。
    known.add(singleAggregation(expression) ?? "");
    found.set(key, known);
  }
  return new Map(Array.from(found, ([key, kinds]) => {
    const [kind] = Array.from(kinds);
    return [key, kinds.size === 1 && kind ? aggregationLabels[kind] : ""] as const;
  }));
}

/** 聚合方式按可信度取：注解明写的 → SQL 里实际执行的 → 命名约定；都没有就空着，不硬猜。 */
function measureAggregation(
  member: string,
  meta: UnknownRecord | undefined,
  sqlAggregations: Map<string, string>
) {
  const fromSql = sqlAggregations.get(normalizedMemberKey(member));
  return declaredAggregation(meta) || (fromSql ?? guessedAggregation(member));
}

function businessTerms(meta?: UnknownRecord) {
  const value = meta?.businessTerms ?? meta?.synonyms ?? meta?.aliases;
  return Array.isArray(value) ? value.map(asString).filter(Boolean).slice(0, 6) : [];
}

function timeDescriptions(
  value: unknown,
  columns: DataHubTableColumn[],
  annotation?: UnknownRecord
) {
  const granularityLabels: Record<string, string> = {
    day: "日",
    week: "周",
    month: "月",
    quarter: "季度",
    year: "年"
  };
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = recordFromJson(item);
    const member = asString(record?.dimension) || asString(item);
    if (!member) return [];
    const label = friendlyMemberLabel(member, columns, annotation);
    if (!label) return [];
    const range = Array.isArray(record?.dateRange)
      ? record.dateRange.map(asString).filter(Boolean).join(" 至 ")
      : asString(record?.dateRange);
    const granularity = asString(record?.granularity);
    const granularityLabel = granularityLabels[granularity.toLowerCase()] || granularity;
    return [`${label}${range ? `：${range}` : ""}${granularityLabel ? `（按${granularityLabel}）` : ""}`];
  });
}

/** Cube 的 order 有三种写法：{成员: 方向}、[[成员, 方向]]，以及 /load 回显的 [{ id, desc }]。 */
function querySorts(value: unknown) {
  const order = parseJsonMaybe(value);
  const entries = (Array.isArray(order) ? order : [order]).flatMap((item): Array<[string, string]> => {
    if (Array.isArray(item)) return [[asString(item[0]), asString(item[1])]];
    const record = recordFromJson(item);
    if (!record) return [];
    if (typeof record.id === "string") return [[record.id, record.desc === true ? "desc" : "asc"]];
    return Object.entries(record).map(([member, direction]) => [member, asString(direction)]);
  });
  return entries.flatMap(([member, direction]) => {
    const normalized = direction.toLowerCase();
    return member && (normalized === "asc" || normalized === "desc")
      ? [{ member, direction: normalized as "asc" | "desc" }]
      : [];
  });
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(asString(value));
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

/** Cube 在查询没写 limit 时会自动补上 10000，那不是这次查询的意图，不写进依据。 */
const cubeDefaultRowLimit = 10_000;

/** 按 Cube 约定「cube 标题 + 空格 + 成员短标题」反推表业务名，截取规则同后端 BusinessColumnLabels.shorten。 */
function cubeBusinessName(cube: string, annotation?: UnknownRecord) {
  const metas = ["measures", "dimensions", "timeDimensions", "segments"].flatMap((bucket) =>
    Object.entries(recordFromJson(annotation?.[bucket]) ?? {})
      .filter(([member]) => member.split(".")[0] === cube)
      .map(([, meta]) => recordFromJson(meta)));
  for (const meta of metas) {
    const title = asString(meta?.title).trim();
    const shortTitle = asString(meta?.shortTitle).trim();
    if (!title || !shortTitle || title === shortTitle || !title.endsWith(shortTitle)) continue;
    const comment = title.slice(0, -shortTitle.length).replace(/[\s|｜·:：/—-]+$/u, "").trim();
    if (comment) return shortBusinessName(comment);
  }
  // 注解兜底：「微信机器人项目信息表 项目名称」这类标题本身就带着表名。
  return metas.map((meta) => extractChineseTableName(asString(meta?.title))).find(Boolean);
}

function queryBasis(
  query: UnknownRecord,
  columns: DataHubTableColumn[],
  annotation: UnknownRecord | undefined,
  context: { sql: string; tableLabel?: string }
): DataHubBusinessQueryBasis {
  const sqlAggregations = sqlMeasureAggregations(context.sql);
  const measures = stringMembers(query.measures).map((member) => ({
    ...basisField(member, columns, annotation),
    aggregation: measureAggregation(member, annotationMember(annotation, member), sqlAggregations)
  }));
  const groups: DataHubBusinessQueryBasis["groups"] = stringMembers(query.dimensions)
    .map((member) => basisField(member, columns, annotation));
  // 时间范围是整条查询的口径，读起来放在其他筛选前面。
  const timeConditions: DataHubBusinessQueryBasis["conditions"] = [];
  for (const item of Array.isArray(query.timeDimensions) ? query.timeDimensions : []) {
    const record = recordFromJson(item);
    const member = asString(record?.dimension);
    if (!record || !member) continue;
    const granularity = asString(record.granularity);
    const field = basisField(member, columns, annotation, granularity ? [`${member}.${granularity}`] : []);
    const range = Array.isArray(record.dateRange)
      ? record.dateRange.map(asString).filter(Boolean)
      : [asString(record.dateRange)].filter(Boolean);
    if (range.length) timeConditions.push({ ...field, operator: "inDateRange", values: range });
    if (granularity) groups.push({ ...field, granularity });
  }
  const conditions = [...timeConditions, ...basisConditions(query.filters, columns, annotation)];
  const segments = stringMembers(query.segments).map((member) => segmentField(member, annotation));
  const sorts = querySorts(query.order).map(({ member, direction }) => ({
    ...basisField(member, columns, annotation),
    direction
  }));
  // 只有「cube.成员」形式的成员能说明它属于哪张表；没有 cube 前缀的旧夹具退回表级注释。
  const cubes = uniqueStrings([
    ...measures.map((item) => item.member),
    ...groups.map((item) => item.member),
    ...conditionMembers(conditions),
    ...segments.map((item) => item.member)
  ].filter((member) => member.includes(".")).map((member) => member.split(".")[0]));
  const tables = cubes.length
    ? cubes.map((cube) => {
        const table = cubeBusinessName(cube, annotation) ?? (cubes.length === 1 ? context.tableLabel : undefined);
        return table ? { cube, table } : { cube };
      })
    : context.tableLabel ? [{ cube: "", table: context.tableLabel }] : [];
  const limit = positiveInteger(query.limit);
  const offset = positiveInteger(query.offset);
  return {
    tables,
    conditions,
    groups,
    measures,
    segments,
    sorts,
    ...(limit && limit < cubeDefaultRowLimit ? { limit } : {}),
    ...(offset ? { offset } : {}),
    ...(query.ungrouped === true ? { ungrouped: true } : {})
  };
}

function normalizeBusinessQueryContext(
  value: unknown,
  columns: DataHubTableColumn[]
): DataHubBusinessQueryContext | undefined {
  const query = findQueryRecord(value);
  const annotation = annotationFor(value);
  if (!query && !annotation) return undefined;

  const outer = recordFromJson(value);
  const nested = recordFromJson(outer?.result) ?? recordFromJson(outer?.output);
  const sql = asString(outer?.sql) || asString(nested?.sql);
  const sqlAggregations = sqlMeasureAggregations(sql);
  const measures = stringMembers(query?.measures);
  const dimensions = stringMembers(query?.dimensions);
  const times = timeDescriptions(query?.timeDimensions, columns, annotation);
  const measureLabels = measures.map((member) => friendlyMemberLabel(member, columns, annotation));
  const dimensionLabels = dimensions.map((member) => friendlyMemberLabel(member, columns, annotation));
  const measurePlans = measures.flatMap((member, index) => {
    const label = measureLabels[index];
    return label
      ? [{
          label,
          aggregation: measureAggregation(member, annotationMember(annotation, member), sqlAggregations)
            || "按企业语义模型定义计算"
        }]
      : [];
  });
  const calculationEntries = measurePlans.map((plan) => `${plan.label}：${plan.aggregation}`);
  const synonymEntries = measures.concat(dimensions).flatMap((member) => {
    const terms = businessTerms(annotationMember(annotation, member));
    const label = friendlyMemberLabel(member, columns, annotation);
    return terms.length && label ? [`${label}：${terms.join("、")}`] : [];
  });
  const cubeNames = new Set(
    measures.concat(dimensions).concat(
      Array.isArray(query?.timeDimensions)
        ? query.timeDimensions.map((item) => asString(recordFromJson(item)?.dimension)).filter(Boolean)
        : []
    ).map((member) => member.split(".")[0]).filter(Boolean)
  );
  const rawUsedAssets = outer?.usedAssets ?? nested?.usedAssets;
  const usedAssets = Array.isArray(rawUsedAssets) ? rawUsedAssets : [];
  const assetLabels = usedAssets.flatMap((asset) => {
    const record = recordFromJson(asset);
    const label = pickHanLabel([
      asString(record?.businessName),
      asString(record?.displayName),
      asString(record?.assetTitle),
      asString(record?.assetName)
    ]);
    return label ? [label] : [];
  });
  const tableLabels = columns.flatMap((column) => {
    const label = extractChineseTableName(asString(annotationMember(annotation, column.key)?.title))
      || extractChineseTableName(column.title) || extractChineseTableName(column.key);
    return label ? [label] : [];
  });
  const dataTables = uniqueStrings([...assetLabels, ...tableLabels]);
  const filters = uniqueStrings(filterDescriptions(query?.filters, columns, annotation));
  // 表级注释只作兜底；物理表名（tableName、usedAssets.assetName）不进查询依据。
  const tableLabel = [outer?.tableComment, outer?.tableTitle, outer?.comment, outer?.remark,
    outer?.caption, outer?.entityName, outer?.modelName]
    .map(asString)
    .find(hasHanScript);

  return {
    dataTables,
    fields: uniqueStrings([...measureLabels, ...dimensionLabels, ...columns.map((column) => column.title)]),
    filters,
    calculations: uniqueStrings([
      ...calculationEntries,
      ...querySorts(query?.order).flatMap(({ member, direction }) => {
        const label = friendlyMemberLabel(member, columns, annotation);
        return label ? [`按${label}${direction === "asc" ? "升序" : "降序"}排列`] : [];
      })
    ]),
    relationships: query
      ? [cubeNames.size > 1
          ? "多个业务主题按已发布语义模型关系关联"
          : "单一业务主题，本次没有跨主题关联"]
      : [],
    metricDefinitions: uniqueStrings(measures.map((member, index) => {
      const meta = annotationMember(annotation, member);
      const definition = pickHanLabel([
        asString(meta?.businessDefinition),
        asString(meta?.definition),
        asString(meta?.businessDescription),
        asString(meta?.description)
      ]);
      return measureLabels[index]
        ? `${measureLabels[index]}：${definition || "采用企业语义模型中已发布的指标口径"}`
        : "";
    })),
    synonymMappings: uniqueStrings(synonymEntries),
    time: uniqueStrings(times),
    query: query
      ? {
          table: dataTables[0],
          dimensions: uniqueStrings(dimensionLabels),
          measures: measurePlans,
          filters,
          time: uniqueStrings(times),
          basis: queryBasis(query, columns, annotation, {
            sql,
            tableLabel: tableLabel ? shortBusinessName(tableLabel) : undefined
          })
        }
      : undefined
  };
}

function columnsFromAnnotation(value: unknown) {
  const annotation = recordFromJson(value);
  if (!annotation) return undefined;
  const columns = ["measures", "dimensions", "timeDimensions"].flatMap((key) => {
    const bucket = recordFromJson(annotation[key]);
    return bucket
      ? Object.entries(bucket).map(([name, meta]) => ({ name, ...recordFromJson(meta) }))
      : [];
  });
  return columns.length ? columns : undefined;
}

function tableCommentFromAnnotation(value: unknown) {
  const annotation = recordFromJson(value);
  if (!annotation) return undefined;

  for (const key of ["measures", "dimensions", "timeDimensions"]) {
    const bucket = recordFromJson(annotation[key]);
    if (!bucket) continue;

    for (const value of Object.values(bucket)) {
      const meta = recordFromJson(value);
      const title = asString(meta?.title).trim();
      const shortTitle = asString(meta?.shortTitle).trim();
      if (!title || !shortTitle || title === shortTitle || !title.endsWith(shortTitle)) continue;

      const comment = title.slice(0, -shortTitle.length).replace(/[\s|｜·:：/—-]+$/u, "").trim();
      if (hasHanScript(comment)) return comment;
    }
  }

  return undefined;
}

export function normalizeDataHubTableResult(input: unknown, tableIndex = 0): DataHubTableResult | null {
  const data = unwrapEventData(input);
  const candidate =
    isRecord(data) && (data.type === "table" || data.type === "result") && "data" in data ? data.data : data;
  const parsedCandidate = parseJsonMaybe(candidate);

  if (Array.isArray(parsedCandidate)) {
    const columns = normalizeColumns(undefined, parsedCandidate);
    return {
      columns,
      rows: normalizeRows(parsedCandidate, columns),
      totalRows: parsedCandidate.length,
      totalRowsKnown: false,
      tableIndex
    };
  }

  if (!isRecord(parsedCandidate)) {
    return null;
  }

  const nested = parsedCandidate.result ?? parsedCandidate.payload;
  if (!("columns" in parsedCandidate) && !("rows" in parsedCandidate) && nested) {
    const parsedNested = parseJsonMaybe(nested);
    return normalizeDataHubTableResult(isRecord(parsedNested) || Array.isArray(parsedNested)
      ? { ...parsedCandidate, result: undefined, payload: undefined,
          ...(isRecord(parsedNested) ? parsedNested : { data: parsedNested }) }
      : parsedNested, tableIndex);
  }

  const rawRows =
    parsedCandidate.rows ?? parsedCandidate.records ?? parsedCandidate.values ?? parsedCandidate.data;
  const columns = normalizeColumns(
    parsedCandidate.columns ?? columnsFromAnnotation(parsedCandidate.annotation),
    rawRows,
    recordFromJson(parsedCandidate.annotation)
  );
  const rows = normalizeRows(rawRows, columns);
  const annotatedTableComment = tableCommentFromAnnotation(parsedCandidate.annotation);

  if (columns.length === 0 && rows.length === 0 && !Array.isArray(parseJsonMaybe(rawRows))) {
    return null;
  }

  const total = [parsedCandidate.totalRows, parsedCandidate.total, parsedCandidate.rowCount]
    .find((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0);

  return {
    columns,
    rows,
    totalRows: total ?? rows.length,
    totalRowsKnown: parsedCandidate.totalRowsKnown === false ? false : total !== undefined,
    datasourceId: typeof parsedCandidate.datasourceId === "string" || typeof parsedCandidate.datasourceId === "number"
      ? parsedCandidate.datasourceId : undefined,
    title: asString(parsedCandidate.title).trim() || undefined,
    usedAssets: Array.isArray(parsedCandidate.usedAssets) ? parsedCandidate.usedAssets.filter(isRecord).map((asset) => ({
      assetId: asString(asset.assetId), assetName: asString(asset.assetName), assetType: asString(asset.assetType)
    })).filter((asset) => asset.assetId && asset.assetName) : undefined,
    groupIndex: typeof parsedCandidate.groupIndex === "number" ? parsedCandidate.groupIndex : undefined,
    groupLabel:
      [
        asString(parsedCandidate.tableComment),
        annotatedTableComment,
        asString(parsedCandidate.tableTitle),
        asString(parsedCandidate.comment),
        asString(parsedCandidate.remark),
        asString(parsedCandidate.caption),
        asString(parsedCandidate.entityName),
        asString(parsedCandidate.modelName),
        asString(parsedCandidate.groupLabel),
        asString(parsedCandidate.tableName)
      ].find(hasHanScript) ||
      asString(parsedCandidate.groupLabel) ||
      asString(parsedCandidate.tableName) ||
      undefined,
    source: asString(parsedCandidate.source) || undefined,
    business: normalizeBusinessQueryContext(parsedCandidate, columns),
    tableIndex
  };
}

function isOrchestrationStatusSummary(summary: string) {
  const text = summary.trim();
  if (!text || text.length > 24 || /[，,；;：:]/.test(text)) {
    return false;
  }
  return /完成/.test(text);
}

/**
 * DataHub 回答显示：正常完成时与平台的终态摘要优先规则一致；
 * 失败时正文仅供回看，调用方仍须保持错误/未完成状态，不能作为完整产物。
 * 正常终态 summary 优先；出错只保留已经收到的公开文本，不能采纳失败终态摘要。
 * Agent 编排的 done.summary 经常只是「均已完成」这类收束状态，不能盖掉流式综合结论。
 */
export function resolveDataHubFinalAnswer(
  summary: unknown,
  streamedContent: unknown,
  hasTerminalError: boolean,
  options: { keepRicherStreamedAnswer?: boolean } = {}
): string {
  const finalSummary = splitDataHubThinkingEnvelope(String(summary ?? "")).answer.trim();
  const streamedText = splitDataHubThinkingEnvelope(String(streamedContent ?? "")).answer.trim();
  if (hasTerminalError) return streamedText;
  if (options.keepRicherStreamedAnswer && streamedText && isOrchestrationStatusSummary(finalSummary)) {
    return streamedText;
  }
  return finalSummary || streamedText;
}

export function getDataHubActionLabel(action?: string): string {
  if (!action) {
    return "执行步骤";
  }

  return actionLabels[action] ?? action;
}

export function getDataHubStatusLabel(status?: string): string {
  if (status === "success") {
    return "完成";
  }

  if (status === "running") {
    return "运行中";
  }

  if (status === "error" || status === "fail") {
    return "失败";
  }

  return status || "处理中";
}

function normalizeReactStep(data: unknown): DataHubReactStepData {
  const record = isRecord(unwrapEventData(data)) ? (unwrapEventData(data) as UnknownRecord) : {};

  return {
    round: typeof record.round === "number" ? record.round : undefined,
    stepNum: typeof record.stepNum === "number" ? record.stepNum : undefined,
    action: asString(record.action),
    stepType: asString(record.stepType),
    status: asString(record.status),
    summary: asString(record.summary),
    content: asString(record.content),
    resultSummary: asString(record.resultSummary),
    reason: asString(record.reason),
    durationMs: typeof record.durationMs === "number" ? record.durationMs : undefined
  };
}

function normalizeToolCall(data: unknown): DataHubToolCallData {
  return isRecord(unwrapEventData(data)) ? (unwrapEventData(data) as DataHubToolCallData) : {};
}

function normalizeToolResult(data: unknown): DataHubToolResultData {
  return isRecord(unwrapEventData(data)) ? (unwrapEventData(data) as DataHubToolResultData) : {};
}

function normalizeDecompose(data: unknown): DataHubRoutingDecomposeData | undefined {
  const record = unwrapEventData(data);

  if (!isRecord(record)) {
    return undefined;
  }

  return {
    executionMode: asString(record.executionMode),
    subQuestions: Array.isArray(record.subQuestions) ? record.subQuestions.map(asString).filter(Boolean) : []
  };
}

function normalizeDone(data: unknown): DataHubDoneData | undefined {
  const record = unwrapEventData(data);

  return isRecord(record) ? (record as DataHubDoneData) : undefined;
}

function normalizeArtifact(data: unknown): AskArtifactRef | undefined {
  const record = unwrapEventData(data);
  if (!isRecord(record)) return undefined;
  const askRunId = asString(record.askRunId);
  const resolvedQuestion = asString(record.resolvedQuestion);
  if (!askRunId) return undefined;
  return {
    askRunId,
    resolvedQuestion,
    canFavorite: record.canFavorite === true
  };
}

/** 追加一段流式文本；新建了块时返回它，并进上一块时返回 undefined。 */
function appendContentBlock(
  blocks: DataHubContentBlock[],
  content: string,
  event: DataHubStreamEvent
): DataHubContentBlock | undefined {
  if (!content) {
    return undefined;
  }

  const previous = blocks[blocks.length - 1];
  const sameModelCall =
    previous &&
    previous.replyId === event.replyId &&
    previous.modelCallIndex === event.modelCallIndex &&
    // 过程说明与正式回答即使同属一次模型调用也不能拼成一段。
    previous.textRole === event.textRole &&
    (event.modelCallIndex !== undefined ||
      (event.replyId === undefined && previous.replyId === undefined));

  if (sameModelCall) {
    // 同一次模型调用还可能在增量之后补发整段全文，直接拼接会把这段话写成两遍。
    previous.content = mergeRepeatedAnswerChunk(previous.content, content) ?? previous.content + content;
    return undefined;
  }

  const block: DataHubContentBlock = {
    content,
    replyId: event.replyId,
    modelCallIndex: event.modelCallIndex,
    ...(event.textRole ? { textRole: event.textRole } : {})
  };
  blocks.push(block);
  return block;
}

/**
 * text_replace：把同 replyId + modelCallIndex 的最近一个正文块换成收敛后的全文并写入 textRole；
 * 历史有缺口找不到时追加一块，正式回答不能丢。缺身份的替换无法定位，直接忽略。
 * 新建了块时返回它。
 */
function replaceContentBlock(
  blocks: DataHubContentBlock[],
  content: string,
  event: DataHubStreamEvent
): DataHubContentBlock | undefined {
  if (!content || !event.replyId?.trim() || event.modelCallIndex === undefined) {
    return undefined;
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.replyId === event.replyId && block.modelCallIndex === event.modelCallIndex) {
      block.content = content;
      if (event.textRole) block.textRole = event.textRole;
      return undefined;
    }
  }

  const block: DataHubContentBlock = {
    content,
    replyId: event.replyId,
    modelCallIndex: event.modelCallIndex,
    ...(event.textRole ? { textRole: event.textRole } : {})
  };
  blocks.push(block);
  return block;
}

function normalizeDataSource(data: unknown): DataHubDataSourceSelected | undefined {
  const record = unwrapEventData(data);
  if (!isRecord(record)) {
    return undefined;
  }

  const datasourceId = record.datasourceId;
  const datasourceName = asString(record.datasourceName);
  if ((typeof datasourceId !== "string" && typeof datasourceId !== "number") || !datasourceName) {
    return undefined;
  }

  return { datasourceId, datasourceName };
}

export function normalizeDataHubCitationEvidence(data: unknown): DataHubCitationDocument["evidenceFragments"] {
  if (!Array.isArray(data)) return undefined;
  const evidence = data.flatMap((item) => {
    if (!isRecord(item) || typeof item.evidenceId !== "string" || !/^e\d+$/.test(item.evidenceId)
      || typeof item.text !== "string" || !item.text.trim()) return [];
    return [{ evidenceId: item.evidenceId, text: formatDataHubCitationFragment(item.text) }];
  });
  return evidence.length ? evidence : undefined;
}

export function normalizeCitationDocument(data: unknown): DataHubCitationDocument | undefined {
  const record = unwrapEventData(data);
  if (!isRecord(record)) {
    return undefined;
  }

  const docId = asString(record.docId).trim();
  const docKey = asString(record.docKey).trim();
  const kbId = asString(record.kbId).trim();
  // docKey 可为空；数字 docId 可直接打开，旧字符串标识仍需 docKey 回退。
  if (!docId || !kbId) {
    return undefined;
  }

  return {
    docId,
    docKey: docKey || undefined,
    kbId,
    kbName: asString(record.kbName).trim() || undefined,
    docName: asString(record.docName).trim() || asString(record.title).trim() || undefined,
    fileName: asString(record.fileName).trim() || undefined,
    chapter:
      asString(record.chapter).trim() ||
      asString(record.sectionName).trim() ||
      asString(record.heading).trim() ||
      undefined,
    pageNumber:
      asString(record.pageNumber).trim() ||
      asString(record.page_number).trim() ||
      asString(record.page).trim() ||
      asString(record.page_idx).trim() ||
      undefined,
    sourceAvailable: record.sourceAvailable !== false && Boolean(docKey || /^\d+$/.test(docId)),
    markdownAvailable:
      typeof record.markdownAvailable === "boolean" ? record.markdownAvailable : undefined,
    evidenceFragments: normalizeDataHubCitationEvidence(record.evidenceFragments),
    fragments: Array.isArray(record.fragments)
      ? record.fragments.map(asString).map(formatDataHubCitationFragment).filter(Boolean)
      : []
  };
}

function businessIntent(turn: DataHubAskTurn, question: string) {
  const event = turn.routingEvents.find((item) => item.type === "routing_intent");
  const record = recordFromJson(event ? getDataHubEventPayload(event) : undefined);
  const routed = [record?.message, record?.summary, record?.intentLabel, record?.intent]
    .map(asString)
    .find((value) => value && (hasHanScript(value) || !/^[a-z0-9_-]+$/i.test(value)));
  return routed || `用户希望：${question}`;
}

function inferredLocation(value: UnknownRecord, fragments: string[]) {
  const blob = [
    asString(value.docName),
    asString(value.fileName),
    ...fragments
  ].filter(Boolean).join(" ");
  const chapter =
    asString(value.chapter) ||
    asString(value.sectionName) ||
    asString(value.heading) ||
    blob.match(/第[\d一二三四五六七八九十百千]+章[^，。\s]*/)?.[0];
  const pageNumber =
    asString(value.pageNumber) ||
    asString(value.page_number) ||
    asString(value.page) ||
    asString(value.page_idx) ||
    blob.match(/第?\s*\d+\s*页/)?.[0];
  return { chapter, pageNumber };
}

function businessDocuments(turn: DataHubAskTurn, supplementalDocuments: unknown[] = []) {
  const raw = [
    ...turn.citationDocuments,
    ...supplementalDocuments,
    ...(Array.isArray(turn.done?.documentResults) ? turn.done.documentResults : [])
  ];
  const seen = new Set<string>();
  return raw.flatMap((item) => {
    const record = recordFromJson(item);
    if (!record) return [];
    const docName =
      asString(record.docName) ||
      asString(record.fileName) ||
      asString(record.title) ||
      asString(record.docKey) ||
      "未命名文档";
    const kbName = asString(record.kbName);
    const fragments = uniqueStrings([
      ...(Array.isArray(record.fragments) ? record.fragments.map(asString) : []),
      asString(record.snippet),
      asString(record.excerpt)
    ]).slice(0, 3);
    const identity = `${asString(record.kbId) || kbName}::${asString(record.docId) || docName}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    const location = inferredLocation(record, fragments);
    return [{
      kbName,
      docName,
      chapter: location.chapter,
      pageNumber: location.pageNumber,
      fragments
    }];
  });
}

/** groupLabel 常是整段表注释，取第一个逗号/句号前的部分当表名。 */
function shortTableName(label: string | undefined) {
  const text = label?.trim();
  if (!text) return undefined;
  const head = text.split(/[，,。;；]/)[0].trim();
  return head && head.length <= 24 ? head : undefined;
}

type DataHubBusinessListKey = {
  [Key in keyof DataHubBusinessQueryContext]-?:
    DataHubBusinessQueryContext[Key] extends string[] ? Key : never;
}[keyof DataHubBusinessQueryContext];

function mergeBusinessContexts(contexts: DataHubBusinessQueryContext[]) {
  const merge = (key: DataHubBusinessListKey) =>
    uniqueStrings(contexts.flatMap((context) => context[key]));
  return {
    dataTables: merge("dataTables"),
    fields: merge("fields"),
    filters: merge("filters"),
    calculations: merge("calculations"),
    relationships: merge("relationships"),
    metricDefinitions: merge("metricDefinitions"),
    synonymMappings: merge("synonymMappings"),
    time: merge("time")
  };
}

/** 业务名和列标题常常对不上（列标题挂着整段表注释），逐级放宽再匹配。 */
function columnForLabel(columns: DataHubTableColumn[], label: string | undefined) {
  const name = label?.trim();
  if (!name) return undefined;
  return (
    columns.find((column) => column.title.trim() === name) ??
    columns.find((column) => trailingFieldName(column.title) === name) ??
    columns.find((column) => column.title.includes(name))
  );
}

function isTimeColumn(column: DataHubTableColumn) {
  return /time|date|timestamp/i.test(column.type ?? "")
    || /日期|月份|时间|年份|季度|周次/.test(column.title);
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = asString(value).replace(/[,，\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
}

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/** 预览值必须自带单位，否则读者还得回表里猜「6」是六条还是六万元。 */
function formatMeasureValue(value: number, measure: DataHubBusinessMeasure) {
  if (measure.aggregation.includes("计数")) return `${formatNumber(value)} 条`;
  const unit = measure.label.match(/（([^（）]{1,6})）\s*$/)?.[1];
  if (unit) return `${formatNumber(value)} ${unit}`;
  // 率/占比在语义层多以小数返回，直接加 % 会把 1.04 写成「1.04%」。
  if (/率|占比|百分比/.test(measure.label)) {
    return Math.abs(value) <= 1 ? `${formatNumber(value * 100)}%` : `${formatNumber(value)}%`;
  }
  return formatNumber(value);
}

/** 结果里最值得复述的几行：按数值降序取前三，时间维度不做预览（排名没有意义）。 */
function resultPreview(
  table: DataHubTableResult,
  query: Omit<DataHubBusinessQuery, "preview" | "rowKind">
): Pick<DataHubBusinessQuery, "preview" | "rowKind"> {
  const measure = query.measures[0];
  const dimensionColumn = columnForLabel(table.columns, query.dimensions[0]);
  const measureColumn = measure ? columnForLabel(table.columns, measure.label) : undefined;
  if (!measure || !measureColumn || !table.rows.length) {
    return query.dimensions.length && table.rows.length ? { rowKind: "list" } : {};
  }
  if (dimensionColumn && !isTimeColumn(dimensionColumn)) {
    const preview = table.rows
      .map((row) => ({
        label: asString(row[dimensionColumn.key]),
        value: numericValue(row[measureColumn.key])
      }))
      .flatMap((entry) => (entry.label && entry.value != null
        ? [{ label: entry.label, value: entry.value }]
        : []))
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)
      .map((entry) => ({ label: entry.label, value: formatMeasureValue(entry.value, measure) }));
    return preview.length ? { preview, rowKind: "grouped" } : { rowKind: "list" };
  }
  const single = !query.dimensions.length && table.totalRows === 1
    ? numericValue(table.rows[0][measureColumn.key])
    : undefined;
  return single == null
    ? {}
    : {
        preview: [{ label: measure.label, value: formatMeasureValue(single, measure) }],
        rowKind: "single"
      };
}

export function buildDataHubBusinessTrace(
  turn: DataHubAskTurn,
  question: string,
  kind: "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT",
  agentNames: string[] = [],
  supplemental: {
    tableResults?: DataHubTableResult[];
    citationDocuments?: unknown[];
    dataSources?: unknown[];
  } = {}
): DataHubBusinessTrace {
  const tableResults = supplemental.tableResults ?? turn.tableResults;
  const columns = tableResults.flatMap((table) => table.columns);
  const contexts = [
    ...tableResults.map((table) => table.business),
    ...turn.toolResults.map((result) => normalizeBusinessQueryContext(result, columns))
  ].filter((context): context is DataHubBusinessQueryContext => Boolean(context));
  const business = mergeBusinessContexts(contexts);
  const knownDataSources = [
    ...turn.dataSources,
    ...(supplemental.dataSources ?? []).map((source) => normalizeDataSource(source))
  ].filter((source): source is DataHubDataSourceSelected => Boolean(source));
  const dataSources = uniqueStrings(knownDataSources.map((source) => source.datasourceName));
  const dataSourceNames = new Map(knownDataSources.map((source) => [String(source.datasourceId), source.datasourceName]));
  // 表带着 datasourceId 就按 id 对名字；对不上宁可空着。
  // 表没带 id 时，只有整轮只选过一个数据源才归到它名下：多个数据源的返回顺序不能证明表的归属。
  const dataSourceFor = (named: string | undefined, datasourceId?: string | number) =>
    named || (datasourceId != null
      ? dataSourceNames.get(String(datasourceId))
      : dataSources.length === 1 ? dataSources[0] : undefined);
  const documents = businessDocuments(turn, supplemental.citationDocuments);
  const knowledgeBases = uniqueStrings(documents.map((document) => document.kbName));
  const dataTables = business.dataTables.length
    ? business.dataTables
    : dataSources.map((source) => `${source}中的业务数据`);
  // Cube 只给查询里选中的成员配注解，只出现在筛选里的字段没有中文名；
  // 同一轮别的结果表若正好选中过它（或它所在的表），借来补名，仍叫不出的保留成员名。
  const memberNames = new Map<string, string>();
  const cubeTables = new Map<string, string>();
  for (const table of tableResults) {
    const basis = table.business?.query?.basis;
    for (const column of table.columns) {
      if (hasHanScript(column.title) && !memberNames.has(column.key)) {
        memberNames.set(column.key, shortBusinessName(column.title));
      }
    }
    for (const item of [...(basis?.groups ?? []), ...(basis?.measures ?? []), ...(basis?.sorts ?? [])]) {
      if (item.field !== memberKeyFallback(item.member) && !memberNames.has(item.member)) {
        memberNames.set(item.member, item.field);
      }
    }
    for (const item of basis?.tables ?? []) {
      if (item.cube && item.table && !cubeTables.has(item.cube)) cubeTables.set(item.cube, item.table);
    }
  }
  const namedField = <Field extends DataHubBusinessField>(item: Field): Field => {
    const known = item.field === memberKeyFallback(item.member) ? memberNames.get(item.member) : undefined;
    return known ? { ...item, field: known } : item;
  };
  const namedConditions = (nodes: DataHubBusinessConditionNode[]): DataHubBusinessConditionNode[] =>
    nodes.map((node) => ("logic" in node
      ? { ...node, conditions: namedConditions(node.conditions) }
      : namedField(node)));
  const namedBasis = (basis: DataHubBusinessQueryBasis | undefined) => basis
    ? {
        basis: {
          ...basis,
          tables: basis.tables.map((item) => (item.table || !cubeTables.has(item.cube)
            ? item
            : { ...item, table: cubeTables.get(item.cube) })),
          conditions: namedConditions(basis.conditions),
          groups: basis.groups.map(namedField),
          measures: basis.measures.map(namedField),
          segments: basis.segments.map(namedField),
          sorts: basis.sorts.map(namedField)
        }
      }
    : {};
  // 每份结果表一条查询记录；后端没给 Cube Query 时只剩「哪个数据源、多少行」，
  // 也照样成条，叙事再按缺什么少说什么。
  const tableQueries = tableResults.map((table) => {
    const query = {
      dataSource: dataSourceFor(table.business?.query?.dataSource, table.datasourceId),
      table: table.business?.query?.table || shortTableName(table.groupLabel),
      dimensions: table.business?.query?.dimensions ?? [],
      measures: table.business?.query?.measures ?? [],
      filters: table.business?.query?.filters ?? [],
      time: table.business?.query?.time ?? [],
      rows: table.totalRows,
      ...namedBasis(table.business?.query?.basis)
    };
    return { ...query, ...resultPreview(table, query) };
  });
  const queries = tableQueries.length
    ? tableQueries
    : contexts.flatMap((context) => context.query
        ? [{
            ...context.query,
            dataSource: dataSourceFor(context.query.dataSource),
            ...namedBasis(context.query.basis)
          }]
        : []);
  const fields = business.fields.length
    ? business.fields
    : uniqueStrings(columns.map((column) => column.title));
  const questions = turn.decompose?.subQuestions?.length
    ? turn.decompose.subQuestions
    : [question];
  const agents = uniqueStrings(agentNames);
  const fallbackAgent = kind === "ASK_DATA"
    ? "问数智能体"
    : kind === "ASK_KNOWLEDGE"
      ? "问知智能体"
      : kind === "DOCUMENT_LOOKUP"
        ? "找文档智能体"
        : "编排智能体";
  const target = kind === "ASK_DATA"
    ? uniqueStrings([...dataSources, ...dataTables]).join("、") || "企业内可访问数据"
    : kind === "AGENT"
      ? uniqueStrings([...dataSources, ...dataTables, ...knowledgeBases]).join("、") || "企业内可用数据与知识能力"
      : knowledgeBases.join("、") || "企业内可访问知识库";
  const dataTarget = uniqueStrings([...dataSources, ...dataTables]).join("、");
  const knowledgeTarget = knowledgeBases.join("、");
  const rowCount = tableResults.reduce((sum, table) => sum + table.totalRows, 0);
  const steps = uniqueStrings([
    turn.routingEvents.length || turn.decompose || turn.status === "done"
      ? `已理解问题${questions.length > 1 ? `并拆分为 ${questions.length} 个子任务` : ""}`
      : "正在理解问题",
    dataSources.length ? `已确认数据范围：${dataSources.join("、")}` : undefined,
    tableResults.length
      ? `已获得 ${tableResults.length} 份结构化结果，共 ${rowCount} 行`
      : undefined,
    documents.length
      ? `已从 ${knowledgeBases.length} 个知识库复核 ${documents.length} 份文档`
      : undefined,
    turn.assistantContent || turn.status === "done" ? "已汇总并复核最终结果" : undefined
  ]);
  const hasDataQuery = tableResults.length > 0 || contexts.length > 0;
  const numericFields = uniqueStrings(columns
    .filter((column) => /int|float|double|decimal|number|numeric|count|ratio|percent/i.test(column.type ?? ""))
    .map((column) => column.title));

  return {
    intent: businessIntent(turn, question),
    tasks: questions.map((taskQuestion, index) => {
      const agentName = agents[index] || fallbackAgent;
      const taskIdentity = `${agentName} ${taskQuestion}`;
      const taskTarget = /知识|制度|政策|文档|问知/.test(taskIdentity)
        ? knowledgeTarget
        : /数据|指标|统计|问数/.test(taskIdentity)
          ? dataTarget
          : "";
      return {
        id: `task-${index + 1}`,
        agentName,
        question: taskQuestion,
        target: taskTarget || target
      };
    }),
    steps,
    dataSources,
    dataTables,
    fields,
    filters: business.filters.length
      ? business.filters
      : hasDataQuery ? ["本次未返回可复核的筛选条件"] : [],
    calculations: business.calculations.length
      ? business.calculations
      : hasDataQuery ? ["本次未返回可复核的计算规则"] : [],
    relationships: business.relationships.length
      ? business.relationships
      : hasDataQuery ? ["本次未返回可复核的关联关系"] : [],
    metricDefinitions: business.metricDefinitions.length
      ? business.metricDefinitions
      : numericFields.map((field) => `${field}：采用企业语义模型中已发布的指标口径`),
    synonymMappings: business.synonymMappings.length
      ? business.synonymMappings
      : hasDataQuery ? ["本次未返回可复核的同义词映射"] : [],
    time: uniqueStrings([
      ...business.time,
      asString((turn.done as UnknownRecord | undefined)?.dataAsOf)
        ? `数据截至 ${asString((turn.done as UnknownRecord).dataAsOf)}`
        : undefined
    ]),
    documents,
    queries
  };
}

function appendCitationDocument(
  citations: DataHubCitationDocument[],
  citation: DataHubCitationDocument | undefined
) {
  if (!citation) {
    return;
  }

  const identity = `${citation.kbId}::${citation.docId}::${citation.docKey ?? ""}`;
  const existing = citations.find((item) => `${item.kbId}::${item.docId}::${item.docKey ?? ""}` === identity);
  if (existing) {
    existing.fragments = Array.from(new Set([...existing.fragments, ...citation.fragments]));
    const evidence = [...(existing.evidenceFragments ?? []), ...(citation.evidenceFragments ?? [])];
    if (evidence.length) existing.evidenceFragments = Array.from(new Map(evidence.map(item =>
      [JSON.stringify([item.evidenceId, item.text]), item])).values());
    return;
  }

  citations.push(citation);
}

type DataHubTurnContext = {
  sessionId?: string | null;
  chatId?: string | null;
};

export function createDataHubAskTurn(
  question: string,
  events: DataHubStreamEvent[],
  status: DataHubAskDataStatus,
  errorMessage = "",
  context: DataHubTurnContext = {}
): DataHubAskTurn {
  const turn: DataHubAskTurn = {
    question,
    status,
    sessionId: context.sessionId || undefined,
    chatId: context.chatId || undefined,
    assistantContent: "",
    answerBlocks: [],
    thinkingContent: "",
    thinkingBlocks: [],
    infoMessages: [],
    dataSources: [],
    citationDocuments: [],
    routingEvents: [],
    reactSteps: [],
    toolCalls: [],
    toolResults: [],
    tableResults: [],
    chartResults: [],
    clarifications: []
  };
  // 思考块与正文块按到达顺序记一条时间线，「思考过程」据此把分析说明和过程说明交织排列。
  const timeline: DataHubContentBlock[] = [];
  const track = (block: DataHubContentBlock | undefined) => {
    if (block) timeline.push(block);
  };

  for (const event of events) {
    const payload = getDataHubEventPayload(event);
    const isSubagentEvent = Boolean(event.parentSessionId);

    if (!turn.sessionId && !isSubagentEvent && (event.globalSessionId || event.sessionId)) {
      turn.sessionId = event.globalSessionId || event.sessionId;
    }
    if (!turn.chatId && !isSubagentEvent && event.chatId) {
      turn.chatId = event.chatId;
    }

    // DataHub keeps every child execution in its own internal session. Child
    // results are rendered in the sub-agent detail view and never mutate the
    // root answer/result projection.
    if (isSubagentEvent) {
      continue;
    }

    if (event.type.startsWith("routing_") && event.type !== "routing_decompose") {
      turn.routingEvents.push(event);
    }

    if (event.type === "routing_decompose") {
      turn.decompose = normalizeDecompose(payload);
    }

    if (event.type === "react_step") {
      turn.reactSteps.push(normalizeReactStep(payload));
    }

    if (event.type === "tool_call") {
      turn.toolCalls.push(normalizeToolCall(payload));
    }

    if (event.type === "tool_result") {
      turn.toolResults.push(normalizeToolResult(payload));
    }

    if (event.type === "thinking" || event.type === "final_thinking" || event.isThinking) {
      track(appendContentBlock(turn.thinkingBlocks, readText(payload), event));
    } else if (event.type === "content" || event.type === "text") {
      track(appendContentBlock(turn.answerBlocks, readText(payload), event));
    } else if (event.type === "text_replace") {
      track(replaceContentBlock(turn.answerBlocks, readText(payload), event));
    }

    if (event.type === "info" || event.type === "hallucination") {
      const message = readText(payload);
      if (message) {
        turn.infoMessages.push(message);
      }
    }

    if (event.type === "data_source_selected") {
      const dataSource = normalizeDataSource(payload);
      if (
        dataSource &&
        !turn.dataSources.some((item) => String(item.datasourceId) === String(dataSource.datasourceId))
      ) {
        turn.dataSources.push(dataSource);
      }
    }

    if (event.type === "table") {
      const table = normalizeDataHubTableResult(payload, turn.tableResults.length);
      if (table) {
        turn.tableResults.push(table);
      }
    }

    if (event.type === "chart") {
      turn.chartResults.push(payload);
    }

    if (event.type === "done") {
      turn.done = normalizeDone(payload);
    }

    if (event.type === "ask_artifact") {
      turn.artifact = normalizeArtifact(payload);
    }

    /* 受控澄清：Agent 挂在 ask_user 上等用户选，续跑时后端先回一条 response 回填已选。 */
    if (event.type === "clarification") {
      const clarification = normalizeDataHubClarification(payload);
      if (clarification) {
        appendDataHubClarification(turn.clarifications, clarification);
      }
    }

    if (event.type === "clarification_response") {
      const response = normalizeDataHubClarificationResponse(payload);
      if (response) {
        applyDataHubClarificationResponse(turn.clarifications, response);
      }
    }

    if (event.type === "citation_document") {
      appendCitationDocument(turn.citationDocuments, normalizeCitationDocument(payload));
    }

    if (event.type === "error") {
      turn.error = readError(payload);
    }
  }

  for (const citation of turn.done?.citationDocuments ?? []) {
    appendCitationDocument(turn.citationDocuments, normalizeCitationDocument(citation));
  }

  // 清洗、去重会换出新对象，新对象沿用原块在时间线上的位置；不在时间线上的（终态补发）排在最后。
  const positions = new Map<DataHubContentBlock, number>();
  timeline.forEach((block, index) => positions.set(block, index));
  const keepPosition = (block: DataHubContentBlock, source: DataHubContentBlock) => {
    positions.set(block, positions.get(source) ?? timeline.length);
    return block;
  };

  if (turn.done?.thinkingContent) {
    turn.thinkingBlocks.push({ content: turn.done.thinkingContent });
  }
  turn.thinkingBlocks = dedupeDataHubAnswerBlocks(turn.thinkingBlocks.map((block) => keepPosition({
    ...block, content: cleanDataHubThinkingText(block.content)
  }, block)).filter((block) => block.content.trim()));
  turn.thinkingContent = turn.thinkingBlocks.map((block) => block.content).join("\n\n");

  if (errorMessage && !turn.error) {
    turn.error = { message: errorMessage };
  }

  let processTextBlocks: DataHubContentBlock[] = [];
  let envelopeThinking: string;
  if (hasDataHubTextRoles(turn.answerBlocks)) {
    // 新协议：服务端已标明哪段是过程说明、哪段是正式回答，正文只取正式回答。
    const split = splitDataHubRoleAnswer(turn.answerBlocks);
    turn.answerBlocks = split.answer ? [split.answer] : [];
    processTextBlocks = split.process.map(({ source, content }) => keepPosition({ ...source, content }, source));
    envelopeThinking = split.thinking;
  } else {
    // 后端会在增量之外把整段正文再发一遍：结果事件在 replyId 对不上时补发全文，
    // 编排根智能体每结束一次模型调用也整段公开一次。先把同义块收敛成一份，
    // 再据此判定正式回答，流式过程中与终态就都只剩一份正文。
    const envelope = cleanDataHubAnswerBlocks(turn.answerBlocks);
    turn.answerBlocks = dedupeDataHubAnswerBlocks(envelope.blocks);
    envelopeThinking = envelope.thinking;
  }

  const streamedAnswer = turn.answerBlocks.map((block) => block.content).join("");
  const summaryThinking = splitDataHubThinkingEnvelope(String(turn.done?.summary ?? "")).thinking;
  const protocolThinking = Array.from(new Set([envelopeThinking, summaryThinking]
    .map(cleanDataHubThinkingText).filter(Boolean))).join("\n");
  if (protocolThinking && !turn.thinkingContent.includes(protocolThinking)) {
    turn.thinkingBlocks.push({ content: protocolThinking });
    turn.thinkingContent = turn.thinkingBlocks.map((block) => block.content).join("\n");
  }
  const officialAnswer = resolveDataHubFinalAnswer(
    turn.done?.summary,
    streamedAnswer,
    Boolean(turn.error || turn.done?.failed),
    {
      keepRicherStreamedAnswer:
        turn.done?.mode === "agent" || turn.done?.adaptiveTeam === true
    }
  );
  turn.answerBlocks = officialAnswer
    ? officialAnswer === streamedAnswer
      ? turn.answerBlocks
      : [{ content: officialAnswer }]
    : [];
  turn.assistantContent = officialAnswer;
  turn.processNotes = orderProcessNotes(turn.thinkingBlocks, processTextBlocks, positions, timeline.length);

  return turn;
}

/** 分析说明与过程说明按到达顺序合成一列；同一位置时分析说明在前。 */
function orderProcessNotes(
  analysisBlocks: DataHubContentBlock[],
  progressBlocks: DataHubContentBlock[],
  positions: Map<DataHubContentBlock, number>,
  end: number
): DataHubProcessNote[] {
  return [
    ...analysisBlocks.map((block) => ({ kind: "analysis" as const, block })),
    ...progressBlocks.map((block) => ({ kind: "progress" as const, block }))
  ]
    .map((note, order) => ({ ...note, order, position: positions.get(note.block) ?? end }))
    .sort((left, right) => left.position - right.position || left.order - right.order)
    .map(({ kind, block }) => ({ kind, content: block.content }));
}
