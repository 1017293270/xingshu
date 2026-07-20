import type {
  DashboardDataBinding,
  DashboardWidgetType
} from "@/types/dashboardStudio";

export type DashboardMockResultKind = "metric" | "time-series" | "category" | "table";

export type DashboardMockField = {
  id: string;
  label: string;
  unit?: string;
  resultKinds: DashboardMockResultKind[];
  compatibleDimensions: string[];
};

export type DashboardMockDimension = {
  id: string;
  label: string;
  resultKind: Exclude<DashboardMockResultKind, "metric">;
};

export type DashboardMockSource = {
  id: string;
  name: string;
  description: string;
  dimensions: DashboardMockDimension[];
  metrics: DashboardMockField[];
  defaultMetricId: string;
};

const dimensions: Record<string, DashboardMockDimension> = {
  date: { id: "date", label: "Date", resultKind: "time-series" },
  category: { id: "category", label: "Category", resultKind: "category" },
  table: { id: "table", label: "Table rows", resultKind: "table" }
};

function metric(
  id: string,
  label: string,
  unit: string,
  resultKind: DashboardMockResultKind,
  compatibleDimensions: string[] = []
): DashboardMockField {
  return { id, label, unit, resultKinds: [resultKind], compatibleDimensions };
}

const metrics: Record<string, DashboardMockField> = {
  requests: metric("requests", "Total Q&A Requests", "count", "metric"),
  autonomous_resolutions: metric("autonomous_resolutions", "Autonomous Resolutions", "count", "metric"),
  revenue: metric("revenue", "Revenue This Month", "USD", "metric"),
  pipeline: metric("pipeline", "Qualified Pipeline", "USD", "metric"),
  satisfaction: metric("satisfaction", "Customer Satisfaction", "%", "metric"),
  first_response: metric("first_response", "First Response SLA", "%", "metric"),
  freshness: metric("freshness", "Fresh Sources", "%", "metric"),
  incidents: metric("incidents", "Open Incidents", "count", "metric"),
  resolved_questions: metric("resolved_questions", "Resolved Questions", "count", "time-series", ["date"]),
  revenue_trend: metric("revenue_trend", "Revenue Trend", "USD", "time-series", ["date"]),
  response_trend: metric("response_trend", "Response Trend", "%", "time-series", ["date"]),
  freshness_trend: metric("freshness_trend", "Freshness Trend", "%", "time-series", ["date"]),
  workload_mix: metric("workload_mix", "Workload Mix", "count", "category", ["category"]),
  channel_revenue: metric("channel_revenue", "Channel Revenue", "%", "category", ["category"]),
  pipeline_stage: metric("pipeline_stage", "Pipeline Stage", "count", "category", ["category"]),
  service_quality: metric("service_quality", "Service Quality", "%", "category", ["category"]),
  contact_channel: metric("contact_channel", "Contact Channel", "%", "category", ["category"]),
  source_errors: metric("source_errors", "Source Errors", "count", "category", ["category"]),
  platform_health: metric("platform_health", "Platform Health", "%", "category", ["category"]),
  quality_remediation: metric("quality_remediation", "Quality Remediation", "count", "category", ["category"]),
  ai_queue: metric("ai_queue", "AI Queue", "rows", "table", ["table"]),
  account_health: metric("account_health", "Account Health", "rows", "table", ["table"]),
  service_queue: metric("service_queue", "Service Queue", "rows", "table", ["table"]),
  data_jobs: metric("data_jobs", "Data Jobs", "rows", "table", ["table"])
};

