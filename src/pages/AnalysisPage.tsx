import { Button } from "antd";
import { CaretUp, Check, DownloadSimple } from "@phosphor-icons/react";
import { XsCommandBox, XsEChart } from "@/components/xs";
import { getSalesAnalysisResult } from "@/services/dashboardService";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-source.png";
import userAvatar from "@/assets/brand/analysis-user-avatar-source.png";
import { PageFrame } from "./PageFrame";

const reasoningSteps = ["理解问题", "确定数据范围", "数据处理", "趋势分析", "生成可视化结果"];

export function AnalysisPage() {
  const { rows, salesTrendOption } = getSalesAnalysisResult();

  return (
    <PageFrame title="新建对话" className="analysis-page">
      <section className="analysis-question" aria-label="用户提问">
        <div>
          <strong>请帮我分析2024年各季度的销售额趋势，并与2023年同期进行对比。</strong>
          <span>10:30</span>
        </div>
        <img src={userAvatar} alt="" />
      </section>

      <section className="analysis-response" aria-label="星数分析结果">
        <img className="analysis-response__mark" src={assistantMark} alt="" />
        <article className="xs-card analysis-card">
          <header className="analysis-card__head">
            <div>
              <h1>已完成分析</h1>
              <p>基于销售数据，已为您生成2024年各季度销售额趋势及与2023年同期对比分析。</p>
            </div>
            <Button aria-label="收起分析过程" icon={<CaretUp size={18} />} />
          </header>

          <section className="reasoning-block" aria-label="思考过程">
            <h2>思考过程（共 5 步）</h2>
            <ol>
              {reasoningSteps.map((step) => (
                <li key={step}>
                  <span className="step-dot"><Check size={14} weight="bold" /></span>
                  <div>
                    <strong>{step}</strong>
                    <p>{step === "生成可视化结果" ? "生成趋势图表和对比表格，清晰展示分析结果。" : "已完成相关数据确认与分析准备。"}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="analysis-output" aria-label="分析结果">
            <div className="section-title-row">
              <h2>分析结果</h2>
              <Button icon={<DownloadSimple size={18} />}>导出结果</Button>
            </div>
            <div className="analysis-output__grid">
              <article className="xs-card xs-card--inner">
                <h3>2024年各季度销售额趋势及同比对比</h3>
                <XsEChart option={salesTrendOption} label="2023与2024季度销售额对比图" className="chart-large" />
              </article>
              <article className="xs-card xs-card--inner">
                <h3>销售额对比明细（单位：万元）</h3>
                <table className="xs-table">
                  <thead>
                    <tr><th>季度</th><th>2023年销售额</th><th>2024年销售额</th><th>同比增长额</th><th>同比增长率</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row[0]} className={row[0] === "合计" ? "total-row" : ""}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </div>
          </section>
        </article>
      </section>

      <div className="analysis-composer">
        <XsCommandBox value="" onChange={() => undefined} onSubmit={() => undefined} />
        <p>内容由 AI 生成，仅供参考，请核实重要信息。</p>
      </div>
    </PageFrame>
  );
}
