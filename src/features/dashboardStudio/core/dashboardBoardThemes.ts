import type { DashboardSchema, DashboardWidget, DashboardWidgetStyle } from "@/types/dashboardStudio";
import { xingshuTokens } from "@/theme/xingshuTokens";
import { dashboardChartWidgetTypes } from "./dashboardComponentRegistry";
import { getDashboardChartTheme } from "./dashboardChartThemes";

/**
 * 整板主题：一次决定画布底、每一类组件的卡面、图表色板与强调色。
 *
 * 之前只有 chartTheme 作用在图表上，table/text/metric 的卡面从未被统一，
 * 于是「深色画布 + 白色表格卡 + 粉色告警卡」混在一屏，就是用户说的“方方块块很丑”。
 * 这里把卡面下沉成整板的一等公民：所有承载数据的卡（metric/table/图表）共用同一张卡面，
 * 图片/装饰只改必要项，文本条走画布上的墨色而不是卡面。
 */
export type DashboardBoardThemeSurface = {
  background: string;
  borderColor: string;
  color: string;
  borderRadius: number;
  backgroundBlur: number;
};

export type DashboardBoardTheme = {
  id: string;
  title: string;
  description: string;
  mode: "light" | "dark";
  /** 画布底色。深色档另配自带的渐变底图，见 backdrop。 */
  canvasBackground: string;
  /**
   * 画布底图（data URI）。
   * resolveCanvasBackgroundStyle 在没有自定义底图时会强制铺一张浅冰蓝科技图，
   * 只有 ice-light 与它同色系，可以留空复用；其余每档——深色档会被浅照片压穿，
   * 纸白/米白/暖米档会被冰蓝染冷——都必须自带底图。
   */
  backdrop?: string;
  /** 关联的图表主题 id：卡面与图表面板取同一张皮，设计器的主题下拉才能正确回显。 */
  chartThemeId: string;
  seriesColors: string[];
  /** metric/table/图表共用的卡面。 */
  surface: DashboardBoardThemeSurface;
  /** KPI 卡按顺序轮转强调色，一排指标卡不会四张同色。 */
  metricAccents: string[];
  /** 画布上的文本墨色（文本组件不占卡面）。 */
  headingColor: string;
  textAccent: string;
  imageSurface: { background: string; borderColor: string; borderRadius: number };
  decorationSurface: { background: string; borderColor: string; accent: string; borderRadius: number };
  fontFamily: string;
};

export type ApplyDashboardBoardThemeOptions = {
  /**
   * 是否给锁定组件也换肤，默认 true：锁定锁的是位置。
   * 注意设计器里 locked 会同时禁用属性面板，若要严格对齐那套语义，接线时传 false。
   */
  includeLocked?: boolean;
  /** 保留画布上已有的自定义底图（深色档默认会覆盖成自带渐变底）。 */
  keepBackgroundImage?: boolean;
};

const CARD_RADIUS = 16;
const CHART_TYPES = new Set<DashboardWidget["type"]>(dashboardChartWidgetTypes);

/**
 * 画布底：对角渐变 + 两团柔光，比纯色更有纵深，且不会抢卡片的视线。
 * 用 SVG data URI 而不是位图，整张不到 1KB，且随画布任意拉伸都不糊。
 *
 * glowOpacity 必须可调：同一组不透明度放到浅色底上会把纸感染成有色块，
 * 浅色档的柔光要比深色档淡一个量级才只剩「纵深」不剩「颜色」。
 */
