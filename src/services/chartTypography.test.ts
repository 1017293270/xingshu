/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDashboardChartOptions, getDataAssetChartOptions, getSalesAnalysisResult } from "./dashboardService";

const allowedAlignments = new Set(["left", "right"]);

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function collectAxisLabels(option: unknown): AnyRecord[] {
  if (!isRecord(option)) {
    return [];
  }

  return [...toArray(option.xAxis), ...toArray(option.yAxis)]
    .filter(isRecord)
    .map((axis) => axis.axisLabel)
    .filter(isRecord)
    .filter((axisLabel) => axisLabel.show !== false);
}

function collectVisibleSeriesLabels(option: unknown): AnyRecord[] {
  if (!isRecord(option)) {
    return [];
  }

  return toArray(option.series)
    .filter(isRecord)
    .map((series) => series.label)
    .filter(isRecord)
    .filter((label) => label.show === true);
}

describe("chart typography", () => {
  const chartOptions = [
    getSalesAnalysisResult().salesTrendOption,
    ...Object.values(getDashboardChartOptions()),
    ...Object.values(getDataAssetChartOptions())
  ];

  it("uses explicit left or right alignment for visible chart axis text", () => {
    const labels = chartOptions.flatMap(collectAxisLabels);

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(allowedAlignments.has(String(label.align))).toBe(true);
    }
  });

  it("places visible series labels on the left or right side", () => {
    const labels = chartOptions.flatMap(collectVisibleSeriesLabels);

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(allowedAlignments.has(String(label.align)) || allowedAlignments.has(String(label.position))).toBe(true);
    }
  });

  it("keeps chart card titles on one line", () => {
    const css = readFileSync("src/pages/pages.css", "utf8");

    expect(css).toContain(".data-card h2");
    expect(css).toContain(".board-card h2");
    expect(css).toContain(".xs-card--inner h3");
    expect(css).toContain("white-space: nowrap");
  });
});
