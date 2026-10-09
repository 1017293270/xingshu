import type { QueryAsset, QueryColumnDefinition, QueryExecutionOutput } from "@/types/analytics";
import { dashboardAnswerEvidence, type DashboardAnswerOutputEvidence } from "./dashboardAnswerEvidence";
import { cleanDashboardQueryOutput } from "./dashboardColumnLabels";
import { numericMetricColumns } from "./dashboardColumnSemantics";
import { cleanQuestionText, compactColumnLabel } from "./dashboardDesignTitles";

/**
 * 从一份收藏问数里挑「答案」那张结果表。
 *
 * 收藏存下的是这轮问数每一次 load_data 的结果（output_001… 按调用顺序），探查查询与 0 行结果都在里面，
 * 也没标明答案来自哪一条。
 * 收藏带着回答原文（answerText）时先拿回答认：回答引用的数或名称落在哪张表，哪张表就排最前
 * （规则见 dashboardAnswerEvidence），同分取后调用的；哪张表都对不上时退回下面按问题形状认的规则。
 * 老收藏没有回答原文，只能按问题的形状去认：
 * - 单值问题（合计 / 总额 / 多少 / 几个 / 「…的销售额」）优先单行且取得到数的结果；
 * - 明细、分组、排行、趋势类问题优先多行结果——问排行要的是一列数，收尾补的一行合计不是答案；
 * - 其余取调用顺序最后的非空结果：编排先探查、最后一次查询才用来作答；
 * - 0 行结果一律垫底，同一档里后调用的在前。
 * 输入必须是后端给的调用顺序，函数不改入参，所以反复计算结果一致。
 */

export type DashboardAnswerIntent = "single" | "detail" | "grouped" | "neutral";

type AnswerQuestion = Pick<QueryAsset, "name" | "originalQuestion" | "resolvedQuestion">
  & Partial<Pick<QueryAsset, "answerText">>;

/** 回答指向的指标列。valueMode 为 sum 时，回答的数是这一列的合计，指标卡要按列求和。 */
export type DashboardAnswerMetric = {
  metricKey: string;
  valueMode?: "sum";
};

/** 分数比较前取整：浮点加权和在第十几位上的差不算差，同分才能落到「取后调用的」。 */
const SCORE_PRECISION = 1e6;

const DETAIL_PATTERN = /哪些|哪几|列出|罗列|列表|明细|清单|详情|逐条|台账|名录|\blist\b|\bdetails?\b/i;
const GROUPED_PATTERN =
  /每(?:个|一|年|月|季度?|周|天|日|家|项|人|位|类)|各|按|分别|分组|排名|排行|前\s*\d+|前[一二三四五六七八九十]+|\btop\s*\d*|趋势|走势|变化|分布|对比|比较|构成|逐月|逐年/i;
const SINGLE_PATTERN =
  /合计|总计|总额|总数|总量|总和|总共|一共|共计|累计|多少|几(?:个|家|项|份|笔|次|名|位|人|条|单|张|台|户|件)/;
/** 没写「多少」但以指标名收尾的问题（「善治今年的销售额」）同样只要一个数。 */
const METRIC_TAIL_PATTERN =
  /(?:金额|额|数量|总数|个数|笔数|次数|人数|收入|营收|支出|利润|成本|费用|余额|均价|单价|均值|平均值|占比|比例|率|增速)$/;
const COUNT_QUESTION_PATTERN = /几(?:个|家|项|份|笔|次|名|位|人|条|单|张|台|户|件)|多少(?:个|家|项|份|笔|次|名|位|人|条|单|张|台|户|件)|数量|个数|条数|笔数/;
const COUNT_COLUMN_PATTERN = /数量|个数|条数|笔数|次数|人数|记录数|count|qty/i;

function questionsOf(asset: AnswerQuestion) {
  return [asset.resolvedQuestion, asset.originalQuestion, asset.name]
    .map((value) => (value ?? "").normalize("NFKC").trim())
    .filter(Boolean);
}

export function dashboardAnswerIntent(asset: AnswerQuestion): DashboardAnswerIntent {
  const questions = questionsOf(asset);
  const text = questions.join(" ");
  if (DETAIL_PATTERN.test(text)) return "detail";
  if (GROUPED_PATTERN.test(text)) return "grouped";
  if (SINGLE_PATTERN.test(text)) return "single";
  if (questions.some((question) => METRIC_TAIL_PATTERN.test(cleanQuestionText(question)))) return "single";
  return "neutral";
}

function isScalar(output: QueryExecutionOutput) {
  return output.rows.length === 1 && numericMetricColumns(output.columns, output.rows).length > 0;
}

function answerTier(output: QueryExecutionOutput, intent: DashboardAnswerIntent) {
  if (output.rows.length === 0) return 2;
  if (intent === "single") return isScalar(output) ? 0 : 1;
  if (intent === "detail" || intent === "grouped") return output.rows.length > 1 ? 0 : 1;
  return 0;
}

