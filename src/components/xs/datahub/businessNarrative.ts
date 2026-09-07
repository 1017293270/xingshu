import type {
  DataHubBusinessDocument,
  DataHubBusinessMeasure,
  DataHubBusinessQuery,
  DataHubBusinessTrace
} from "@/types/dataHub";

export type BusinessNarrativeKind = "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT";
export type BusinessNarrativeStatus = "running" | "done" | "error" | "cancelled";

export type BusinessNarrativeFinding = {
  key: string;
  text: string;
  /** 有文档时整条可点开原文片段。 */
  document?: DataHubBusinessDocument;
};

export type BusinessNarrative = {
  /** 怎么查：一到两句散文，不是编号步骤。 */
  how: string[];
  found: BusinessNarrativeFinding[];
};

/**
 * 后端没返回真实口径时 presenter 会补一句兜底文案。
 * 这些句子读者既核对不了也决定不了什么，一律不进叙事。
 */
const placeholderPatterns = [
  /^本次未/,
  /^本次结果采用企业语义模型/,
  /^单一业务主题/,
  /采用企业语义模型(?:中)?已发布的(?:指标口径|计算规则)$/,
  /中的业务数据$/
];

function isPlaceholder(value: string) {
  return placeholderPatterns.some((pattern) => pattern.test(value.trim()));
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function meaningful(values: Array<string | undefined>) {
  return unique(values).filter((value) => !isPlaceholder(value));
}

function realName(value: string | undefined) {
  const text = value?.trim();
  return text && !isPlaceholder(text) ? text : "";
}

/**
 * 字段名前挂着整段表注释时（「合同主数据清单，记录…。合同名称」），
 * 同一段前缀重复出现就把它剥掉，只留字段本身。
 */
function stripSharedContext(values: string[]) {
  const leadingCounts = new Map<string, number>();
  values.forEach((value) => {
    const separator = value.indexOf("。");
    if (separator < 8) return;
    const leading = value.slice(0, separator).trim();
    leadingCounts.set(leading, (leadingCounts.get(leading) ?? 0) + 1);
  });
  const common = Array.from(leadingCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .find(([, count]) => count >= 2)?.[0];
  return unique(values.map((value) => common && value.startsWith(`${common}。`)
    ? value.slice(common.length + 1).replace(/^[。；:：,，\s]+/, "")
    : value));
}

/** 表名后缀去掉后剩下的就是业务对象：「合同主数据清单」→「合同」。 */
const tableSuffixPattern =
  /(主数据清单|主数据|数据清单|清单|明细表|明细|台账|信息表|信息|数据表|数据|记录表|记录|列表|表)$/;
const entityPattern = /^[一-龥]{1,6}$/;

function entityFrom(table: string, question: string) {
  const name = table.trim();
  if (!name) return "";
  const stripped = name.replace(tableSuffixPattern, "");
  if (entityPattern.test(stripped)) return stripped;
  const head = name.slice(0, 2);
  return head && question.includes(head) ? head : "";
}

/**
 * 字段名前挂着整段表注释时（「销售明细表，记录…。统计月份」），只留末段那个字段名。
 * stripSharedContext 只能剥重复出现的前缀，单独出现一次的照样要剥。
 */
function plainFieldName(value: string) {
  const tail = value.split(/[。;；]/).map((part) => part.trim()).filter(Boolean).pop();
  return tail && tail.length <= 24 ? tail : value.trim();
}

/** 口语短名：去掉实体前缀和「名称/编号」类后缀，「合同乙方单位名称」→「乙方单位」。 */
const fieldSuffixPattern = /(名称|编号|代码|ID|Id|id)$/;

function shortFieldName(field: string, entity: string) {
  let text = plainFieldName(field);
  if (entity && text.length > entity.length && text.startsWith(entity)) {
    text = text.slice(entity.length);
  }
  return text.replace(fieldSuffixPattern, "") || text || field.trim();
}

const genericCountLabel = /^(记录数|数量|条数|计数|总数|行数|count)$/i;

function measureHowPhrase(measures: DataHubBusinessMeasure[], entityLabel: string) {
  return measures
    .map((measure) => {
      const label = measure.label.trim();
      switch (measure.aggregation) {
        case "计数":
          return genericCountLabel.test(label) ? `统计${entityLabel}数量` : `统计${label}`;
        case "去重计数":
          return `统计不重复的${label}`;
        case "求和":
          return `汇总${label}`;
        case "计算平均值":
          return `计算${label}的平均值`;
        case "取最大值":
          return `找出${label}的最大值`;
        case "取最小值":
          return `找出${label}的最小值`;
        default:
          return `计算${label}`;
      }
    })
    .join("、");
}

/** 已经写了「按“乙方单位名称”」时，泛称计数再说一遍对象就是废话，只留动作。 */
function measureFoundPhrase(
  measures: DataHubBusinessMeasure[],
  recordLabel: string,
  grouped: boolean
) {
  return measures
    .map((measure) => {
      const label = measure.label.trim();
      const quoted = `“${label}”`;
      switch (measure.aggregation) {
        case "计数":
          if (genericCountLabel.test(label)) return grouped ? "计数" : `对${recordLabel}计数`;
          return `对${quoted}计数`;
        case "去重计数":
          return `对${quoted}去重计数`;
        case "求和":
          return `对${quoted}求和`;
        case "计算平均值":
          return `计算${quoted}的平均值`;
        case "取最大值":
          return `取${quoted}的最大值`;
        case "取最小值":
          return `取${quoted}的最小值`;
        default:
          return `计算${quoted}`;
      }
    })
    .join("、");
}

const filterOperatorRewrites: Record<string, string> = {
  等于: "为",
  不等于: "不为",
  包含: "含有",
  不包含: "不含",
  有值: "已填写",
  为空: "为空"
};
/** 长的先试，否则「大于等于」会被「大于」切开。 */
const filterOperators = [
  "大于等于",
  "小于等于",
  "不等于",
  "不包含",
  "等于",
  "包含",
  "大于",
  "小于",
  "位于",
  "早于",
  "晚于",
  "有值",
  "为空",
  "符合"
];

function parseFilter(text: string) {
  for (const operator of filterOperators) {
    const index = text.indexOf(operator);
    if (index <= 0) continue;
    const value = text.slice(index + operator.length);
    if (!value || /^“[^”]*”$/.test(value)) {
      return { field: text.slice(0, index), operator, value };
    }
  }
  return undefined;
}

function joinConditions(parts: string[]) {
  return parts.length > 3
    ? `${parts.slice(0, 3).join("、")}等 ${parts.length} 个条件`
    : parts.join("、");
}

function filterPhrase(filters: string[], entity: string, short: boolean) {
  return joinConditions(filters.map((text) => {
    const parsed = parseFilter(text);
    if (!parsed) return text;
    const operator = filterOperatorRewrites[parsed.operator] ?? parsed.operator;
    const field = short ? shortFieldName(parsed.field, entity) : plainFieldName(parsed.field);
    return `${field}${operator}${parsed.value}`;
  }));
}

function quantifier(name: string) {
  if (/单位|公司|部门|机构/.test(name)) return "家";
  if (/^人$|人员|员工|客户|经理|负责人/.test(name)) return "位";
  return "个";
}

function rankWord(measure: DataHubBusinessMeasure | undefined) {
  if (!measure) return "最多的是";
  if (measure.aggregation === "取最小值") return "最低的是";
  if (["求和", "计算平均值", "取最大值"].includes(measure.aggregation)) return "最高的是";
  return "最多的是";
}

type NormalizedQuery = {
  dataSource: string;
  table: string;
  dimensions: string[];
  measures: DataHubBusinessMeasure[];
  filters: string[];
  time: string[];
  rows?: number;
  preview: Array<{ label: string; value: string }>;
  rowKind?: DataHubBusinessQuery["rowKind"];
  entity: string;
  entityLabel: string;
  /** 叫不出业务对象时只说「记录」，别写成「记录记录」。 */
  recordLabel: string;
};

function normalizeQuery(query: DataHubBusinessQuery, question: string): NormalizedQuery {
  const table = realName(query.table);
  const entity = entityFrom(table, question);
  return {
    dataSource: realName(query.dataSource),
    table,
    dimensions: meaningful(stripSharedContext(query.dimensions)).map(plainFieldName),
    measures: query.measures.filter((measure) => measure.label.trim()),
    filters: meaningful(stripSharedContext(query.filters)),
    time: meaningful(query.time),
    rows: query.rows,
    preview: query.preview ?? [],
    rowKind: query.rowKind,
    entity,
    entityLabel: entity || "记录",
    recordLabel: entity ? `${entity}记录` : "记录"
  };
}

/** 后端没给结构化 query 时，用已拼好的字符串数组凑一条，缺什么就少说什么。 */
function fallbackQuery(content: DataHubBusinessTrace, question: string) {
  const sources = meaningful(content.dataSources);
  const tables = meaningful(content.dataTables);
  const filters = meaningful(stripSharedContext(content.filters));
  const measures = meaningful(stripSharedContext(content.calculations)).flatMap((entry) => {
    const [label, aggregation] = entry.split("：");
    return label && aggregation ? [{ label: label.trim(), aggregation: aggregation.trim() }] : [];
  });
  if (!sources.length && !tables.length && !filters.length && !measures.length) return undefined;
  return normalizeQuery({
    dataSource: sources[0],
    table: tables[0],
    dimensions: [],
    measures,
    filters,
    time: meaningful(content.time)
  }, question);
}

function searchClause(sources: string[], entity: string) {
  const what = `查找${entity ? `${entity}相关的` : "相关的"}数据表`;
  return sources.length
    ? `搜索数据源${sources.map((source) => `“${source}”`).join("")}，${what}`
    : `搜索可用的数据源，${what}`;
}

function howSentence(query: NormalizedQuery, sources: string[], question: string) {
  // 后端连数据源、表、口径都没给：只能说去查了什么问题，别假装还定位了数据表。
  if (!sources.length && !query.table && !query.measures.length
    && !query.dimensions.length && !query.filters.length) {
    const topic = quotedQuestion(question);
    return topic ? `搜索数据源，查找与“${topic}”相关的数据。` : "搜索数据源，查找相关的数据。";
  }
  const search = searchClause(sources, query.entity);
  const filters = query.filters.length
    ? `只看${filterPhrase(query.filters, query.entity, true)}的${query.entityLabel}`
    : "";
  const dimensions = query.dimensions.length
    ? `按${query.dimensions.map((name) => shortFieldName(name, query.entity)).join("、")}`
    : "";
  const measures = query.measures.length
    ? measureHowPhrase(query.measures, query.entityLabel)
    : query.dimensions.length
      ? `列出${query.entityLabel}明细`
      : "";
  const time = query.time.length ? `，时间范围${query.time.join("、")}` : "";
  const actions = [filters, `${dimensions}${measures}`].filter(Boolean).join("，");
  return actions ? `${search}；找到后${actions}${time}。` : `${search}${time}。`;
}

function resultClause(query: NormalizedQuery) {
  if (query.rowKind === "single" && query.preview.length) {
    return `结果为 ${query.preview[0].value}`;
  }
  if (query.rowKind === "grouped" && query.preview.length && query.rows != null) {
    const grouped = shortFieldName(query.dimensions[0] ?? "", query.entity);
    const list = query.preview.map((item) => `${item.label}（${item.value}）`).join("、");
    return `共 ${query.rows} ${quantifier(grouped)}${grouped}；${rankWord(query.measures[0])}${list}`;
  }
  return query.rows != null ? `得到 ${query.rows} 行结果` : "";
}

function foundSentence(query: NormalizedQuery, fields: string[]) {
  const filters = query.filters.length
    ? `筛出${filterPhrase(query.filters, query.entity, false)}的${query.recordLabel}`
    : "";
  const dimensions = query.dimensions.length
    ? `按${query.dimensions.map((name) => `“${name}”`).join("、")}`
    : "";
  const measures = query.measures.length
    ? measureFoundPhrase(query.measures, query.recordLabel, Boolean(query.dimensions.length))
    : "";
  const head = query.dataSource && query.table
    ? `在数据源“${query.dataSource}”找到数据表“${query.table}”，`
    : query.table
      ? `找到数据表“${query.table}”，`
      : query.dataSource ? `在数据源“${query.dataSource}”里` : "";
  const body = [filters, `${dimensions}${measures}`, resultClause(query)].filter(Boolean).join("，");
  // 什么都没查到，只回来一个行数：把结果里的字段名补上，否则这条几乎等于什么都没说。
  if (!head && !filters && !dimensions && !measures) {
    if (query.rows == null) return "";
    return `查到 ${query.rows} 行结果${fields.length ? `，包含“${fields.join("、")}”` : ""}。`;
  }
  // 没有结论，或者既没落到具体表又没拿到行数：这条读者核对不了，不写。
  if (!body || (query.rows == null && !query.table)) return "";
  const text = `${head}${body}`.replace(/，$/, "");
  return text ? `${text}。` : "";
}

/** 引进句子里的问题不带问号，否则「…环节？”相关的文档」读起来是断的。 */
function quotedQuestion(question: string) {
  return question.trim().replace(/[？?。.！!，,、；;：:\s]+$/, "");
}

function knowledgeHowSentence(documents: DataHubBusinessDocument[], question: string) {
  const bases = unique(documents.map((document) => document.kbName));
  const where = bases.length
    ? `在知识库${bases.map((name) => `“${name}”`).join("")}中`
    : "在可访问的企业知识库中";
  const topic = quotedQuestion(question);
  return `${where}检索${topic ? `与“${topic}”相关的` : "相关"}文档，并核对来源。`;
}

function documentLocation(document: DataHubBusinessDocument) {
  const page = document.pageNumber?.trim();
  const pageText = page ? (/^\d+$/.test(page) ? `第 ${page} 页` : page) : "";
  return [document.chapter?.trim(), pageText].filter(Boolean).join(" · ");
}

function documentSentence(document: DataHubBusinessDocument) {
  const location = documentLocation(document);
  const quotes = document.fragments.filter(Boolean).length;
  return `在知识库“${document.kbName}”找到文档《${document.docName}》${
    location ? `（${location}）` : ""
  }${quotes ? `，引用了 ${quotes} 段原文` : ""}。`;
}

/** 编排模式把各子任务的做法串成一句，谁先谁后按 tasks 顺序。 */
function agentHowSentence(clauses: Array<{ knowledge: boolean; text: string }>, trace: DataHubBusinessTrace) {
  const isKnowledgeTask = (name: string) => /知识|制度|政策|文档|问知/.test(name);
  const agents = {
    data: trace.tasks
      .filter((task) => !isKnowledgeTask(`${task.agentName} ${task.question}`))
      .map((task) => task.agentName),
    knowledge: trace.tasks
      .filter((task) => isKnowledgeTask(`${task.agentName} ${task.question}`))
      .map((task) => task.agentName)
  };
  const named = clauses.map((clause) => {
    const pool = clause.knowledge ? agents.knowledge : agents.data;
    const agent = pool.shift();
    return agent ? `由${agent}${clause.text}` : clause.text;
  });
  if (named.length === 1) return `${named[0]}。`;
  return `${named
    .map((text, index) => {
      const last = index === named.length - 1;
      return `${index === 0 ? "先" : last && named.length > 2 ? "最后" : "再"}${text}`;
    })
    .join("，")}。`;
}

/** 运行中：已知的部分照写，末尾换成省略号，别装作已经查完。 */
function asRunning(sentence: string) {
  const text = sentence.replace(/。$/, "");
  return `正在${text}……`;
}

export function buildBusinessNarrative({
  trace,
  kind,
  status,
  question
}: {
  trace: DataHubBusinessTrace;
  kind: BusinessNarrativeKind;
  status: BusinessNarrativeStatus;
  question: string;
}): BusinessNarrative {
  const structured = (trace.queries ?? []).map((query) => normalizeQuery(query, question));
  const fallback = structured.length ? undefined : fallbackQuery(trace, question);
  const queries = fallback ? [fallback] : structured;
  const sources = meaningful(
    queries.map((query) => query.dataSource).concat(trace.dataSources)
  );
  const fields = meaningful(stripSharedContext(trace.fields)).slice(0, 6);

  const dataHow = queries.map((query) => howSentence(
    query,
    // 只有一条查询时把已知数据源都写上，多条时各归各的，对不上就不写。
    queries.length === 1 ? sources : meaningful([query.dataSource]),
    question
  ));
  const documentHow = trace.documents.length
    ? knowledgeHowSentence(trace.documents, question)
    : kind === "ASK_KNOWLEDGE" || kind === "DOCUMENT_LOOKUP"
      ? knowledgeHowSentence([], question)
      : "";

  let how: string[] = [];
  if (kind === "AGENT" && (dataHow.length || documentHow) && trace.tasks.length) {
    how = [agentHowSentence([
      ...dataHow.map((text) => ({ knowledge: false, text: text.replace(/。$/, "") })),
      ...(documentHow ? [{ knowledge: true, text: documentHow.replace(/。$/, "") }] : [])
    ], trace)];
  } else {
    how = [...dataHow, ...(documentHow ? [documentHow] : [])];
  }

  if (!how.length) {
    if (kind === "ASK_DATA") {
      how = [question.trim()
        ? `搜索数据源，查找与“${question.trim()}”相关的数据。`
        : "搜索数据源，查找相关的数据。"];
    } else if (status !== "running") {
      how = ["理解问题后直接作答，本次没有查询数据或文档。"];
    }
  }

  if (status === "running") {
    how = how.length
      ? how.map((text, index) => (index === how.length - 1 ? asRunning(text) : text))
      : ["正在理解问题……"];
  }

  const found: BusinessNarrativeFinding[] = [];
  queries.forEach((query, index) => {
    const text = foundSentence(query, fields);
    if (text) found.push({ key: `query-${index}`, text });
  });
  trace.documents.forEach((document) => {
    found.push({
      key: `${document.kbName}::${document.docName}`,
      text: documentSentence(document),
      document
    });
  });

  if (!found.length && status === "running") {
    found.push({ key: "waiting", text: "正在等待结果……" });
  }
  if (!found.length && (status === "error" || status === "cancelled")) {
    found.push({ key: "unavailable", text: "本次未拿到可核对的结果。" });
  }

  return { how, found };
}

/** 指标定义、同义词、关联关系只有真内容才值得占一块地方。 */
export function scopeDetailRows(content: DataHubBusinessTrace) {
  return [
    { label: "指标定义", values: meaningful(stripSharedContext(content.metricDefinitions)) },
    { label: "同义词映射", values: meaningful(stripSharedContext(content.synonymMappings)) },
    { label: "关联关系", values: meaningful(content.relationships) }
  ].filter((row) => row.values.length);
}
