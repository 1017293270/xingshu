/**
 * 列语义的唯一口径。
 *
 * 设计侧（发给模型的上下文、落板校验）、运行侧（指标卡取数、图表映射）与收藏问数拖入面板
 * 以前各写了一份同样的正则，于是同样漏判：
 *   - 「合同签订或归属年度」不含「年份」→ 不算时间列，样本 "2024" 全是数字 → 被当成数值指标；
 *   - 「合同编号」若是纯数字也会被当指标；
 *   - 「￥12,000.00」「1,200.50」「3.5万」这类带符号带单位的金额解析不出来 → 指标全空。
 * 三处口径集中到这里，改一次就都对。
 */

export type DashboardColumnRole = "time" | "identifier" | "number" | "dimension";

/** QueryColumnDefinition 与 DataHubTableColumn 的公共形状：一个有 label，一个有 title。 */
export type DashboardSemanticColumn = {
  key: string;
  label?: string;
  title?: string;
  type?: string;
};

/** 判种类只看前 12 行，够分辨形状又不会在几万行的明细上白扫一遍。 */
const SAMPLE_LIMIT = 12;
/**
 * 「值几乎都不重复」只有在行数够多时才说明是编号：五个区域当然互不相同，
 * 那是一张正常的分类图，不是主键。20 行以上才敢下这个判断，扫描窗口也随之放宽。
 */
const MIN_IDENTIFIER_ROWS = 20;
/** 基数判断与「这列取不取得到数」共用的扫描窗口：够看出规律，又不会为一个布尔值全表扫一遍。 */
const SCAN_LIMIT = 60;
const IDENTIFIER_UNIQUE_RATIO = 0.9;

const CURRENCY_PATTERN = /[¥￥$€]/g;
/** 「万/万元」「亿/亿元」是量级后缀，要还原成真实数值；「%」只是单位，不乘。 */
const UNIT_SUFFIX_PATTERN = /(万元|亿元|万|亿|元|%|人|个|件|次|台|户|笔)$/;
const UNIT_SCALE: Record<string, number> = { 万: 1e4, 万元: 1e4, 亿: 1e8, 亿元: 1e8 };

const TIME_NAME_PATTERN =
  /date|time|datetime|timestamp|year|month|week|quarter|period|日期|时间|年份|年度|年月|月份|季度|周|期间|周期/;
const TIME_TYPE_PATTERN = /date|time|timestamp|year/;
/** 年份、年月、ISO 时间戳；四位数只认 1900–2199，免得把「1200」这样的金额当年份。 */
const TIME_SAMPLE_PATTERN =
  /^(?:19|20|21)\d{2}(?:\s*年(?:\s*\d{1,2}\s*月?)?)?$|^\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?(?:[T\s]\d{1,2}:\d{2}.*)?$/;

const IDENTIFIER_NAME_PATTERN = /(?:^|[_\s])id$|id$|_id|编号|编码|代码|工号|序号|单号|号码|code|no\.?$|number$/;
const NUMBER_NAME_PATTERN =
  /int|long|float|double|decimal|numeric|number|count|amount|ratio|percent|sum|total|avg|qty|price|金额|数量|占比|比例|率|记录数|价|额|值$|数值|均值|峰值|阈值|得分|评分|分数|积分/;
const NUMBER_TYPE_PATTERN = /int|long|float|double|decimal|numeric|number|money|real/;
/** 名字里带这些词的列一定是度量，不管值多分散都不许当编号。 */
const MEASURE_NAME_PATTERN = /金额|数量|记录数|占比|比例|率|额|价|amount|count|qty|sum|total|price/;

function nameTokens(column: DashboardSemanticColumn) {
  return [column.key, column.label, column.title]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());
}

function matchesName(column: DashboardSemanticColumn, pattern: RegExp) {
  return nameTokens(column).some((token) => pattern.test(token));
}

function matchesType(column: DashboardSemanticColumn, pattern: RegExp) {
  const type = (column.type ?? "").trim().toLowerCase();
  return type.length > 0 && pattern.test(type);
}

function samplesOf(column: DashboardSemanticColumn, rows: Record<string, unknown>[], limit = SAMPLE_LIMIT) {
  return rows
    .slice(0, limit)
    .map((row) => row[column.key])
    .filter((value) => value !== null && value !== undefined && value !== "");
}

/**
 * 单元格取数：数字直接用；字符串先摘掉空白、中英文逗号、货币符号与单位后缀再解析。
 * 「3.5万」还原成 35000，「12%」保持 12，解析不出来一律 null（绝不当 0 用）。
 */
