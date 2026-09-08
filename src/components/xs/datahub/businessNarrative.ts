import type { DataHubBusinessDocument, DataHubBusinessTrace, DataHubBusinessQuery } from "@/types/dataHub";

export type BusinessNarrativeKind = "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT";
export type BusinessNarrativeStatus = "running" | "done" | "error" | "cancelled";
export type BusinessNarrativeRow = { label: string; values: string[] };
export type BusinessNarrativeStep = { title: string; description: string };
export type BusinessNarrativeProcess = { key: string; title?: string; rows: BusinessNarrativeRow[]; steps?: BusinessNarrativeStep[] };
export type BusinessNarrativeFinding = {
  key: string;
  title: string;
  metadata: string[];
  preview?: Array<{ label: string; value: string }>;
  document?: DataHubBusinessDocument;
};
export type BusinessNarrative = {
  process: BusinessNarrativeProcess[];
  found: BusinessNarrativeFinding[];
  statusMessage?: string;
};

// Presenter 的未知信息占位不能作为查询事实展示。
const placeholderPatterns = [
  /^本次未/,
  /^本次结果采用企业语义模型/,
  /^单一业务主题/,
  /采用企业语义模型(?:中)?已发布的(?:指标口径|计算规则)$/,
  /按企业语义模型定义计算$/,
  /中的业务数据$/
];

function meaningful(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "")))
    .filter((value) => value && !placeholderPatterns.some((pattern) => pattern.test(value)));
}

function factRows(rows: BusinessNarrativeRow[]) {
  return rows.map((row) => ({ ...row, values: meaningful(row.values) }))
    .filter((row) => row.values.length > 0);
}

function queryTitle(query: DataHubBusinessQuery) {
  const table = meaningful([query.table])[0];
  const shortTable = table && table.length <= 28 ? table : "";
  const dimensions = meaningful(query.dimensions);
  const measures = query.measures.filter((measure) => meaningful([measure.label]).length && meaningful([measure.aggregation]).length);
  if (query.rowKind !== "list" && measures.length) {
    if (dimensions.length <= 1 && measures.length === 1) {
      const { label, aggregation } = measures[0];
      let action = "";
      switch (aggregation.toLowerCase()) {
        case "count": case "计数": action = `统计${/^(记录数|数量|条数|计数|总数|行数|count)$/i.test(label) ? "记录数" : label}`; break;
        case "sum": case "求和": action = `汇总${label}`; break;
        case "avg": case "计算平均值": action = `计算${label}平均值`; break;
        case "countdistinct": case "count_distinct": case "去重计数": action = `对${label}去重计数`; break;
        case "max": case "取最大值": action = `统计${label}最大值`; break;
        case "min": case "取最小值": action = `统计${label}最小值`; break;
      }
      const title = `${dimensions.length ? `按${dimensions[0]}` : ""}${action}`;
      if (action && title.length <= 32) return title;
    }
    return `${shortTable}汇总统计`;
  }
  return shortTable ? `查询${shortTable}` : "查询数据";
}

function querySteps(query: DataHubBusinessQuery, sorts: string[], status: BusinessNarrativeStatus): BusinessNarrativeStep[] {
  const steps: BusinessNarrativeStep[] = [];
  const source = meaningful([query.dataSource])[0];
  const table = meaningful([query.table])[0];
  const filters = meaningful(query.filters);
  const time = meaningful(query.time);
  const scope = source ? `在数据源“${source}”${table ? `的“${table}”` : ""}中`
    : table ? `在“${table}”中` : "";
  const selection = filters.length ? `只保留${filters.join("；")}的记录` : "";
  const conditions = [scope, selection, time.length ? `时间条件：${time.join("；")}` : ""].filter(Boolean);
  if (conditions.length) steps.push({ title: "限定查询范围", description: `${conditions.length === 1 && scope ? `${scope}查询数据` : conditions.join("，")}。` });

  const dimensions = meaningful(query.dimensions);
  const grouped = dimensions.length > 0;
  const perGroup = grouped ? "每组的" : "";
  const measures = query.measures.filter((measure) => meaningful([measure.label]).length && meaningful([measure.aggregation]).length);
  const actions = measures.map(({ label, aggregation }) => {
    switch (aggregation.toLowerCase()) {
      case "count": case "计数":
        return /^(记录数|数量|条数|计数|总数|行数|count)$/i.test(label)
          ? `统计${grouped ? "每组" : "共"}有多少条记录`
          : `统计${perGroup}“${label}”${/(数量|总数|记录数|次数|件数|份数|条数|笔数|人数)$/.test(label) ? "" : "的数量"}`;
      case "countdistinct": case "count_distinct": case "去重计数": return `对${perGroup}“${label}”去重后计数`;
      case "sum": case "求和": return `将${perGroup}“${label}”相加`;
      case "avg": case "计算平均值": return `计算${perGroup}“${label}”的平均值`;
      case "max": case "取最大值": return `找出${perGroup}“${label}”的最大值`;
      case "min": case "取最小值": return `找出${perGroup}“${label}”的最小值`;
      default: return `对“${label}”执行“${aggregation}”`;
    }
  });
  if (grouped || actions.length) {
    steps.push({ title: actions.length ? "汇总统计" : "整理数据",
      description: `${[grouped ? `将${dimensions.map((name) => `“${name}”`).join("、")}相同的记录归为一组` : "", ...actions].filter(Boolean).join("，")}。` });
  }
  const sorting = sorts.flatMap((sort) => {
    const match = sort.match(/^按(.+)(升序|降序)排列$/);
    return match ? [`按“${match[1]}”${match[2] === "降序" ? "从高到低" : "从低到高"}排列`] : [];
  });
  if (sorting.length) steps.push({ title: "排列结果", description: `${sorting.join("；")}。` });
  if (query.rows != null && Number.isInteger(query.rows) && query.rows >= 0) {
    steps.push({ title: "返回结果", description: `${status === "done" ? "本次返回" : "当前已返回"} ${query.rows} 行数据。` });
  }
  return steps;
}

