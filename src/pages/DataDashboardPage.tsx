import { Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { resolveXsAsyncStatus, XsAsyncPanel, XsChartCard, XsIconTile, XsStatusBar } from "@/components/xs";
import kpiDataApisIcon from "@/assets/data-dashboard-icons/kpi-data-apis.png";
import kpiDataAssetsIcon from "@/assets/data-dashboard-icons/kpi-data-assets.png";
import kpiDataTablesIcon from "@/assets/data-dashboard-icons/kpi-data-tables.png";
import kpiDataVolumeIcon from "@/assets/data-dashboard-icons/kpi-data-volume.png";
import kpiMediaDocumentsIcon from "@/assets/data-dashboard-icons/kpi-media-documents.png";
import kpiServiceCallsIcon from "@/assets/data-dashboard-icons/kpi-service-calls.png";
import {
  getDataAssetChartInsights,
  getDataAssetChartOptions,
  getDataAssetUpdateStatus
} from "@/services/dashboardService";
import { getDataAssetKpis } from "@/services/dataAssetService";
import type { DataAssetKpiIconId } from "@/types/dataAsset";
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

export function DataDashboardPage() {
  const options = getDataAssetChartOptions();
  const chartInsights = getDataAssetChartInsights();
  const dataUpdate = getDataAssetUpdateStatus();
  const freshnessMessage = dataUpdate.isStale
    ? `数据已超过 ${dataUpdate.staleAfterHours} 小时未更新，请谨慎解读当前指标。`
    : "";
  const kpiQuery = useQuery({
    queryKey: ["dataAssetKpis"],
    queryFn: getDataAssetKpis
  });
  const kpis = kpiQuery.data ?? [];
  const kpiStatus = resolveXsAsyncStatus({
    isPending: kpiQuery.isPending,
    isFetching: kpiQuery.isFetching,
    isError: kpiQuery.isError,
    hasData: kpiQuery.data !== undefined
  });
  const hotAssets = ["客户基础信息表", "交易订单明细表", "产品销售汇总表", "供应商信息表", "用户行为日志表"];
  const unavailableDetailAction = (name: string) => (
    <Button
      type="link"
      className="xs-mini-link"
      aria-label={`查看 ${name} 明细`}
      aria-describedby="data-asset-details-availability"
      disabled
    >
      查看明细
    </Button>
  );

  return (
    <PageFrame
      title="数据资产看板"
      subtitle="全局掌握企业数据资产规模、质量与应用价值"
      actions={
        <>
          <time dateTime={dataUpdate.updatedAt}>数据更新于 {dataUpdate.updatedAtLabel}</time>
          <Link className="xs-action-link xs-action-link--primary" to="/data-management">管理数据资产</Link>
        </>
      }
      className="data-dashboard-page"
    >
      <XsStatusBar
        tone="warning"
        label="数据新鲜度"
        message={freshnessMessage}
      />
      <div id="data-asset-details-availability">
        <XsStatusBar
          tone="info"
          label="明细功能"
          message="指标下钻、资产明细与热门资产详情即将开放；当前可查看图表摘要与来源数据。"
        />
      </div>
      <XsAsyncPanel
        status={kpiStatus}
        empty={kpis.length === 0}
        emptyDescription="暂无数据资产指标。"
        error="数据资产指标加载失败，请稍后重试。"
        onRetry={() => void kpiQuery.refetch()}
      >
        <section className="data-kpis data-kpis--mobile-2x2" aria-label="数据资产指标">
          {kpis.map((kpi) => (
            <article
              className="xs-card stat-card"
              key={kpi.id}
              aria-label={`${kpi.label}，指标下钻即将开放`}
              aria-describedby="data-asset-details-availability"
            >
              <XsIconTile imageSrc={kpiIconById[kpi.iconId]} label={kpi.label} tone={kpi.tone} />
              <div><span>{kpi.label}</span><strong>{kpi.value}</strong><small>{kpi.delta}</small></div>
            </article>
          ))}
        </section>
      </XsAsyncPanel>
      <section className="data-dashboard-grid" aria-label="数据资产图表">
        <XsChartCard
          title="数据资产类型分布"
          summary={chartInsights.donut.summary}
          option={options.donut}
          table={chartInsights.donut.table}
          headingLevel={2}
          className="data-card"
          chartClassName="chart-large"
          action={unavailableDetailAction("数据资产类型分布")}
        />
        <XsChartCard
          title="数据资产增长趋势"
          summary={chartInsights.growth.summary}
          option={options.growth}
          table={chartInsights.growth.table}
          headingLevel={2}
          className="data-card"
          chartClassName="chart-large"
          action={unavailableDetailAction("数据资产增长趋势")}
        />
        <XsChartCard
          title="数据来源分布"
          summary={chartInsights.source.summary}
          option={options.source}
          table={chartInsights.source.table}
          headingLevel={2}
          className="data-card"
          chartClassName="chart-large"
          action={unavailableDetailAction("数据来源分布")}
        />
      </section>
      <section className="data-bottom-grid" aria-label="数据资产应用">
        <XsChartCard
          title="数据应用场景 Top10"
          summary={chartInsights.top.summary}
          option={options.top}
          table={chartInsights.top.table}
          headingLevel={2}
          className="data-card"
          chartClassName="chart-large"
          action={unavailableDetailAction("数据应用场景 Top10")}
        />
        <article className="xs-card data-card data-table">
          <h2>热门数据资产</h2>
          <table className="xs-table">
            <caption className="sr-only">热门数据资产</caption>
            <thead>
              <tr>
                <th scope="col">排名</th>
                <th scope="col">资产名称</th>
                <th scope="col">存储量</th>
              </tr>
            </thead>
            <tbody>
              {hotAssets.map((name, index) => (
                <tr key={name}>
                  <td>{index + 1}</td>
                  <td aria-describedby="data-asset-details-availability"><strong>{name}</strong></td>
                  <td>{[12.6, 9.8, 8.7, 6.3, 5.4][index]} TB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </PageFrame>
  );
}
