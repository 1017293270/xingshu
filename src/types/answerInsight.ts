import type { AiChartColumnSummary } from "@/types/aiChart";

/** 一条数据洞察：title 一句话概括，detail 写依据和推测。 */
export type DataHubAnswerInsightItem = {
  title: string;
  detail: string;
};

/** 问数回答之后补充的数据洞察与引导问题（ai-service `/ai/chat/answer-insight`）。 */
export type DataHubAnswerInsight = {
  insights: DataHubAnswerInsightItem[];
  followUps: string[];
};

export type DataHubAnswerInsightTable = {
  tableIndex: number;
  title: string;
  totalRows: number;
  columns: AiChartColumnSummary[];
  rows: Record<string, unknown>[];
  /** 前端按结果行算好的统计事实，模型引用数字时以它为准。 */
  facts: string[];
};

export type DataHubAnswerInsightRequest = {
  question: string;
  answer?: string;
  tables: DataHubAnswerInsightTable[];
};
