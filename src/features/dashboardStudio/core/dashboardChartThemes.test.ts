import { describe, expect, it } from "vitest";
import { dashboardBoardThemes } from "./dashboardBoardThemes";
import {
  dashboardChartThemes,
  getDashboardChartTheme,
  getMatchingDashboardChartThemeId,
  isLegacyCommandDashboardStyle,
  isLightDashboardSurface
} from "./dashboardChartThemes";

describe("dashboardChartThemes", () => {
  it("keeps ids and card surfaces distinct so the picker can echo a selection", () => {
    expect(new Set(dashboardChartThemes.map((theme) => theme.id)).size).toBe(dashboardChartThemes.length);
    expect(new Set(dashboardChartThemes.map((theme) => theme.title)).size).toBe(dashboardChartThemes.length);

    for (const theme of dashboardChartThemes) {
      const echoed = getMatchingDashboardChartThemeId({
        background: theme.background,
        color: theme.color,
        accent: theme.seriesColors[0],
        borderColor: theme.border,
        seriesColors: [...theme.seriesColors],
        chartTheme: theme.id
      });
      expect(echoed).toBe(theme.id);
    }
  });

  it("keeps every board-backed card surface clear of the legacy command-screen rewrite", () => {
    // 撞上那份黑名单的卡面会在渲染时被整张改写回冰蓝白卡，整板主题当场失效
    const swallowed = dashboardBoardThemes
      .map((board) => getDashboardChartTheme(board.chartThemeId))
      .filter((theme) => isLegacyCommandDashboardStyle({ background: theme.background, chartTheme: theme.id }))
      .map((theme) => theme.id);

    expect(swallowed).toEqual([]);
  });

  it("reads each board-backed surface as the light or dark side its preset claims", () => {
    // 卡片的浅深判定驱动阴影、空态底与图表轴色，判反了就是深底白卡那种混搭
    for (const board of dashboardBoardThemes) {
      const theme = getDashboardChartTheme(board.chartThemeId);
      expect({ id: board.id, light: isLightDashboardSurface(theme.background, theme.color) }).toEqual({
        id: board.id,
        light: board.mode === "light"
      });
    }
  });
});
