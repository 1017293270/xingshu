import type { EChartsOption } from "echarts";
import type { DataAssetKpiIconId, DataAssetOverview, XsTone } from "@/types/dataAsset";
import type { DataHubTableResult } from "@/types/dataHub";

export const typeLabels: Record<string, string> = {
  STRUCTURED: "结构化数据",
  DOCUMENT: "文档",
  IMAGE: "图片",
  AUDIO: "音频",
  VIDEO: "视频",
  QUERY_ASSET: "问数结果"
};

export const sourceLabels: Record<string, string> = {
  DATABASE: "数据库",
  EXCEL: "Excel",
  API: "API",
  MANUAL: "手工录入",
  OTHER: "其他"
};

export const scenarioLabels: Record<string, string> = {
  KNOWLEDGE_QA: "问知",
  ASK_DATA: "问数",
  DOCUMENT_SEARCH: "找文档",
  TABLE_GENERATION: "智能制表",
  OFFICIAL_DOCUMENT: "公文写作"
};

export type DashboardKpi = {
  id: DataAssetKpiIconId;
  label: string;
  value: string;
  note: string;
  tone: Extract<XsTone, "blue" | "cyan" | "green" | "orange" | "purple">;
};

export type ChartView = {
  summary: string;
  option: EChartsOption;
  table: DataHubTableResult;
};

export function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

export function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