const metricValues: Record<string, { value: number; label: string; trend: number }> = {
  requests: { value: 128430, label: "Total Q&A Requests", trend: 12.8 },
  autonomous_resolutions: { value: 76240, label: "Autonomous Resolutions", trend: 9.4 },
  revenue: { value: 842000, label: "Revenue This Month", trend: 8.6 },
  pipeline: { value: 3120000, label: "Qualified Pipeline", trend: 5.1 },
  satisfaction: { value: 94, label: "Customer Satisfaction", trend: 3.4 },
  first_response: { value: 87, label: "First Response SLA", trend: 4.8 },
  freshness: { value: 97, label: "Fresh Sources", trend: 2.1 },
  incidents: { value: 6, label: "Open Incidents", trend: -3.2 }
};

const timeSeriesValues: Record<string, Array<{ date: string; count: number }>> = {
  resolved_questions: [
    { date: "2026-06-01", count: 42 }, { date: "2026-06-02", count: 48 },
    { date: "2026-06-03", count: 57 }, { date: "2026-06-04", count: 63 }
  ],
  revenue_trend: [
    { date: "2026-06-01", count: 126 }, { date: "2026-06-02", count: 138 },
    { date: "2026-06-03", count: 152 }, { date: "2026-06-04", count: 168 }
  ],
  response_trend: [
    { date: "2026-06-01", count: 81 }, { date: "2026-06-02", count: 84 },
    { date: "2026-06-03", count: 86 }, { date: "2026-06-04", count: 87 }
  ],
  freshness_trend: [
    { date: "2026-06-01", count: 91 }, { date: "2026-06-02", count: 93 },
    { date: "2026-06-03", count: 95 }, { date: "2026-06-04", count: 97 }
  ]
};

const categoryValues: Record<string, Array<{ category: string; value: number }>> = {
  workload_mix: [
    { category: "SQL", value: 38 }, { category: "Q&A", value: 26 },
    { category: "Report", value: 18 }, { category: "Alert", value: 14 }
  ],
  channel_revenue: [
    { category: "Direct", value: 42 }, { category: "Partner", value: 28 },
    { category: "Expansion", value: 18 }, { category: "Self Serve", value: 12 }
  ],
  pipeline_stage: [
    { category: "Lead", value: 96 }, { category: "Qualified", value: 64 },
    { category: "Proposal", value: 38 }, { category: "Contract", value: 21 }
  ],
  service_quality: [
    { category: "Accuracy", value: 92 }, { category: "Speed", value: 87 },
    { category: "Empathy", value: 90 }, { category: "Coverage", value: 84 },
    { category: "Handoff", value: 78 }
  ],
  contact_channel: [
    { category: "Chat", value: 46 }, { category: "Email", value: 27 },
    { category: "Voice", value: 19 }, { category: "Portal", value: 8 }
  ],
  source_errors: [
    { category: "CRM", value: 12 }, { category: "Billing", value: 8 },
    { category: "Warehouse", value: 5 }, { category: "Support", value: 3 }
  ],
  platform_health: [
    { category: "Freshness", value: 97 }, { category: "Latency", value: 88 },
    { category: "Completeness", value: 91 }, { category: "Accuracy", value: 94 },
    { category: "Coverage", value: 86 }
  ],
  quality_remediation: [
    { category: "Detected", value: 44 }, { category: "Triaged", value: 31 },
    { category: "Assigned", value: 22 }, { category: "Resolved", value: 16 }
  ]
};

const tableValues: Record<string, { columns: string[]; rows: Array<Record<string, string | number>> }> = {
  ai_queue: {
    columns: ["name", "count", "owner"],
    rows: [
      { name: "Pending questions", count: 12, owner: "Data team" },
      { name: "Resolved questions", count: 86, owner: "AI ops" },
      { name: "Needs review", count: 7, owner: "Quality" }
    ]
  },
  account_health: {
    columns: ["account", "arr", "risk"],
    rows: [
      { account: "Northwind", arr: 184000, risk: "Low" },
      { account: "Contoso", arr: 136000, risk: "Medium" },
      { account: "Fabrikam", arr: 98000, risk: "Low" },
      { account: "Tailspin", arr: 74000, risk: "High" }
    ]
  },
  service_queue: {
    columns: ["queue", "open", "sla"],
    rows: [
      { queue: "Billing", open: 18, sla: "92%" },
      { queue: "Enterprise", open: 11, sla: "88%" },
      { queue: "Integrations", open: 9, sla: "84%" },
      { queue: "Bug triage", open: 6, sla: "79%" }
    ]
  },
  data_jobs: {
    columns: ["pipeline", "status", "lag"],
    rows: [
      { pipeline: "Revenue mart", status: "Healthy", lag: "8m" },
      { pipeline: "Support facts", status: "Delayed", lag: "32m" },
      { pipeline: "Usage events", status: "Healthy", lag: "5m" },
      { pipeline: "Quality checks", status: "Review", lag: "18m" }
    ]
  }
};