/** 回答原文的证据，顺序与 outputs 一致；没有回答原文时为 undefined。outputs 须已清洗列名。 */
function answerEvidenceOf(
  asset: AnswerQuestion,
  outputs: QueryExecutionOutput[]
): DashboardAnswerOutputEvidence[] | undefined {
  const answerText = typeof asset.answerText === "string" ? asset.answerText.trim() : "";
  return answerText ? dashboardAnswerEvidence(answerText, outputs, questionsOf(asset)) : undefined;
}

function evidenceScore(evidence?: DashboardAnswerOutputEvidence) {
  return evidence?.hasEvidence ? Math.round(evidence.score * SCORE_PRECISION) : undefined;
}

/** 全部结果表按「最可能是答案」排序（列名已清洗），0 行的排在最后。 */
export function rankDashboardAnswerOutputs(
  asset: AnswerQuestion,
  outputs: QueryExecutionOutput[]
): QueryExecutionOutput[] {
  const intent = dashboardAnswerIntent(asset);
  const cleaned = outputs.map((output) => cleanDashboardQueryOutput(output));
  const evidence = answerEvidenceOf(asset, cleaned);
  return cleaned
    .map((output, order) => ({
      output,
      order,
      tier: answerTier(output, intent),
      score: evidenceScore(evidence?.[order])
    }))
    .sort((left, right) => {
      // 有回答证据的表排在所有没证据的表前面，彼此按得分、同分取后调用的。
      if (left.score !== undefined || right.score !== undefined) {
        if (left.score === undefined) return 1;
        if (right.score === undefined) return -1;
        return right.score - left.score || right.order - left.order;
      }
      return left.tier - right.tier || right.order - left.order;
    })
    .map((item) => item.output);
}

/**
 * 交给看板的候选：剔除 0 行结果。整份都是 0 行时只留排第一的那张，
 * 卡片如实显示「暂无数据」，而不是让这条收藏在列表里凭空消失。
 */
export function dashboardAnswerCandidates(
  asset: AnswerQuestion,
  outputs: QueryExecutionOutput[]
): QueryExecutionOutput[] {
  const ranked = rankDashboardAnswerOutputs(asset, outputs);
  const nonEmpty = ranked.filter((output) => output.rows.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : ranked.slice(0, 1);
}

export function pickDashboardAnswerOutputKey(asset: AnswerQuestion, outputs: QueryExecutionOutput[]) {
  return rankDashboardAnswerOutputs(asset, outputs)[0]?.outputKey ?? "";
}

/**
 * 选定结果表里回答引用的那一列：有回答原文、且这张表命中了回答里的数才有，否则 undefined。
 * 单元格命中优先；这张表只有「列合计等于回答的数」、问题又只要一个数（单值 / 看不出形状）时，
 * valueMode 为 sum——先查明细、在回答里自己加总的情况，指标卡要按列求和才和回答一致。
 * outputs 传整份收藏的全部结果表：某个数是否「有单元格直接等于它」要跨表判断。
 */
export function dashboardAnswerMetric(
  asset: AnswerQuestion,
  outputs: QueryExecutionOutput[],
  outputKey: string
): DashboardAnswerMetric | undefined {
  const evidence = answerEvidenceOf(asset, outputs.map((output) => cleanDashboardQueryOutput(output)));
  const best = evidence?.find((item) => item.outputKey === outputKey)?.columns[0];
  if (!best) return undefined;
  const intent = dashboardAnswerIntent(asset);
  return best.match === "sum" && (intent === "single" || intent === "neutral")
    ? { metricKey: best.key, valueMode: "sum" }
    : { metricKey: best.key };
}

/**
 * 数值列按问题重排：回答引用的那一列（answer.metricKey）排最前；其次是问题里点名的指标（「…的预签金额」），
 * 问「几个 / 多少家」时计数列在前，其余保持原有的金额优先顺序。
 * 指标卡取第一列，这一步决定卡上显示的是不是问题问的那个数。
 */
export function orderMetricsByQuestion<T extends Pick<QueryColumnDefinition, "key" | "label" | "title">>(
  asset: AnswerQuestion,
  columns: T[],
  answer?: Pick<DashboardAnswerMetric, "metricKey">
): T[] {
  const text = questionsOf(asset).join(" ");
  const countQuestion = COUNT_QUESTION_PATTERN.test(text);
  const score = (column: T) => {
    if (answer?.metricKey && column.key === answer.metricKey) return 1_000_000;
    const label = compactColumnLabel(column.label || column.title || column.key);
    if (label.length >= 2 && text.includes(label)) return 1_000 + label.length;
    if (countQuestion && COUNT_COLUMN_PATTERN.test(`${label} ${column.key}`)) return 1;
    return 0;
  };
  return columns
    .map((column, index) => ({ column, index, score: score(column) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.column);
}
