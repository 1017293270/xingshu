import type {
  DashboardWidgetStyle,
  DashboardWidgetType,
  DashboardWidgetPosition
} from "@/types/dashboardStudio";

export type DashboardComponentDefinition = {
  type: DashboardWidgetType;
  title: string;
  defaultTitle?: string;
  defaultSize: Pick<DashboardWidgetPosition, "w" | "h">;
  defaultContent?: string;
  defaultProps?: Record<string, unknown>;
  defaultStyle: DashboardWidgetStyle;
};

export const dashboardComponentDefinitions: DashboardComponentDefinition[] = [
  {
    type: "metric",
    title: "指标卡",
    defaultTitle: "核心指标",
    defaultSize: { w: 320, h: 180 },
    defaultProps: { valuePrefix: "", valueSuffix: "", precision: 0 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.86)", color: "#e5f0ff", accent: "#38bdf8" }
  },
  {
    type: "line",
    title: "折线图",
    defaultTitle: "趋势概览",
    defaultSize: { w: 560, h: 320 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.82)", color: "#dbeafe", accent: "#60a5fa", smooth: true, chartTheme: "command-default", chartVariant: "line-smooth" }
  },
  {
    type: "area",
    title: "面积图",
    defaultTitle: "规模趋势",
    defaultSize: { w: 620, h: 340 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.82)", color: "#dbeafe", accent: "#2dd4bf", smooth: true, chartTheme: "command-default", chartVariant: "area-bold" }
  },
  {
    type: "bar",
    title: "柱状图",
    defaultTitle: "分类拆解",
    defaultSize: { w: 560, h: 320 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.82)", color: "#dbeafe", accent: "#22c55e", chartTheme: "command-default", chartVariant: "bar-vertical" }
  },
  {
    type: "pie",
    title: "饼图",
    defaultTitle: "工作占比",
    defaultSize: { w: 420, h: 320 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.82)", color: "#dbeafe", accent: "#f59e0b", showLegend: true, chartTheme: "command-default", chartVariant: "pie-donut" }
  },
  {
    type: "radar",
    title: "雷达图",
    defaultTitle: "能力画像",
    defaultSize: { w: 500, h: 360 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.82)", color: "#dbeafe", accent: "#a78bfa", showLegend: true, chartTheme: "command-default", chartVariant: "radar-filled" }
  },
  {
    type: "funnel",
    title: "漏斗图",
    defaultTitle: "转化漏斗",
    defaultSize: { w: 500, h: 360 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.82)", color: "#dbeafe", accent: "#fb7185", showLegend: true, chartTheme: "command-default", chartVariant: "funnel-standard" }
  },
  {
    type: "table",
    title: "数据表格",
    defaultTitle: "运营队列",
    defaultSize: { w: 620, h: 340 },
    defaultStyle: { background: "rgba(15, 23, 42, 0.86)", color: "#e2e8f0", accent: "#38bdf8" }
  },
  {
    type: "text",
    title: "文本",
    defaultSize: { w: 360, h: 120 },
    defaultContent: "AI 运营指挥中心",
    defaultStyle: { background: "transparent", color: "#0F2B50", accent: "#38bdf8", fontSize: 28, fontWeight: 700 }
  },
  {
    type: "image",
    title: "图片",
    defaultSize: { w: 360, h: 220 },
    defaultProps: { src: "", objectFit: "cover" },
    defaultStyle: { background: "rgba(15, 23, 42, 0.56)", borderColor: "rgba(148, 163, 184, 0.26)", imageFit: "cover" }
  },
  {
    type: "decoration",
    title: "装饰",
    defaultSize: { w: 420, h: 120 },
    defaultContent: "frame",
    defaultProps: { variant: "frame" },
    defaultStyle: {
      background: "rgba(8, 13, 28, 0.32)",
      borderColor: "rgba(56, 189, 248, 0.5)",
      accent: "#38bdf8",
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
