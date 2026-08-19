import { useMemo, useState } from "react";
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
import type { DataAssetKpiIconId, DataAssetOverviewRange } from "@/types/dataAsset";
import { buildChartViews, buildKpis, formatCount, labelFor, typeLabels } from "./dataDashboardCharts";
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
