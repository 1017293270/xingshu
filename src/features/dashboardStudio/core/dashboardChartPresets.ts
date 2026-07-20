import type { DashboardWidgetType } from "@/types/dashboardStudio";

export type DashboardChartPreviewKind =
  | "line-smooth"
  | "line-stepped"
  | "line-minimal"
  | "area-bold"
  | "area-soft"
  | "area-wire"
  | "bar-vertical"
  | "bar-horizontal"
  | "bar-compact"
  | "pie-donut"
  | "pie-rose"
  | "pie-solid"
  | "radar-filled"
  | "radar-outline"
  | "radar-compact"
  | "funnel-standard"
  | "funnel-pipeline"
  | "funnel-minimal";

export type DashboardChartDataRequirement = "time-series" | "category" | "time-series-or-category";

export type DashboardChartVariant = {
  id: DashboardChartPreviewKind;
  title: string;
  type: DashboardWidgetType;
  previewKind: DashboardChartPreviewKind;
  dataRequirement: DashboardChartDataRequirement;
  accent: string;
};

export type DashboardChartVariantGroup = {
  type: DashboardWidgetType;
  title: string;
  dataRequirement: DashboardChartDataRequirement;
  variants: DashboardChartVariant[];
};

export const dashboardChartVariants: DashboardChartVariant[] = [
  { id: "bar-vertical", title: "纵向柱状", type: "bar", previewKind: "bar-vertical", dataRequirement: "time-series-or-category", accent: "#22c55e" },
  { id: "bar-horizontal", title: "横向排行", type: "bar", previewKind: "bar-horizontal", dataRequirement: "time-series-or-category", accent: "#38bdf8" },
  { id: "bar-compact", title: "紧凑柱状", type: "bar", previewKind: "bar-compact", dataRequirement: "time-series-or-category", accent: "#f59e0b" },
  { id: "line-smooth", title: "平滑折线", type: "line", previewKind: "line-smooth", dataRequirement: "time-series", accent: "#60a5fa" },
  { id: "line-stepped", title: "阶梯折线", type: "line", previewKind: "line-stepped", dataRequirement: "time-series", accent: "#f59e0b" },
  { id: "line-minimal", title: "极简折线", type: "line", previewKind: "line-minimal", dataRequirement: "time-series", accent: "#38bdf8" },
  { id: "area-bold", title: "强调面积", type: "area", previewKind: "area-bold", dataRequirement: "time-series", accent: "#2dd4bf" },
  { id: "area-soft", title: "柔和面积", type: "area", previewKind: "area-soft", dataRequirement: "time-series", accent: "#22c55e" },
  { id: "area-wire", title: "线框面积", type: "area", previewKind: "area-wire", dataRequirement: "time-series", accent: "#38bdf8" },
  { id: "pie-donut", title: "环形占比", type: "pie", previewKind: "pie-donut", dataRequirement: "category", accent: "#f59e0b" },
  { id: "pie-rose", title: "玫瑰占比", type: "pie", previewKind: "pie-rose", dataRequirement: "category", accent: "#fb7185" },
  { id: "pie-solid", title: "实心占比", type: "pie", previewKind: "pie-solid", dataRequirement: "category", accent: "#a78bfa" },
  { id: "radar-filled", title: "填充雷达", type: "radar", previewKind: "radar-filled", dataRequirement: "category", accent: "#a78bfa" },
  { id: "radar-outline", title: "轮廓雷达", type: "radar", previewKind: "radar-outline", dataRequirement: "category", accent: "#38bdf8" },
  { id: "radar-compact", title: "紧凑雷达", type: "radar", previewKind: "radar-compact", dataRequirement: "category", accent: "#22c55e" },
  { id: "funnel-standard", title: "转化漏斗", type: "funnel", previewKind: "funnel-standard", dataRequirement: "category", accent: "#fb7185" },
  { id: "funnel-pipeline", title: "流程漏斗", type: "funnel", previewKind: "funnel-pipeline", dataRequirement: "category", accent: "#f59e0b" },
  { id: "funnel-minimal", title: "极简漏斗", type: "funnel", previewKind: "funnel-minimal", dataRequirement: "category", accent: "#38bdf8" }
];

const dashboardChartGroupOrder: Array<Pick<DashboardChartVariantGroup, "type" | "title" | "dataRequirement">> = [
  { type: "bar", title: "柱状图", dataRequirement: "time-series-or-category" },
  { type: "line", title: "折线图", dataRequirement: "time-series" },
  { type: "area", title: "面积图", dataRequirement: "time-series" },
  { type: "pie", title: "饼图", dataRequirement: "category" },
  { type: "radar", title: "雷达图", dataRequirement: "category" },
  { type: "funnel", title: "漏斗图", dataRequirement: "category" }
];

export function getDashboardChartVariantGroups(): DashboardChartVariantGroup[] {
  return dashboardChartGroupOrder.map((group) => ({
    ...group,
    variants: dashboardChartVariants.filter((variant) => variant.type === group.type)
  }));
}

export function getDashboardChartVariants(type: DashboardWidgetType) {
  return dashboardChartVariants.filter((variant) => variant.type === type);
}

export function getDefaultDashboardChartVariant(type: DashboardWidgetType) {
  return getDashboardChartVariants(type)[0]?.id;
}
