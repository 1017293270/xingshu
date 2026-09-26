import type { QueryColumnDefinition, QueryExecution, QueryExecutionOutput } from "@/types/analytics";
import type { DashboardTableColumn } from "@/types/dashboardStudio";

/**
 * 收藏问数的列名清洗：把「cube 描述 + 空格 + 字段名」收成短业务名。
 *
 * ai-service 记录问数产物时取的是 Cube 注解的全称 title，按 Cube 约定是「cube 标题 + 空格 + 成员短标题」；
 * 本项目的 cube 标题是一整段表描述（「合同主数据清单，记录合同编号、名称、年度…」），成员标题也常带说明
 * （「合同编号，合同的业务唯一标识……」）。原样当表头，表头就成了表描述；描述里的「年度」还会让整张表的列
 * 都被判成时间列，指标卡与图表因此取不到数。所以清洗必须发生在列分类与渲染之前。
 *
 * 规则：先剥 cube 标题——同一 cube（列 key 点号前那段）的多列共享同一前缀，取它们公共前缀里最后一个空格为界；
 * 单列时退到「最后一个空格之后」。再按后端 BusinessColumnLabels.shorten 同一规则截到首个句读之前。
 * 完整原文留在 fullTitle 里只作悬浮提示；已清洗过的列按 fullTitle 重算，反复清洗结果不变。
 */

type LabeledColumn = {
  key: string;
  label?: string;
  title?: string;
  fullTitle?: string;
};

export type DashboardColumnDisplayLabel = {
  label: string;
  /** 与 label 不同时才有：清洗前的完整列名。 */
  fullTitle?: string;
};

/** 与后端 BusinessColumnLabels.DESCRIPTION_SEPARATOR 同一组句读：其后都是字段说明。 */
const DESCRIPTION_SEPARATOR = /[，。；;,.]/;
/** Cube 成员键：ContractList.contractName、ContractList.signDate.month。 */
const MEMBER_KEY_PATTERN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;
const TIME_GRANULARITY = new Set(["second", "minute", "hour", "day", "week", "month", "quarter", "year"]);
const CJK_PATTERN = /[㐀-鿿]/;
/** 单列兜底时，空格前那段得像一段中文表描述才剥：带句读，或至少四个字。 */
const MIN_SINGLE_CUBE_TITLE_LENGTH = 4;

function rawLabelOf(column: LabeledColumn) {
  const raw = column.fullTitle ?? (column.label || column.title || column.key);
  return raw.trim() || column.key;
}

function cubeOf(key: string) {
  const dot = key.indexOf(".");
  return dot > 0 ? key.slice(0, dot) : "";
}

function commonPrefix(values: string[]) {
  let prefix = values[0] ?? "";
  for (const value of values.slice(1)) {
    let length = 0;
    while (length < prefix.length && length < value.length && prefix[length] === value[length]) length += 1;
    prefix = prefix.slice(0, length);
    if (!prefix) break;
  }
  return prefix;
}

/** 空格后面紧跟括号说明那只是单位（「合同金额 （万元）」），不是 cube 标题与字段名的分界。 */
function startsWithBracket(text: string) {
  return /^[（(]/.test(text);
}

function stripSingleCubeTitle(raw: string) {
  for (let index = raw.lastIndexOf(" "); index > 0; index = raw.lastIndexOf(" ", index - 1)) {
    const head = raw.slice(0, index).trim();
    const tail = raw.slice(index + 1).trim();
    if (!tail || startsWithBracket(tail)) continue;
    const looksLikeCubeTitle = CJK_PATTERN.test(head)
      && (DESCRIPTION_SEPARATOR.test(head) || head.length >= MIN_SINGLE_CUBE_TITLE_LENGTH);
    return looksLikeCubeTitle ? tail : raw;
  }
  return raw;
}

function stripCubeTitles(columns: readonly LabeledColumn[], raws: string[]) {
  const members = [...raws];
  const stripped = new Set<number>();
  const groups = new Map<string, number[]>();
  columns.forEach((column, index) => {
    const cube = cubeOf(column.key);
    if (cube) groups.set(cube, [...(groups.get(cube) ?? []), index]);
  });

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const prefix = commonPrefix(indexes.map((index) => raws[index]!));
    const boundary = prefix.lastIndexOf(" ");
    if (boundary <= 0) continue;
    const cubeTitle = prefix.slice(0, boundary + 1);
    for (const index of indexes) {
      const member = raws[index]!.slice(cubeTitle.length).trim();
      if (!member) continue;
      members[index] = member;
      stripped.add(index);
    }
  }

  return members.map((member, index) => (stripped.has(index) ? member : stripSingleCubeTitle(member)));
}

