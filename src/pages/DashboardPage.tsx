import { Button } from "antd";
import { Plus, WarningCircle, CheckCircle, SquaresFour } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { XsChartCard, XsStatusBar } from "@/components/xs";
import { getDashboardChartInsights, getDashboardChartOptions } from "@/services/dashboardService";
import { PageFrame } from "./PageFrame";
import "./styles/dashboard.css";

const activeDashboardName = "经营分析看板";
const alertItems = [
  { title: "销售额环比下降 12.3%", time: "5分钟前", tone: "warning" as const },
  { title: "服务器响应延迟升高", time: "23分钟前", tone: "warning" as const },
  { title: "数据同步已完成", time: "1小时前", tone: "success" as const }
];

export function DashboardPage() {
  const options = getDashboardChartOptions();
  const chartInsights = getDashboardChartInsights();
  const navigate = useNavigate();
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [handledAlerts, setHandledAlerts] = useState<Set<string>>(() => new Set());
  const unhandledAlertCount = alertItems.filter(
    (alert) => alert.tone === "warning" && !handledAlerts.has(alert.title)
  ).length;

  const handleEditDashboard = () => {
    navigate("/dashboard-editor");
  };

  const handleAlert = (title: string) => {
    setHandledAlerts((current) => new Set(current).add(title));
    setWorkflowStatus(`已处理预警：${title}`);
  };

  const cardAction = (title: string) => (
    <Button
      type="link"
      className="xs-card-action"
      aria-label={`查看 ${title}`}
      aria-describedby="dashboard-card-details-availability"
      disabled
    >
      查看
    </Button>
  );

  return (
    <PageFrame
      title="我的看板"
      subtitle="经营分析全景看板"
      className="dashboard-page"
      actions={
        <div className="dashboard-upcoming-actions">
          <Button
            icon={<SquaresFour size={18} />}
            disabled
            aria-describedby="dashboard-actions-availability"
          >
            看板市场
          </Button>
          <Button
            type="primary"
            icon={<Plus size={18} />}
            disabled
            aria-describedby="dashboard-actions-availability"
          >
            新建看板
          </Button>
          <span id="dashboard-actions-availability" className="dashboard-upcoming-actions__label">
            即将开放
          </span>
        </div>
      }
    >
      <XsStatusBar className="dashboard-page__status" tone="success" label="操作" message={workflowStatus} />
      <section className="dashboard-control-bar" aria-label="看板状态">
        <div className="dashboard-control-bar__meta">
          <span className="dashboard-active-name">{activeDashboardName}</span>
          <span className="dashboard-control-bar__summary">
            近 12 个月 · 12 个指标 · 8 个组件 · 更新于今日 14:30
          </span>
          <span
            id="dashboard-card-details-availability"
            className="dashboard-upcoming-actions__label"
          >
            组件详情即将开放，可通过“查看数据”展开当前图表来源。
          </span>
        </div>
        <div className="dashboard-control-bar__actions">
          <Button disabled aria-describedby="dashboard-switch-availability">
            切换看板
          </Button>
          <span id="dashboard-switch-availability" className="dashboard-upcoming-actions__label">
            即将开放
          </span>
          <Button autoInsertSpace={false} onClick={handleEditDashboard}>
            编辑
          </Button>
        </div>
      </section>

      <section className="board-grid" aria-label={activeDashboardName}>
        <XsChartCard
          title="月度营收趋势"
          summary={chartInsights.revenue.summary}
          option={options.revenue}
          table={chartInsights.revenue.table}
          headingLevel={2}
          ariaLabel="看板组件：月度营收趋势"
          className="board-card board-card--revenue"
          chartClassName="chart-panel chart-panel--hero"
          action={cardAction("月度营收趋势")}
          beforeChart={
            <div className="revenue-value">
              <strong>
                ￥2.84<span className="revenue-unit">亿</span>
              </strong>
              <div className="revenue-delta">
                <span className="revenue-delta__change">↑ 8.3% 环比</span>
                <small>vs 同期 +15.2%</small>
              </div>
            </div>
          }
          afterChart={
            <div className="metric-row">
              <span>
                完成率 <b>94%</b>
              </span>
              <span>
                上月 <b>￥2.62亿</b>
              </span>
            </div>
          }
        />

        <XsChartCard
          title="销售预测"
          summary={chartInsights.salesLine.summary}
          option={options.salesLine}
          table={chartInsights.salesLine.table}
          headingLevel={2}
          ariaLabel="看板组件：销售预测"
          className="board-card board-card--forecast"
          chartClassName="chart-panel"
          action={cardAction("销售预测")}
          afterChart={
            <div className="metric-row">
              <span>
                Q3预测 <b>1.86亿</b>
              </span>
              <span>
                Q4目标 <b>2.15亿</b>
              </span>
            </div>
          }
        />

        <article className="xs-card board-card board-card--ops" aria-label="看板组件：实时运营概览">
          <div className="board-card__head">
            <h2>实时运营概览</h2>
            {cardAction("实时运营概览")}
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

        <XsChartCard
          title="渠道转化分析"
          summary={chartInsights.channel.summary}
          option={options.channel}
          table={chartInsights.channel.table}
          headingLevel={2}
          ariaLabel="看板组件：渠道转化分析"
          className="board-card board-card--channel"
          chartClassName="chart-panel"
          action={cardAction("渠道转化分析")}
          afterChart={
            <p className="board-card__footnote">
              综合转化率 <strong>3.2%</strong> <span className="success-text">↑ 0.4pp</span>
            </p>
          }
        />

        <XsChartCard
          title="客户画像分布"
          summary={chartInsights.customer.summary}
          option={options.customer}
          table={chartInsights.customer.table}
          headingLevel={2}
          ariaLabel="看板组件：客户画像分布"
          className="board-card board-card--customer"
          chartClassName="chart-panel chart-panel--donut"
          action={cardAction("客户画像分布")}
          chartAside={
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
          }
        />

        <XsChartCard
          title="区域业绩排行"
          summary={chartInsights.region.summary}
          option={options.region}
          table={chartInsights.region.table}
          headingLevel={2}
          ariaLabel="看板组件：区域业绩排行"
          className="board-card board-card--region"
          chartClassName="chart-panel"
          action={cardAction("区域业绩排行")}
        />

        <XsChartCard
          title="TOP 产品营收"
          summary={chartInsights.productRank.summary}
          option={options.productRank}
          table={chartInsights.productRank.table}
          headingLevel={2}
          ariaLabel="看板组件：TOP 产品营收"
          className="board-card board-card--top"
          chartClassName="chart-panel"
          action={cardAction("TOP 产品营收")}
        />

        <article className="xs-card board-card board-card--alert" aria-label="看板组件：智能预警">
          <div className="board-card__head">
            <h2 className="board-card__alert-title">
              智能预警{" "}
              <span className="board-card__alert-pill">
                {unhandledAlertCount > 0 ? `${unhandledAlertCount}条未处理` : "全部已处理"}
              </span>
            </h2>
          </div>
          <div className="alert-list">
            {alertItems.map((alert) => {
              if (alert.tone === "success") {
                return (
                  <div
                    className="alert-list__item alert-list__item--success is-handled"
                    key={alert.title}
                    aria-label={`已完成 ${alert.title}`}
                  >
                    <span className="alert-list__icon">
                      <CheckCircle size={18} />
                    </span>
                    <span className="alert-list__body">
                      <span className="alert-list__title">{alert.title}</span>
                      <small>{alert.time} · 已完成</small>
                    </span>
                  </div>
                );
              }

              const isHandled = handledAlerts.has(alert.title);

              return (
                <button
                  type="button"
                  className={`alert-list__item alert-list__item--${isHandled ? "success" : "warning"}${isHandled ? " is-handled" : ""}`}
                  key={alert.title}
                  aria-label={`${isHandled ? "已处理" : "处理"} ${alert.title}`}
                  disabled={isHandled}
                  onClick={() => handleAlert(alert.title)}
                >
                  <span className="alert-list__icon">
                    {isHandled ? (
                      <CheckCircle size={18} />
                    ) : (
                      <WarningCircle size={18} />
                    )}
                  </span>
                  <span className="alert-list__body">
                    <span className="alert-list__title">{alert.title}</span>
                    <small>{alert.time} · {isHandled ? "已处理" : "待处理"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </article>
      </section>
    </PageFrame>
  );
}
