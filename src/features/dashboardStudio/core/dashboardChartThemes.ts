import type { DashboardWidgetStyle } from "@/types/dashboardStudio";

export type DashboardChartTheme = {
  id: string;
  title: string;
  seriesColors: string[];
  background: string;
  color: string;
  border: string;
};

export const xingshuIceSeriesColors = ["#1677FF", "#00A6E8", "#16A37A", "#6C7FF2", "#FFB020", "#FF4D4F"];

export const xingshuIceTheme: DashboardChartTheme = {
  id: "command-default",
  title: "星数冰蓝",
  seriesColors: [...xingshuIceSeriesColors],
  background: "#FFFFFF",
  color: "#294469",
  border: "#E3ECF9"
};

export const dashboardChartThemes: DashboardChartTheme[] = [
  xingshuIceTheme,
  { id: "calm-tech", title: "冷静科技", seriesColors: ["#3b82f6", "#22d3ee", "#2dd4bf", "#84cc16", "#facc15"], background: "rgba(12,20,38,.84)", color: "#e0f2fe", border: "rgba(125,211,252,.22)" },
  { id: "growth-contrast", title: "增长对比", seriesColors: ["#2563eb", "#f97316", "#facc15", "#22c55e", "#64748b"], background: "rgba(15,23,42,.82)", color: "#dbeafe", border: "rgba(56,189,248,.18)" },
  { id: "risk-signal", title: "风险告警", seriesColors: ["#38bdf8", "#facc15", "#fb923c", "#ef4444", "#475569"], background: "rgba(24,18,24,.82)", color: "#fee2e2", border: "rgba(248,113,113,.24)" },
  { id: "executive-gold", title: "经营金色", seriesColors: ["#fbbf24", "#f59e0b", "#fde68a", "#67e8f9", "#bfdbfe"], background: "rgba(24,20,12,.82)", color: "#fef3c7", border: "rgba(251,191,36,.24)" },
  { id: "vivid-compare", title: "活力对比", seriesColors: ["#0891b2", "#2563eb", "#8b5cf6", "#f472b6", "#ec4899"], background: "rgba(16,18,38,.82)", color: "#ede9fe", border: "rgba(167,139,250,.22)" },
  { id: "mint-lake", title: "湖蓝薄荷", seriesColors: ["#14b8a6", "#06b6d4", "#60a5fa", "#a7f3d0", "#fde68a"], background: "rgba(8,24,32,.78)", color: "#ccfbf1", border: "rgba(45,212,191,.24)" },
  { id: "high-contrast", title: "高对比", seriesColors: ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#334155"], background: "rgba(3,7,18,.9)", color: "#fff", border: "rgba(255,255,255,.2)" },
  /*
   * 以下六条与 dashboardBoardThemes 的六档新主题同 id：整板主题的卡面直接取这里的 background/color/border，
   * 拆成两处会立刻漂移，所以卡面色只在这一份里定义。
   * 深色档的 background 刻意避开 rgba(15,23,42,*)——那三个值是 isLegacyCommandDashboardStyle 的黑名单，
   * 撞上就会被整张改写回冰蓝白卡。
   */
  { id: "gov-navy", title: "政务藏青", seriesColors: ["#5b8ae0", "#c8a96a", "#5fb3a1", "#de6a62", "#8fa9dc"], background: "rgba(11,22,48,0.86)", color: "#e8edf8", border: "rgba(200,169,106,0.30)" },
  { id: "gov-paper", title: "政务米白", seriesColors: ["#1e3a6e", "#b07e24", "#2e7d6b", "#a8352a", "#6d82a8"], background: "#FDFBF6", color: "#22314F", border: "#E4DCCB" },
  { id: "minimal-paper", title: "极简纸白", seriesColors: ["#2563eb", "#1f2328", "#8e959e", "#4e5661", "#a6aeb8"], background: "#FFFFFF", color: "#1F2328", border: "#EAECEF" },
  { id: "aurora-violet", title: "星云紫", seriesColors: ["#8b7cf6", "#38bdf8", "#2dd4bf", "#e48ac7", "#f0c36b"], background: "rgba(20,17,44,0.82)", color: "#e8e4fb", border: "rgba(150,130,255,0.24)" },
  { id: "forest-green", title: "生态绿", seriesColors: ["#3fbe86", "#a9cf5a", "#efb44b", "#4ea8c9", "#d2856a", "#7fd2b4"], background: "rgba(9,32,22,0.82)", color: "#dff3e7", border: "rgba(63,190,134,0.24)" },
  { id: "sunset-warm", title: "暖阳橙", seriesColors: ["#cf5d26", "#b03354", "#b98220", "#2f7669", "#7c5aa6"], background: "#FFFCF8", color: "#42332A", border: "#F0E1D1" }
];

const legacyCommandBackgrounds = new Set([
  "rgba(15,23,42,0.82)",
  "rgba(15,23,42,0.86)",
  "rgba(15,23,42,0.56)"
]);

function normalizeCssColor(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,(\.\d+)/g, ",0$1");
}