export function parseNumericCell(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  // NFKC 先把全角数字、全角逗号与全角货币符号折成半角，后面一套正则就够用了。
  let text = value
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/[,，]/g, "")
    .replace(CURRENCY_PATTERN, "");
  if (!text) return null;

  let scale = 1;
  const suffix = text.match(UNIT_SUFFIX_PATTERN)?.[1];
  if (suffix) {
    scale = UNIT_SCALE[suffix] ?? 1;
    text = text.slice(0, text.length - suffix.length);
  }
  if (!text) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed * scale : null;
}

function looksLikeTimeSamples(samples: unknown[]) {
  return samples.length > 0 && samples.every((value) => TIME_SAMPLE_PATTERN.test(String(value).trim()));
}

function looksLikeIdentifier(column: DashboardSemanticColumn, rows: Record<string, unknown>[]) {
  if (rows.length < MIN_IDENTIFIER_ROWS) return false;
  const samples = samplesOf(column, rows, SCAN_LIMIT);
  if (samples.length < MIN_IDENTIFIER_ROWS) return false;
  // 小数不会是编号：编号要么是字符串，要么是整数序列。
  if (samples.some((value) => {
    const numeric = parseNumericCell(value);
    return numeric !== null && !Number.isInteger(numeric);
  })) {
    return false;
  }
  const distinct = new Set(samples.map((value) => String(value))).size;
  return distinct >= samples.length * IDENTIFIER_UNIQUE_RATIO;
}

/**
 * 列种类：时间 / 编号 / 数值 / 分类。
 * 先按列名与声明类型判，再拿样本兜底——名字命中数值词但样本一个都解析不出来（整列「面议」）
 * 仍然退回分类，免得指标卡挂在一列永远取不到数的字段上。
 */
export function classifyColumn(
  column: DashboardSemanticColumn,
  rows: Record<string, unknown>[]
): DashboardColumnRole {
  const samples = samplesOf(column, rows);
  const parsable = samples.filter((value) => parseNumericCell(value) !== null);

  if (matchesName(column, TIME_NAME_PATTERN) || matchesType(column, TIME_TYPE_PATTERN)) return "time";
  if (matchesName(column, IDENTIFIER_NAME_PATTERN) && !matchesName(column, MEASURE_NAME_PATTERN)) {
    return "identifier";
  }
  if (matchesName(column, NUMBER_NAME_PATTERN) || matchesType(column, NUMBER_TYPE_PATTERN)) {
    if (samples.length === 0 || parsable.length > 0) return "number";
  }
  if (looksLikeTimeSamples(samples)) return "time";
  if (!matchesName(column, MEASURE_NAME_PATTERN) && looksLikeIdentifier(column, rows)) {
    return "identifier";
  }
  if (samples.length > 0 && parsable.length === samples.length) return "number";
  return "dimension";
}

/** 金额优先、数量其次，其余保持原列序：指标卡与图表默认取第一列时才不会挑到边角料。 */
const PRIMARY_METRIC_PATTERN = /金额|额|amount|sum|total/;
const SECONDARY_METRIC_PATTERN = /数量|记录数|count|qty|件数/;

/** 指标优先级：0 金额类、1 数量类、2 其余。跨结果表挑「最该上指标卡的那几个」时也用它。 */
export function metricColumnPriority(column: DashboardSemanticColumn) {
  if (matchesName(column, PRIMARY_METRIC_PATTERN)) return 0;
  if (matchesName(column, SECONDARY_METRIC_PATTERN)) return 1;
  return 2;
}

/**
 * 真正画得出来的数值列：既判成 number，又至少有一行取得到数。
 * 空表按列名放行——没有数据时也该让「金额」列保持指标身份，等刷新回来还是它。
 */
export function numericMetricColumns<T extends DashboardSemanticColumn>(
  columns: T[],
  rows: Record<string, unknown>[]
): T[] {
  // 「至少取得到一个数」只在扫描窗口里判：几万行的明细没必要为了这一个布尔值全表扫一遍。
  const scanned = rows.slice(0, SCAN_LIMIT);
  return columns
    .filter(
      (column) =>
        classifyColumn(column, rows) === "number"
        && (scanned.length === 0 || scanned.some((row) => parseNumericCell(row[column.key]) !== null))
    )
    .map((column, index) => ({ column, index, rank: metricColumnPriority(column) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((item) => item.column);
}