export function formatBytes(value: number) {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function chartTable(
  groupLabel: string,
  columns: DataHubTableResult["columns"],
  rows: DataHubTableResult["rows"]
): DataHubTableResult {
  return { columns, rows, totalRows: rows.length, groupLabel, source: "live" };
}

export function buildKpis(overview: DataAssetOverview): DashboardKpi[] {
  return [
    { id: "data-assets", label: "数据资产总量", value: formatCount(overview.kpis.assetCount), note: "本人一级资产", tone: "blue" },
    { id: "data-volume", label: "数据总量", value: formatBytes(overview.kpis.dataVolumeBytes), note: "本人一级资产", tone: "green" },
    { id: "media-documents", label: "非结构化数据资产数量", value: formatCount(overview.kpis.unstructuredCount), note: "READY 文件", tone: "purple" },
    { id: "data-tables", label: "数据表数量", value: formatCount(overview.kpis.tableCount), note: "已选择数据表", tone: "cyan" },
    { id: "data-apis", label: "数据源数量", value: formatCount(overview.kpis.dataSourceCount), note: "本人创建且有效", tone: "orange" },
    { id: "service-calls", label: "数据服务调用量", value: formatCount(overview.kpis.serviceCallCount), note: `近 ${overview.range}`, tone: "blue" }
  ];
}

/**
 * 图表文本一律显式声明 align 与 position，不依赖 ECharts 默认值。
 * `chartTypography.test.ts` 直接校验这里产出的配置。
 */
export function buildChartViews(overview: DataAssetOverview) {
  const typeRows = overview.typeDistribution.map((item) => ({
    type: labelFor(typeLabels, item.type),
    count: item.count
  }));
  const growthRows = overview.growth.map((item) => ({
    date: item.date,
    assetCount: item.assetCount,
    dataVolumeBytes: item.dataVolumeBytes,
    dataVolume: formatBytes(item.dataVolumeBytes)
  }));
  const sourceRows = overview.sourceDistribution.map((item) => ({
    source: labelFor(sourceLabels, item.type),
    count: item.count
  }));
  const usageRows = overview.usageByScenario.map((item) => ({
    scenario: labelFor(scenarioLabels, item.scenario),
    count: item.count
  }));
  const maxVolume = Math.max(0, ...overview.growth.map((item) => item.dataVolumeBytes));
  const volumeDivisor = maxVolume >= 1024 ** 4 ? 1024 ** 4 : maxVolume >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2;
  const volumeUnit = volumeDivisor === 1024 ** 4 ? "TB" : volumeDivisor === 1024 ** 3 ? "GB" : "MB";

  const donut: ChartView = {
    summary: `当前共 ${formatCount(overview.kpis.assetCount)} 项本人一级数据资产。`,
    option: {
      color: ["#2C75FF", "#75C9F2", "#91DFAD", "#F1DB3D", "#E9A7FF"],
      legend: { orient: "vertical", right: 0, top: "middle", textStyle: { color: "#294469", fontSize: 12 } },
      series: [{
        type: "pie",
        radius: ["44%", "72%"],
        center: ["38%", "50%"],
        label: { show: false },
        data: typeRows.map((item) => ({ name: item.type, value: item.count }))
      }]
    },
    table: chartTable(
      "数据资产类型分布",
      [{ key: "type", title: "资产类型" }, { key: "count", title: "数量", type: "number" }],
      typeRows
    )
  };

  const growth: ChartView = {
    summary: overview.growth.length > 1
      ? `当前范围包含 ${overview.growth.length} 个真实快照点，不补造上线前历史。`
      : "当前仅有首次打开看板形成的真实快照，后续访问将逐日形成趋势。",
    option: {
      color: ["#1677FF", "#75C6F5"],
      grid: { left: 48, right: 52, top: 36, bottom: 34 },
      legend: { top: 0, left: 70, itemWidth: 18, itemHeight: 4, textStyle: { color: "#294469", fontSize: 12 } },
      xAxis: {
        type: "category",
        data: growthRows.map((item) => item.date),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#DCE8FB" } },
        axisLabel: { color: "#6B7F9D", align: "center" }
      },
      yAxis: [
        {
          name: "个",
          type: "value",
          min: 0,
          splitLine: { lineStyle: { color: "#EDF2FB" } },
          axisLabel: { color: "#6B7F9D", align: "right" }
        },
        {
          name: volumeUnit,
          type: "value",
          position: "right",
          min: 0,
          splitLine: { show: false },
          axisLabel: { color: "#6B7F9D", align: "left" }
        }
      ],
      series: [
        { name: "数据资产总量（个）", type: "line", smooth: true, symbolSize: 6, data: growthRows.map((item) => item.assetCount), lineStyle: { width: 3 } },
        { name: `数据总量（${volumeUnit}）`, type: "line", yAxisIndex: 1, smooth: true, symbolSize: 6, data: overview.growth.map((item) => Number((item.dataVolumeBytes / volumeDivisor).toFixed(2))), lineStyle: { width: 3 } }
      ]
    },
    table: chartTable(
      "数据资产增长趋势",
      [
        { key: "date", title: "日期" },
        { key: "assetCount", title: "资产总量（个）", type: "number" },
        { key: "dataVolume", title: "数据总量" }
      ],
      growthRows
    )
  };

  const source: ChartView = {
    summary: `当前共有 ${formatCount(overview.kpis.dataSourceCount)} 个本人创建的有效数据源。`,
    option: {
      grid: { left: 86, right: 48, top: 10, bottom: 10 },
      xAxis: { type: "value", min: 0, show: false },
      yAxis: {
        type: "category",
        inverse: true,
        data: sourceRows.map((item) => item.source),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#294469", fontSize: 13, align: "right" }
      },
      series: [{
        type: "bar",
        barWidth: 14,
        data: sourceRows.map((item) => item.count),
        showBackground: true,
        backgroundStyle: { color: "#EDF5FF", borderRadius: 9 },
        label: { show: true, position: "right", align: "left", color: "#294469", fontSize: 13, fontWeight: 700 },
        itemStyle: { borderRadius: 9, color: "#1677FF" }
      }]
    },
    table: chartTable(
      "数据来源分布",
      [{ key: "source", title: "数据来源" }, { key: "count", title: "数量", type: "number" }],
      sourceRows
    )
  };

  const usage: ChartView = {
    summary: `当前范围共记录 ${formatCount(overview.kpis.serviceCallCount)} 次成功数据调用。`,
    option: {
      grid: { left: 42, right: 42, top: 20, bottom: 34 },
      xAxis: {
        type: "category",
        data: usageRows.map((item) => item.scenario),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#DCE8FB" } },
        axisLabel: { color: "#4B5D77", fontSize: 11, align: "center" }
      },
      yAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
        splitLine: { lineStyle: { color: "#EDF2FB" } },
        axisLabel: { color: "#6B7F9D", align: "right" }
      },
      series: [{
        type: "bar",
        barMaxWidth: 32,
        data: usageRows.map((item) => item.count),
        label: { show: true, position: "top", align: "center", color: "#081A3A" },
        itemStyle: { borderRadius: [4, 4, 0, 0], color: "#2F7CF7" }
      }]
    },
    table: chartTable(
      "数据应用场景",
      [{ key: "scenario", title: "应用场景" }, { key: "count", title: "调用次数", type: "number" }],
      usageRows
    )
  };

  return { donut, growth, source, usage };
}
