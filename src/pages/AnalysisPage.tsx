import { Button, Progress, Segmented, Tag } from "antd";
import {
  Brain,
  CaretUp,
  ChartPieSlice,
  CheckCircle,
  CircleNotch,
  Database,
  DownloadSimple,
  FlowArrow,
  Function,
  MagicWand,
  PresentationChart,
  WarningCircle
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { XsCommandBox, XsEChart } from "@/components/xs";
import { streamAgentMessage } from "@/services/agentService";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  planAiChart
} from "@/services/aiChartPlannerService";
import {
  createDataHubAskTurn
} from "@/services/dataHubAskDataPresenter";
import { loadAiProviderConfig } from "@/services/aiProviderConfigService";
import { formatDataHubColumnTitle, getDataHubColumnMinWidth } from "@/services/dataHubFormat";
import { useUiStore } from "@/stores/uiStore";
import type { AiChartType, GeneratedChartSpec } from "@/types/aiChart";
import type { DataHubReactStepData, DataHubTableResult, DataHubToolResultData } from "@/types/dataHub";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-image2-transparent.png";
import userAvatar from "@/assets/brand/analysis-user-avatar-source.png";
import { PageFrame } from "./PageFrame";

type ThinkingPhaseStatus = "complete" | "active" | "pending" | "error";

type ThinkingPhase = {
  id: string;
  title: string;
  description: string;
  status: ThinkingPhaseStatus;
  details: string[];
  icon: typeof Brain;
};

type AiChartUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; spec: GeneratedChartSpec; activeType: AiChartType }
  | { status: "not-chartable"; message: string }
  | { status: "error"; message: string };

const autoScrollBottomThreshold = 96;

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getColumnMinWidth(column: DataHubTableResult["columns"][number]) {
  return getDataHubColumnMinWidth(column);
}

