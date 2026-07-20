import type {
  DashboardDataBinding,
  DashboardSchema,
  DashboardWidget,
  DashboardWidgetPosition,
  DashboardWidgetStyle,
  DashboardWidgetType
} from "@/types/dashboardStudio";
import { getDashboardComponentDefinition } from "./dashboardComponentRegistry";
import { createDashboardMockBinding, getDashboardMockMapping } from "./dashboardMockData";

type PresetWidgetSeed = {
  id: string;
  name?: string;
  type: DashboardWidgetType;
  title: string;
  position: DashboardWidgetPosition;
  binding?: string;
  content?: string;
  locked?: boolean;
  props?: Record<string, unknown>;
  style?: DashboardWidgetStyle;
};

export type DashboardStudioPreset = {
  id: string;
  title: string;
  description: string;
  themeName: string;
  colors: string[];
  refreshSeconds: number;
  seeds: PresetWidgetSeed[];
};

function createPresetBindings(prefix: string): Record<string, DashboardDataBinding> {
  const specs: Record<string, Array<[string, string, string, number]>> = {
    "ai-operations": [
      ["ai-ops-total-requests", "", "requests", 30],
      ["ai-ops-autonomous-resolutions", "", "autonomous_resolutions", 30],
      ["ai-ops-resolution-trend", "date", "resolved_questions", 30],
      ["ai-ops-workload-mix", "category", "workload_mix", 45],
      ["ai-ops-queue-detail", "table", "ai_queue", 45]
    ],
    "business-kpi": [
      ["business-revenue", "", "revenue", 45],
      ["business-pipeline", "", "pipeline", 45],
      ["business-revenue-trend", "date", "revenue_trend", 45],
      ["business-channel-mix", "category", "channel_revenue", 60],
      ["business-pipeline-stages", "category", "pipeline_stage", 60],
      ["business-account-health", "table", "account_health", 60]
    ],
    "customer-service": [
      ["service-satisfaction", "", "satisfaction", 30],
      ["service-response", "", "first_response", 30],
      ["service-response-trend", "date", "response_trend", 30],
      ["service-quality-radar", "category", "service_quality", 45],
      ["service-contact-mix", "category", "contact_channel", 45],
      ["service-escalation-table", "table", "service_queue", 45]
    ],
    "data-quality-health": [
      ["quality-freshness", "", "freshness", 30],
      ["quality-incidents", "", "incidents", 30],
      ["quality-freshness-trend", "date", "freshness_trend", 30],
      ["quality-source-errors", "category", "source_errors", 45],
      ["quality-platform-health", "category", "platform_health", 45],
      ["quality-remediation", "category", "quality_remediation", 45],
      ["quality-job-table", "table", "data_jobs", 45]
    ]
  };
  const definitions = (specs[prefix] ?? []).map(([id, dimensionId, metricId, refreshSeconds]) => ({
    ...createDashboardMockBinding({ id, sourceId: "mock-all", dimensionId, metricId }),
    refreshSeconds
  }));
  return Object.fromEntries(definitions.map((binding) => [binding.id, binding]));
}

function createPresetWidget(
  prefix: string,
  seed: PresetWidgetSeed,
  dataBindings: Record<string, DashboardDataBinding>
): DashboardWidget {
  const definition = getDashboardComponentDefinition(seed.type);
  const bindingId = seed.binding;
  return {
    id: seed.id,
    name: seed.name ?? seed.title,
    type: seed.type,
    title: seed.title,
    content: seed.content ?? definition.defaultContent,
    props: {
      ...(seed.type === "metric" ? { valuePrefix: "", valueSuffix: "", precision: 0 } : {}),
      ...seed.props
    },
    bindingId,
    mapping: bindingId && dataBindings[bindingId]
      ? getDashboardMockMapping(dataBindings[bindingId])
      : {},
    position: seed.position,
    style: {
      ...seed.style,
      locked: seed.locked ?? false,
      visible: true
    }
  };
}

const textStyle = { background: "transparent" };