function backdropDataUrl(
  stops: [string, string, string],
  glowTop: string,
  glowBottom: string,
  glowOpacity: [number, number] = [0.3, 0.2]
) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="none">' +
    "<defs>" +
    '<linearGradient id="base" x1="0" y1="0" x2="1" y2="1">' +
    `<stop offset="0" stop-color="${stops[0]}"/>` +
    `<stop offset="0.55" stop-color="${stops[1]}"/>` +
    `<stop offset="1" stop-color="${stops[2]}"/>` +
    "</linearGradient>" +
    '<radialGradient id="glowTop" cx="0.16" cy="0.1" r="0.62">' +
    `<stop offset="0" stop-color="${glowTop}" stop-opacity="${glowOpacity[0]}"/>` +
    `<stop offset="1" stop-color="${glowTop}" stop-opacity="0"/>` +
    "</radialGradient>" +
    '<radialGradient id="glowBottom" cx="0.88" cy="0.92" r="0.55">' +
    `<stop offset="0" stop-color="${glowBottom}" stop-opacity="${glowOpacity[1]}"/>` +
    `<stop offset="1" stop-color="${glowBottom}" stop-opacity="0"/>` +
    "</radialGradient>" +
    "</defs>" +
    '<rect width="1920" height="1080" fill="url(#base)"/>' +
    '<rect width="1920" height="1080" fill="url(#glowTop)"/>' +
    '<rect width="1920" height="1080" fill="url(#glowBottom)"/>' +
    "</svg>";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 浅色档的柔光基准：0.3/0.2 落在纸白上会直接变成两块色斑。 */
const PAPER_GLOW: [number, number] = [0.16, 0.1];

type BoardThemeSeed = Omit<DashboardBoardTheme, "seriesColors" | "surface" | "fontFamily"> & {
  cardBlur: number;
};

/** 卡面直接取图表主题的底/墨/描边，图表面板与 KPI、表格因此严格同色。 */
function createBoardTheme(seed: BoardThemeSeed): DashboardBoardTheme {
  const chartTheme = getDashboardChartTheme(seed.chartThemeId);
  const { cardBlur, ...rest } = seed;
  return {
    ...rest,
    chartThemeId: chartTheme.id,
    seriesColors: [...chartTheme.seriesColors],
    surface: {
      background: chartTheme.background,
      borderColor: chartTheme.border,
      color: chartTheme.color,
      borderRadius: CARD_RADIUS,
      backgroundBlur: cardBlur
    },
    fontFamily: xingshuTokens.fontFamily
  };
}