function escapeCsvCell(value: unknown) {
  const text = formatCell(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildDataHubTablesCsv(tables: DataHubTableResult[]) {
  return tables
    .map((table, index) => {
      const title = table.groupLabel || `结果表 ${table.tableIndex !== undefined ? table.tableIndex + 1 : index + 1}`;
      const header = table.columns.map((column) => escapeCsvCell(formatDataHubColumnTitle(column.title))).join(",");
      const rows = table.rows.map((row) => table.columns.map((column) => escapeCsvCell(row[column.key])).join(","));

      return [escapeCsvCell(title), header, ...rows].join("\r\n");
    })
    .join("\r\n\r\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= autoScrollBottomThreshold;
}

function scrollElementToBottom(element: HTMLElement, sentinel?: HTMLElement | null) {
  sentinel?.scrollIntoView?.({ block: "end" });
  element.scrollTop = element.scrollHeight;
}

function getStepSummary(step: DataHubReactStepData) {
  return step.summary || step.resultSummary || step.content || step.reason || "正在推进问数步骤";
}

function getToolName(tool: DataHubToolResultData) {
  return tool.toolName || tool.tool || tool.name || "tool";
}

function compactMessages(messages: string[]) {
  return Array.from(new Set(messages.filter(Boolean))).slice(0, 5);
}

function hasStep(steps: DataHubReactStepData[], actions: string[], status?: string) {
  return steps.some((step) => {
    const actionMatched = step.action ? actions.includes(step.action) : false;
    if (!actionMatched) {
      return false;
    }

    return status ? step.status === status : true;
  });
}

function hasFailedStep(steps: DataHubReactStepData[], actions: string[]) {
  return steps.some((step) => step.action && actions.includes(step.action) && ["error", "fail"].includes(step.status || ""));
}

function collectStepDetails(steps: DataHubReactStepData[], actions: string[]) {
  return steps
    .filter((step) => step.action && actions.includes(step.action) && !["error", "fail"].includes(step.status || ""))
    .map(getStepSummary);
}

function buildThinkingPhases(
  askTurn: ReturnType<typeof createDataHubAskTurn>,
  askDataStatus: "idle" | "streaming" | "done" | "error"
): ThinkingPhase[] {
  const steps = askTurn.reactSteps;
  const hasDecompose = Boolean(askTurn.decompose?.subQuestions?.length);
  const hasRouting = askTurn.routingEvents.length > 0;
  const hasTable = askTurn.tableResults.length > 0;
  const isDone = askDataStatus === "done";

  const drafts: Omit<ThinkingPhase, "status">[] = [
    {
      id: "understand",
      title: "理解问题",
      description: "识别问数意图，拆解为 data-hub 可执行的问题。",
      icon: Brain,
      details: compactMessages([
        ...(askTurn.decompose?.subQuestions ?? []),
        ...askTurn.routingEvents.map((event) => {
          const data = event.data as { message?: string; intent?: string; status?: string } | undefined;
          return data?.message || data?.intent || data?.status || "";
        })
      ])
    },
    {
      id: "scope",
      title: "确定数据范围",
      description: "定位空间、数据源和业务语义，确认本次查询边界。",
      icon: Database,
      details: compactMessages(collectStepDetails(steps, ["locate_datasource", "match_skill", "load_cube_meta"]))
    },
    {
      id: "process",
      title: "数据处理",
      description: "读取 Skill 与语义模型，生成受约束的查询结构。",
      icon: Function,
      details: compactMessages(collectStepDetails(steps, ["plan_with_datasource_skill", "generate_query", "nl2sql_fallback"]))
    },
    {
      id: "execute",
      title: "执行查询",
      description: "调用 data-hub 查询服务，返回结构化数据结果。",
      icon: FlowArrow,
      details: compactMessages([
        ...collectStepDetails(steps, ["execute_query"]),
        ...askTurn.toolResults
          .filter((tool) => getToolName(tool) === "execute_query")
          .map((tool) => tool.summary || (typeof tool.rows === "number" ? `返回 ${tool.rows} 行数据` : "查询已执行"))
      ])
    },
    {
      id: "result",
      title: "生成结果",
      description: "汇总答案并整理为可读表格。",
      icon: PresentationChart,
      details: compactMessages([
        ...collectStepDetails(steps, ["finalize"]),
        hasTable ? `已生成 ${askTurn.tableResults.length} 张结果表` : ""
      ])
    }
  ];

  const completed = [
    hasRouting || hasDecompose || steps.length > 0 || hasTable || isDone,
    hasStep(steps, ["locate_datasource", "match_skill", "load_cube_meta"], "success") || hasTable || isDone,
    hasStep(steps, ["plan_with_datasource_skill", "generate_query", "nl2sql_fallback"], "success") || hasTable || isDone,
    hasStep(steps, ["execute_query"], "success") || hasTable || isDone,
    isDone
  ];
  const failed = [
    false,
    hasFailedStep(steps, ["locate_datasource", "match_skill", "load_cube_meta"]),
    hasFailedStep(steps, ["plan_with_datasource_skill", "generate_query", "nl2sql_fallback"]),
    hasFailedStep(steps, ["execute_query"]),
    askDataStatus === "error"
  ];
  const firstIncompleteIndex = completed.findIndex((value) => !value);

  return drafts.map((phase, index) => {
    let status: ThinkingPhaseStatus = "pending";

    if (completed[index]) {
      status = "complete";
    } else if (failed[index]) {
      status = "error";
    } else if (askDataStatus === "streaming" && index === firstIncompleteIndex) {
      status = "active";
    } else if (askDataStatus === "idle" && index === 0) {
      status = "active";
    }

    return { ...phase, status };
  });
}

function getPhasePercent(phases: ThinkingPhase[]) {
  const completeWeight = phases.filter((phase) => phase.status === "complete").length;
  const activeWeight = phases.some((phase) => phase.status === "active") ? 0.45 : 0;

  return Math.min(100, Math.round(((completeWeight + activeWeight) / phases.length) * 100));
}

const phaseStatusMeta: Record<ThinkingPhaseStatus, { label: string; color: string }> = {
  complete: { label: "已完成", color: "success" },
  active: { label: "思考中", color: "processing" },
  pending: { label: "待处理", color: "default" },
  error: { label: "异常", color: "error" }
};

function DataHubThinkingProcess({ phases, active }: { phases: ThinkingPhase[]; active: boolean }) {
  return (
    <div className="datahub-thinking-panel">
      <div className="datahub-thinking-panel__head">
        <div>
          <strong>Agent 思考进度</strong>
          <span>{phases.filter((phase) => phase.status === "complete").length} / {phases.length} 已完成</span>
        </div>
        <Progress className="datahub-thinking-progress" percent={getPhasePercent(phases)} size="small" showInfo={false} />
      </div>

      <ol className="datahub-step-list datahub-step-list--condensed" aria-label="data-hub 问数步骤">
        {phases.map((phase, index) => {
          const Icon = phase.icon;
          const meta = phaseStatusMeta[phase.status];
          const isActive = phase.status === "active";
          const visibleDetail = phase.details[0];
          const extraDetails = phase.details.slice(1);

          return (
            <li key={phase.id} className={`datahub-step datahub-step--${phase.status}`}>
              <span className="datahub-step__index" aria-hidden="true">
                {phase.status === "complete" ? (
                  <CheckCircle size={20} weight="fill" />
                ) : isActive ? (
                  <CircleNotch size={20} weight="bold" />
                ) : (
                  <Icon size={18} weight="bold" />
                )}
              </span>
              <div className="datahub-step__content">
                <div className="datahub-step__title">
                  <strong>{phase.title}</strong>
                  <Tag color={meta.color}>{meta.label}</Tag>
                  {isActive ? <span className="thinking-dots" aria-label="正在思考"><i /><i /><i /></span> : null}
                </div>
                <p>{phase.description}</p>
                {visibleDetail ? <span className="datahub-step__hint">{visibleDetail}</span> : null}
                {extraDetails.length > 0 ? (
                  <details className="datahub-step-details" open={phase.status !== "pending"}>
                    <summary>
                      <span>过程细节</span>
                      <small>{extraDetails.length} 条</small>
                    </summary>
                    <div className="datahub-step-detail-list">
                      {extraDetails.map((detail) => (
                        <span key={detail}>{detail}</span>
                      ))}
                    </div>
                  </details>
                ) : null}
                {isActive && active ? <div className="datahub-thinking-shimmer" aria-hidden="true" /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DataHubResultTable({ table }: { table: DataHubTableResult }) {
  const previewRows = table.rows.slice(0, 20);
  const tableMinWidth = Math.max(760, table.columns.reduce((sum, column) => sum + getColumnMinWidth(column), 0));

  return (
    <article className="xs-card xs-card--inner datahub-table-card">
      <div className="datahub-result-head">
        <h3>{table.groupLabel || `结果表 ${table.tableIndex !== undefined ? table.tableIndex + 1 : 1}`}</h3>
        <span>{table.source || "data-hub"} / {table.totalRows} 行</span>
      </div>
      <div className="datahub-table-scroll">
        <table className="xs-table" style={{ minWidth: tableMinWidth }}>
          <thead>
            <tr>
              {table.columns.map((column) => {
                const title = formatDataHubColumnTitle(column.title);

                return (
                  <th key={column.key} title={column.title} style={{ minWidth: getColumnMinWidth(column) }}>
                    {title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={`${table.tableIndex}-${rowIndex}`}>
                {table.columns.map((column) => {
                  const cellText = formatCell(row[column.key]);

                  return (
                    <td key={column.key} title={cellText}>
                      {cellText}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function chartTypeLabel(type: AiChartType) {
  if (type === "pie") {
    return "饼图";
  }

  if (type === "line") {
    return "折线";
  }

  return "柱状";
}

function AiChartSuggestionCard({
  state,
  onTypeChange
}: {
  state: AiChartUiState;
  onTypeChange: (type: AiChartType) => void;
}) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <section className="ai-chart-card ai-chart-card--loading" aria-label="智能图表建议">
        <div className="ai-chart-card__icon" aria-hidden="true">
          <CircleNotch size={20} weight="bold" />
        </div>
        <div>
          <strong>AI 正在判断图表可行性</strong>
          <p>只发送字段结构、样例行和行数统计，不上传完整结果表。</p>
        </div>
      </section>
    );
  }

  if (state.status === "not-chartable" || state.status === "error") {
    return (
      <section className={`ai-chart-card ai-chart-card--${state.status}`} role="region" aria-label="智能图表建议">
        <div className="ai-chart-card__icon" aria-hidden="true">
          <WarningCircle size={20} weight="bold" />
        </div>
        <div>
          <strong>{state.status === "error" ? "图表生成失败" : "暂不适合生成图表"}</strong>
          <p>{state.message}</p>
        </div>
      </section>
    );
  }

  const option = buildGeneratedChartOption(state.spec, state.activeType);

  return (
    <section className="ai-chart-card ai-chart-card--success" role="region" aria-label="智能图表建议">
      <div className="ai-chart-card__head">
        <div className="ai-chart-card__title">
          <span className="ai-chart-card__icon" aria-hidden="true">
            <ChartPieSlice size={20} weight="bold" />
          </span>
          <div>
            <strong>{state.spec.title}</strong>
            <p>{state.spec.reason}</p>
            <span className="ai-chart-card__source">来源：{state.spec.tableTitle}</span>
          </div>
        </div>
        <Segmented
          size="small"
          value={state.activeType}
          options={state.spec.allowedTypes.map((type) => ({ label: chartTypeLabel(type), value: type }))}
          onChange={(value) => onTypeChange(value as AiChartType)}
        />
      </div>
      <XsEChart option={option} label={state.spec.title} className="chart-large ai-chart-card__chart" />
    </section>
  );
}

export function AnalysisPage() {
  const activeAnalysisQuestion = useUiStore((state) => state.activeAnalysisQuestion);
  const askDataStatus = useUiStore((state) => state.askDataStatus);
  const askDataEvents = useUiStore((state) => state.askDataEvents);
  const askDataError = useUiStore((state) => state.askDataError);
  const analysisTurns = useUiStore((state) => state.analysisTurns);
  const startAskDataRun = useUiStore((state) => state.startAskDataRun);
  const appendAskDataEvent = useUiStore((state) => state.appendAskDataEvent);
  const completeAskDataRun = useUiStore((state) => state.completeAskDataRun);
  const failAskDataRun = useUiStore((state) => state.failAskDataRun);
  const [isReasoningVisible, setIsReasoningVisible] = useState(true);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [aiChartStates, setAiChartStates] = useState<Record<string, AiChartUiState>>({});
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const hasConversation =
    Boolean(activeAnalysisQuestion.trim()) || askDataStatus !== "idle" || askDataEvents.length > 0 || Boolean(askDataError);
  const askTurn = createDataHubAskTurn(activeAnalysisQuestion, askDataEvents, askDataStatus, askDataError);
  const visibleTurns =
    analysisTurns.length > 0
      ? analysisTurns
      : hasConversation
        ? [
            {
              id: "active-turn",
              question: activeAnalysisQuestion,
              sessionId: null,
              status: askDataStatus,
              events: askDataEvents,
              error: askDataError
            }
          ]
        : [];
  const lastVisibleTurn = visibleTurns[visibleTurns.length - 1];
  const scrollSignature = visibleTurns
    .map((turn) => `${turn.id}:${turn.status}:${turn.events.length}:${turn.error}`)
    .join("|");

  useEffect(() => {
    if (!hasConversation) {
      shouldAutoScrollRef.current = true;
    }
  }, [hasConversation]);

  const scheduleAutoScrollToBottom = () => {
    const workspace = workspaceRef.current;

    if (!workspace || !shouldAutoScrollRef.current) {
      return;
    }

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    const scrollNow = () => {
      const currentWorkspace = workspaceRef.current;

      if (!currentWorkspace || !shouldAutoScrollRef.current) {
        return;
      }

      scrollElementToBottom(currentWorkspace, bottomSentinelRef.current);
      shouldAutoScrollRef.current = true;
    };

    scrollNow();
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollNow();
      scrollFrameRef.current = null;
    });
    scrollTimeoutRef.current = window.setTimeout(() => {
      scrollNow();
      scrollTimeoutRef.current = null;
    }, 80);
  };

  useEffect(() => {
    scheduleAutoScrollToBottom();

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [hasConversation, isReasoningVisible, scrollSignature]);

  useEffect(() => {
    const workspace = workspaceRef.current;

    if (!workspace || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      scheduleAutoScrollToBottom();
    });
    const content = workspace.querySelector(".analysis-turn-list");

    observer.observe(workspace);
    if (content instanceof HTMLElement) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, [hasConversation, scrollSignature]);

  const handleWorkspaceScroll = () => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    shouldAutoScrollRef.current = isNearScrollBottom(workspace);
  };

  const handleToggleReasoning = () => {
    setIsReasoningVisible((current) => {
      const next = !current;
      setWorkflowStatus(next ? "已展开分析过程" : "已收起分析过程");
      return next;
    });
  };

  const handleExport = (tables: DataHubTableResult[]) => {
    const rowCount = tables.reduce((count, table) => count + table.rows.length, 0);

    if (rowCount === 0) {
      setWorkflowStatus("暂无可导出的问数表格");
      return;
    }

    const safeQuestion = (lastVisibleTurn?.question || "问数结果")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim()
      .slice(0, 28);
    downloadCsv(`${safeQuestion || "问数结果"}-${new Date().toISOString().slice(0, 10)}.csv`, buildDataHubTablesCsv(tables));
    setWorkflowStatus(`已导出 ${rowCount} 行问数结果`);
  };

  const handleGenerateAiChart = async (turnId: string, question: string, tables: DataHubTableResult[]) => {
    const config = loadAiProviderConfig();

    if (!config?.apiKey) {
      const message = "请先配置 AI 供应商和 API Key";
      setAiChartStates((current) => ({ ...current, [turnId]: { status: "not-chartable", message } }));
      setWorkflowStatus(message);
      return;
    }

    setAiChartStates((current) => ({ ...current, [turnId]: { status: "loading" } }));
    setWorkflowStatus("AI 正在判断能否生成图表");

    try {
      const plan = await planAiChart({ question, tables }, { providerConfig: config });
      const spec = buildGeneratedChartSpec(plan, tables);

      if (!plan.chartable || !spec) {
        const message = plan.reason || "当前结果暂不适合生成图表。";
        setAiChartStates((current) => ({ ...current, [turnId]: { status: "not-chartable", message } }));
        setWorkflowStatus(message);
        return;
      }

      setAiChartStates((current) => ({
        ...current,
        [turnId]: { status: "success", spec, activeType: spec.chartType }
      }));
      setWorkflowStatus(`已生成 ${chartTypeLabel(spec.chartType)}：${spec.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 图表判断失败";
      setAiChartStates((current) => ({ ...current, [turnId]: { status: "error", message } }));
      setWorkflowStatus(message);
    }
  };

  const handleChartTypeChange = (turnId: string, type: AiChartType) => {
    setAiChartStates((current) => {
      const state = current[turnId];

      if (!state || state.status !== "success") {
        return current;
      }

      return {
        ...current,
        [turnId]: { ...state, activeType: type }
      };
    });
  };

  const streamDataHubQuestion = (question: string) => {
    const sessionId = useUiStore.getState().activeAnalysisSessionId;
    startAskDataRun(question);

    if (import.meta.env.MODE === "test") {
      completeAskDataRun();
      return;
    }

    streamAgentMessage(
      { content: question, sessionId: sessionId ?? undefined },
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
      <div className="analysis-workspace" ref={workspaceRef} onScroll={handleWorkspaceScroll}>
        {hasConversation ? (
          <div className="analysis-turn-list">
            {visibleTurns.map((turn) => {
              const turnAsk = createDataHubAskTurn(turn.question, turn.events, turn.status, turn.error);
              const thinkingPhases = buildThinkingPhases(turnAsk, turn.status);
              const isLatestTurn = turn.id === lastVisibleTurn?.id;
              const statusTitle =
                turn.status === "streaming"
                  ? "正在问数"
                  : turn.status === "done"
                    ? "问数完成"
                    : turn.status === "error"
                      ? "问数失败"
                      : "已完成分析";
              const statusDescription =
                turn.status === "idle"
                  ? "请从首页发起智能问数，星数会同步展示 data-hub 的意图路由、语义匹配、查询执行和结果表格。"
                  : turnAsk.error?.message || turnAsk.assistantContent || "正在连接 data-hub 问数 Agent，请稍候。";
              const aiChartState = aiChartStates[turn.id] ?? { status: "idle" as const };
              const isGeneratingAiChart = aiChartState.status === "loading";

              return (
                <div className="analysis-turn" key={turn.id}>
                  <section className="analysis-question" aria-label="用户提问">
                    <div>
                      <strong>{turn.question}</strong>
                    </div>
                    <img src={userAvatar} alt="" />
                  </section>

                  <section className="analysis-response" aria-label="星数分析结果">
                    <img className="analysis-response__mark" src={assistantMark} alt="" />
                    <article className="xs-card analysis-card">
                      <header className="analysis-card__head">
                        <div>
                          <h1>{statusTitle}</h1>
                          <p>{statusDescription}</p>
                        </div>
                        <Button aria-label={isReasoningVisible ? "收起分析过程" : "展开分析过程"} icon={<CaretUp size={18} />} onClick={handleToggleReasoning} />
                      </header>
                      {isLatestTurn && (askDataStatusText || workflowStatus) ? (
                        <div className="sr-only" role="status">
                          {[askDataStatusText, workflowStatus].filter(Boolean).join("，")}
                        </div>
                      ) : null}

                      {isReasoningVisible ? (
                        <section className="reasoning-block" aria-label="思考过程">
                          <h2>问数过程（5 步）</h2>
                          <DataHubThinkingProcess phases={thinkingPhases} active={turn.status === "streaming"} />

                          {turnAsk.infoMessages.length > 0 ? (
                            <div className="datahub-info-list">
                              {turnAsk.infoMessages.map((message) => (
                                <p key={message}>{message}</p>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      ) : null}

                      <section className="analysis-output" aria-label="分析结果">
                        <div className="section-title-row">
                          <h2>问数结果</h2>
                          <div className="analysis-output__actions">
                            {turnAsk.tableResults.length > 0 ? (
                              <Button
                                icon={<MagicWand size={18} />}
                                loading={isGeneratingAiChart}
                                onClick={() => handleGenerateAiChart(turn.id, turn.question, turnAsk.tableResults)}
                              >
                                AI 生成图表
                              </Button>
                            ) : null}
                            {isLatestTurn ? (
                              <Button icon={<DownloadSimple size={18} />} onClick={() => handleExport(turnAsk.tableResults)}>
                                导出结果
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <AiChartSuggestionCard
                          state={aiChartState}
                          onTypeChange={(type) => handleChartTypeChange(turn.id, type)}
                        />
                        {turnAsk.tableResults.length > 0 ? (
                          <div className="analysis-output__tables">
                            {turnAsk.tableResults.map((table) => (
                              <DataHubResultTable table={table} key={table.tableIndex} />
                            ))}
                          </div>
                        ) : (
                          <div className="datahub-empty-state" role="status">
                            {turn.status === "streaming" ? "正在等待查询结果表格..." : "暂无可展示的问数表格。"}
                          </div>
                        )}
                      </section>
                    </article>
                  </section>
                </div>
              );
            })}
            <div className="analysis-bottom-sentinel" ref={bottomSentinelRef} aria-hidden="true" />
          </div>
        ) : (
          <div className="analysis-empty-canvas" aria-label="空白问数工作区" />
        )}
      </div>

      <div className="analysis-composer">
        <XsCommandBox
          value={followUpDraft}
          onChange={setFollowUpDraft}
          onSubmit={handleFollowUp}
          onVoice={() => setWorkflowStatus("已准备语音输入")}
        />
      </div>
    </PageFrame>
  );
}
