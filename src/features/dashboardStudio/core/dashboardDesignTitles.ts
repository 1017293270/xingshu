/**
 * 大屏文案的短标题策略。
 *
 * 大屏上一行标题最多容得下十来个字，可收藏问数的资产名常常是一整段资产描述、
 * resolvedQuestion 又是一整句问题，直接拿来当标题就会出现「最新合同主数据清单，记录合同编号、
 * 名称、年度、签约双方及合同金额（万元）。合同编号，合同的…」这种指标卡。
 * 这里把「清洗问题」「取主题词」「按角色拼短标题」三件事集中起来，
 * 兜底方案与收藏问数拖入面板都用同一套，改一次两边都短。
 */

export type DashboardTitleRole = "kpi" | "trend" | "comparison" | "composition" | "detail";

export type DashboardTitleAsset = {
  name?: string;
  question?: string;
};

export type ShortWidgetTitleInput = {
  role: DashboardTitleRole;
  metricLabel?: string;
  dimensionLabel?: string;
  asset?: DashboardTitleAsset;
  /** 指标卡的口径后缀，例如「合计」；标题超长时先截指标名，保证后缀读得到。 */
  qualifier?: string;
};

/** 指标卡只有一行大字，标题超过 12 字就会换行挤掉数字。 */
const MAX_KPI_TITLE = 12;
/** 与设计诊断 title-too-long 同一条线：超过 16 字在大屏上会被截断。 */
const MAX_WIDGET_TITLE = 16;
/** 主题词是用来拼「XX总览」的，八个字已经很长了。 */
const MAX_TOPIC = 8;

/** 「查询/统计一下……的情况」这类问句外壳去掉后才剩下真正的主题。 */
export function cleanQuestionText(question: string) {
  return question
    .trim()
    .replace(/[？?。！!]+$/g, "")
    .replace(/^(?:请|帮我|麻烦)?(?:统计一下|查询一下|查一下|看一下|分析一下|统计|查询|分析)/, "")
    .replace(/(?:如何|怎么样|是多少|有多少)$/g, "")
    .replace(/(?:的)?(?:情况|数据|结果)$/g, "")
    .trim();
}

function clip(text: string, max: number) {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** 列名去掉括号里的单位：「合同金额（万元）」在标题里只留「合同金额」，单位归指标卡的 displayUnit。 */
export function compactColumnLabel(label?: string) {
  return (label ?? "").replace(/[（(][^）)]*[）)]/g, "").replace(/[：:，,、。.]+$/g, "").trim();
}

/**
 * 资产主题词：取资产名（没有就取问题）第一个分句，摘掉「最新/全部」这类前缀
 * 与「清单/明细/数据」这类通用后缀，剩下的才是这份数据在讲什么。
 */
export function assetTopic(asset?: DashboardTitleAsset) {
  const source = [asset?.name, asset?.question].find((value) => Boolean(value?.trim())) ?? "";
  const head = cleanQuestionText(source).split(/[，,。.；;：:、\n（(]/)[0] ?? "";
  const trimmed = head
    .replace(/^(?:最新|最近|当前|全部|所有|本年|今年|历年)/, "")
    .replace(/(?:的)?(?:清单|列表|明细|台账|一览表|一览|报表|统计|信息|数据|结果|情况)$/, "")
    .trim();
  return clip(trimmed || head, MAX_TOPIC);
}

/**
 * 按角色拼组件标题。指标列名优先——用户在卡上先读的是「合同金额」而不是这份资产叫什么。
 * 维度与指标都在的对比图，短的直接连写（区域销售额），连写超长时改成「按X看Y」并各自截断，
 * 免得两个词一起被砍成半句。
 */
export function shortWidgetTitle({
  role,
  metricLabel,
  dimensionLabel,
  asset,
  qualifier
}: ShortWidgetTitleInput) {
  const metric = compactColumnLabel(metricLabel);
  // 维度名里的「名称」是数据库口径，标题里没人这么说话：「合同甲方单位名称」→「合同甲方」。
  const dimension = compactColumnLabel(dimensionLabel).replace(/(?:单位)?名称$/, "");
  const topic = assetTopic(asset);

  if (role === "kpi") {
    const suffix = qualifier ?? "";
    return clip(`${clip(metric || topic || "指标", MAX_KPI_TITLE - suffix.length)}${suffix}`, MAX_KPI_TITLE);
  }
  if (role === "trend") {
    return metric ? clip(`${clip(metric, MAX_WIDGET_TITLE - 2)}趋势`, MAX_WIDGET_TITLE) : clip(`${topic}趋势`, MAX_WIDGET_TITLE);
  }
  if (role === "composition") {
    return metric ? clip(`${clip(metric, MAX_WIDGET_TITLE - 2)}占比`, MAX_WIDGET_TITLE) : clip(`${topic}占比`, MAX_WIDGET_TITLE);
  }
  if (role === "comparison") {
    if (dimension && metric) {
      const joined = `${dimension}${metric}`;
      return joined.length <= MAX_WIDGET_TITLE ? joined : `按${clip(dimension, 5)}看${clip(metric, 6)}`;
    }
    return clip(metric || dimension || topic || "对比", MAX_WIDGET_TITLE);
  }

  const name = compactColumnLabel(asset?.name);
  if (name && name.length <= MAX_WIDGET_TITLE) return name;
  return clip(topic ? `${topic}明细` : cleanQuestionText(asset?.question ?? ""), MAX_WIDGET_TITLE) || "明细";
}

/** 只剩这些词的需求句没有主题可言，用户说的是「做个大屏」而不是「做什么」。 */
const GENERIC_BRIEF_PATTERN = /^(?:数据|可视化|智能|企业级)?(?:大屏|看板|驾驶舱|页面|界面|图表|报表)$/;

/** 剥掉「帮我设计个企业级的」这层指令外壳，留下真正的主题。 */
function stripBriefInstruction(text: string) {
  return text
    .replace(/^(?:帮我|帮忙|请|麻烦|给我)+/, "")
    .replace(/^(?:设计|制作|搭建|生成|做|搭|画|来|出)(?:一)?(?:[块个张份版])?/, "")
    .replace(/^(?:一)?[块个张份版]/, "")
    .replace(/^(?:企业级|专业|高级|好看|漂亮|简洁|大气)(?:的)?/, "")
    .replace(/^的/, "")
    .trim();
}

/**
 * 整板标题：需求句本身能当标题就用它，只剩一句指令就换成「{资产主题}总览」。
 * 用户那句「帮我设计个企业级的大屏」被原样印在标题条上，是这次返工最扎眼的一处。
 */
export function boardTitle(brief: string, asset?: DashboardTitleAsset, fallback = "") {
  const subject = stripBriefInstruction(cleanQuestionText(brief));
  if (subject && !GENERIC_BRIEF_PATTERN.test(subject)) return clip(subject, MAX_WIDGET_TITLE);
  const topic = assetTopic(asset);
  if (topic) return clip(`${topic}总览`, MAX_WIDGET_TITLE);
  return clip(fallback || subject, MAX_WIDGET_TITLE);
}
