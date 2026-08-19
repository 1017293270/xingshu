/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildChartViews } from "@/pages/dataDashboardCharts";
import type { DataAssetOverview } from "@/types/dataAsset";

const allowedAlignments = new Set(["left", "right", "center"]);
const allowedSeriesLabelPositions = new Set([
  "left",
  "right",
  "top",
  "bottom",
  "inside",
  "insideTop",
  "insideBottom",
  "insideLeft",
  "insideRight"
]);

type AnyRecord = Record<string, unknown>;

/** 覆盖每种图表形态：环形、双轴折线、横向条、纵向柱 */
const overview: DataAssetOverview = {
  updatedAt: "2026-08-11T08:00:00Z",
  range: "30D",
  kpis: {
    assetCount: 6,
    dataVolumeBytes: 2 * 1024 ** 3,
    unstructuredCount: 2,
    tableCount: 4,
    dataSourceCount: 3,
    serviceCallCount: 9
  },
  typeDistribution: [{ type: "STRUCTURED", count: 4 }, { type: "DOCUMENT", count: 2 }],
  growth: [
    { date: "2026-08-10", assetCount: 5, dataVolumeBytes: 1024 ** 3 },
    { date: "2026-08-11", assetCount: 6, dataVolumeBytes: 2 * 1024 ** 3 }
  ],
  sourceDistribution: [{ type: "DATABASE", count: 2 }, { type: "EXCEL", count: 1 }],
  usageByScenario: [{ scenario: "ASK_DATA", count: 6 }, { scenario: "KNOWLEDGE_QA", count: 3 }],
  hotAssets: [{ assetId: "asset-1", assetName: "订单表", assetType: "STRUCTURED", callCount: 6 }]
};

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
    .filter((axis) => axis.show !== false)
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
  const chartOptions = Object.values(buildChartViews(overview)).map((view) => view.option);

  it("uses explicit alignment for visible chart axis text", () => {
    const labels = chartOptions.flatMap(collectAxisLabels);

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(allowedAlignments.has(String(label.align))).toBe(true);
    }
  });

  it("declares explicit alignment and placement for visible series labels", () => {
    const labels = chartOptions.flatMap(collectVisibleSeriesLabels);

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(allowedAlignments.has(String(label.align))).toBe(true);
      expect(allowedSeriesLabelPositions.has(String(label.position))).toBe(true);
    }
  });

  it("keeps chart card titles on one line", () => {
    const css = readFileSync("src/pages/styles/data-assets.css", "utf8");

    expect(css).toContain(".data-card h2");
    expect(css).toContain("white-space: nowrap");
  });
});