export const dashboardStudioPresets: DashboardStudioPreset[] = [
  {
    id: "ai-operations",
    title: "AI 运营指挥",
    description: "工作量、自动化质量和响应健康度。",
    themeName: "AI 运营指挥",
    colors: ["#38bdf8", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa"],
    refreshSeconds: 30,
    seeds: [
      { id: "ai-ops-title", type: "text", title: "大屏标题", content: "AI 运营指挥中心", position: { x: 48, y: 28, w: 920, h: 72 }, locked: true, style: { ...textStyle, color: "#f8fafc", fontSize: 40, fontWeight: 800 } },
      { id: "ai-ops-subtitle", type: "text", title: "大屏副标题", content: "实时工作量、自动化质量和响应健康度", position: { x: 52, y: 94, w: 780, h: 42 }, locked: true, style: { ...textStyle, color: "#94a3b8", fontSize: 18, fontWeight: 600 } },
      { id: "ai-ops-metric-requests", type: "metric", title: "AI 请求总量", binding: "ai-ops-total-requests", position: { x: 48, y: 164, w: 360, h: 180 }, style: { background: "rgba(15, 23, 42, 0.92)", color: "#e2e8f0", accent: "#38bdf8" } },
      { id: "ai-ops-metric-autonomous", type: "metric", title: "自动解决量", binding: "ai-ops-autonomous-resolutions", position: { x: 432, y: 164, w: 360, h: 180 }, style: { background: "rgba(10, 31, 46, 0.92)", color: "#e0f2fe", accent: "#22c55e" } },
      { id: "ai-ops-trend-chart", type: "line", title: "解决趋势", binding: "ai-ops-resolution-trend", position: { x: 48, y: 380, w: 900, h: 408 }, style: { background: "rgba(15, 23, 42, 0.88)", color: "#dbeafe", accent: "#60a5fa" } },
      { id: "ai-ops-workload-chart", type: "pie", title: "工作量分布", binding: "ai-ops-workload-mix", position: { x: 988, y: 164, w: 432, h: 360 }, style: { background: "rgba(17, 24, 39, 0.9)", color: "#e5e7eb", accent: "#f59e0b" } },
      { id: "ai-ops-queue-table", name: "运营队列", type: "table", title: "运营队列明细", binding: "ai-ops-queue-detail", position: { x: 988, y: 560, w: 820, h: 348 }, style: { background: "rgba(15, 23, 42, 0.9)", color: "#e2e8f0", accent: "#a78bfa" } },
      { id: "ai-ops-footer", type: "text", title: "运行态备注", content: "模拟数据每 30 秒刷新一次，用于稳定验证运行态预览。", position: { x: 50, y: 950, w: 980, h: 46 }, locked: true, style: { ...textStyle, color: "#64748b", fontSize: 16, fontWeight: 600 } }
    ]
  },
  {
    id: "business-kpi",
    title: "经营 KPI 指挥",
    description: "收入脉搏、管道阶段和客户健康度。",
    themeName: "经营 KPI 指挥",
    colors: ["#14b8a6", "#f97316", "#22c55e", "#0ea5e9", "#f43f5e"],
    refreshSeconds: 45,
    seeds: [
      { id: "business-title", type: "text", title: "大屏标题", content: "经营 KPI 指挥舱", position: { x: 52, y: 34, w: 780, h: 64 }, locked: true, style: { ...textStyle, color: "#f8fafc", fontSize: 38, fontWeight: 800 } },
      { id: "business-subtitle", type: "text", title: "大屏副标题", content: "收入脉搏、管道质量和客户变化", position: { x: 54, y: 96, w: 740, h: 42 }, locked: true, style: { ...textStyle, color: "#8fb4c7", fontSize: 17, fontWeight: 600 } },
      { id: "business-revenue-card", type: "metric", title: "本月收入", binding: "business-revenue", position: { x: 52, y: 168, w: 356, h: 172 }, style: { background: "rgba(12, 42, 49, 0.9)", color: "#ecfeff", accent: "#14b8a6" } },
      { id: "business-pipeline-card", type: "metric", title: "合格商机管道", binding: "business-pipeline", position: { x: 432, y: 168, w: 356, h: 172 }, style: { background: "rgba(42, 26, 10, 0.88)", color: "#fff7ed", accent: "#f97316" } },
      { id: "business-area-chart", type: "area", title: "收入运行速率", binding: "business-revenue-trend", position: { x: 52, y: 380, w: 900, h: 408 }, style: { background: "rgba(8, 22, 38, 0.9)", color: "#dff7f3", accent: "#14b8a6" } },
      { id: "business-channel-chart", type: "bar", title: "渠道收入", binding: "business-channel-mix", position: { x: 988, y: 168, w: 460, h: 336 }, style: { background: "rgba(11, 27, 44, 0.9)", color: "#e0f2fe", accent: "#0ea5e9" } },
      { id: "business-funnel-chart", type: "funnel", title: "管道阶段", binding: "business-pipeline-stages", position: { x: 1488, y: 168, w: 380, h: 336 }, style: { background: "rgba(35, 17, 28, 0.86)", color: "#ffe4e6", accent: "#fb7185" } },
      { id: "business-account-table", name: "客户健康", type: "table", title: "客户健康关注清单", binding: "business-account-health", position: { x: 988, y: 548, w: 880, h: 348 }, style: { background: "rgba(15, 23, 42, 0.9)", color: "#e2e8f0", accent: "#22c55e" } },
      { id: "business-bottom-rule", type: "decoration", title: "底部边框", props: { variant: "frame" }, position: { x: 52, y: 928, w: 1816, h: 38 }, locked: true, style: { background: "rgba(20, 184, 166, 0.06)", accent: "#14b8a6", borderColor: "rgba(20, 184, 166, 0.36)" } }
    ]
  },
  {
    id: "customer-service",
    title: "客服体验分析",
    description: "体验质量、触点分布和升级关注。",
    themeName: "客服体验分析",
    colors: ["#f59e0b", "#38bdf8", "#a78bfa", "#22c55e", "#f87171"],
    refreshSeconds: 30,
    seeds: [
      { id: "service-title", type: "text", title: "大屏标题", content: "客服体验分析", position: { x: 50, y: 30, w: 760, h: 68 }, locked: true, style: { ...textStyle, color: "#f8fafc", fontSize: 40, fontWeight: 800 } },
      { id: "service-subtitle", type: "text", title: "大屏副标题", content: "体验质量、渠道压力和升级关注", position: { x: 54, y: 96, w: 760, h: 42 }, locked: true, style: { ...textStyle, color: "#a6b7d4", fontSize: 17, fontWeight: 600 } },
      { id: "service-satisfaction-card", type: "metric", title: "客户满意度", binding: "service-satisfaction", position: { x: 52, y: 164, w: 356, h: 172 }, style: { background: "rgba(43, 32, 13, 0.9)", color: "#fef3c7", accent: "#f59e0b" } },
      { id: "service-response-card", type: "metric", title: "首次响应 SLA", binding: "service-response", position: { x: 432, y: 164, w: 356, h: 172 }, style: { background: "rgba(8, 31, 48, 0.9)", color: "#e0f2fe", accent: "#38bdf8" } },
      { id: "service-response-chart", type: "line", title: "响应趋势", binding: "service-response-trend", position: { x: 52, y: 380, w: 770, h: 392 }, style: { background: "rgba(15, 23, 42, 0.9)", color: "#dbeafe", accent: "#38bdf8" } },
      { id: "service-quality-radar-chart", name: "服务质量", type: "radar", title: "服务质量画像", binding: "service-quality-radar", position: { x: 858, y: 164, w: 520, h: 408 }, style: { background: "rgba(30, 23, 52, 0.9)", color: "#ede9fe", accent: "#a78bfa" } },
      { id: "service-contact-chart", type: "pie", title: "触点分布", binding: "service-contact-mix", position: { x: 1412, y: 164, w: 440, h: 408 }, style: { background: "rgba(17, 24, 39, 0.9)", color: "#e5e7eb", accent: "#22c55e" } },
      { id: "service-escalation-table-component", type: "table", title: "升级关注", binding: "service-escalation-table", position: { x: 858, y: 612, w: 994, h: 312 }, style: { background: "rgba(15, 23, 42, 0.9)", color: "#e2e8f0", accent: "#f87171" } },
      { id: "service-note", type: "text", title: "运行态备注", content: "面向客服主管和服务负责人的运营视图。", position: { x: 52, y: 842, w: 720, h: 46 }, locked: true, style: { ...textStyle, color: "#64748b", fontSize: 16 } }
    ]
  },
  {
    id: "data-quality-health",
    title: "数据质量健康",
    description: "新鲜度、源系统错误和修复进度。",
    themeName: "数据质量健康",
    colors: ["#22c55e", "#38bdf8", "#f59e0b", "#f43f5e", "#a78bfa"],
    refreshSeconds: 30,
    seeds: [
      { id: "quality-title", type: "text", title: "大屏标题", content: "数据质量与系统健康", position: { x: 50, y: 32, w: 840, h: 68 }, locked: true, style: { ...textStyle, color: "#f8fafc", fontSize: 40, fontWeight: 800 } },
      { id: "quality-subtitle", type: "text", title: "大屏副标题", content: "新鲜度、链路可靠性和修复状态", position: { x: 54, y: 98, w: 760, h: 42 }, locked: true, style: { ...textStyle, color: "#94a3b8", fontSize: 17, fontWeight: 600 } },
      { id: "quality-freshness-card", type: "metric", title: "新鲜数据源", binding: "quality-freshness", position: { x: 52, y: 166, w: 344, h: 170 }, style: { background: "rgba(10, 36, 25, 0.9)", color: "#dcfce7", accent: "#22c55e" } },
      { id: "quality-incident-card", type: "metric", title: "未处理事件", binding: "quality-incidents", position: { x: 420, y: 166, w: 344, h: 170 }, style: { background: "rgba(43, 19, 23, 0.9)", color: "#ffe4e6", accent: "#f43f5e" } },
      { id: "quality-freshness-area", type: "area", title: "新鲜度趋势", binding: "quality-freshness-trend", position: { x: 52, y: 382, w: 764, h: 392 }, style: { background: "rgba(8, 28, 25, 0.9)", color: "#d1fae5", accent: "#22c55e" } },
      { id: "quality-error-bars", name: "源系统错误", type: "bar", title: "各系统错误数", binding: "quality-source-errors", position: { x: 852, y: 166, w: 500, h: 352 }, style: { background: "rgba(15, 23, 42, 0.9)", color: "#e2e8f0", accent: "#f59e0b" } },
      { id: "quality-health-radar", name: "平台健康", type: "radar", title: "平台健康画像", binding: "quality-platform-health", position: { x: 1390, y: 166, w: 458, h: 352 }, style: { background: "rgba(26, 22, 48, 0.88)", color: "#ede9fe", accent: "#a78bfa" } },
      { id: "quality-remediation-funnel", type: "funnel", title: "修复漏斗", binding: "quality-remediation", position: { x: 852, y: 558, w: 500, h: 352 }, style: { background: "rgba(37, 25, 15, 0.88)", color: "#ffedd5", accent: "#fb7185" } },
      { id: "quality-job-table-component", type: "table", title: "数据任务", binding: "quality-job-table", position: { x: 1390, y: 558, w: 458, h: 352 }, style: { background: "rgba(15, 23, 42, 0.9)", color: "#e2e8f0", accent: "#38bdf8" } }
    ]
  }
];

export function applyDashboardStudioPreset(
  base: DashboardSchema,
  preset: DashboardStudioPreset
): DashboardSchema {
  const dataBindings = createPresetBindings(preset.id);
  return {
    ...base,
    canvas: { ...base.canvas, width: 1920, height: 1080, background: "#F5F9FF", scaleMode: "fit-screen" },
    dataBindings,
    widgets: preset.seeds.map((seed, index) => {
      const widget = createPresetWidget(preset.id, seed, dataBindings);
      return { ...widget, style: { ...widget.style, zIndex: index + 1 } };
    }),
    theme: { name: preset.themeName, colors: preset.colors, fontFamily: "Inter" },
    refresh: { mode: "interval", intervalSeconds: preset.refreshSeconds },
    updatedAt: new Date().toISOString()
  };
}