export function buildBusinessNarrative({ trace, kind, status }: {
  trace: DataHubBusinessTrace;
  kind: BusinessNarrativeKind;
  status: BusinessNarrativeStatus;
  question: string;
}): BusinessNarrative {
  const process: BusinessNarrativeProcess[] = [];
  const found: BusinessNarrativeFinding[] = [];
  if (kind === "ASK_DATA" || kind === "AGENT") {
    const queries = trace.queries ?? [];
    queries.forEach((query, index) => {
      const key = `query-${index}`;
      const processTitle = queryTitle(query);
      const title = meaningful([query.table])[0] || (processTitle === "查询数据" ? "查询结果" : processTitle);
      const rows = factRows([
        { label: "数据源", values: meaningful([query.dataSource]) },
        { label: "数据表", values: meaningful([query.table]) },
        { label: "筛选", values: query.filters },
        { label: "分组", values: query.dimensions },
        { label: "统计", values: query.measures.flatMap((measure) =>
          meaningful([measure.label]).length && meaningful([measure.aggregation]).length
            ? [`${measure.label}：${measure.aggregation}`] : []) },
        { label: "时间", values: query.time },
        ...(queries.length === 1 ? [{ label: "排序", values: trace.calculations.filter((value) => /[升降]序排列$/.test(value)) }] : [])
      ]);
      const steps = querySteps(query, queries.length === 1 ? meaningful(trace.calculations) : [], status);
      if (rows.length || steps.length) process.push({ key, title: processTitle, rows, steps });
      const preview = query.preview?.filter((item) => item.label.trim() && item.value.trim());
      const hasRows = query.rows != null && Number.isInteger(query.rows) && query.rows >= 0;
      if (hasRows || preview?.length) {
        found.push({ key, title,
          metadata: [...meaningful([query.dataSource]), ...(hasRows ? [`${query.rows} 行`] : [])],
          ...(preview?.length ? { preview } : {}) });
      }
    });
    // 全局来源没有逐查询归属时单独列出，不能凭数组位置绑定。
    const knownRows = factRows([
      { label: "数据源", values: trace.dataSources.filter((source) => !queries.some((query) => query.dataSource === source)) },
      { label: "数据表", values: trace.dataTables.filter((table) => !queries.some((query) => query.table === table)) },
      ...(queries.length ? [
        { label: "排序", values: queries.length > 1 ? trace.calculations.filter((value) => /[升降]序排列$/.test(value)) : [] }
      ] : [
        { label: "字段", values: trace.fields },
        { label: "筛选", values: trace.filters },
        { label: "计算", values: trace.calculations },
        { label: "时间", values: trace.time }
      ])
    ]);
    if (knownRows.length) process.push({ key: "known-data", title: "已返回信息", rows: knownRows });
  }

  const knowledgeBases = meaningful(trace.documents.map((document) => document.kbName));
  if (knowledgeBases.length) {
    process.push({ key: "knowledge", rows: [{ label: "知识库", values: knowledgeBases }] });
  }
  trace.documents.forEach((document, index) => {
    const page = document.pageNumber?.trim();
    const fragments = document.fragments.filter((fragment) => fragment.trim()).length;
    found.push({
      key: `document-${index}-${document.kbName}::${document.docName}`,
      title: document.docName,
      metadata: [
        ...meaningful([document.kbName, document.chapter]),
        ...(page ? [/^\d+$/.test(page) ? `第 ${page} 页` : page] : []),
        ...(fragments ? [`${fragments} 个片段`] : [])
      ],
      document
    });
  });

  const emptyMessages: Record<BusinessNarrativeStatus, string> = {
    running: "等待查询结果",
    done: "未返回查询结果",
    error: "查询失败，未返回结果",
    cancelled: "查询已停止，未返回结果"
  };
  return { process, found, ...(!found.length ? { statusMessage: emptyMessages[status] } : {}) };
}

/** 指标定义、同义词、关联关系仅展示实际返回的内容。 */
export function scopeDetailRows(content: DataHubBusinessTrace) {
  return factRows([
    { label: "指标定义", values: content.metricDefinitions },
    { label: "同义词映射", values: content.synonymMappings },
    { label: "关联关系", values: content.relationships }
  ]);
}
