import { Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { resolveXsAsyncStatus, XsAsyncPanel, XsEChart, XsIconTile, XsStatusBar } from "@/components/xs";
import kpiDataApisIcon from "@/assets/data-dashboard-icons/kpi-data-apis.png";
import kpiDataAssetsIcon from "@/assets/data-dashboard-icons/kpi-data-assets.png";
import kpiDataTablesIcon from "@/assets/data-dashboard-icons/kpi-data-tables.png";
import kpiDataVolumeIcon from "@/assets/data-dashboard-icons/kpi-data-volume.png";
import kpiMediaDocumentsIcon from "@/assets/data-dashboard-icons/kpi-media-documents.png";
import kpiServiceCallsIcon from "@/assets/data-dashboard-icons/kpi-service-calls.png";
import { getDataAssetChartOptions } from "@/services/dashboardService";
import { getDataAssetKpis } from "@/services/dataAssetService";
import type { DataAssetKpiIconId } from "@/types/dataAsset";
import { PageFrame } from "./PageFrame";

const kpiIconById: Record<DataAssetKpiIconId, string> = {
  "data-assets": kpiDataAssetsIcon,
  "data-volume": kpiDataVolumeIcon,
  "media-documents": kpiMediaDocumentsIcon,
  "data-tables": kpiDataTablesIcon,
  "data-apis": kpiDataApisIcon,
  "service-calls": kpiServiceCallsIcon
};

export function DataDashboardPage() {
  const [currentDate, setCurrentDate] = useState("2024-06-04");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const options = getDataAssetChartOptions();
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

  const handleDateChange = () => {
    const nextDate = currentDate === "2024-06-04" ? "2024-06-03" : "2024-06-04";
    setCurrentDate(nextDate);
    setWorkflowStatus(`已切换数据日期：${nextDate}`);
  };

  return (
    <PageFrame title="数据资产看板" subtitle="全局掌握企业数据资产规模、质量与应用价值" actions={<><span>数据更新于 {currentDate} 14:30:00</span><Button onClick={handleDateChange}>{currentDate}</Button><Link className="xs-action-link xs-action-link--primary" to="/data-management">管理数据资产</Link></>} className="data-dashboard-page">
      <XsStatusBar tone="success" label="操作" message={workflowStatus} />
      <XsAsyncPanel
        status={kpiStatus}
        empty={kpis.length === 0}
        emptyDescription="暂无数据资产指标。"
        error="数据资产指标加载失败，请稍后重试。"
        onRetry={() => void kpiQuery.refetch()}
      >
        <section className="data-kpis" aria-label="数据资产指标">
          {kpis.map((kpi) => (
            <Link className="xs-card stat-card xs-card-link" key={kpi.id} to={`/data-management?source=${encodeURIComponent(kpi.label)}`}>
              <XsIconTile imageSrc={kpiIconById[kpi.iconId]} label={kpi.label} tone={kpi.tone} />
              <div><span>{kpi.label}</span><strong>{kpi.value}</strong><small>{kpi.delta}</small></div>
            </Link>
          ))}
        </section>
      </XsAsyncPanel>
      <section className="data-dashboard-grid" aria-label="数据资产图表">
        <article className="xs-card data-card"><h2>数据资产类型分布</h2><Link className="xs-mini-link" to="/data-management?source=数据资产类型分布">查看明细</Link><XsEChart option={options.donut} label="数据资产类型分布图" className="chart-large" /></article>
        <article className="xs-card data-card"><h2>数据资产增长趋势</h2><Link className="xs-mini-link" to="/data-management?source=数据资产增长趋势">查看明细</Link><XsEChart option={options.growth} label="数据资产增长趋势图" className="chart-large" /></article>
        <article className="xs-card data-card"><h2>数据来源分布</h2><Link className="xs-mini-link" to="/data-management?source=数据来源分布">查看明细</Link><XsEChart option={options.source} label="数据来源分布图" className="chart-large" /></article>
      </section>
      <section className="data-bottom-grid" aria-label="数据资产应用">
        <article className="xs-card data-card"><h2>数据应用场景 Top10</h2><Link className="xs-mini-link" to="/data-management?source=数据应用场景 Top10">查看明细</Link><XsEChart option={options.top} label="数据应用场景排行图" className="chart-large" /></article>
        <article className="xs-card data-card data-table"><h2>热门数据资产</h2><table className="xs-table"><tbody>{hotAssets.map((name, index) => <tr key={name}><td>{index + 1}　<Link to={`/data-management?source=${encodeURIComponent(name)}`}>{name}</Link></td><td>{[12.6, 9.8, 8.7, 6.3, 5.4][index]} TB</td></tr>)}</tbody></table></article>
      </section>
    </PageFrame>
  );
}
