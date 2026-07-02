import { Button } from "antd";
import { CirclesThreePlus, Database, Files, ShareNetwork, Stack, Table } from "@phosphor-icons/react";
import { XsEChart, XsIconTile } from "@/components/xs";
import { getDataAssetChartOptions } from "@/services/dashboardService";
import { PageFrame } from "./PageFrame";

const kpis = [
  ["数据资产总量", "12,846 ↑", "较昨日 ↑ 5.2%", Database, "blue"],
  ["数据总量", "28.6 TB", "较昨日 ↑ 8.1%", Stack, "green"],
  ["多媒体文档数量", "8,532", "较昨日 ↑ 6.7%", Files, "purple"],
  ["数据表数量", "4,328", "较昨日 ↑ 7.3%", Table, "blue"],
  ["数据接口数量", "1,256", "较昨日 ↑ 3.4%", ShareNetwork, "orange"],
  ["数据服务调用量", "32.8 万次", "较昨日 ↑ 12.3%", CirclesThreePlus, "cyan"]
] as const;

export function DataDashboardPage() {
  const options = getDataAssetChartOptions();

  return (
    <PageFrame title="数据资产看板" subtitle="全局掌握企业数据资产规模、质量与应用价值" actions={<><span>数据更新于 2024-06-04 14:30:00</span><Button>2024-06-04</Button></>} className="data-dashboard-page">
      <section className="data-kpis" aria-label="数据资产指标">
        {kpis.map(([label, value, delta, Icon, tone]) => (
          <article className="xs-card stat-card" key={label}>
            <XsIconTile icon={Icon} label={label} tone={tone} />
            <div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div>
          </article>
        ))}
      </section>
      <section className="data-dashboard-grid" aria-label="数据资产图表">
        <article className="xs-card data-card"><h2>数据资产类型分布</h2><XsEChart option={options.donut} label="数据资产类型分布图" className="chart-large" /></article>
        <article className="xs-card data-card"><h2>数据资产增长趋势</h2><XsEChart option={options.growth} label="数据资产增长趋势图" className="chart-large" /></article>
        <article className="xs-card data-card"><h2>数据来源分布</h2><XsEChart option={options.source} label="数据来源分布图" className="chart-large" /></article>
      </section>
      <section className="data-bottom-grid" aria-label="数据资产应用">
        <article className="xs-card data-card"><h2>数据应用场景 Top10</h2><XsEChart option={options.top} label="数据应用场景排行图" className="chart-large" /></article>
        <article className="xs-card data-card data-table"><h2>热门数据资产</h2><table className="xs-table"><tbody>{["客户基础信息表", "交易订单明细表", "产品销售汇总表", "供应商信息表", "用户行为日志表"].map((name, index) => <tr key={name}><td>{index + 1}　{name}</td><td>{[12.6, 9.8, 8.7, 6.3, 5.4][index]} TB</td></tr>)}</tbody></table></article>
      </section>
    </PageFrame>
  );
}
