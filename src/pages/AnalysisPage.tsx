import { Button } from "antd";
import { CaretUp, DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { XsCommandBox, XsEChart, XsTimeline, type XsTimelineItem } from "@/components/xs";
import { streamAgentMessage } from "@/services/agentService";
import { getSalesAnalysisResult } from "@/services/dashboardService";
import { useUiStore } from "@/stores/uiStore";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-image2-transparent.png";
import userAvatar from "@/assets/brand/analysis-user-avatar-source.png";
import { PageFrame } from "./PageFrame";

const reasoningSteps: XsTimelineItem[] = [
  {
    title: "理解问题",
    description: "用户需要分析2024年各季度销售额趋势，并与2023年同期进行对比。"
  },
  {
    title: "确定数据范围",
    description: "筛选2023年和2024年的销售数据，按季度汇总销售额。"
  },
  {
    title: "数据处理",
    description: "清洗数据，处理缺失值和异常值，确保数据准确性。"
  },
  {
    title: "趋势分析",
    description: "分析2024年各季度销售额趋势，并与2023年同期进行对比计算同比增长率。"
  },
  {
    title: "生成可视化结果",
    description: "生成趋势图表和对比表格，清晰展示分析结果。"
  }
];

export function AnalysisPage() {
  const { rows, salesTrendOption } = getSalesAnalysisResult();
  const activeAnalysisQuestion = useUiStore((state) => state.activeAnalysisQuestion);
  const askDataStatus = useUiStore((state) => state.askDataStatus);
  const askDataEvents = useUiStore((state) => state.askDataEvents);
  const askDataError = useUiStore((state) => state.askDataError);
  const startAskDataRun = useUiStore((state) => state.startAskDataRun);
  const appendAskDataEvent = useUiStore((state) => state.appendAskDataEvent);
  const completeAskDataRun = useUiStore((state) => state.completeAskDataRun);
  const failAskDataRun = useUiStore((state) => state.failAskDataRun);
  const [isReasoningVisible, setIsReasoningVisible] = useState(true);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");

  const handleToggleReasoning = () => {
    setIsReasoningVisible((current) => {
      const next = !current;
      setWorkflowStatus(next ? "已展开分析过程" : "已收起分析过程");
      return next;
    });
  };

  const handleExport = () => {
    setWorkflowStatus("已生成分析结果导出任务");
  };

  const streamDataHubQuestion = (question: string) => {
    startAskDataRun(question);

    if (import.meta.env.MODE === "test") {
      completeAskDataRun();
      return;
    }

    streamAgentMessage(
      { content: question },
      {
        onEvent: (event) => {
          appendAskDataEvent(event);
          if (event.type === "error") {
            const data = event.data as { message?: string } | string | undefined;
            failAskDataRun(typeof data === "string" ? data : data?.message || "问数执行失败");
          }
        },
        onDone: completeAskDataRun,
        onError: (error) => failAskDataRun(error.message)
      }
    );
  };

  const askDataStatusText = (() => {
    if (askDataStatus === "streaming") {
      return `正在调用 data-hub 问数，已接收 ${askDataEvents.length} 个过程事件`;
    }
    if (askDataStatus === "done") {
      return askDataEvents.length > 0
        ? `data-hub 问数完成，共接收 ${askDataEvents.length} 个过程事件`
        : "data-hub 问数已提交";
    }
    if (askDataStatus === "error") {
      return `data-hub 问数失败：${askDataError || "未知错误"}`;
    }
    return "";
  })();

  const handleFollowUp = async () => {
    const command = followUpDraft.trim();

    if (!command) {
      return;
    }

    streamDataHubQuestion(command);
    setFollowUpDraft("");
    setWorkflowStatus(`已继续追问：${command}`);
  };

  return (
    <PageFrame title="新建对话" className="analysis-page">
      <section className="analysis-question" aria-label="用户提问">
        <div>
          <strong>{activeAnalysisQuestion}</strong>
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
            <Button aria-label={isReasoningVisible ? "收起分析过程" : "展开分析过程"} icon={<CaretUp size={18} />} onClick={handleToggleReasoning} />
          </header>
          {askDataStatusText || workflowStatus ? (
            <div className="workflow-status" role="status">
              {askDataStatusText ? <span>{askDataStatusText}</span> : null}
              {workflowStatus ? <span>{workflowStatus}</span> : null}
            </div>
          ) : null}

          {isReasoningVisible ? (
            <section className="reasoning-block" aria-label="思考过程">
              <h2>思考过程（共 5 步）</h2>
              <XsTimeline items={reasoningSteps} ariaLabel="分析步骤时间线" />
            </section>
          ) : null}

          <section className="analysis-output" aria-label="分析结果">
            <div className="section-title-row">
              <h2>分析结果</h2>
              <Button icon={<DownloadSimple size={18} />} onClick={handleExport}>导出结果</Button>
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
        <XsCommandBox
          value={followUpDraft}
          onChange={setFollowUpDraft}
          onSubmit={handleFollowUp}
          onAttach={() => setWorkflowStatus("已打开附件选择")}
          onVoice={() => setWorkflowStatus("已准备语音输入")}
        />
        <p>内容由 AI 生成，仅供参考，请核实重要信息。</p>
      </div>
    </PageFrame>
  );
}
