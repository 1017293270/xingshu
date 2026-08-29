import { describe, expect, it } from "vitest";
import { getDashboardChartVariantGroups, dashboardChartVariants } from "./dashboardChartPresets";
import { dashboardChartThemes, getMatchingDashboardChartThemeId, resolveDashboardWidgetStyle } from "./dashboardChartThemes";

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

  it("lifts legacy dark command-default widgets onto the Xingshu ice surface", () => {
    expect(getMatchingDashboardChartThemeId({
      chartTheme: "command-default",
      background: "rgba(15, 23, 42, 0.82)",
      color: "#dbeafe",
      accent: "#38bdf8"
    })).toBe("command-default");

    expect(resolveDashboardWidgetStyle({
      chartTheme: "command-default",
      background: "rgba(15, 23, 42, 0.82)",
      color: "#dbeafe",
      accent: "#fb7185"
    })).toMatchObject({
      background: "#FFFFFF",
      color: "#294469",
      accent: "#1677FF"
    });
  });
});
