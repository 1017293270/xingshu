export type DashboardChartTheme = {
  id: string;
  title: string;
  seriesColors: string[];
  background: string;
  color: string;
  border: string;
};

export const dashboardChartThemes: DashboardChartTheme[] = [
  { id: "command-default", title: "默认指挥舱", seriesColors: ["#38bdf8", "#22c55e", "#f59e0b", "#f87171", "#a78bfa", "#60a5fa"], background: "rgba(15,23,42,.82)", color: "#dbeafe", border: "rgba(56,189,248,.18)" },
  { id: "calm-tech", title: "冷静科技", seriesColors: ["#3b82f6", "#22d3ee", "#2dd4bf", "#84cc16", "#facc15"], background: "rgba(12,20,38,.84)", color: "#e0f2fe", border: "rgba(125,211,252,.22)" },
  { id: "growth-contrast", title: "增长对比", seriesColors: ["#2563eb", "#f97316", "#facc15", "#22c55e", "#64748b"], background: "rgba(15,23,42,.82)", color: "#dbeafe", border: "rgba(56,189,248,.18)" },
  { id: "risk-signal", title: "风险告警", seriesColors: ["#38bdf8", "#facc15", "#fb923c", "#ef4444", "#475569"], background: "rgba(24,18,24,.82)", color: "#fee2e2", border: "rgba(248,113,113,.24)" },
  { id: "executive-gold", title: "经营金色", seriesColors: ["#fbbf24", "#f59e0b", "#fde68a", "#67e8f9", "#bfdbfe"], background: "rgba(24,20,12,.82)", color: "#fef3c7", border: "rgba(251,191,36,.24)" },
  { id: "vivid-compare", title: "活力对比", seriesColors: ["#0891b2", "#2563eb", "#8b5cf6", "#f472b6", "#ec4899"], background: "rgba(16,18,38,.82)", color: "#ede9fe", border: "rgba(167,139,250,.22)" },
  { id: "mint-lake", title: "湖蓝薄荷", seriesColors: ["#14b8a6", "#06b6d4", "#60a5fa", "#a7f3d0", "#fde68a"], background: "rgba(8,24,32,.78)", color: "#ccfbf1", border: "rgba(45,212,191,.24)" },
  { id: "high-contrast", title: "高对比", seriesColors: ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#334155"], background: "rgba(3,7,18,.9)", color: "#fff", border: "rgba(255,255,255,.2)" }
];

export function getDashboardChartTheme(id?: string) {
  return dashboardChartThemes.find((theme) => theme.id === id) ?? dashboardChartThemes[0];
}

export function getMatchingDashboardChartThemeId(style?: {
  background?: string;
  color?: string;
  accent?: string;
  borderColor?: string;
  seriesColors?: string[];
}) {
  if (!style) return "";
  return dashboardChartThemes.find((theme) =>
    style.background === theme.background
    && style.color === theme.color
    && style.accent === theme.seriesColors[0]
    && style.borderColor === theme.border
    && style.seriesColors?.length === theme.seriesColors.length
    && style.seriesColors.every((color, index) => color === theme.seriesColors[index])
  )?.id ?? "";
}