const sourceMetricIds = {
  all: Object.keys(metrics),
  aiOperations: ["requests", "autonomous_resolutions", "resolved_questions", "workload_mix", "ai_queue"],
  business: ["revenue", "pipeline", "revenue_trend", "channel_revenue", "pipeline_stage", "account_health"],
  service: ["satisfaction", "first_response", "response_trend", "service_quality", "contact_channel", "service_queue"],
  dataQuality: ["freshness", "incidents", "freshness_trend", "source_errors", "platform_health", "quality_remediation", "data_jobs"]
};

function source(
  id: string,
  name: string,
  description: string,
  metricIds: string[],
  defaultMetricId: string
): DashboardMockSource {
  const sourceMetrics = metricIds.map((id) => metrics[id]).filter(Boolean);
  const dimensionIds = new Set(sourceMetrics.flatMap((field) => field.compatibleDimensions));
  return {
    id,
    name,
    description,
    dimensions: [...dimensionIds].map((id) => dimensions[id]).filter(Boolean),
    metrics: sourceMetrics,
    defaultMetricId
  };
}

export const dashboardMockDataSources: DashboardMockSource[] = [
  source("mock-all", "All mock signals", "Demo metrics across AI operations, revenue, service, and data quality.", sourceMetricIds.all, "requests"),
  source("mock-ai-operations", "AI operations", "Workload, automation, resolution trend, and queue health.", sourceMetricIds.aiOperations, "requests"),
  source("mock-business-kpi", "Business KPI", "Revenue, pipeline, channels, stages, and account health.", sourceMetricIds.business, "revenue"),
  source("mock-customer-service", "Customer service", "Satisfaction, response performance, service quality, and queues.", sourceMetricIds.service, "satisfaction"),
  source("mock-data-quality", "Data quality", "Freshness, incidents, source errors, platform health, and data jobs.", sourceMetricIds.dataQuality, "freshness")
];

const componentResultKinds: Partial<Record<DashboardWidgetType, DashboardMockResultKind[]>> = {
  metric: ["metric"],
  line: ["time-series"],
  area: ["time-series"],
  bar: ["time-series", "category"],
  pie: ["category"],
  radar: ["category"],
  funnel: ["category"],
  table: ["table"]
};

export function getDashboardMockSource(sourceId?: string) {
  return dashboardMockDataSources.find((item) => item.id === sourceId) ?? dashboardMockDataSources[0];
}

export function getDashboardMockDimensionKind(sourceValue: DashboardMockSource, dimensionId: string) {
  return sourceValue.dimensions.find((item) => item.id === dimensionId)?.resultKind ?? "metric";
}

export function isDashboardMockDimensionAllowed(
  type: DashboardWidgetType,
  sourceValue: DashboardMockSource,
  dimensionId: string
) {
  return (componentResultKinds[type] ?? []).includes(getDashboardMockDimensionKind(sourceValue, dimensionId));
}

