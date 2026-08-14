import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Segmented } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsCapabilityStatus } from "@/components/xs/XsCapabilityStatus";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsChartCard } from "@/components/xs/XsChartCard";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsIconTile } from "@/components/xs/XsIconTile";
import { productCapabilities } from "@/config/capabilities";
import kpiDataApisIcon from "@/assets/data-dashboard-icons/kpi-data-apis.png";
import kpiDataAssetsIcon from "@/assets/data-dashboard-icons/kpi-data-assets.png";
import kpiDataTablesIcon from "@/assets/data-dashboard-icons/kpi-data-tables.png";
import kpiDataVolumeIcon from "@/assets/data-dashboard-icons/kpi-data-volume.png";
import kpiMediaDocumentsIcon from "@/assets/data-dashboard-icons/kpi-media-documents.png";
import kpiServiceCallsIcon from "@/assets/data-dashboard-icons/kpi-service-calls.png";
import { getDataAssetOverview } from "@/services/dataAssetService";
import type { DataHubTableResult } from "@/types/dataHub";
import type {
  DataAssetKpiIconId,
  DataAssetOverview,
  DataAssetOverviewRange,
  XsTone
} from "@/types/dataAsset";
import { PageFrame } from "./PageFrame";
import "./styles/data-assets.css";

const kpiIconById: Record<DataAssetKpiIconId, string> = {
  "data-assets": kpiDataAssetsIcon,
  "data-volume": kpiDataVolumeIcon,
  "media-documents": kpiMediaDocumentsIcon,
  "data-tables": kpiDataTablesIcon,
  "data-apis": kpiDataApisIcon,
  "service-calls": kpiServiceCallsIcon
};

const typeLabels: Record<string, string> = {
  STRUCTURED: "结构化数据",
  DOCUMENT: "文档",
  IMAGE: "图片",
  AUDIO: "音频",
  VIDEO: "视频",
  QUERY_ASSET: "问数结果"
};

const sourceLabels: Record<string, string> = {
  DATABASE: "数据库",
  EXCEL: "Excel",
  API: "API",
  MANUAL: "手工录入",
  OTHER: "其他"
};

const scenarioLabels: Record<string, string> = {
  KNOWLEDGE_QA: "问知",
  ASK_DATA: "问数",
  DOCUMENT_SEARCH: "找文档",
  TABLE_GENERATION: "智能制表",
  OFFICIAL_DOCUMENT: "公文写作"
};

type DashboardKpi = {
  id: DataAssetKpiIconId;
  label: string;
  value: string;
  note: string;
  tone: Extract<XsTone, "blue" | "cyan" | "green" | "orange" | "purple">;
};

type ChartView = {
  summary: string;
  option: EChartsOption;
  table: DataHubTableResult;
};

