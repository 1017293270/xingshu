import {
  ChartBar,
  ChartPieSlice,
  ClockCounterClockwise,
  Cloud,
  Database,
  NotePencil,
  Table
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

export type XsNavigationIcon = ComponentType<{
  size?: number;
  weight?: "regular" | "duotone";
  className?: string;
}>;

export type XsNavigationItem = {
  label: string;
  to: string;
  icon: XsNavigationIcon;
};

export const primaryNavigation: XsNavigationItem[] = [
  { label: "历史对话", to: "/history", icon: ClockCounterClockwise },
  { label: "智能制表", to: "/table", icon: Table },
  { label: "智能写作", to: "/writing", icon: NotePencil },
  { label: "我的看板", to: "/dashboard", icon: ChartBar },
  { label: "我的云盘", to: "/cloud", icon: Cloud }
];

export const secondaryNavigation: XsNavigationItem[] = [
  { label: "数据资产看板", to: "/data-dashboard", icon: ChartPieSlice },
  { label: "数据资产管理", to: "/data-management", icon: Database }
];

export const routeTitles: Record<string, string> = {
  "/": "首页",
  "/analysis": "智能问数",
  "/history": "历史对话",
  "/table": "智能制表",
  "/writing": "智能写作",
  "/dashboard": "我的看板",
  "/dashboard-editor": "看板编辑器",
  "/cloud": "我的云盘",
  "/data-dashboard": "数据资产看板",
  "/data-management": "数据资产管理",
  "/settings/ai": "AI 配置",
  "/login": "登录",
  "/welcome": "欢迎"
};
