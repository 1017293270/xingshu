import type { DataHubTableResult } from "@/types/dataHub";
import {
  analysisRows,
  assetApplicationLabels,
  assetApplicationValues,
  assetGrowthLabels,
  assetGrowthValues,
  assetOptions,
  assetSourceLabels,
  assetSourceValues,
  assetTypeLabels,
  assetTypeValues,
  channelLabels,
  channelValues,
  customerLabels,
  customerValues,
  dashboardOptions,
  dataAssetSnapshot,
  productLabels,
  productValues,
  regionLabels,
  regionValues,
  revenueMonths,
  revenueValues,
  salesForecastLabels,
  salesForecastValues,
  salesTrendOption
} from "./mock/dashboardMock";

type ChartInsight = {
  summary: string;
  table: DataHubTableResult;
};

function chartTable(
  groupLabel: string,
  columns: DataHubTableResult["columns"],
  rows: DataHubTableResult["rows"]
): DataHubTableResult {
  return { columns, rows, totalRows: rows.length, groupLabel, source: "mock" };
}

export function getDashboardChartInsights(): Record<keyof typeof dashboardOptions, ChartInsight> {
  return {
    revenue: {
      summary: "12 月营收指数回升至 94，较 11 月增加 7 个点。",
      table: chartTable(
        "月度营收趋势",
        [{ key: "period", title: "月份" }, { key: "value", title: "营收指数", type: "number" }],
        revenueMonths.map((period, index) => ({ period, value: revenueValues[index] }))
      )
    },
    salesLine: {
      summary: "W7 达到阶段峰值 52，W8 回落至 48。",
      table: chartTable(
        "销售预测",
        [{ key: "period", title: "周期" }, { key: "value", title: "预测指数", type: "number" }],
        salesForecastLabels.map((period, index) => ({ period, value: salesForecastValues[index] }))
      )
    },
    channel: {
      summary: "搜索引擎转化率最高为 35%，广告投放为 8%。",
      table: chartTable(
        "渠道转化分析",
        [{ key: "channel", title: "渠道" }, { key: "rate", title: "转化率（%）", type: "number" }],
        channelLabels.map((channel, index) => ({ channel, rate: channelValues[index] }))
      )
    },
    customer: {
      summary: "企业客户占 75%，是当前主要客户群。",
      table: chartTable(
        "客户画像分布",
        [{ key: "segment", title: "客户类型" }, { key: "share", title: "占比（%）", type: "number" }],
        customerLabels.map((segment, index) => ({ segment, share: customerValues[index] }))
      )
    },
    region: {
      summary: "华东以 6,820 万位列第一，领先华南 700 万。",
      table: chartTable(
        "区域业绩排行",
        [{ key: "region", title: "区域" }, { key: "revenue", title: "营收（万元）", type: "number" }],
        regionLabels.map((region, index) => ({ region, revenue: regionValues[index] }))
      )
    },
    productRank: {
      summary: "AI 数据分析平台营收 1.24 亿，在四项产品中排名第一。",
      table: chartTable(
        "TOP 产品营收",
        [{ key: "product", title: "产品" }, { key: "revenue", title: "营收（亿元）", type: "number" }],
        productLabels.map((product, index) => ({ product, revenue: productValues[index] }))
      )
    }
  };
}

export function getDataAssetChartInsights(): Record<keyof typeof assetOptions, ChartInsight> {
  return {
    donut: {
      summary: "结构化数据共 5,861 项，在五类资产中占比最高。",
      table: chartTable(
        "数据资产类型分布",
        [{ key: "type", title: "资产类型" }, { key: "count", title: "数量", type: "number" }],
        assetTypeLabels.map((type, index) => ({ type, count: assetTypeValues[index] }))
      )
    },
    growth: {
      summary: `截至 ${dataAssetSnapshot.date}，资产总量增至 ${dataAssetSnapshot.assetCount.toLocaleString("zh-CN")} 个，数据容量同步增至 ${dataAssetSnapshot.dataVolumeTb} TB。`,
      table: chartTable(
        "数据资产增长趋势",
        [
          { key: "date", title: "日期" },
          { key: "assetCount", title: "资产总量（个）", type: "number" },
          { key: "dataVolumeTb", title: "数据总量（TB）", type: "number" }
        ],
        assetGrowthLabels.map((date, index) => ({
          date,
          assetCount: assetGrowthValues.assetCount[index],
          dataVolumeTb: assetGrowthValues.dataVolumeTb[index]
        }))
      )
    },
    top: {
      summary: "经营分析应用量为 14.2，位列十大数据应用场景第一。",
      table: chartTable(
        "数据应用场景 Top10",
        [{ key: "scene", title: "应用场景" }, { key: "value", title: "应用量", type: "number" }],
        assetApplicationLabels.map((scene, index) => ({ scene, value: assetApplicationValues[index] }))
      )
    },
    source: {
      summary: "业务系统贡献 42.3% 的数据来源，占比最高。",
      table: chartTable(
        "数据来源分布",
        [{ key: "source", title: "数据来源" }, { key: "share", title: "占比（%）", type: "number" }],
        assetSourceLabels.map((source, index) => ({ source, share: assetSourceValues[index] }))
      )
    }
  };
}

export function getDashboardChartOptions() {
  return dashboardOptions;
}

export function getDataAssetChartOptions() {
  return assetOptions;
}

export function getSalesAnalysisResult() {
  return {
    rows: analysisRows,
    salesTrendOption
  };
}
