import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardSchema, DashboardWidget } from "@/types/dashboardStudio";
import { dashboardWidgetTypes } from "@/types/dashboardStudio";
import {
  DEFAULT_DASHBOARD_BOARD_THEME_ID,
  applyDashboardBoardTheme,
  dashboardBoardThemes,
  getDashboardBoardTheme,
  getMatchingDashboardBoardThemeId
} from "./dashboardBoardThemes";
import { isLightDashboardSurface, resolveDashboardWidgetStyle } from "./dashboardChartThemes";
import { dashboardChartWidgetTypes } from "./dashboardComponentRegistry";

const CARD_TYPES = new Set<DashboardWidget["type"]>(["metric", "table", ...dashboardChartWidgetTypes]);

/* 对比度自查：主题里的颜色只有 #rrggbb 与 rgba() 两种写法，够用就好，不引第三方色库。 */
function parseColor(value: string): [number, number, number, number] {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1]!;
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16), 1];
  }
  const rgba = value.replace(/\s+/g, "").match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i);
  if (!rgba) throw new Error(`主题色写法未覆盖：${value}`);
  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
}

function compositeOver(top: string, bottom: string) {
  const [r, g, b, alpha] = parseColor(top);
  const [br, bg, bb] = parseColor(bottom);
  const blend = (fg: number, back: number) => Math.round(fg * alpha + back * (1 - alpha));
  return `#${[blend(r, br), blend(g, bg), blend(b, bb)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(value: string) {
  const [r, g, b] = parseColor(value);
  const channel = (part: number) => {
    const ratio = part / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function everyTypeBoard(): DashboardSchema {
  const schema = createBlankDashboard();
  schema.canvas.background = "#123456";
  schema.widgets = dashboardWidgetTypes.map((type, index) => ({
    id: `w-${type}`,
    type,
    title: type,
    mapping: {},
    position: { x: index * 40, y: index * 30, w: 360, h: 240 },
    // 用户截图里的病灶：深底上混着白卡、粉卡、默认卡。
    // chartTheme 必须留在 fixture 里：组件库默认样式和 createWidgetStyle 都会带上
    // "command-default"，深色档漏清它就会被旧指挥屏兜底整张改写回冰蓝白卡。
    style: index % 2 === 0
      ? {
        background: "#FFFFFF",
        color: "#294469",
        borderColor: "#E3ECF9",
        borderRadius: 4,
        chartTheme: "command-default",
        seriesColors: ["#1677FF", "#00A6E8"]
      }
      : { background: "rgba(244,63,94,.28)", color: "#fecdd3", borderRadius: 24, chartTheme: "command-default" }
  }));
  return schema;
}

describe("dashboardBoardThemes", () => {
  it("ships a light enterprise default plus dark command presets", () => {
    expect(dashboardBoardThemes.length).toBeGreaterThanOrEqual(3);
    expect(dashboardBoardThemes[0]!.id).toBe(DEFAULT_DASHBOARD_BOARD_THEME_ID);
    expect(dashboardBoardThemes.filter((theme) => theme.mode === "light").length).toBeGreaterThanOrEqual(1);
    expect(dashboardBoardThemes.filter((theme) => theme.mode === "dark").length).toBeGreaterThanOrEqual(1);
    expect(new Set(dashboardBoardThemes.map((theme) => theme.id)).size).toBe(dashboardBoardThemes.length);
    expect(getDashboardBoardTheme("does-not-exist").id).toBe(DEFAULT_DASHBOARD_BOARD_THEME_ID);
  });

  it("carries a self-contained backdrop wherever the built-in ice-blue photo would clash", () => {
    for (const theme of dashboardBoardThemes) {
      if (theme.id === DEFAULT_DASHBOARD_BOARD_THEME_ID) {
        // 内置底图就是这一档的冰蓝科技图，默认档复用它才对
        expect(theme.backdrop).toBeUndefined();
        continue;
      }
      // 其余档要么被浅照片压穿（深色档），要么被冰蓝染冷（纸白/米白/暖米档）
      expect(theme.backdrop).toMatch(/^data:image\/svg\+xml/);
      expect(theme.backdrop!.length).toBeLessThan(4096);
      expect(theme.backdrop).not.toContain('"');
    }
  });

  it("keeps every canvas background unique so the designer can echo the current preset", () => {
    // getMatchingDashboardBoardThemeId 只按 canvasBackground + title 回显，撞色就会认错档
    const backgrounds = dashboardBoardThemes.map((theme) => theme.canvasBackground.toLowerCase());
    expect(new Set(backgrounds).size).toBe(dashboardBoardThemes.length);
    expect(new Set(dashboardBoardThemes.map((theme) => theme.title)).size).toBe(dashboardBoardThemes.length);
  });

  it("clears WCAG AA on card ink and canvas headings for every preset", () => {
    const failures = dashboardBoardThemes.flatMap((theme) => {
      // 半透明卡面先叠到画布底色上：直接拿 rgba 的 rgb 三元组算会高估成一片纯深色
      const card = compositeOver(theme.surface.background, theme.canvasBackground);
      const ink = contrastRatio(theme.surface.color, card);
      const heading = contrastRatio(theme.headingColor, theme.canvasBackground);
      return [
        ...(ink >= 4.5 ? [] : [`${theme.id} 卡面墨色 ${ink.toFixed(2)}:1`]),
        ...(heading >= 4.5 ? [] : [`${theme.id} 画布标题 ${heading.toFixed(2)}:1`])
      ];
    });
    expect(failures).toEqual([]);
  });
});

describe("applyDashboardBoardTheme", () => {
  for (const theme of dashboardBoardThemes) {
    it(`unifies every widget type under ${theme.title}`, () => {
      const next = applyDashboardBoardTheme(everyTypeBoard(), theme.id);
      const styleOf = (type: DashboardWidget["type"]) => next.widgets.find((item) => item.type === type)!.style;

      expect(next.canvas.background).toBe(theme.canvasBackground);
      expect(next.theme).toEqual({
        name: theme.title,
        colors: theme.seriesColors,
        fontFamily: theme.fontFamily
      });

      for (const type of dashboardWidgetTypes) {
        const style = styleOf(type);
        if (CARD_TYPES.has(type)) {
          expect(style.background).toBe(theme.surface.background);
          expect(style.color).toBe(theme.surface.color);
          expect(style.borderColor).toBe(theme.surface.borderColor);
          expect(style.borderRadius).toBe(theme.surface.borderRadius);
          expect(style.accent).toBeTruthy();
          // 深底白卡 / 浅底深卡这种混搭在换肤后必须消失
          expect(isLightDashboardSurface(style.background, style.color)).toBe(theme.mode === "light");
        }
        if (CARD_TYPES.has(type)) {
          // metric/table 也必须换掉 chartTheme：留着旧 id 会被旧指挥屏兜底改写回白卡
          expect(style.chartTheme).toBe(theme.chartThemeId);
          expect(style.seriesColors).toEqual(theme.seriesColors);
        } else {
          // 非图表面不该攥着图表主题 id 和色板
          expect(style.chartTheme).toBeUndefined();
          expect(style.seriesColors).toBeUndefined();
        }
      }

      expect(styleOf("text")).toMatchObject({
        background: "transparent",
        color: theme.headingColor,
        accent: theme.textAccent
      });
      expect(styleOf("image")).toMatchObject({
        background: theme.imageSurface.background,
        borderColor: theme.imageSurface.borderColor,
        borderRadius: theme.imageSurface.borderRadius
      });
      expect(styleOf("decoration")).toMatchObject({
        background: theme.decorationSurface.background,
        borderColor: theme.decorationSurface.borderColor,
        accent: theme.decorationSurface.accent
      });
    });

    it(`survives the legacy command-screen rewrite under ${theme.title}`, () => {
      // resolveDashboardWidgetStyle 会把“旧指挥屏深底”整张改写成冰蓝白卡，
      // 任何一档主题的卡面撞上那份黑名单，渲染出来就不是它自己了。
      const next = applyDashboardBoardTheme(everyTypeBoard(), theme.id);
      for (const item of next.widgets) {
        if (!CARD_TYPES.has(item.type)) continue;
        const resolved = resolveDashboardWidgetStyle(item.style);
        expect(resolved.background).toBe(theme.surface.background);
        expect(resolved.color).toBe(theme.surface.color);
        expect(resolved.borderColor).toBe(theme.surface.borderColor);
        expect(isLightDashboardSurface(resolved.background, resolved.color)).toBe(theme.mode === "light");
      }
    });

    it(`is idempotent under ${theme.title}`, () => {
      const once = applyDashboardBoardTheme(everyTypeBoard(), theme.id);
      const twice = applyDashboardBoardTheme(once, theme.id);

      expect(twice).toEqual(once);
      expect(getMatchingDashboardBoardThemeId(once)).toBe(theme.id);
    });
  }

  it("cycles KPI accents so a row of metric cards is not four of the same colour", () => {
    const schema = createBlankDashboard();
    schema.widgets = ["k1", "k2", "k3", "k4"].map((id) => ({
      id,
      type: "metric" as const,
      title: id,
      mapping: {},
      position: { x: 0, y: 0, w: 320, h: 180 },
      style: {}
    }));
    const theme = getDashboardBoardTheme("command-dark");
    const next = applyDashboardBoardTheme(schema, "command-dark");

    expect(next.widgets.map((item) => item.style.accent)).toEqual(theme.metricAccents.slice(0, 4));
  });

  it("themes locked widgets by default and keeps every position untouched", () => {
    const schema = everyTypeBoard();
    schema.widgets[0]!.style = { ...schema.widgets[0]!.style, locked: true };
    const positions = schema.widgets.map((item) => ({ ...item.position }));

    const themed = applyDashboardBoardTheme(schema, "command-dark");
    const skipped = applyDashboardBoardTheme(schema, "command-dark", { includeLocked: false });
    const theme = getDashboardBoardTheme("command-dark");

    expect(themed.widgets[0]!.style.background).toBe(theme.surface.background);
    expect(themed.widgets[0]!.style.locked).toBe(true);
    expect(skipped.widgets[0]!.style.background).toBe("#FFFFFF");
    expect(skipped.widgets[1]!.style.background).toBe(theme.surface.background);
    expect(themed.widgets.map((item) => item.position)).toEqual(positions);
  });

  it("hands a dark preset its own backdrop and leaves the light preset's image alone", () => {
    const schema = createBlankDashboard();
    schema.canvas.backgroundImage = { dataUrl: "data:image/jpeg;base64,userphoto", fit: "contain" };

    const dark = applyDashboardBoardTheme(schema, "command-dark");
    const kept = applyDashboardBoardTheme(schema, "command-dark", { keepBackgroundImage: true });
    const light = applyDashboardBoardTheme(schema, "ice-light");

    expect(dark.canvas.backgroundImage).toEqual({
      dataUrl: getDashboardBoardTheme("command-dark").backdrop,
      fit: "cover"
    });
    expect(kept.canvas.backgroundImage).toEqual(schema.canvas.backgroundImage);
    expect(light.canvas.backgroundImage).toEqual(schema.canvas.backgroundImage);
  });

  it("does not mutate the source schema", () => {
    const schema = everyTypeBoard();
    const snapshot = structuredClone(schema);

    applyDashboardBoardTheme(schema, "mint-lake");

    expect(schema).toEqual(snapshot);
  });
});
