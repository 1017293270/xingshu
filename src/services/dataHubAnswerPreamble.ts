import type { DataHubBusinessTrace } from "@/types/dataHub";

const PREAMBLE_MAX_ITEMS = 3;

function limitList(values: string[]) {
  const unique = values.map((value) => value.trim()).filter(Boolean);
  const items = Array.from(new Set(unique));
  if (items.length === 0) {
    return "";
  }
  const shown = items.slice(0, PREAMBLE_MAX_ITEMS).join("、");
  return items.length > PREAMBLE_MAX_ITEMS ? `${shown} 等 ${items.length} 项` : shown;
}

/** trace.dataTables 会在缺表名时用「xx中的业务数据」占位；占位不算真实表材料。 */
function realDataTables(trace: DataHubBusinessTrace) {
  return trace.dataTables.filter((table) => !table.endsWith("中的业务数据"));
}

/**
 * 回答后的简短查询依据，保留真实来源与可核对的中文操作。
 *
 * 只面向问数与编排结果（问知已有「依据《文档》第X章第N页」来源行，不重复）；
 * 素材不足时返回空串，绝不硬造来源；模型答案自己已以「根据/依据/基于」开头时也
 * 在没有可补充的查询操作时返回空串，避免两句来源叠在一起。
 */
export function buildDataHubAnswerPreamble(
  kind: "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT",
  trace: DataHubBusinessTrace | undefined,
  answerText: string
): string {
  if (kind !== "ASK_DATA" && kind !== "AGENT") {
    return "";
  }
  if (!trace || !answerText.trim()) {
    return "";
  }
  const operations = Array.from(new Set([
    ...(trace.queries ?? []).flatMap((query, index) => {
      const details = [
        ...query.filters.map((filter) => `筛选${filter}`),
        ...query.time,
        ...(query.dimensions.length ? [`按${query.dimensions.join("、")}分组`] : []),
        ...query.measures.map((measure) => `对${measure.label}${measure.aggregation}`)
      ];
      if (!details.length) return [];
      const label = (trace.queries?.length ?? 0) > 1 ? `查询${index + 1}${query.table ? `（${query.table}）` : ""}：` : "";
      return [`${label}${details.join("；")}`];
    }),
    ...trace.calculations.filter((calculation) => /[升降]序排列$/.test(calculation))
  ]));
  if (!operations.length && /^\s*[（(【[]?(根据|依据|基于)/.test(answerText)) {
    return "";
  }

  const sources = limitList(trace.dataSources);
  const tables = limitList(realDataTables(trace));
  const knowledgeBases = kind === "AGENT"
    ? limitList(trace.documents.map((document) => document.kbName))
    : "";

  if (!sources && !tables && !knowledgeBases) {
    return "";
  }

  const dataPart = sources && tables
    ? trace.dataSources.length === 1
      ? `${sources} 数据源的 ${tables}`
      : `${sources} 数据源及 ${tables} 数据表`
    : sources
      ? `${sources} 数据源`
      : tables;
  const materials = [dataPart, knowledgeBases ? `${knowledgeBases} 知识库` : ""]
    .filter(Boolean)
    .join("与");
  return `查询依据：根据${materials}${operations.length ? `，${operations.join("；")}` : ""}。`;
}