function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatBytes(value: number) {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function formatUpdatedAt(value?: string) {
  if (!value) return "加载中";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function chartTable(
  groupLabel: string,
  columns: DataHubTableResult["columns"],
  rows: DataHubTableResult["rows"]
): DataHubTableResult {
  return { columns, rows, totalRows: rows.length, groupLabel, source: "live" };
}

function buildKpis(overview: DataAssetOverview): DashboardKpi[] {
  return [
    { id: "data-assets", label: "数据资产总量", value: formatCount(overview.kpis.assetCount), note: "本人一级资产", tone: "blue" },
    { id: "data-volume", label: "数据总量", value: formatBytes(overview.kpis.dataVolumeBytes), note: "本人一级资产", tone: "green" },
    { id: "media-documents", label: "非结构化数据资产数量", value: formatCount(overview.kpis.unstructuredCount), note: "READY 文件", tone: "purple" },
    { id: "data-tables", label: "数据表数量", value: formatCount(overview.kpis.tableCount), note: "已选择数据表", tone: "cyan" },
    { id: "data-apis", label: "数据源数量", value: formatCount(overview.kpis.dataSourceCount), note: "本人创建且有效", tone: "orange" },
    { id: "service-calls", label: "数据服务调用量", value: formatCount(overview.kpis.serviceCallCount), note: `近 ${overview.range}`, tone: "blue" }
  ];
}

function buildChartViews(overview: DataAssetOverview) {
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
        axisLabel: { color: "#6B7F9D" }
      },
      yAxis: [
        { name: "个", type: "value", min: 0, splitLine: { lineStyle: { color: "#EDF2FB" } }, axisLabel: { color: "#6B7F9D" } },
        { name: volumeUnit, type: "value", position: "right", min: 0, splitLine: { show: false }, axisLabel: { color: "#6B7F9D" } }
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
        axisLabel: { color: "#294469", fontSize: 13 }
      },
      series: [{
        type: "bar",
        barWidth: 14,
        data: sourceRows.map((item) => item.count),
        showBackground: true,
        backgroundStyle: { color: "#EDF5FF", borderRadius: 9 },
        label: { show: true, position: "right", color: "#294469", fontSize: 13, fontWeight: 700 },
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
        axisLabel: { color: "#4B5D77", fontSize: 11 }
      },
      yAxis: { type: "value", min: 0, minInterval: 1, splitLine: { lineStyle: { color: "#EDF2FB" } }, axisLabel: { color: "#6B7F9D" } },
      series: [{
        type: "bar",
        barMaxWidth: 32,
        data: usageRows.map((item) => item.count),
        label: { show: true, position: "top", color: "#081A3A" },
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

export function DataDashboardPage() {
  const sessionScope = useSessionQueryScope();
  const [range, setRange] = useState<DataAssetOverviewRange>("30D");
  const overviewQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "dataAssetOverview", range),
    queryFn: () => getDataAssetOverview(range),
    retry: false
  });
  const overview = overviewQuery.data;
  const dashboardView = useMemo(
    () => overview ? { kpis: buildKpis(overview), charts: buildChartViews(overview) } : null,
    [overview]
  );
  const overviewStatus = overviewQuery.isError
    ? "error"
    : resolveXsAsyncStatus({
        isPending: overviewQuery.isPending,
        isFetching: overviewQuery.isFetching,
        isError: false,
        hasData: overview !== undefined
      });

  return (
    <PageFrame
      title="数据资产看板"
      subtitle="统计当前空间内，由当前登录用户本人创建或上传的一级数据资产"
      actions={
        <>
          <Segmented
            aria-label="统计范围"
            options={[
              { label: "近7天", value: "7D" },
              { label: "近30天", value: "30D" },
              { label: "近6个月", value: "6M" }
            ]}
            value={range}
            onChange={(value) => setRange(value as DataAssetOverviewRange)}
          />
          <time dateTime={overview?.updatedAt}>数据更新于 {formatUpdatedAt(overview?.updatedAt)}</time>
          <Link className="xs-action-link xs-action-link--primary" to="/data-management">管理数据资产</Link>
        </>
      }
      className="data-dashboard-page"
    >
      <XsCapabilityStatus capability={productCapabilities.dataAssets} />
      <XsAsyncPanel
        status={overviewStatus}
        empty={!overview || !dashboardView}
        emptyDescription="暂无可展示的数据资产汇总。"
        errorTitle="数据资产看板加载失败"
        error="无法取得当前用户的真实数据资产汇总，请检查 DPS 和文档元数据汇总接口。"
        onRetry={() => void overviewQuery.refetch()}
        loadingVariant="metrics"
        contentKey={overviewQuery.dataUpdatedAt}
        preserveContentWhileRefreshing={false}
      >
        {overview && dashboardView ? (
          <>
            <section className="data-kpis data-kpis--mobile-2x2" aria-label="数据资产指标">
              {dashboardView.kpis.map((kpi, index) => (
                <article
                  className="xs-card stat-card data-stat-card--enter"
                  style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
                  key={kpi.id}
                >
                  <XsIconTile imageSrc={kpiIconById[kpi.id]} label={kpi.label} tone={kpi.tone} />
                  <div>
                    <span>{kpi.label}</span>
                    <strong><XsCountUpText value={kpi.value} durationMs={700} /></strong>
                    <small>{kpi.note}</small>
                  </div>
                </article>
              ))}
            </section>
            <section className="data-dashboard-grid" aria-label="数据资产图表">
              <XsChartCard title="数据资产类型分布" {...dashboardView.charts.donut} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" />
              <XsChartCard title="数据资产增长趋势" {...dashboardView.charts.growth} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" />
              <XsChartCard title="数据来源分布" {...dashboardView.charts.source} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" />
            </section>
            <section className="data-bottom-grid" aria-label="数据资产应用">
              <XsChartCard title="数据应用场景" {...dashboardView.charts.usage} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" />
              <article className="xs-card data-card data-table">
                <h2>热门数据资产</h2>
                <table className="xs-table">
                  <caption className="sr-only">按调用次数排序的热门数据资产</caption>
                  <thead>
                    <tr>
                      <th scope="col">排名</th>
                      <th scope="col">资产名称</th>
                      <th scope="col">类型</th>
                      <th scope="col">调用次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.hotAssets.length ? overview.hotAssets.map((asset, index) => (
                      <tr key={asset.assetId}>
                        <td>{index + 1}</td>
                        <td><strong>{asset.assetName}</strong></td>
                        <td>{labelFor(typeLabels, asset.assetType)}</td>
                        <td>{formatCount(asset.callCount)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4}>当前范围暂无成功调用记录</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </article>
            </section>
          </>
        ) : null}
      </XsAsyncPanel>
    </PageFrame>
  );
}