export function isDashboardMockMetricAllowed(
  type: DashboardWidgetType,
  sourceValue: DashboardMockSource,
  dimensionId: string,
  metricId: string
) {
  const field = sourceValue.metrics.find((item) => item.id === metricId);
  if (!field) return false;
  const resultKind = getDashboardMockDimensionKind(sourceValue, dimensionId);
  const dimensionMatches = dimensionId
    ? field.compatibleDimensions.includes(dimensionId)
    : field.compatibleDimensions.length === 0;
  return (componentResultKinds[type] ?? []).includes(resultKind)
    && field.resultKinds.includes(resultKind)
    && dimensionMatches;
}

export function getFirstDashboardMockDimensionId(type: DashboardWidgetType, sourceValue: DashboardMockSource) {
  if (isDashboardMockDimensionAllowed(type, sourceValue, "")) return "";
  return sourceValue.dimensions.find((item) => isDashboardMockDimensionAllowed(type, sourceValue, item.id))?.id ?? "";
}

export function getFirstDashboardMockMetricId(
  type: DashboardWidgetType,
  sourceValue: DashboardMockSource,
  dimensionId: string
) {
  return sourceValue.metrics.find((item) => isDashboardMockMetricAllowed(type, sourceValue, dimensionId, item.id))?.id ?? "";
}

function createTable(
  sourceValue: DashboardMockSource,
  dimensionId: string,
  metricId: string
): Pick<DashboardDataBinding, "table" | "resultKind" | "metricLabel" | "trend"> {
  const field = sourceValue.metrics.find((item) => item.id === metricId) ?? sourceValue.metrics[0];
  const resultKind = getDashboardMockDimensionKind(sourceValue, dimensionId);

  if (resultKind === "time-series") {
    const rows = timeSeriesValues[field.id] ?? timeSeriesValues.resolved_questions;
    return {
      resultKind,
      metricLabel: field.label,
      table: {
        columns: [{ key: "date", title: "date", type: "date" }, { key: "count", title: field.label, type: "number" }],
        rows,
        totalRows: rows.length,
        source: "mock"
      }
    };
  }

  if (resultKind === "category") {
    const rows = categoryValues[field.id] ?? categoryValues.workload_mix;
    return {
      resultKind,
      metricLabel: field.label,
      table: {
        columns: [{ key: "category", title: "category", type: "string" }, { key: "value", title: field.label, type: "number" }],
        rows,
        totalRows: rows.length,
        source: "mock"
      }
    };
  }

  if (resultKind === "table") {
    const value = tableValues[field.id] ?? tableValues.ai_queue;
    return {
      resultKind,
      metricLabel: field.label,
      table: {
        columns: value.columns.map((column) => ({ key: column, title: column, type: "string" })),
        rows: value.rows,
        totalRows: value.rows.length,
        source: "mock"
      }
    };
  }

  const value = metricValues[field.id] ?? metricValues.requests;
  return {
    resultKind: "metric",
    metricLabel: value.label,
    trend: value.trend,
    table: {
      columns: [{ key: "value", title: value.label, type: "number" }],
      rows: [{ value: value.value }],
      totalRows: 1,
      source: "mock"
    }
  };
}

export function createDashboardMockBinding(input: {
  id: string;
  sourceId: string;
  dimensionId: string;
  metricId: string;
}): DashboardDataBinding {
  const sourceValue = getDashboardMockSource(input.sourceId);
  const tableData = createTable(sourceValue, input.dimensionId, input.metricId);
  return {
    id: input.id,
    label: `${sourceValue.name} · ${tableData.metricLabel}`,
    mode: "snapshot",
    tableIndex: 0,
    sourceId: sourceValue.id,
    dimensionId: input.dimensionId,
    metricId: input.metricId,
    ...tableData
  };
}

export function getDashboardMockMapping(binding: DashboardDataBinding) {
  if (binding.resultKind === "time-series") return { dimensionKey: "date", metricKeys: ["count"] };
  if (binding.resultKind === "category") return { dimensionKey: "category", metricKeys: ["value"] };
  if (binding.resultKind === "metric") return { metricKeys: ["value"], valueMode: "latest" as const };
  return {};
}
