import { Button } from "antd";
import { Plus, WarningCircle, CheckCircle, SquaresFour } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { XsEChart, XsStatusBar } from "@/components/xs";
import { getDashboardChartOptions } from "@/services/dashboardService";
import { PageFrame } from "./PageFrame";

const productRanks = [
  { rank: "1", name: "AI 数据分析平台", value: "￥1.24亿", change: "↑12%", tone: "up" as const, share: 100 },
  { rank: "2", name: "智能知识库系统", value: "￥0.86亿", change: "↑8%", tone: "up" as const, share: 69 },
  { rank: "3", name: "数据可视化套件", value: "￥0.52亿", change: "—", tone: "flat" as const, share: 42 },
  { rank: "4", name: "自动化报告引擎", value: "￥0.38亿", change: "↓3%", tone: "down" as const, share: 31 }
];

const dashboardNames = ["经营分析看板", "风险监控看板"];
const alertItems = [
  { title: "销售额环比下降 12.3%", time: "5分钟前", tone: "warning" as const },
  { title: "服务器响应延迟升高", time: "23分钟前", tone: "warning" as const },
  { title: "数据同步已完成", time: "1小时前", tone: "success" as const }
];

export function DashboardPage() {
  const options = getDashboardChartOptions();
  const navigate = useNavigate();
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

  const handleOpenMarket = () => {
    setWorkflowStatus("已打开看板市场");
  };

  const handleEditDashboard = () => {
    navigate("/dashboard-editor");
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
      subtitle="经营分析全景看板"
      className="dashboard-page"
      actions={
        <>
          <Button icon={<SquaresFour size={18} />} onClick={handleOpenMarket}>
            看板市场
          </Button>
          <Button type="primary" icon={<Plus size={18} />} onClick={handleCreateDashboard}>
            新建看板
          </Button>
        </>
      }
    >
      <XsStatusBar className="dashboard-page__status" tone="success" label="操作" message={workflowStatus} />
      <section className="dashboard-control-bar" aria-label="看板状态">
        <div className="dashboard-control-bar__meta">
          <span className="dashboard-active-name">{activeDashboardName}</span>
          <span className="dashboard-control-bar__summary">
            近 12 个月 · 12 个指标 · 8 个组件 · 更新于今日 14:30
          </span>
        </div>
        <div className="dashboard-control-bar__actions">
          <Button onClick={handleSwitchDashboard}>切换看板</Button>
          <Button autoInsertSpace={false} onClick={handleEditDashboard}>
            编辑
          </Button>
        </div>
      </section>

      <div className="board-scroll">
        <section className="board-grid" aria-label={activeDashboardName}>
          <article className="xs-card board-card" aria-label="看板组件：月度营收趋势">
            <div className="board-card__head">
              <h2>月度营收趋势</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 月度营收趋势"
                onClick={() => handleOpenCard("月度营收趋势")}
              >
                查看
              </Button>
            </div>
            <div className="revenue-value">
              <strong>
                ￥2.84<span className="revenue-unit">亿</span>
              </strong>
              <div className="revenue-delta">
                <span className="revenue-delta__change">↑ 8.3% 环比</span>
                <small>vs 同期 +15.2%</small>
              </div>
            </div>
            <XsEChart option={options.revenue} label="月度营收趋势图" className="chart-panel" />
            <div className="metric-row">
              <span>
                完成率 <b>94%</b>
              </span>
              <span>
                上月 <b>￥2.62亿</b>
              </span>
            </div>
          </article>

          <article className="xs-card board-card" aria-label="看板组件：渠道转化分析">
            <div className="board-card__head">
              <h2>渠道转化分析</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 渠道转化分析"
                onClick={() => handleOpenCard("渠道转化分析")}
              >
                查看
              </Button>
            </div>
            <XsEChart option={options.channel} label="渠道转化分析图" className="chart-panel" />
            <p className="board-card__footnote">
              综合转化率 <strong>3.2%</strong> <span className="success-text">↑ 0.4pp</span>
            </p>
          </article>

          <article className="xs-card board-card" aria-label="看板组件：销售预测">
            <div className="board-card__head">
              <h2>销售预测</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 销售预测"
                onClick={() => handleOpenCard("销售预测")}
              >
                查看
              </Button>
            </div>
            <XsEChart option={options.salesLine} label="销售预测折线图" className="chart-panel" />
            <div className="metric-row">
              <span>
                Q3预测 <b>1.86亿</b>
              </span>
              <span>
                Q4目标 <b>2.15亿</b>
              </span>
            </div>
          </article>

          <article className="xs-card board-card" aria-label="看板组件：客户画像分布">
            <div className="board-card__head">
              <h2>客户画像分布</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 客户画像分布"
                onClick={() => handleOpenCard("客户画像分布")}
              >
                查看
              </Button>
            </div>
            <div className="board-card__split">
              <XsEChart option={options.customer} label="客户画像分布图" className="chart-panel chart-panel--donut" />
              <div className="legend-grid">
                <span>
                  <i className="legend-dot legend-dot--enterprise" />
                  企业客户 75%
                </span>
                <span>
                  <i className="legend-dot legend-dot--sme" />
                  中小客户 15%
                </span>
                <span>
                  <i className="legend-dot legend-dot--personal" />
                  个人用户 10%
                </span>
              </div>
            </div>
          </article>

          <article className="xs-card board-card" aria-label="看板组件：TOP 产品营收">
            <div className="board-card__head">
              <h2>TOP 产品营收</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 TOP 产品营收"
                onClick={() => handleOpenCard("TOP 产品营收")}
              >
                查看
              </Button>
            </div>
            <div className="ranking-list">
              {productRanks.map((item) => (
                <div className="ranking-list__row" key={item.name}>
                  <span className={`ranking-list__rank ranking-list__rank--${item.rank}`}>{item.rank}</span>
                  <div className="ranking-list__body">
                    <div className="ranking-list__meta">
                      <span className="ranking-list__name">{item.name}</span>
                      <b>{item.value}</b>
                      <em className={`ranking-list__change ranking-list__change--${item.tone}`}>{item.change}</em>
                    </div>
                    <div className="ranking-list__bar" aria-hidden="true">
                      <span style={{ width: `${item.share}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="xs-card board-card" aria-label="看板组件：实时运营概览">
            <div className="board-card__head">
              <h2>实时运营概览</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 实时运营概览"
                onClick={() => handleOpenCard("实时运营概览")}
              >
                查看
              </Button>
            </div>
            <div className="ops-grid">
              <div>
                <strong>847</strong>
                <span>在线用户</span>
              </div>
              <div>
                <strong>94</strong>
                <span>API QPS</span>
              </div>
              <div>
                <strong>99.97%</strong>
                <span>可用率</span>
              </div>
              <div>
                <strong>236ms</strong>
                <span>平均响应</span>
              </div>
            </div>
          </article>

          <article className="xs-card board-card" aria-label="看板组件：区域业绩排行">
            <div className="board-card__head">
              <h2>区域业绩排行</h2>
              <Button
                type="link"
                className="xs-card-action"
                aria-label="查看 区域业绩排行"
                onClick={() => handleOpenCard("区域业绩排行")}
              >
                查看
              </Button>
            </div>
            <XsEChart option={options.region} label="区域业绩排行图" className="chart-panel" />
          </article>

          <article className="xs-card board-card" aria-label="看板组件：智能预警">
            <div className="board-card__head">
              <h2 className="board-card__alert-title">
                智能预警 <span className="board-card__alert-pill">3条未处理</span>
              </h2>
            </div>
            <div className="alert-list">
              {alertItems.map((alert) => (
                <button
                  type="button"
                  className={`alert-list__item alert-list__item--${alert.tone}`}
                  key={alert.title}
                  aria-label={`处理 ${alert.title}`}
                  onClick={() => handleAlert(alert.title)}
                >
                  <span className="alert-list__icon">
                    {alert.tone === "warning" ? <WarningCircle size={18} /> : <CheckCircle size={18} />}
                  </span>
                  <span className="alert-list__body">
                    <span className="alert-list__title">{alert.title}</span>
                    <small>{alert.time}</small>
                  </span>
                </button>
              ))}
            </div>
          </article>
        </section>
      </div>
    </PageFrame>
  );
}