export const dashboardBoardThemes: DashboardBoardTheme[] = [
  createBoardTheme({
    id: "ice-light",
    title: "星数冰蓝",
    description: "白底卡片配冰蓝主色，浅色企业默认档，汇报和投屏都稳。",
    mode: "light",
    canvasBackground: "#EFF4FB",
    chartThemeId: "command-default",
    cardBlur: 0,
    metricAccents: ["#1677FF", "#00A6E8", "#16A37A", "#6C7FF2"],
    headingColor: "#0F2B50",
    textAccent: "#1677FF",
    imageSurface: { background: "#F8FBFF", borderColor: "#E3ECF9", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(22,119,255,0.06)",
      borderColor: "#C7D9F6",
      accent: "#1677FF",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "command-dark",
    title: "深空指挥",
    description: "深空渐变底配玻璃卡片，值班大屏和暗光环境的主力档。",
    mode: "dark",
    canvasBackground: "#050C1C",
    backdrop: backdropDataUrl(["#0A1730", "#050C1C", "#02060F"], "#1D4ED8", "#22D3EE"),
    chartThemeId: "calm-tech",
    cardBlur: 10,
    metricAccents: ["#38BDF8", "#22D3EE", "#2DD4BF", "#A78BFA"],
    headingColor: "#F1F5F9",
    textAccent: "#38BDF8",
    imageSurface: { background: "rgba(10,18,34,0.62)", borderColor: "rgba(125,211,252,0.2)", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(56,189,248,0.08)",
      borderColor: "rgba(125,211,252,0.34)",
      accent: "#38BDF8",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "mint-lake",
    title: "湖蓝薄荷",
    description: "湖蓝薄荷冷色，适合数据质量、运维监控这类长时间盯屏的场景。",
    mode: "dark",
    canvasBackground: "#04161C",
    backdrop: backdropDataUrl(["#08222B", "#04161C", "#020C10"], "#14B8A6", "#60A5FA"),
    chartThemeId: "mint-lake",
    cardBlur: 8,
    metricAccents: ["#2DD4BF", "#22D3EE", "#60A5FA", "#A7F3D0"],
    headingColor: "#ECFEFF",
    textAccent: "#2DD4BF",
    imageSurface: { background: "rgba(8,28,36,0.62)", borderColor: "rgba(45,212,191,0.22)", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(45,212,191,0.08)",
      borderColor: "rgba(45,212,191,0.32)",
      accent: "#2DD4BF",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "executive-gold",
    title: "经营金色",
    description: "深底配金色强调，营收复盘、经营例会用得上的一档暖色。",
    mode: "dark",
    canvasBackground: "#150F06",
    backdrop: backdropDataUrl(["#241A0A", "#150F06", "#0A0703"], "#F59E0B", "#67E8F9"),
    chartThemeId: "executive-gold",
    cardBlur: 8,
    metricAccents: ["#FBBF24", "#F59E0B", "#67E8F9", "#FDE68A"],
    headingColor: "#FEF9E7",
    textAccent: "#FBBF24",
    imageSurface: { background: "rgba(26,20,10,0.62)", borderColor: "rgba(251,191,36,0.24)", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(251,191,36,0.08)",
      borderColor: "rgba(251,191,36,0.3)",
      accent: "#FBBF24",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "gov-navy",
    title: "政务藏青",
    description: "藏青底配金色细描边，朱红只点在单张指标上，党政机关值班大屏与领导视察用。",
    mode: "dark",
    canvasBackground: "#071129",
    // 金色柔光压在右下角当远景，蓝光在左上——朱红不进底图，只留给单张卡当强调。
    backdrop: backdropDataUrl(["#0E1D42", "#081431", "#040A1B"], "#2C4E9E", "#C8A96A", [0.28, 0.16]),
    chartThemeId: "gov-navy",
    cardBlur: 8,
    metricAccents: ["#6E9BE8", "#C8A96A", "#5FB3A1", "#DE6A62"],
    headingColor: "#F2F5FC",
    textAccent: "#C8A96A",
    imageSurface: { background: "rgba(10,20,44,0.62)", borderColor: "rgba(200,169,106,0.22)", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(200,169,106,0.08)",
      borderColor: "rgba(200,169,106,0.3)",
      accent: "#C8A96A",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "gov-paper",
    title: "政务米白",
    description: "米白纸底配藏青墨字，朱红只做小面积强调，正式汇报材料与会议投屏。",
    mode: "light",
    canvasBackground: "#F4F1E9",
    backdrop: backdropDataUrl(["#FAF7F0", "#F4F1E9", "#EBE5D8"], "#C8A96A", "#1E3A6E", PAPER_GLOW),
    chartThemeId: "gov-paper",
    cardBlur: 0,
    metricAccents: ["#1E3A6E", "#9C7420", "#2E7D6B", "#A8352A"],
    headingColor: "#1B2B4B",
    textAccent: "#A8352A",
    imageSurface: { background: "#FBF8F1", borderColor: "#E4DCCB", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(168,53,42,0.06)",
      borderColor: "#DCCFBC",
      accent: "#A8352A",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "minimal-paper",
    title: "极简纸白",
    description: "纸白底、黑灰墨、极淡描边，只留一个蓝点缀，对外路演和印刷截图最干净。",
    mode: "light",
    canvasBackground: "#F6F7F8",
    // 中性灰柔光 + 一点蓝，几乎看不见：这一档的纵深靠卡片投影，不靠底图。
    backdrop: backdropDataUrl(["#FBFBFC", "#F6F7F8", "#EEEFF1"], "#98A2B3", "#2563EB", [0.1, 0.06]),
    chartThemeId: "minimal-paper",
    cardBlur: 0,
    // 四张 KPI 走「深蓝 → 墨黑 → 亮蓝 → 石板灰」，同一套黑白灰蓝里也分得清是四张卡。
    metricAccents: ["#1D4ED8", "#1F2328", "#3B82F6", "#64748B"],
    headingColor: "#111417",
    textAccent: "#2563EB",
    imageSurface: { background: "#FFFFFF", borderColor: "#EAECEF", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(37,99,235,0.05)",
      borderColor: "#E3E6EA",
      accent: "#2563EB",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "aurora-violet",
    title: "星云紫",
    description: "深紫底上一团紫、一团青的柔光，玻璃卡面，算法与研发效能看板的一档。",
    mode: "dark",
    canvasBackground: "#0B0A1F",
    backdrop: backdropDataUrl(["#1A1440", "#0E0C26", "#050411"], "#7C5CFF", "#22D3EE", [0.3, 0.18]),
    chartThemeId: "aurora-violet",
    cardBlur: 10,
    metricAccents: ["#8B7CF6", "#38BDF8", "#2DD4BF", "#E48AC7"],
    headingColor: "#F0EDFE",
    textAccent: "#A78BFA",
    imageSurface: { background: "rgba(19,16,42,0.62)", borderColor: "rgba(150,130,255,0.22)", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(139,124,246,0.09)",
      borderColor: "rgba(150,130,255,0.3)",
      accent: "#8B7CF6",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "forest-green",
    title: "生态绿",
    description: "墨绿底从翠绿走到琥珀，环保、农业、能源这类指标屏的自然色档。",
    mode: "dark",
    canvasBackground: "#06170F",
    backdrop: backdropDataUrl(["#0C2C1D", "#071A11", "#020A06"], "#34D399", "#D9A441", [0.26, 0.18]),
    chartThemeId: "forest-green",
    cardBlur: 8,
    metricAccents: ["#3FBE86", "#A9CF5A", "#EFB44B", "#4EA8C9"],
    headingColor: "#E9F8EE",
    textAccent: "#5FD3A0",
    imageSurface: { background: "rgba(8,30,21,0.62)", borderColor: "rgba(63,190,134,0.22)", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(63,190,134,0.08)",
      borderColor: "rgba(63,190,134,0.3)",
      accent: "#3FBE86",
      borderRadius: CARD_RADIUS
    }
  }),
  createBoardTheme({
    id: "sunset-warm",
    title: "暖阳橙",
    description: "暖米底配橙珊瑚强调，零售、门店与消费类经营看板的浅色暖档。",
    mode: "light",
    canvasBackground: "#FBF3EA",
    backdrop: backdropDataUrl(["#FFF9F2", "#FBF3EA", "#F4E4D3"], "#F59E0B", "#E2725B", PAPER_GLOW),
    chartThemeId: "sunset-warm",
    cardBlur: 0,
    metricAccents: ["#CF5D26", "#B03354", "#B98220", "#2F7669"],
    headingColor: "#3A2A20",
    textAccent: "#CF5D26",
    imageSurface: { background: "#FFFAF4", borderColor: "#F0E1D1", borderRadius: CARD_RADIUS },
    decorationSurface: {
      background: "rgba(207,93,38,0.06)",
      borderColor: "#EFDCC8",
      accent: "#CF5D26",
      borderRadius: CARD_RADIUS
    }
  })
];

export const DEFAULT_DASHBOARD_BOARD_THEME_ID = "ice-light";

export function getDashboardBoardTheme(id?: string): DashboardBoardTheme {
  return dashboardBoardThemes.find((theme) => theme.id === id) ?? dashboardBoardThemes[0]!;
}

/** 给设计器回显当前整板主题；认不出来返回空串，调用方按“自定义”处理。 */
export function getMatchingDashboardBoardThemeId(schema: DashboardSchema) {
  const matched = dashboardBoardThemes.find(
    (theme) => theme.canvasBackground === schema.canvas.background && theme.title === schema.theme?.name
  );
  return matched?.id ?? "";
}

/**
 * 卡面必须连 chartTheme 一起改写，metric/table 也不例外。
 * 组件库默认样式和 dashboardModuleService 的 createWidgetStyle 都会给指标卡、表格带上
 * chartTheme: "command-default"；只换底色不换这个 id，深色档就会凑出「深底 + command-default」，
 * 正好命中 resolveDashboardWidgetStyle 的旧指挥屏兜底，整张卡被改写回冰蓝白卡——
 * 深色大屏上跳出白表格、白 KPI，就是这么来的。
 */
function cardStyle(style: DashboardWidgetStyle, theme: DashboardBoardTheme, accent: string): DashboardWidgetStyle {
  return {
    ...style,
    background: theme.surface.background,
    color: theme.surface.color,
    borderColor: theme.surface.borderColor,
    borderRadius: theme.surface.borderRadius,
    backgroundBlur: theme.surface.backgroundBlur,
    accent,
    chartTheme: theme.chartThemeId,
    seriesColors: [...theme.seriesColors]
  };
}

/** 文本/图片/装饰不是图表面，不该攥着上一档主题的 id 和色板——留着就是同一个坑的下一次触发。 */
function withoutChartPalette(style: DashboardWidgetStyle): DashboardWidgetStyle {
  const { chartTheme: _chartTheme, seriesColors: _seriesColors, ...rest } = style;
  return rest;
}

function themedWidgetStyle(
  widget: DashboardWidget,
  theme: DashboardBoardTheme,
  metricOrdinal: number
): DashboardWidgetStyle {
  const style = widget.style;
  const primary = theme.seriesColors[0] ?? theme.textAccent;

  if (widget.type === "metric") {
    const accent = theme.metricAccents[metricOrdinal % theme.metricAccents.length] ?? primary;
    return cardStyle(style, theme, accent);
  }
  if (widget.type === "table") {
    return cardStyle(style, theme, primary);
  }
  if (CHART_TYPES.has(widget.type)) {
    return cardStyle(style, theme, primary);
  }
  if (widget.type === "text") {
    // 文本条不占卡面，只跟画布的墨色走，避免整屏出现一块块白底标题。
    return {
      ...withoutChartPalette(style),
      background: "transparent",
      color: theme.headingColor,
      accent: theme.textAccent
    };
  }
  if (widget.type === "image") {
    return {
      ...withoutChartPalette(style),
      background: theme.imageSurface.background,
      borderColor: theme.imageSurface.borderColor,
      borderRadius: theme.imageSurface.borderRadius
    };
  }
  return {
    ...withoutChartPalette(style),
    background: theme.decorationSurface.background,
    borderColor: theme.decorationSurface.borderColor,
    borderRadius: theme.decorationSurface.borderRadius,
    accent: theme.decorationSurface.accent
  };
}

/**
 * 纯函数换肤：画布底、卡面、图表色板、KPI 强调色一次对齐，位置一律不动。
 * 幂等——同一档主题应用两次结果完全相同（不写 updatedAt，时间戳交给排版或保存链路盖）。
 */
export function applyDashboardBoardTheme(
  schema: DashboardSchema,
  presetId: string = DEFAULT_DASHBOARD_BOARD_THEME_ID,
  options: ApplyDashboardBoardThemeOptions = {}
): DashboardSchema {
  const theme = getDashboardBoardTheme(presetId);
  const includeLocked = options.includeLocked ?? true;
  const metricOrdinals = new Map<string, number>();
  schema.widgets
    .filter((widget) => widget.type === "metric")
    .forEach((widget, index) => metricOrdinals.set(widget.id, index));

  const widgets = schema.widgets.map((widget) => {
    if (widget.style.locked && !includeLocked) return { ...widget, style: { ...widget.style } };
    return { ...widget, style: themedWidgetStyle(widget, theme, metricOrdinals.get(widget.id) ?? 0) };
  });

  const canvas = { ...schema.canvas, background: theme.canvasBackground };
  if (theme.backdrop && !options.keepBackgroundImage) {
    canvas.backgroundImage = { dataUrl: theme.backdrop, fit: "cover" };
  }

  return {
    ...schema,
    canvas,
    widgets,
    theme: { name: theme.title, colors: [...theme.seriesColors], fontFamily: theme.fontFamily }
  };
}
