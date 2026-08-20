import { useMemo, useState } from "react";
import { Segmented } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsChartCard } from "@/components/xs/XsChartCard";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsStatCard } from "@/components/xs/XsStatCard";
import { xsMetricGlyphById } from "@/components/xs/XsMetricGlyphs";
import { getDataAssetOverview } from "@/services/dataAssetService";
import type { DataAssetOverviewRange } from "@/types/dataAsset";
import { buildChartViews, buildKpis, formatCount, labelFor, typeLabels } from "./dataDashboardCharts";
import { PageFrame } from "./PageFrame";
import "./styles/data-assets.css";

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
      track="data"
    >
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
            <section className="xs-stat-row" aria-label="数据资产指标">
              {dashboardView.kpis.map((kpi, index) => (
                <XsStatCard
                  key={kpi.id}
                  label={kpi.label}
                  value={<XsCountUpText value={kpi.value} durationMs={700} />}
                  caption={kpi.note}
                  glyph={xsMetricGlyphById[kpi.id]}
                  tone={kpi.tone}
                  step={index + 1}
                />
              ))}
            </section>
            {/* 五张面板同属一个栅格：四张图两两成对，排行表在底部通栏收口，不留空格子 */}
            <section className="data-dashboard-grid" aria-label="数据资产图表与排行">
              <XsChartCard title="数据资产类型分布" {...dashboardView.charts.donut} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" controlsPlacement="head" />
              <XsChartCard title="数据资产增长趋势" {...dashboardView.charts.growth} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" controlsPlacement="head" />
              <XsChartCard title="数据来源分布" {...dashboardView.charts.source} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" controlsPlacement="head" />
              <XsChartCard title="数据应用场景" {...dashboardView.charts.usage} headingLevel={2} className="data-card" chartClassName="chart-large" motionPreset="subtle" controlsPlacement="head" />
              <article className="xs-card data-card data-card--hot data-table">
                <h2>热门数据资产</h2>
                <table className="xs-table">
                  <caption className="sr-only">按调用次数排序的热门数据资产</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="xs-table__numeric">排名</th>
                      <th scope="col">资产名称</th>
                      <th scope="col">类型</th>
                      <th scope="col" className="xs-table__numeric">调用次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.hotAssets.length ? overview.hotAssets.map((asset, index) => (
                      <tr key={asset.assetId}>
                        <td className="xs-table__numeric">{index + 1}</td>
                        <td><strong>{asset.assetName}</strong></td>
                        <td>{labelFor(typeLabels, asset.assetType)}</td>
                        <td className="xs-table__numeric">{formatCount(asset.callCount)}</td>
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
