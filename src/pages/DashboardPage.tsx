import { Button } from "antd";
import { Plus, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { XsEChart } from "@/components/xs";
import { getDashboardChartOptions } from "@/services/dashboardService";
import { PageFrame } from "./PageFrame";

const productRanks = [
  ["1", "AI 数据分析平台", "￥1.24亿", "↑12%"],
  ["2", "智能知识库系统", "￥0.86亿", "↑8%"],
  ["3", "数据可视化套件", "￥0.52亿", "—"],
  ["4", "自动化报告引擎", "￥0.38亿", "↓3%"]
];

const dashboardNames = ["经营分析看板", "风险监控看板"];
const alertItems = [
  { title: "销售额环比下降 12.3%", time: "5分钟前", tone: "warning" },
  { title: "服务器响应延迟升高", time: "23分钟前", tone: "warning" },
  { title: "数据同步已完成", time: "1小时前", tone: "success" }
];

export function DashboardPage() {
  const options = getDashboardChartOptions();
  const [activeDashboardName, setActiveDashboardName] = useState(dashboardNames[0]);
  const [workflowStatus, setWorkflowStatus] = useState("");

  const handleSwitchDashboard = () => {
    const currentIndex = dashboardNames.indexOf(activeDashboardName);
    const nextName = dashboardNames[(currentIndex + 1) % dashboardNames.length];

    setActiveDashboardName(nextName);
    setWorkflowStatus(`已切换至${nextName}`);
  };

  const handleCreateDashboard = () => {
    setWorkflowStatus("已创建新建看板任务");
  };

  const handleOpenCard = (title: string) => {
    setWorkflowStatus(`已打开看板组件：${title}`);
  };

  const handleAlert = (title: string) => {
    setWorkflowStatus(`已处理预警：${title}`);
  };

  return (
    <PageFrame
      title="我的看板"
      subtitle={`当前看板：${activeDashboardName}`}
      className="dashboard-page"
      actions={<><span>12 个指标 · 8 个组件 · 更新于今日 14:30</span><Button onClick={handleSwitchDashboard}>切换看板</Button><Button type="primary" icon={<Plus size={18} />} onClick={handleCreateDashboard}>新建看板</Button></>}
    >
      {workflowStatus ? <p className="workflow-status" role="status">{workflowStatus}</p> : null}
      <section className="board-grid" aria-label={activeDashboardName}>
        <article className="xs-card board-card">
          <h2>月度营收趋势</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 月度营收趋势" onClick={() => handleOpenCard("月度营收趋势")}>查看</Button>
          <div className="revenue-value"><strong>￥2.84<br />亿</strong><div><span>↑ 8.3% 环比</span><small>vs 同期 +15.2%</small></div></div>
          <XsEChart option={options.revenue} label="月度营收趋势图" className="chart-mini" />
          <div className="metric-row"><span>完成率 <b>94%</b></span><span>上月 <b>￥2.62亿</b></span></div>
        </article>
        <article className="xs-card board-card">
          <h2>渠道转化分析</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 渠道转化分析" onClick={() => handleOpenCard("渠道转化分析")}>查看</Button>
          <XsEChart option={options.channel} label="渠道转化分析图" className="chart-medium" />
          <p>综合转化率 <strong>3.2%</strong> <span className="success-text">↑ 0.4pp</span></p>
        </article>
        <article className="xs-card board-card">
          <h2>销售预测</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 销售预测" onClick={() => handleOpenCard("销售预测")}>查看</Button>
          <XsEChart option={options.salesLine} label="销售预测折线图" className="chart-medium" />
          <div className="metric-row"><span>Q3预测 <b>1.86亿</b></span><span>Q4目标 <b>2.15亿</b></span></div>
        </article>
        <article className="xs-card board-card">
          <h2>客户画像分布</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 客户画像分布" onClick={() => handleOpenCard("客户画像分布")}>查看</Button>
          <XsEChart option={options.customer} label="客户画像分布图" className="chart-medium" />
          <div className="legend-grid"><span>企业客户 75%</span><span>中小客户 15%</span><span>个人用户 10%</span></div>
        </article>
        <article className="xs-card board-card">
          <h2>TOP 产品营收</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 TOP 产品营收" onClick={() => handleOpenCard("TOP 产品营收")}>查看</Button>
          <div className="ranking-list">{productRanks.map(([rank, name, value, change]) => <div key={name}><span>{rank}</span><span>{name}</span><b>{value}</b><em>{change}</em></div>)}</div>
        </article>
        <article className="xs-card board-card">
          <h2>实时运营概览</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 实时运营概览" onClick={() => handleOpenCard("实时运营概览")}>查看</Button>
          <div className="ops-grid"><div><strong>847</strong>在线用户</div><div><strong>94</strong>API QPS</div><div><strong>99.97%</strong>可用率</div><div><strong>236ms</strong>平均响应</div></div>
          <XsEChart option={options.ops} label="实时运营柱状图" className="chart-mini" />
        </article>
        <article className="xs-card board-card">
          <h2>区域业绩排行</h2>
          <Button type="link" className="xs-card-action" aria-label="查看 区域业绩排行" onClick={() => handleOpenCard("区域业绩排行")}>查看</Button>
          <XsEChart option={options.region} label="区域业绩排行图" className="chart-medium" />
        </article>
        <article className="xs-card board-card">
          <h2>智能预警 <span>3条未处理</span></h2>
          <div className="alert-list">
            {alertItems.map((alert) => (
              <button
                type="button"
                key={alert.title}
                aria-label={`处理 ${alert.title}`}
                onClick={() => handleAlert(alert.title)}
              >
                {alert.tone === "warning" ? <WarningCircle size={18} /> : <CheckCircle size={18} />}
                <span>{alert.title}</span>
                <small>{alert.time}</small>
              </button>
            ))}
          </div>
        </article>
      </section>
    </PageFrame>
  );
}
