import { describe, expect, it } from "vitest";
import { getDashboardChartVariantGroups, dashboardChartVariants } from "./dashboardChartPresets";
import { dashboardChartThemes, getMatchingDashboardChartThemeId } from "./dashboardChartThemes";

describe("dashboard chart catalog", () => {
  it("keeps all 18 original chart variants in the original six groups", () => {
    const groups = getDashboardChartVariantGroups();
    expect(dashboardChartVariants).toHaveLength(18);
    expect(groups.map((group) => group.type)).toEqual(["bar", "line", "area", "pie", "radar", "funnel"]);
    expect(groups.map((group) => group.variants.length)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("keeps all eight original chart themes and detects exact theme matches", () => {
    expect(dashboardChartThemes).toHaveLength(8);
    const theme = dashboardChartThemes[0]!;
    expect(getMatchingDashboardChartThemeId({
      background: theme.background,
      color: theme.color,
      accent: theme.seriesColors[0],
      borderColor: theme.border,
      seriesColors: [...theme.seriesColors]
    })).toBe(theme.id);
    expect(getMatchingDashboardChartThemeId({
      background: theme.background,
      color: theme.color,
      accent: theme.seriesColors[0],
      borderColor: theme.border,
      seriesColors: [theme.seriesColors[0]!]
    })).toBe("");
  });
});
