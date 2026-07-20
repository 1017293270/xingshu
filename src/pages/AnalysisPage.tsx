import { Button, Progress, Segmented, Tag } from "antd";
import {
  ArrowDown,
  Brain,
  CaretDown,
  CaretUp,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import { useNavigate } from "react-router-dom";
import { XsChartCard, XsCommandBox } from "@/components/xs";
import { XsStreamingText } from "@/components/xs/XsStreamingText";
import { useVoiceInput } from "@/hooks/useVoiceInput";
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
import { prepareDashboardFromAskTurn } from "@/services/dashboardAskDataHandoffService";
import { formatDataHubColumnTitle, getDataHubColumnMinWidth } from "@/services/dataHubFormat";
import { useUiStore } from "@/stores/uiStore";
import type { AiChartType, GeneratedChartSpec } from "@/types/aiChart";
import type {
  DataHubAskDataStatus,
  DataHubReactStepData,
  DataHubTableResult,
  DataHubToolResultData
} from "@/types/dataHub";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-image2-transparent.png";
import userAvatar from "@/assets/brand/analysis-user-avatar-source.png";
import { PageFrame } from "./PageFrame";
import "./styles/analysis-motion.css";

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

const autoScrollBottomThreshold = 24;

const quickQuestions = [
  "本月销售额与目标完成率怎么样？",
  "目前咨询量最高的社区是哪个？",
  "分析最近 30 天客户增长趋势",
  "对比各区域收入与利润率"
];

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

function scrollElementToBottom(element: HTMLElement) {
  const bottom = Math.max(0, element.scrollHeight - element.clientHeight);

  if (Math.abs(element.scrollTop - bottom) > 1) {
    element.scrollTop = bottom;
  }
}

function getStepSummary(step: DataHubReactStepData) {
  return step.summary || step.resultSummary || step.content || step.reason || "正在推进问数步骤";
}

function getToolName(tool: DataHubToolResultData) {
  return tool.toolName || tool.tool || tool.name || "tool";
}

function compactMessages(messages: string[]) {
  return Array.from(new Set(messages.filter(Boolean)));
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
  askDataStatus: DataHubAskDataStatus
): ThinkingPhase[] {
  const steps = askTurn.reactSteps;
  const hasDecompose = Boolean(askTurn.decompose?.subQuestions?.length);
  const hasRouting = askTurn.routingEvents.length > 0;
  const hasTable = askTurn.tableResults.length > 0;
  const isDone = askDataStatus === "done";
  const hasProcessingStarted = hasStep(steps, [
    "plan_with_datasource_skill",
    "generate_query",
    "nl2sql_fallback",
    "execute_query",
    "finalize"
  ]);
  const hasExecutionStarted =
    hasStep(steps, ["execute_query", "finalize"]) ||
    askTurn.toolCalls.some((tool) => getToolName(tool) === "execute_query") ||
    askTurn.toolResults.some((tool) => getToolName(tool) === "execute_query");
  const hasResultStarted = hasStep(steps, ["finalize"]) || hasTable || Boolean(askTurn.assistantContent);

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
    hasProcessingStarted || hasExecutionStarted || hasResultStarted || isDone,
    hasExecutionStarted || hasResultStarted || isDone,
    hasResultStarted || isDone,
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

type DrainedPhase = {
  id: string;
  signature: string;
};

type ThinkingPlaybackState = {
  activeTitle?: string;
  isComplete: boolean;
};

const phasePlaybackSettleMs = 220;

function getPhaseStreamMessages(phase: ThinkingPhase) {
  return Array.from(new Set([phase.description, ...phase.details].filter(Boolean)));
}

function getPhaseStreamSignature(phase: ThinkingPhase) {
  return getPhaseStreamMessages(phase).join("\u001f");
}

function getInitialPlaybackIndex(phases: ThinkingPhase[]) {
  return phases.some((phase) => phase.status === "active") ? 0 : phases.length;
}

function useThinkingPhasePlayback(phases: ThinkingPhase[], isProcessing: boolean) {
  const playbackEnabledRef = useRef(phases.some((phase) => phase.status === "active"));
  const [playbackIndex, setPlaybackIndex] = useState(() => getInitialPlaybackIndex(phases));
  const [drainedPhase, setDrainedPhase] = useState<DrainedPhase | null>(null);
  const targetPhase = phases[playbackIndex];
  const targetSignature = targetPhase ? getPhaseStreamSignature(targetPhase) : "";
  const hasPendingPhase = phases.some((phase) => phase.status === "pending");
  const shouldAbortPlayback = !isProcessing && hasPendingPhase;
  const backendHasAdvanced = Boolean(
    targetPhase &&
    (targetPhase.status === "complete" ||
      targetPhase.status === "error" ||
      phases.slice(playbackIndex + 1).some((phase) => phase.status !== "pending"))
  );

  useEffect(() => {
    if (
      !playbackEnabledRef.current ||
      shouldAbortPlayback ||
      !targetPhase ||
      !backendHasAdvanced ||
      drainedPhase?.id !== targetPhase.id ||
      drainedPhase.signature !== targetSignature
    ) {
      return undefined;
    }

    const settleTimer = window.setTimeout(() => {
      setPlaybackIndex((current) => Math.min(phases.length, current + 1));
      setDrainedPhase(null);
    }, phasePlaybackSettleMs);

    return () => window.clearTimeout(settleTimer);
  }, [
    backendHasAdvanced,
    drainedPhase,
    phases.length,
    shouldAbortPlayback,
    targetPhase,
    targetSignature
  ]);

  const displayedPhases = useMemo<ThinkingPhase[]>(() => {
    if (!playbackEnabledRef.current || shouldAbortPlayback || playbackIndex >= phases.length) {
      return phases;
    }

    return phases.map((phase, index) => {
      if (index < playbackIndex) {
        return { ...phase, status: phase.status === "error" ? "error" : "complete" };
      }

      if (index === playbackIndex) {
        return { ...phase, status: phase.status === "error" ? "error" : "active" };
      }

      return { ...phase, status: "pending" };
    });
  }, [phases, playbackIndex, shouldAbortPlayback]);

  return {
    displayedPhases,
    markPhaseDrained: (id: string, signature: string) => setDrainedPhase({ id, signature })
  };
}

function AiThinkingDots({ label }: { label: string }) {
  return (
    <span className="datahub-thinking-dots" role="status" aria-label={label}>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </span>
  );
}

function PhaseStreamingOutput({
  phase,
  onDrained
}: {
  phase: ThinkingPhase;
  onDrained: (id: string, signature: string) => void;
}) {
  const messages = getPhaseStreamMessages(phase);
  const signature = messages.join("\u001f");
  const [completedCount, setCompletedCount] = useState(0);
  const lastDrainedSignatureRef = useRef("");
  const currentMessage = messages[completedCount];

  useEffect(() => {
    if (completedCount < messages.length || lastDrainedSignatureRef.current === signature) {
      return;
    }

    lastDrainedSignatureRef.current = signature;
    onDrained(phase.id, signature);
  }, [completedCount, messages.length, onDrained, phase.id, signature]);

  return (
    <div className="datahub-step__stream">
      <span className="datahub-step__stream-label" aria-hidden="true">实时输出</span>
      <div className="datahub-step__stream-lines">
        {messages.slice(0, completedCount).map((message, index) => (
          <span className="datahub-step__stream-line datahub-step__stream-line--complete" key={`${index}-${message}`}>
            {message}
          </span>
        ))}
        {currentMessage ? (
          <XsStreamingText
            key={`${completedCount}-${currentMessage}`}
            ariaLabel={`${phase.title}实时输出`}
            className="datahub-step__stream-copy"
            intervalMs={22}
            isStreaming
            onComplete={() => setCompletedCount((current) => Math.min(messages.length, current + 1))}
            text={currentMessage}
          />
        ) : null}
      </div>
    </div>
  );
}

function DataHubThinkingProcess({
  phases,
  isProcessing,
  turnId,
  onPlaybackChange
}: {
  phases: ThinkingPhase[];
  isProcessing: boolean;
  turnId: string;
  onPlaybackChange: (turnId: string, activeTitle: string | undefined, isComplete: boolean) => void;
}) {
  const { displayedPhases, markPhaseDrained } = useThinkingPhasePlayback(phases, isProcessing);
  const completedCount = displayedPhases.filter((phase) => phase.status === "complete").length;
  const activePhase = displayedPhases.find((phase) => phase.status === "active");
  const isPlaybackComplete = displayedPhases.every(
    (phase) => phase.status === "complete" || phase.status === "error"
  );

  useEffect(() => {
    onPlaybackChange(turnId, activePhase?.title, isPlaybackComplete);
  }, [activePhase?.title, isPlaybackComplete, onPlaybackChange, turnId]);

  return (
    <div className={`datahub-thinking-panel${activePhase ? " datahub-thinking-panel--active" : ""}`}>
      <div className="datahub-thinking-panel__head">
        <div>
          <strong>Agent 思考进度</strong>
          <span>
            {completedCount} / {displayedPhases.length} 已完成
            {activePhase ? ` · 正在${activePhase.title}` : ""}
          </span>
        </div>
        <Progress
          aria-label={`Agent 思考进度 ${getPhasePercent(displayedPhases)}%`}
          className="datahub-thinking-progress"
          percent={getPhasePercent(displayedPhases)}
          size="small"
          showInfo={false}
        />
      </div>

      <ol className="datahub-step-list datahub-step-list--condensed" aria-label="data-hub 问数步骤">
        {displayedPhases.map((phase) => {
          const Icon = phase.icon;
          const meta = phaseStatusMeta[phase.status];
          const visibleDetail = phase.details[0];
          const extraDetails = phase.details.slice(1);
          const showStaticDetails = phase.status === "complete" || phase.status === "error";

          return (
            <li key={phase.id} className={`datahub-step datahub-step--${phase.status}`}>
              <span className="datahub-step__index" aria-hidden="true">
                {phase.status === "complete" ? (
                  <CheckCircle size={20} weight="fill" />
                ) : (
                  <Icon size={18} weight="bold" />
                )}
              </span>
              <div className="datahub-step__content">
                <div className="datahub-step__title">
                  <strong>{phase.title}</strong>
                  <Tag className={phase.status === "active" ? "datahub-step__tag--thinking" : ""} color={meta.color}>
                    {meta.label}
                    {phase.status === "active" ? <AiThinkingDots label={`AI 正在${phase.title}`} /> : null}
                  </Tag>
                </div>
                {phase.status === "active" ? (
                  <PhaseStreamingOutput phase={phase} onDrained={markPhaseDrained} />
                ) : (
                  <>
                    <p>{phase.description}</p>
                    {showStaticDetails && visibleDetail ? (
                      <span className="datahub-step__hint">{visibleDetail}</span>
                    ) : null}
                  </>
                )}
                {showStaticDetails && extraDetails.length > 0 ? (
                  <details className="datahub-step-details" open>
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
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DataHubResultLoading({ activePhase }: { activePhase?: string }) {
  return (
    <div
      className="datahub-result-loading"
      role="status"
      aria-label="AI 正在生成问数结果"
      aria-live="polite"
    >
      <div className="datahub-result-loading__head">
        <span className="datahub-result-loading__icon" aria-hidden="true">
          <Brain size={20} weight="bold" />
        </span>
        <div>
          <strong>AI 正在生成问数结果</strong>
          <span>{activePhase ? `当前步骤：${activePhase}` : "正在连接 data-hub 问数 Agent"}</span>
        </div>
      </div>
      <div className="datahub-result-loading__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
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

function AiChartSuccessCard({
  state,
  onTypeChange
}: {
  state: Extract<AiChartUiState, { status: "success" }>;
  onTypeChange: (type: AiChartType) => void;
}) {
  const option = useMemo(
    () => buildGeneratedChartOption(state.spec, state.activeType),
    [state.activeType, state.spec]
  );
  const chartTable = useMemo(() => {
    const selectedKeys = new Set([state.spec.dimensionKey, ...state.spec.metricKeys]);
    const columns = state.spec.table.columns.filter((column) => selectedKeys.has(column.key));
    const rows = state.spec.table.rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column.key, row[column.key]]))
    );

    return {
      ...state.spec.table,
      columns,
      rows,
      totalRows: state.spec.table.totalRows,
      groupLabel: `${state.spec.title}数据`
    };
  }, [state.spec]);

  return (
    <section className="ai-chart-card ai-chart-card--success" role="region" aria-label="智能图表建议">
      <XsChartCard
        contained={false}
        title={state.spec.title}
        summary={state.spec.reason}
        option={option}
        table={chartTable}
        chartClassName="chart-large ai-chart-card__chart"
        action={
          <Segmented
            size="small"
            value={state.activeType}
            options={state.spec.allowedTypes.map((type) => ({ label: chartTypeLabel(type), value: type }))}
            onChange={(value) => onTypeChange(value as AiChartType)}
          />
        }
        beforeChart={<span className="ai-chart-card__source">来源：{state.spec.tableTitle}</span>}
      />
    </section>
  );
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

  return <AiChartSuccessCard state={state} onTypeChange={onTypeChange} />;
}

export function AnalysisPage() {
  const navigate = useNavigate();
  const activeAnalysisQuestion = useUiStore((state) => state.activeAnalysisQuestion);
  const askDataStatus = useUiStore((state) => state.askDataStatus);
  const askDataEvents = useUiStore((state) => state.askDataEvents);
  const askDataError = useUiStore((state) => state.askDataError);
  const analysisTurns = useUiStore((state) => state.analysisTurns);
  const activeAskDataRunId = useUiStore((state) => state.activeAskDataRunId);
  const startAskDataRun = useUiStore((state) => state.startAskDataRun);
  const appendAskDataEvent = useUiStore((state) => state.appendAskDataEvent);
  const completeAskDataRun = useUiStore((state) => state.completeAskDataRun);
  const failAskDataRun = useUiStore((state) => state.failAskDataRun);
  const cancelAskDataRun = useUiStore((state) => state.cancelAskDataRun);
  const bindAskDataController = useUiStore((state) => state.bindAskDataController);
  const [isReasoningVisible, setIsReasoningVisible] = useState(true);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [aiChartStates, setAiChartStates] = useState<Record<string, AiChartUiState>>({});
  const [thinkingPlaybackStates, setThinkingPlaybackStates] = useState<Record<string, ThinkingPlaybackState>>({});
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const voiceInput = useVoiceInput({
    onAudioReady: () => setWorkflowStatus("语音录入完成；转写服务尚未接入"),
    onError: setWorkflowStatus
  });
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const lastWorkspaceScrollTopRef = useRef(0);
  const isWorkspacePointerDownRef = useRef(false);
  const lastWorkspaceTouchYRef = useRef<number | null>(null);
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
  const handleThinkingPlaybackChange = useCallback(
    (turnId: string, activeTitle: string | undefined, isComplete: boolean) => {
      setThinkingPlaybackStates((current) => {
        const previous = current[turnId];

        if (previous && previous.activeTitle === activeTitle && previous.isComplete === isComplete) {
          return current;
        }

        return { ...current, [turnId]: { activeTitle, isComplete } };
      });
    },
    []
  );

  useEffect(() => {
    if (!hasConversation) {
      shouldAutoScrollRef.current = true;
      lastWorkspaceScrollTopRef.current = 0;
      setIsScrollToBottomVisible(false);
    }
  }, [hasConversation]);

  useEffect(() => {
    const releasePointer = () => {
      isWorkspacePointerDownRef.current = false;
    };

    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);

    return () => {
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
    };
  }, []);

  const pauseAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = false;
    const workspace = workspaceRef.current;

    if (workspace && !isNearScrollBottom(workspace)) {
      setIsScrollToBottomVisible(true);
    }
  }, []);

  const scheduleAutoScrollToBottom = useCallback(() => {
    const workspace = workspaceRef.current;

    if (!workspace || !shouldAutoScrollRef.current || scrollFrameRef.current !== null) {
      return;
    }

    let didRunSynchronously = false;
    const frameId = window.requestAnimationFrame(() => {
      didRunSynchronously = true;
      scrollFrameRef.current = null;
      const currentWorkspace = workspaceRef.current;

      if (!currentWorkspace || !shouldAutoScrollRef.current) {
        return;
      }

      scrollElementToBottom(currentWorkspace);
      lastWorkspaceScrollTopRef.current = currentWorkspace.scrollTop;
      setIsScrollToBottomVisible(false);
    });

    if (!didRunSynchronously) {
      scrollFrameRef.current = frameId;
    }
  }, []);

  useEffect(() => {
    scheduleAutoScrollToBottom();

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [hasConversation, isReasoningVisible, scheduleAutoScrollToBottom, scrollSignature]);

  useEffect(() => {
    const workspace = workspaceRef.current;

    if (!workspace || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const currentWorkspace = workspaceRef.current;

      if (currentWorkspace && !shouldAutoScrollRef.current && isNearScrollBottom(currentWorkspace)) {
        shouldAutoScrollRef.current = true;
        setIsScrollToBottomVisible(false);
      }

      scheduleAutoScrollToBottom();
    });
    const content = workspace.querySelector(".analysis-turn-list");

    observer.observe(workspace);
    if (content instanceof HTMLElement) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, [hasConversation, scheduleAutoScrollToBottom, scrollSignature]);

  const handleWorkspaceScroll = () => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const isAtBottom = isNearScrollBottom(workspace);
    const movedUp = workspace.scrollTop < lastWorkspaceScrollTopRef.current - 2;

    if (isAtBottom) {
      shouldAutoScrollRef.current = true;
      setIsScrollToBottomVisible(false);
    } else if (isWorkspacePointerDownRef.current && movedUp) {
      shouldAutoScrollRef.current = false;
      setIsScrollToBottomVisible(true);
    } else if (!shouldAutoScrollRef.current) {
      setIsScrollToBottomVisible(true);
    }

    lastWorkspaceScrollTopRef.current = workspace.scrollTop;
  };

  const handleWorkspaceWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      pauseAutoScroll();
    }
  };

  const handleWorkspaceTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    lastWorkspaceTouchYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleWorkspaceTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touchY = event.touches[0]?.clientY;
    const previousTouchY = lastWorkspaceTouchYRef.current;

    if (touchY !== undefined && previousTouchY !== null && touchY > previousTouchY + 2) {
      pauseAutoScroll();
    }

    lastWorkspaceTouchYRef.current = touchY ?? null;
  };

  const handleWorkspaceKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) {
      pauseAutoScroll();
    }
  };

  const handleScrollToBottom = () => {
    const workspace = workspaceRef.current;

    shouldAutoScrollRef.current = true;
    setIsScrollToBottomVisible(false);

    if (!workspace) {
      return;
    }

    scrollElementToBottom(workspace);
    lastWorkspaceScrollTopRef.current = workspace.scrollTop;
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

  const handleGenerateDashboard = (turn: ReturnType<typeof createDataHubAskTurn>) => {
    try {
      const { editorPath } = prepareDashboardFromAskTurn(turn, { dataMode: "snapshot" });
      setWorkflowStatus("已生成大屏草稿，正在打开全屏编辑器");
      navigate(editorPath);
    } catch (error) {
      setWorkflowStatus(error instanceof Error ? error.message : "生成大屏失败，请稍后重试");
    }
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
    shouldAutoScrollRef.current = true;
    setIsScrollToBottomVisible(false);
    const sessionId = useUiStore.getState().activeAnalysisSessionId;
    const runId = startAskDataRun(question);

    if (import.meta.env.MODE === "test") {
      completeAskDataRun(runId);
      return;
    }

    const controller = streamAgentMessage(
      { content: question, sessionId: sessionId ?? undefined },
      {
        onEvent: (event) => {
          appendAskDataEvent(runId, event);
          if (event.type === "error") {
            const data = event.data as { message?: string } | string | undefined;
            failAskDataRun(runId, typeof data === "string" ? data : data?.message || "问数执行失败");
          }
        },
        onDone: () => completeAskDataRun(runId),
        onError: (error) => failAskDataRun(runId, error.message)
      }
    );
    bindAskDataController(runId, controller);
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
    if (askDataStatus === "cancelled") {
      return "已停止本次问数生成";
    }
    return "";
  })();

  const handleStop = () => {
    if (!activeAskDataRunId) {
      return;
    }

    cancelAskDataRun(activeAskDataRunId);
    setWorkflowStatus("已停止生成，你可以修改问题后重新发送");
  };

  const handleFollowUp = () => {
    const command = followUpDraft.trim();

    if (!command) {
      return;
    }

    streamDataHubQuestion(command);
    setFollowUpDraft("");
    setWorkflowStatus(`已继续追问：${command}`);
  };

  return (
    <PageFrame title="新建对话" className="analysis-page" hideHeader>
      {hasConversation ? <h1 className="sr-only">智能问数</h1> : null}
      <div
        className="analysis-workspace"
        ref={workspaceRef}
        onKeyDownCapture={handleWorkspaceKeyDown}
        onPointerDown={() => {
          isWorkspacePointerDownRef.current = true;
        }}
        onScroll={handleWorkspaceScroll}
        onTouchEnd={() => {
          lastWorkspaceTouchYRef.current = null;
        }}
        onTouchMove={handleWorkspaceTouchMove}
        onTouchStart={handleWorkspaceTouchStart}
        onWheel={handleWorkspaceWheel}
      >
        {hasConversation ? (
          <div className="analysis-turn-list">
            {visibleTurns.map((turn) => {
              const turnAsk = createDataHubAskTurn(turn.question, turn.events, turn.status, turn.error);
              const thinkingPhases = buildThinkingPhases(turnAsk, turn.status);
              const playbackState = thinkingPlaybackStates[turn.id];
              const isResultReady = playbackState?.isComplete === true;
              const isWaitingForPlayback =
                !isResultReady && (turn.status === "streaming" || turn.status === "done");
              const isLatestTurn = turn.id === lastVisibleTurn?.id;
              const statusTitle =
                turn.status === "streaming" || (turn.status === "done" && !isResultReady)
                  ? "正在问数"
                  : turn.status === "done"
                    ? "问数完成"
                    : turn.status === "error"
                      ? "问数失败"
                      : turn.status === "cancelled"
                        ? "已停止生成"
                      : "已完成分析";
              const statusDescription =
                  turn.status === "idle"
                    ? "请从首页发起智能问数，星数会同步展示 data-hub 的意图路由、语义匹配、查询执行和结果表格。"
                    : turn.status === "done" && !isResultReady
                      ? "数据已返回，正在完成问数过程并整理结果。"
                    : turn.status === "cancelled"
                      ? "本次问数已停止，你可以修改问题后重新发送。"
                    : turnAsk.error?.message || turnAsk.assistantContent || "正在连接 data-hub 问数 Agent，请稍候。";
              const aiChartState = aiChartStates[turn.id] ?? { status: "idle" as const };
              const isGeneratingAiChart = aiChartState.status === "loading";
              const resultStageState = isResultReady
                ? turnAsk.tableResults.length > 0
                  ? "ready"
                  : "empty"
                : isWaitingForPlayback
                  ? "loading"
                  : "empty";

              return (
                <div
                  className="analysis-turn"
                  data-status={turn.status}
                  data-result-ready={isResultReady}
                  key={turn.id}
                >
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
                        <div className="analysis-card__status-copy" key={`${turn.id}:${statusTitle}`}>
                          <h2>{statusTitle}</h2>
                          <p>{statusDescription}</p>
                        </div>
                        <Button
                          aria-label={isReasoningVisible ? "收起分析过程" : "展开分析过程"}
                          aria-expanded={isReasoningVisible}
                          aria-controls={`analysis-reasoning-${turn.id}`}
                          icon={isReasoningVisible ? <CaretUp size={18} /> : <CaretDown size={18} />}
                          onClick={handleToggleReasoning}
                        />
                      </header>
                      {isLatestTurn && (askDataStatusText || workflowStatus) ? (
                        <div className="sr-only" role="status">
                          {[askDataStatusText, workflowStatus].filter(Boolean).join("，")}
                        </div>
                      ) : null}

                      <section
                        className="reasoning-block"
                        id={`analysis-reasoning-${turn.id}`}
                        aria-label="思考过程"
                        hidden={!isReasoningVisible}
                      >
                        <h2>问数过程（5 步）</h2>
                        <DataHubThinkingProcess
                          phases={thinkingPhases}
                          isProcessing={turn.status === "idle" || turn.status === "streaming"}
                          turnId={turn.id}
                          onPlaybackChange={handleThinkingPlaybackChange}
                        />

                        {turnAsk.infoMessages.length > 0 ? (
                          <div className="datahub-info-list">
                            {turnAsk.infoMessages.map((message) => (
                              <p key={message}>{message}</p>
                            ))}
                          </div>
                        ) : null}
                      </section>

                      <section className="analysis-output" aria-label="分析结果">
                        <div className="section-title-row">
                          <h2>问数结果</h2>
                          <div className="analysis-output__actions">
                            {isResultReady && turnAsk.status === "done" && turnAsk.tableResults.length > 0 ? (
                              <Button
                                type="primary"
                                icon={<PresentationChart size={18} />}
                                onClick={() => handleGenerateDashboard(turnAsk)}
                              >
                                生成大屏
                              </Button>
                            ) : null}
                            {isResultReady && turnAsk.tableResults.length > 0 ? (
                              <Button
                                icon={<MagicWand size={18} />}
                                loading={isGeneratingAiChart}
                                onClick={() => handleGenerateAiChart(turn.id, turn.question, turnAsk.tableResults)}
                              >
                                AI 生成图表
                              </Button>
                            ) : null}
                            {isResultReady && isLatestTurn ? (
                              <Button icon={<DownloadSimple size={18} />} onClick={() => handleExport(turnAsk.tableResults)}>
                                导出结果
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="analysis-result-stage" data-state={resultStageState}>
                          {isResultReady ? (
                            <AiChartSuggestionCard
                              state={aiChartState}
                              onTypeChange={(type) => handleChartTypeChange(turn.id, type)}
                            />
                          ) : null}
                          {isResultReady && turnAsk.tableResults.length > 0 ? (
                            <div className="analysis-output__tables">
                              {turnAsk.tableResults.map((table) => (
                                <DataHubResultTable table={table} key={table.tableIndex} />
                              ))}
                            </div>
                          ) : isWaitingForPlayback ? (
                            <DataHubResultLoading activePhase={playbackState?.activeTitle} />
                          ) : (
                            <div className="datahub-empty-state" role="status">
                              暂无可展示的问数表格。
                            </div>
                          )}
                        </div>
                      </section>
                    </article>
                  </section>
                </div>
              );
            })}
            <div className="analysis-bottom-sentinel" aria-hidden="true" />
          </div>
        ) : (
          <section
            className="analysis-empty-canvas analysis-empty-state"
            aria-labelledby="analysis-empty-title"
            aria-label="空白问数工作区"
          >
            <img src={assistantMark} alt="" aria-hidden="true" />
            <div className="analysis-empty-state__copy">
              <h1 id="analysis-empty-title">从一个经营问题开始</h1>
              <p>星数只会在当前 data-hub 空间及您有权访问的数据范围内查询和生成结果。</p>
            </div>
            <div className="analysis-empty-state__prompts" aria-label="快捷问题">
              {quickQuestions.map((question) => (
                <button
                  type="button"
                  key={question}
                  onClick={() => {
                    setFollowUpDraft(question);
                    setWorkflowStatus("已填入快捷问题，确认后即可发送");
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="analysis-composer">
        {hasConversation && isScrollToBottomVisible ? (
          <Button
            className="analysis-scroll-to-bottom"
            shape="circle"
            aria-label="回到底部"
            icon={<ArrowDown size={18} weight="bold" />}
            title="回到底部"
            onClick={handleScrollToBottom}
          />
        ) : null}
        <XsCommandBox
          value={followUpDraft}
          onChange={setFollowUpDraft}
          onSubmit={handleFollowUp}
          submitOnEnter
          onVoice={() => {
            setWorkflowStatus(voiceInput.state === "recording" ? "正在结束语音录入" : "正在准备语音输入");
            voiceInput.toggle();
          }}
          onCancelVoice={() => {
            voiceInput.cancel();
            setWorkflowStatus("已取消语音输入");
          }}
          onStop={handleStop}
          busy={askDataStatus === "streaming"}
          voiceState={voiceInput.state}
        />
        <div className="analysis-composer__status-slot">
          {workflowStatus ? (
            <div className="analysis-composer__status" role="status">
              {workflowStatus}
            </div>
          ) : null}
        </div>
      </div>
    </PageFrame>
  );
}