function memberKeyLabel(member: string) {
  const segments = member.split(".");
  const last = segments.at(-1) ?? member;
  // 时间维度键带粒度后缀（signDate.month），名字在倒数第二段。
  return segments.length > 2 && TIME_GRANULARITY.has(last.toLowerCase()) ? segments.at(-2)! : last;
}

/** 截在说明里的括号要补齐：「合同金额（万元，含税）」收成「合同金额（万元）」，单位留给指标卡用。 */
function closeBrackets(text: string) {
  const count = (pattern: RegExp) => (text.match(pattern) ?? []).length;
  const fullWidth = Math.max(0, count(/（/g) - count(/）/g));
  const halfWidth = Math.max(0, count(/\(/g) - count(/\)/g));
  return `${text}${"）".repeat(fullWidth)}${")".repeat(halfWidth)}`;
}

/** 与后端 BusinessColumnLabels.shorten 同一规则：取首个句读之前的短语，句读前为空就保留原文。 */
export function shortenDashboardColumnLabel(label: string) {
  const trimmed = label.trim();
  if (MEMBER_KEY_PATTERN.test(trimmed)) return memberKeyLabel(trimmed);
  const separator = DESCRIPTION_SEPARATOR.exec(trimmed);
  if (!separator) return trimmed;
  const head = trimmed.slice(0, separator.index).trim();
  return head ? closeBrackets(head) : trimmed;
}

/** 一整组列的展示名：同一 cube 的列要放在一起算公共前缀，所以必须整组传入。 */
export function dashboardColumnDisplayLabels(columns: readonly LabeledColumn[]): DashboardColumnDisplayLabel[] {
  const raws = columns.map(rawLabelOf);
  const members = stripCubeTitles(columns, raws);
  return raws.map((raw, index) => {
    const label = shortenDashboardColumnLabel(members[index]!) || columns[index]!.key;
    return label === raw ? { label } : { label, fullTitle: raw };
  });
}

function withFullTitle<T extends { fullTitle?: string }>(column: T, fullTitle?: string): T {
  const next = { ...column };
  if (fullTitle) next.fullTitle = fullTitle;
  else delete next.fullTitle;
  return next;
}

export function cleanDashboardQueryColumns(columns: QueryColumnDefinition[]): QueryColumnDefinition[] {
  const labels = dashboardColumnDisplayLabels(columns);
  return columns.map((column, index) => {
    const { label, fullTitle } = labels[index]!;
    return withFullTitle({ ...column, label, ...(column.title !== undefined ? { title: label } : {}) }, fullTitle);
  });
}

export function cleanDashboardTableColumns(columns: DashboardTableColumn[]): DashboardTableColumn[] {
  const labels = dashboardColumnDisplayLabels(columns);
  return columns.map((column, index) => {
    const { label, fullTitle } = labels[index]!;
    return withFullTitle({ ...column, title: label }, fullTitle);
  });
}

/** 查询输出列 → 看板表格列：绑定快照与运行态回放都走这里，两边的表头才是同一套短名。 */
export function dashboardTableColumnsFromQuery(columns: QueryColumnDefinition[]): DashboardTableColumn[] {
  const labels = dashboardColumnDisplayLabels(columns);
  return columns.map((column, index) => {
    const { label, fullTitle } = labels[index]!;
    return {
      columnId: column.columnId,
      key: column.key,
      title: label,
      type: column.type,
      ...(fullTitle ? { fullTitle } : {})
    };
  });
}

export function cleanDashboardQueryOutput<T extends QueryExecutionOutput>(output: T): T {
  return { ...output, columns: cleanDashboardQueryColumns(output.columns) };
}

export function cleanDashboardQueryExecution(execution: QueryExecution): QueryExecution {
  return { ...execution, outputs: execution.outputs.map(cleanDashboardQueryOutput) };
}