function parseRgb(value?: string): [number, number, number] | null {
  if (!value) {
    return null;
  }

  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split("").map((part) => part + part).join("") : hex[1];
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }

  const rgba = normalizeCssColor(value).match(/^rgba?\((\d+),(\d+),(\d+)/);
  if (!rgba) {
    return null;
  }

  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
}

function luminance(rgb: [number, number, number]) {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

export function isLightDashboardSurface(background?: string, color?: string) {
  const backgroundRgb = parseRgb(background);
  if (backgroundRgb) {
    return luminance(backgroundRgb) >= 0.62;
  }

  const inkRgb = parseRgb(color);
  if (inkRgb) {
    return luminance(inkRgb) < 0.55;
  }

  return true;
}

export function isLegacyCommandDashboardStyle(style?: DashboardWidgetStyle) {
  if (!style) {
    return false;
  }

  const background = style.background ? normalizeCssColor(style.background) : "";
  if (legacyCommandBackgrounds.has(background)) {
    return true;
  }

  if (style.chartTheme !== "command-default") {
    return false;
  }

  const rgb = parseRgb(style.background);
  return Boolean(rgb && luminance(rgb) < 0.32);
}

export function getDashboardChartTheme(id?: string) {
  return dashboardChartThemes.find((theme) => theme.id === id) ?? dashboardChartThemes[0];
}

export function getMatchingDashboardChartThemeId(style?: {
  background?: string;
  color?: string;
  accent?: string;
  borderColor?: string;
  seriesColors?: string[];
  chartTheme?: string;
}) {
  if (!style) {
    return "";
  }

  const matched = dashboardChartThemes.find(
    (theme) =>
      style.background === theme.background &&
      style.color === theme.color &&
      style.accent === theme.seriesColors[0] &&
      style.borderColor === theme.border &&
      style.seriesColors?.length === theme.seriesColors.length &&
      style.seriesColors.every((color, index) => color === theme.seriesColors[index])
  );
  if (matched) {
    return matched.id;
  }

  return isLegacyCommandDashboardStyle(style) ? "command-default" : "";
}

export function resolveDashboardWidgetStyle(style: DashboardWidgetStyle = {}): DashboardWidgetStyle {
  if (!isLegacyCommandDashboardStyle(style)) {
    return {
      ...style,
      background: style.background ?? xingshuIceTheme.background,
      color: style.color ?? xingshuIceTheme.color,
      borderColor: style.borderColor ?? xingshuIceTheme.border,
      borderRadius: style.borderRadius ?? 12,
      accent: style.accent ?? xingshuIceTheme.seriesColors[0]
    };
  }

  return {
    ...style,
    background: xingshuIceTheme.background,
    color: xingshuIceTheme.color,
    borderColor: xingshuIceTheme.border,
    borderRadius: style.borderRadius ?? 12,
    accent: xingshuIceTheme.seriesColors[0],
    seriesColors: [...xingshuIceTheme.seriesColors],
    chartTheme: style.chartTheme ?? "command-default"
  };
}
