import type { EChartsOption } from "echarts";
import type { DataHubTableResult } from "@/types/dataHub";

export type AiChartType = "bar" | "line" | "pie";

export type AiChartPlanRequest = {
  question: string;
  tables: DataHubTableResult[];
  answer?: string;
};

export type AiChartPlanResult = {
  chartable: boolean;
  reason: string;
  chartType?: AiChartType;
  allowedTypes?: AiChartType[];
  title?: string;
  tableIndex?: number;
  dimensionKey?: string;
  metricKeys?: string[];
};

export type AiChartColumnSummary = {
  key: string;
  title: string;
  type: "dimension" | "number" | "time";
};

export type AiChartTableSummary = {
  tableIndex: number;
  title: string;
  totalRows: number;
  columns: AiChartColumnSummary[];
  sampleRows: Record<string, unknown>[];
};

export type AiChartPlanRequestSummary = {
  question: string;
  tables: AiChartTableSummary[];
};

export type GeneratedChartSpec = {
  title: string;
  reason: string;
  chartType: AiChartType;
  allowedTypes: AiChartType[];
  table: DataHubTableResult;
  tableIndex: number;
  tableTitle: string;
  dimensionKey: string;
  metricKeys: string[];
};

export type GeneratedChartView = {
  spec: GeneratedChartSpec;
  option: EChartsOption;
};
