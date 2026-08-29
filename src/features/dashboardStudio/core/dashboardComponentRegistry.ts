import type {
  DashboardWidgetStyle,
  DashboardWidgetType
} from "@/types/dashboardStudio";
import { xingshuIceTheme } from "./dashboardChartThemes";

export type DashboardComponentDefinition = {
  type: DashboardWidgetType;
  title: string;
  defaultTitle?: string;
  defaultSize: { w: number; h: number };
  defaultContent?: string;
  defaultProps?: Record<string, unknown>;
  defaultStyle: DashboardWidgetStyle;
};

const iceChartStyle = (accent: string, extra: DashboardWidgetStyle = {}): DashboardWidgetStyle => ({
  background: xingshuIceTheme.background,
  color: xingshuIceTheme.color,
  borderColor: xingshuIceTheme.border,
  borderRadius: 12,
  accent,
  chartTheme: xingshuIceTheme.id,
  seriesColors: [...xingshuIceTheme.seriesColors],
  ...extra
});

export const dashboardComponentDefinitions: DashboardComponentDefinition[] = [
  {
    type: "metric",
    title: "指标卡",
    defaultTitle: "核心指标",
    defaultSize: { w: 320, h: 180 },
    defaultProps: { valuePrefix: "", valueSuffix: "", precision: 0 },
    defaultStyle: iceChartStyle("#1677FF")
  },
  {
    type: "line",
    title: "折线图",
    defaultTitle: "趋势概览",
    defaultSize: { w: 560, h: 320 },
    defaultStyle: iceChartStyle("#1677FF", { smooth: true, chartVariant: "line-smooth" })
  },
  {
    type: "area",
    title: "面积图",
    defaultTitle: "规模趋势",
    defaultSize: { w: 620, h: 340 },
    defaultStyle: iceChartStyle("#00A6E8", { smooth: true, chartVariant: "area-bold" })
  },
  {
    type: "bar",
    title: "柱状图",
    defaultTitle: "分类拆解",
    defaultSize: { w: 560, h: 320 },
    defaultStyle: iceChartStyle("#1677FF", { chartVariant: "bar-vertical" })
  },
  {
    type: "pie",
    title: "饼图",
    defaultTitle: "工作占比",
    defaultSize: { w: 420, h: 320 },
    defaultStyle: iceChartStyle("#00A6E8", { showLegend: true, chartVariant: "pie-donut" })
  },
  {
    type: "radar",
    title: "雷达图",
    defaultTitle: "能力画像",
    defaultSize: { w: 500, h: 360 },
    defaultStyle: iceChartStyle("#6C7FF2", { showLegend: true, chartVariant: "radar-filled" })
  },
  {
    type: "funnel",
    title: "漏斗图",
    defaultTitle: "转化漏斗",
    defaultSize: { w: 500, h: 360 },
    defaultStyle: iceChartStyle("#1677FF", { showLegend: true, chartVariant: "funnel-standard" })
  },
  {
    type: "table",
    title: "数据表格",
    defaultTitle: "运营队列",
    defaultSize: { w: 620, h: 340 },
    defaultStyle: iceChartStyle("#1677FF")
  },
  {
    type: "text",
    title: "文本",
    defaultSize: { w: 360, h: 120 },
    defaultContent: "AI 运营指挥中心",
    defaultStyle: { background: "transparent", color: "#0F2B50", accent: "#1677FF", fontSize: 28, fontWeight: 700 }
  },
  {
    type: "image",
    title: "图片",
    defaultSize: { w: 360, h: 220 },
    defaultProps: { src: "", objectFit: "cover" },
    defaultStyle: { background: "#F8FBFF", borderColor: "#E3ECF9", borderRadius: 12, imageFit: "cover" }
  },
  {
    type: "decoration",
    title: "装饰",
    defaultSize: { w: 420, h: 120 },
    defaultContent: "frame",
    defaultProps: { variant: "frame" },
    defaultStyle: {
      background: "rgba(255, 255, 255, 0.4)",
      borderColor: "#C7D9F6",
      accent: "#1677FF",
      borderRadius: 12,
      decorationKind: "frame"
    }
  }
];

export const dashboardChartWidgetTypes: DashboardWidgetType[] = [
  "line",
  "area",
  "bar",
  "pie",
  "radar",
  "funnel"
];

export function getDashboardComponentDefinition(type: DashboardWidgetType) {
  return dashboardComponentDefinitions.find((definition) => definition.type === type)
    ?? dashboardComponentDefinitions[0];
}
