import { Button, Dropdown, Progress, Segmented, Tag } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowDown,
  ArrowSquareOut,
  Brain,
  CaretDown,
  CaretUp,
  ChartLineUp,
  ChartPieSlice,
  CheckCircle,
  CircleNotch,
  Database,
  DownloadSimple,
  FileText,
  FlowArrow,
  Function,
  MagicWand,
  MapPin,
  PresentationChart,
  Star,
  TrendUp,
  WarningCircle
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { XsChartCard, XsCommandBox, XsSafeMarkdown } from "@/components/xs";
import { DataHubExecutionPanel } from "@/components/xs/datahub";
import { XsStreamingText } from "@/components/xs/XsStreamingText";
import { queryAssetFeatureEnabled } from "@/config/features";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { streamAgentMessage } from "@/services/agentService";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  canAutoGenerateAiChart,
  planAiChart
} from "@/services/aiChartPlannerService";
import {
  createDataHubAskTurn
} from "@/services/dataHubAskDataPresenter";
import { getDataHubDocumentLookupResults } from "@/services/dataHubDocumentLookupPresenter";
import {
  projectDataHubExecutionEvents
} from "@/services/dataHubExecutionProjector";
import {
  getDataHubSingleQueryTableResults,
  getDataHubQueryAssetTargets,
  type DataHubQueryAssetTarget
} from "@/services/dataHubQueryAssetTargetService";
import { materializeAskArtifact } from "@/services/dataHubQueryAssetMaterializationService";
import { ensureAskArtifact, favoriteAskArtifact } from "@/services/queryAssetService";
import { formatDataHubColumnTitle, getDataHubColumnMinWidth } from "@/services/dataHubFormat";
import { loadDataHubCitationDocument } from "@/services/dataHubKnowledgeService";
import { useUiStore } from "@/stores/uiStore";
import type { AiChartType, GeneratedChartSpec } from "@/types/aiChart";
import type {
  DataHubAskDataStatus,
  DataHubAskTurn,
  DataHubChatMode,
  DataHubCitationDocument,
  DataHubContentBlock,
  DataHubDocumentLookupResult,
  DataHubReactStepData,
  DataHubTableResult,
  DataHubToolResultData
} from "@/types/dataHub";
import type { QueryAsset } from "@/types/analytics";
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

type AskFavoriteUiState = {
  status: "idle" | "saving" | "saved" | "error";
  asset?: QueryAsset;
  message?: string;
};

type QueryAssetActionItem = {
  target: DataHubQueryAssetTarget;
  state: AskFavoriteUiState;
};

const autoScrollBottomThreshold = 24;
const incompleteHistoryQueryMessage =
  "历史问数缺少完整可执行查询，请重新问数后收藏";

function isIncompleteHistoricalQueryError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(incompleteHistoryQueryMessage)
  );
}

const quickQuestions = [
  { icon: ChartLineUp, question: "本月销售额与目标完成率怎么样？" },
  { icon: MapPin, question: "目前咨询量最高的社区是哪个？" },
  { icon: TrendUp, question: "分析最近 30 天客户增长趋势" },
  { icon: ChartPieSlice, question: "对比各区域收入与利润率" }
];

const knowledgeQuickQuestions = [
  { icon: FileText, question: "公司合同审批需要经过哪些环节？" },
  { icon: Brain, question: "最新销售政策有哪些重点变化？" },
  { icon: FlowArrow, question: "员工报销制度的完整流程是什么？" },
  { icon: Database, question: "知识库中有哪些信息安全管理要求？" }
];

const documentLookupQuickQuestions = [
  { icon: FileText, question: "帮我找到最新版员工手册" },
  { icon: Database, question: "查找 2026 年度预算报告" },
  { icon: FlowArrow, question: "找到信息安全事件处置流程原文" },
  { icon: Brain, question: "帮我定位最新的销售管理制度" }
];

const agentQuickQuestions = [
  { icon: FlowArrow, question: "综合分析本季度销售下滑原因，并结合最新制度提出改进建议" },
  { icon: Brain, question: "同时核对客户增长数据和最新销售政策，给出行动建议" },
  { icon: Database, question: "分析各区域经营表现，并查找相关考核制度作为依据" },
  { icon: FileText, question: "汇总经营数据与知识库材料，形成一份可追溯的结论" }
];

const analysisModeMeta: Record<
  DataHubChatMode,
  {
    title: string;
    taskName: string;
    resultTitle: string;
    emptyTitle: string;
    emptyDescription: string;
    emptyAria: string;
  }
> = {
  ask: {
    title: "智能问数",
    taskName: "问数",
    resultTitle: "问数结果",
    emptyTitle: "从一个经营问题开始",
    emptyDescription: "星数只会在当前 data-hub 空间及您有权访问的数据范围内查询和生成结果。",
    emptyAria: "空白问数工作区"
  },
  rag: {
    title: "知识问答",
    taskName: "问知",
    resultTitle: "问知结果",
    emptyTitle: "从一个企业知识问题开始",
    emptyDescription: "星数只会检索当前 data-hub 空间内您有权访问的知识，并提供经过复核的引用来源。",
    emptyAria: "空白问知工作区"
  },
  document_lookup: {
    title: "查找文档",
    taskName: "找文档",
    resultTitle: "文档结果",
    emptyTitle: "描述您要查找的企业文档",
    emptyDescription: "星数会在当前 data-hub 空间内定位可访问的原文，并通过受鉴权接口安全打开。",
    emptyAria: "空白找文档工作区"
  },
  agent: {
    title: "智能编排",
    taskName: "智能编排",
    resultTitle: "综合结果",
    emptyTitle: "从一个跨数据与知识的任务开始",
    emptyDescription: "星数会展示 data-hub 的真实路由、Agent 协作、工具调用和最终可追溯结果。",
    emptyAria: "空白智能编排工作区"
  }
};

const analysisRouteByMode: Record<DataHubChatMode, string> = {
  agent: "/ask-agent",
  ask: "/ask-data",
  rag: "/ask-knowledge",
  document_lookup: "/document-lookup"
};

function DataHubQueryAssetActions({
  items,
  onFavorite,
  onOpenDashboard
}: {
  items: QueryAssetActionItem[];
  onFavorite: (target: DataHubQueryAssetTarget) => void;
  onOpenDashboard: (asset: QueryAsset) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  const savedItems = items.filter(
    (item): item is QueryAssetActionItem & { state: AskFavoriteUiState & { asset: QueryAsset } } =>
      item.state.status === "saved" && Boolean(item.state.asset)
  );
  const saving = items.some((item) => item.state.status === "saving");
  const allSaved = savedItems.length === items.length;

  const favoriteControl =
    items.length === 1 ? (
      <Button
        aria-pressed={items[0].state.status === "saved"}
        icon={
          <Star
            size={18}
            weight={items[0].state.status === "saved" ? "fill" : "regular"}
          />
        }
        loading={items[0].state.status === "saving"}
        disabled={items[0].state.status === "saved"}
        onClick={() => onFavorite(items[0].target)}
      >
        {items[0].state.status === "saved" ? "已收藏问数" : "收藏问数"}
      </Button>
    ) : (
      <Dropdown
        menu={{
          items: items.map(
            ({ target, state }): NonNullable<MenuProps["items"]>[number] => ({
              key: target.key,
              icon: (
                <Star
                  size={17}
                  weight={state.status === "saved" ? "fill" : "regular"}
                />
              ),
              label:
                state.status === "saved"
                  ? `已收藏：${target.label}`
                  : `收藏：${target.label}`,
              disabled: state.status === "saving" || state.status === "saved",
              onClick: () => onFavorite(target)
            })
          )
        }}
        placement="bottomRight"
        trigger={["click"]}
      >
        <Button
          aria-label={
            allSaved
              ? `已收藏全部数据结果（${items.length}）`
              : `收藏数据结果（${items.length}）`
          }
          icon={<Star size={18} weight={allSaved ? "fill" : "regular"} />}
          loading={saving}
          disabled={allSaved}
        >
          {allSaved ? `已收藏全部（${items.length}）` : `收藏数据结果（${items.length}）`}
        </Button>
      </Dropdown>
    );

  const dashboardControl =
    savedItems.length === 1 ? (
      <Button
        type="primary"
        icon={<PresentationChart size={18} />}
        onClick={() => onOpenDashboard(savedItems[0].state.asset)}
      >
        加入看板
      </Button>
    ) : savedItems.length > 1 ? (
      <Dropdown
        menu={{
          items: savedItems.map(
            ({ target, state }): NonNullable<MenuProps["items"]>[number] => ({
              key: state.asset.id,
              icon: <PresentationChart size={17} />,
              label: `加入看板：${target.label}`,
              onClick: () => onOpenDashboard(state.asset)
            })
          )
        }}
        placement="bottomRight"
        trigger={["click"]}
      >
        <Button type="primary" icon={<PresentationChart size={18} />}>
          加入看板（{savedItems.length}）
        </Button>
      </Dropdown>
    ) : null;

  return (
    <>
      {favoriteControl}
      {dashboardControl}
    </>
  );
}

type AnalysisPageProps = {
  mode?: DataHubChatMode;
};

function normalizeExecutionDocument(content: unknown): DataHubCitationDocument | undefined {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return undefined;
  }

  const record = content as Record<string, unknown>;
  const identityText = (value: unknown) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
  };
  const optionalText = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const docId = identityText(record.docId);
  const docKey = identityText(record.docKey);
  const kbId = identityText(record.kbId);
  if (!docId || !docKey || !kbId) {
    return undefined;
  }

  return {
    docId,
    docKey,
    kbId,
    docName: optionalText(record.docName) || optionalText(record.title),
    fileName: optionalText(record.fileName),
    sourceAvailable: record.sourceAvailable !== false,
    markdownAvailable:
      typeof record.markdownAvailable === "boolean"
        ? record.markdownAvailable
        : undefined,
    fragments: Array.isArray(record.fragments)
      ? record.fragments
          .filter((fragment): fragment is string => typeof fragment === "string")
          .map((fragment) => fragment.trim())
          .filter(Boolean)
          .slice(0, 3)
      : []
  };
}

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
      const header = table.columns
        .map((column) => escapeCsvCell(formatDataHubColumnTitle(column.title, column.key)))
        .join(",");
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

function hasLegacyThinkingProcess(turn: DataHubAskTurn) {
  return Boolean(
    turn.decompose ||
      turn.routingEvents.length ||
      turn.reactSteps.length ||
      turn.toolCalls.length ||
      turn.toolResults.length
  );
}

function DataHubNativeThinking({
  blocks,
  isProcessing
}: {
  blocks: DataHubContentBlock[];
  isProcessing: boolean;
}) {
  return (
    <div className="datahub-native-thinking">
      <div className="datahub-native-thinking__head">
        <span className="datahub-native-thinking__icon" aria-hidden="true">
          <Brain size={18} weight="bold" />
        </span>
        <div>
          <strong>{isProcessing ? "Agent 正在思考" : "Agent 思考完成"}</strong>
          <span>{blocks.length > 1 ? `${blocks.length} 个模型调用片段` : "真实流式思考记录"}</span>
        </div>
        {isProcessing ? <AiThinkingDots label="Agent 正在思考" /> : null}
      </div>
      <div className="datahub-native-thinking__blocks">
        {blocks.map((block, index) => (
          <article
            className="datahub-native-thinking__block"
            key={`${block.replyId || "reply"}-${block.modelCallIndex ?? "legacy"}-${index}`}
          >
            {block.modelCallIndex !== undefined ? (
              <span className="datahub-native-thinking__call">第 {block.modelCallIndex} 次模型调用</span>
            ) : null}
            <XsSafeMarkdown content={block.content} />
          </article>
        ))}
      </div>
    </div>
  );
}

function DataHubAnswer({ blocks }: { blocks: DataHubContentBlock[] }) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="datahub-answer" aria-label="正式回答">
      {blocks.map((block, index) => (
        <article
          className="datahub-answer__block"
          key={`${block.replyId || "reply"}-${block.modelCallIndex ?? "legacy"}-${index}`}
        >
          {blocks.length > 1 && block.modelCallIndex !== undefined ? (
            <span className="datahub-answer__call">第 {block.modelCallIndex} 次模型调用</span>
          ) : null}
          <XsSafeMarkdown content={block.content} />
        </article>
      ))}
    </div>
  );
}

function DataHubCitationList({
  citations,
  onOpen
}: {
  citations: DataHubCitationDocument[];
  onOpen: (citation: DataHubCitationDocument) => void;
}) {
  const titleId = useId();

  if (citations.length === 0) {
    return null;
  }

  return (
    <section className="knowledge-citations" aria-labelledby={titleId}>
      <div className="knowledge-citations__head">
        <div>
          <span className="knowledge-citations__eyebrow">可信来源</span>
          <h3 id={titleId}>引用文档</h3>
        </div>
        <span>{citations.length} 份</span>
      </div>
      <div className="knowledge-citations__list">
        {citations.map((citation) => (
          <article className="knowledge-citation" key={`${citation.docId}::${citation.docKey}`}>
            <div className="knowledge-citation__title">
              <span aria-hidden="true">
                <FileText size={19} weight="duotone" />
              </span>
              <div>
                <strong>{citation.docName || citation.fileName || citation.docKey}</strong>
                <small>文档编号 {citation.docId}</small>
              </div>
              <Button
                icon={<ArrowSquareOut size={17} />}
                disabled={!citation.sourceAvailable}
                onClick={() => onOpen(citation)}
              >
                {citation.sourceAvailable ? "打开原文" : "原文不可用"}
              </Button>
            </div>
            {citation.fragments.length > 0 ? (
              <div className="knowledge-citation__fragments">
                {citation.fragments.map((fragment, index) => (
                  <blockquote key={`${citation.docId}-${index}`}>{fragment}</blockquote>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function DataHubDocumentLookupList({
  documents,
  onOpen
}: {
  documents: DataHubDocumentLookupResult[];
  onOpen: (document: DataHubDocumentLookupResult) => void;
}) {
  const titleId = useId();

  if (documents.length === 0) {
    return null;
  }

  return (
    <section className="document-lookup-results" aria-labelledby={titleId}>
      <div className="document-lookup-results__head">
        <div>
          <span>已定位原文</span>
          <h3 id={titleId}>匹配文档</h3>
        </div>
        <Tag color="blue">{documents.length} 份</Tag>
      </div>
      <div className="document-lookup-results__list">
        {documents.map((document) => (
          <article
            className="document-lookup-card"
            key={`${String(document.docId)}::${document.docKey}`}
          >
            <span className="document-lookup-card__icon" aria-hidden="true">
              <FileText size={21} />
            </span>
            <div className="document-lookup-card__body">
              <strong>{document.title}</strong>
              <div className="document-lookup-card__meta">
                {document.contentType ? <span>{document.contentType}</span> : null}
                {document.docStatus ? <span>{document.docStatus}</span> : null}
                <span>文档编号 {String(document.docId)}</span>
              </div>
              {document.excerpt ? <p>{document.excerpt}</p> : null}
            </div>
            <Button
              icon={<ArrowSquareOut size={17} />}
              disabled={document.sourceAvailable === false}
              onClick={() => onOpen(document)}
            >
              {document.sourceAvailable === false ? "原文不可用" : "打开原文"}
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

function DataHubResultLoading({
  activePhase,
  taskName = "问数"
}: {
  activePhase?: string;
  taskName?: string;
}) {
  return (
    <div
      className="datahub-result-loading"
      role="status"
      aria-label={`AI 正在生成${taskName}结果`}
      aria-live="polite"
    >
      <div className="datahub-result-loading__head">
        <span className="datahub-result-loading__icon" aria-hidden="true">
          <Brain size={20} weight="bold" />
        </span>
        <div>
          <strong>AI 正在生成{taskName}结果</strong>
          <span>{activePhase ? `当前步骤：${activePhase}` : `正在连接 data-hub ${taskName} Agent`}</span>
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
                const title = formatDataHubColumnTitle(column.title, column.key);

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

export function AnalysisPage({ mode = "agent" }: AnalysisPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const storedAnalysisQuestion = useUiStore((state) => state.activeAnalysisQuestion);
  const storedAskDataStatus = useUiStore((state) => state.askDataStatus);
  const storedAskDataEvents = useUiStore((state) => state.askDataEvents);
  const storedAskDataError = useUiStore((state) => state.askDataError);
  const storedAnalysisTurns = useUiStore((state) => state.analysisTurns);
  const storedActiveAskDataRunId = useUiStore((state) => state.activeAskDataRunId);
  const activeAnalysisMode = useUiStore((state) => state.activeAnalysisMode);
  const activeAnalysisSessionId = useUiStore((state) => state.activeAnalysisSessionId);
  const startAskDataRun = useUiStore((state) => state.startAskDataRun);
  const appendAskDataEvent = useUiStore((state) => state.appendAskDataEvent);
  const completeAskDataRun = useUiStore((state) => state.completeAskDataRun);
  const failAskDataRun = useUiStore((state) => state.failAskDataRun);
  const cancelAskDataRun = useUiStore((state) => state.cancelAskDataRun);
  const bindAskDataController = useUiStore((state) => state.bindAskDataController);
  const [isReasoningVisible, setIsReasoningVisible] = useState(true);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [composerMode, setComposerMode] = useState<DataHubChatMode>(mode);
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [selectedQuickQuestion, setSelectedQuickQuestion] = useState("");
  const [aiChartStates, setAiChartStates] = useState<Record<string, AiChartUiState>>({});
  const [favoriteStates, setFavoriteStates] = useState<Record<string, AskFavoriteUiState>>({});
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
  const liveChartTurnIdsRef = useRef(new Set<string>());
  const autoChartAttemptedRef = useRef(new Set<string>());
  const chartPlanInFlightRef = useRef(new Set<string>());
  const isKnowledgeMode = mode === "rag";
  const isDocumentLookupMode = mode === "document_lookup";
  const isAgentMode = mode === "agent";
  const isAskMode = mode === "ask";
  const modeMeta = analysisModeMeta[mode];
  const taskName = modeMeta.taskName;
  const analysisReturnPath = ["/analysis", "/ask-agent", "/ask-data"].includes(
    location.pathname
  )
    ? location.pathname
    : isAgentMode
      ? "/ask-agent"
      : "/ask-data";
  const supportsTables = isAskMode || isAgentMode;
  const supportsCitations = isKnowledgeMode || isAgentMode;
  const isActiveMode = activeAnalysisMode === mode;
  const activeAnalysisQuestion = isActiveMode ? storedAnalysisQuestion : "";
  const askDataStatus = isActiveMode ? storedAskDataStatus : "idle";
  const askDataEvents = isActiveMode ? storedAskDataEvents : [];
  const askDataError = isActiveMode ? storedAskDataError : "";
  const analysisTurns = isActiveMode
    ? storedAnalysisTurns.filter((turn) => turn.chatMode === mode)
    : [];
  const activeAskDataRunId = isActiveMode ? storedActiveAskDataRunId : null;
  const pageQuickQuestions = isKnowledgeMode
    ? knowledgeQuickQuestions
    : isDocumentLookupMode
      ? documentLookupQuickQuestions
      : isAgentMode
        ? agentQuickQuestions
        : quickQuestions;
  const hasConversation =
    Boolean(activeAnalysisQuestion.trim()) || askDataStatus !== "idle" || askDataEvents.length > 0 || Boolean(askDataError);

  useEffect(() => {
    setComposerMode(mode);
  }, [mode]);

  const visibleTurns =
    analysisTurns.length > 0
      ? analysisTurns
      : hasConversation
        ? [
            {
              id: "active-turn",
              question: activeAnalysisQuestion,
              sessionId: activeAnalysisSessionId,
              chatId: askDataEvents.find((event) => event.chatId)?.chatId || "active-chat",
              chatMode: mode,
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
      liveChartTurnIdsRef.current.clear();
      autoChartAttemptedRef.current.clear();
      chartPlanInFlightRef.current.clear();
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

  const ensureFavoriteAsset = async (
    stateKey: string,
    turn: DataHubAskTurn,
    target: DataHubQueryAssetTarget,
    allowRootHistoryFallback: boolean,
    materializationQuestion?: string
  ) => {
    const existing = favoriteStates[stateKey]?.asset;
    if (existing) return existing;
    let artifact = target.artifact;
    if (
      !artifact &&
      turn.status === "done" &&
      target.rootSessionId &&
      target.sessionId &&
      target.chatId &&
      target.canBackfill
    ) {
      const resultSessionId =
        target.sessionId === target.rootSessionId ? undefined : target.sessionId;
      try {
        artifact = await ensureAskArtifact(
          target.rootSessionId,
          target.chatId,
          resultSessionId
        );
      } catch (error) {
        if (
          !allowRootHistoryFallback ||
          !isIncompleteHistoricalQueryError(error)
        ) {
          throw error;
        }
        let incompleteError = error;
        if (resultSessionId) {
          try {
            artifact = await ensureAskArtifact(
              target.rootSessionId,
              target.chatId
            );
          } catch (rootError) {
            if (!isIncompleteHistoricalQueryError(rootError)) {
              throw rootError;
            }
            incompleteError = rootError;
          }
        }
        if (!artifact) {
          if (!materializationQuestion) {
            throw incompleteError;
          }
          setWorkflowStatus("原历史缺少可执行查询，正在重新问数并收藏");
          artifact = await materializeAskArtifact({
            question: materializationQuestion
          });
        }
      }
    }
    if (!artifact?.canFavorite) throw new Error("该问数没有可复用的结构化查询，请重新问数后再收藏");
    const asset = await favoriteAskArtifact(
      artifact,
      artifact.resolvedQuestion || target.label || turn.question
    );
    setFavoriteStates((current) => ({ ...current, [stateKey]: { status: "saved", asset } }));
    return asset;
  };

  const handleFavoriteQuestion = async (
    turnId: string,
    turn: DataHubAskTurn,
    target: DataHubQueryAssetTarget,
    allowRootHistoryFallback: boolean,
    materializationQuestion?: string
  ) => {
    const stateKey = `${turnId}::${target.key}`;
    setFavoriteStates((current) => ({
      ...current,
      [stateKey]: { ...current[stateKey], status: "saving" }
    }));
    try {
      const asset = await ensureFavoriteAsset(
        stateKey,
        turn,
        target,
        allowRootHistoryFallback,
        materializationQuestion
      );
      setFavoriteStates((current) => ({ ...current, [stateKey]: { status: "saved", asset } }));
      setWorkflowStatus(`已收藏问数「${asset.name}」，可直接加入看板`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "收藏问数失败，请稍后重试";
      setFavoriteStates((current) => ({ ...current, [stateKey]: { status: "error", message } }));
      setWorkflowStatus(message);
    }
  };

  const handleGenerateAiChart = useCallback(async (
    turnId: string,
    question: string,
    tables: DataHubTableResult[]
  ) => {
    if (chartPlanInFlightRef.current.has(turnId)) {
      return;
    }

    chartPlanInFlightRef.current.add(turnId);
    setAiChartStates((current) => ({ ...current, [turnId]: { status: "loading" } }));
    setWorkflowStatus("DataHub 正在使用编排 Agent 模型规划图表");

    try {
      const plan = await planAiChart({ question, tables });
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
    } finally {
      chartPlanInFlightRef.current.delete(turnId);
    }
  }, []);

  useEffect(() => {
    if (!supportsTables) {
      return;
    }

    for (const turn of visibleTurns) {
      if (turn.status === "streaming") {
        liveChartTurnIdsRef.current.add(turn.id);
        continue;
      }

      if (
        turn.status !== "done" ||
        !liveChartTurnIdsRef.current.has(turn.id) ||
        autoChartAttemptedRef.current.has(turn.id) ||
        (aiChartStates[turn.id]?.status ?? "idle") !== "idle"
      ) {
        continue;
      }

      const turnAsk = createDataHubAskTurn(
        turn.question,
        turn.events,
        turn.status,
        turn.error,
        { sessionId: turn.sessionId, chatId: turn.chatId }
      );
      const hasLegacyProcess = !isAgentMode && hasLegacyThinkingProcess(turnAsk);
      if (hasLegacyProcess && thinkingPlaybackStates[turn.id]?.isComplete !== true) {
        continue;
      }

      const tables = isAskMode
        ? turnAsk.tableResults
        : isAgentMode
          ? getDataHubSingleQueryTableResults(
              projectDataHubExecutionEvents(turn.events, {
                mainSessionId: turn.sessionId || undefined,
                globalSessionId: turn.sessionId || undefined,
                chatId: turn.chatId,
                fallbackAgentName: `${taskName}智能体`,
                terminalStatus: "done"
              })
            )
          : [];

      if (!canAutoGenerateAiChart({ question: turn.question, tables })) {
        continue;
      }

      autoChartAttemptedRef.current.add(turn.id);
      void handleGenerateAiChart(turn.id, turn.question, tables);
    }
  }, [
    aiChartStates,
    handleGenerateAiChart,
    isAgentMode,
    isAskMode,
    supportsTables,
    taskName,
    thinkingPlaybackStates,
    visibleTurns
  ]);

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

  const streamDataHubQuestion = (question: string, chatMode: DataHubChatMode) => {
    const submittedTaskName = analysisModeMeta[chatMode].taskName;
    shouldAutoScrollRef.current = true;
    setIsScrollToBottomVisible(false);
    const runId = startAskDataRun(question, undefined, chatMode);
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId);

    if (import.meta.env.MODE === "test") {
      completeAskDataRun(runId);
      return;
    }

    if (!turn?.sessionId || !turn.chatId) {
      failAskDataRun(runId, `${submittedTaskName}会话初始化失败`);
      return;
    }

    const controller = streamAgentMessage(
      {
        content: question,
        sessionId: turn.sessionId,
        globalSessionId: turn.sessionId,
        chatId: turn.chatId,
        chatMode
      },
      {
        onEvent: (event) => {
          appendAskDataEvent(runId, event);
          if (event.type === "error" && !event.parentSessionId) {
            const data = event.data as { message?: string } | string | undefined;
            failAskDataRun(
              runId,
              typeof data === "string" ? data : data?.message || `${submittedTaskName}执行失败`
            );
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
      return `正在调用 data-hub ${taskName}，已接收 ${askDataEvents.length} 个过程事件`;
    }
    if (askDataStatus === "done") {
      return askDataEvents.length > 0
        ? `data-hub ${taskName}完成，共接收 ${askDataEvents.length} 个过程事件`
        : `data-hub ${taskName}已提交`;
    }
    if (askDataStatus === "error") {
      return `data-hub ${taskName}失败：${askDataError || "未知错误"}`;
    }
    if (askDataStatus === "cancelled") {
      return `已停止本次${taskName}生成`;
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

    const submittedMode = composerMode;
    streamDataHubQuestion(command, submittedMode);
    setFollowUpDraft("");
    setWorkflowStatus(`已继续追问：${command}`);
    if (submittedMode !== mode) {
      navigate(analysisRouteByMode[submittedMode]);
    }
  };

  const handleOpenCitation = async (citation: DataHubCitationDocument) => {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setWorkflowStatus("浏览器阻止了原文预览窗口，请允许弹出窗口后重试");
      return;
    }

    try {
      previewWindow.opener = null;
    } catch {
      // Some browsers make opener read-only; the authenticated preview can still proceed.
    }

    setWorkflowStatus(`正在打开原文：${citation.docName || citation.fileName || citation.docKey}`);

    try {
      const access = await loadDataHubCitationDocument(citation);
      previewWindow.location.replace(access.url);
      if (access.revoke) {
        window.setTimeout(access.revoke, 60_000);
      }
      setWorkflowStatus("已通过 data-hub 鉴权打开原文");
    } catch (error) {
      previewWindow.close();
      setWorkflowStatus(error instanceof Error ? `原文打开失败：${error.message}` : "原文打开失败，请稍后重试");
    }
  };

  const handleOpenDocumentLookupResult = (document: DataHubDocumentLookupResult) =>
    handleOpenCitation({
      docId: String(document.docId),
      docKey: document.docKey,
      kbId: String(document.kbId),
      docName: document.title,
      sourceAvailable: document.sourceAvailable !== false,
      fragments: []
    });

  return (
    <PageFrame title={modeMeta.title} className="analysis-page" hideHeader>
      {hasConversation ? <h1 className="sr-only">{modeMeta.title}</h1> : null}
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
              const turnAsk = createDataHubAskTurn(
                turn.question,
                turn.events,
                turn.status,
                turn.error,
                { sessionId: turn.sessionId, chatId: turn.chatId }
              );
              const displayStatus: DataHubAskDataStatus =
                turnAsk.error || turnAsk.done?.failed === true
                  ? "error"
                  : turn.status;
              const executionProjection = projectDataHubExecutionEvents(turn.events, {
                mainSessionId: turn.sessionId || undefined,
                globalSessionId: turn.sessionId || undefined,
                chatId: turn.chatId,
                fallbackAgentName: `${taskName}智能体`,
                terminalStatus:
                  displayStatus === "done" || displayStatus === "error"
                    ? displayStatus
                    : undefined
              });
              const hasNativeAgentScope = turn.events.some(
                (event) =>
                  event.type === "agent_start" ||
                  event.type === "subagent_exposed" ||
                  Boolean(event.agentName || event.parentSessionId) ||
                  event.modelCallIndex !== undefined
              );
              const shouldShowExecutionPanel =
                isAgentMode || isDocumentLookupMode || hasNativeAgentScope;
              const expandExecutionPanelByDefault =
                isAgentMode || isDocumentLookupMode;
              const hasDocumentUrlEvents =
                executionProjection.mainSession.documentResults.length > 0;
              const documentLookupResults = hasDocumentUrlEvents
                ? []
                : getDataHubDocumentLookupResults(turnAsk.done);
              const hasLegacyProcess = !isAgentMode && hasLegacyThinkingProcess(turnAsk);
              const thinkingPhases = hasLegacyProcess ? buildThinkingPhases(turnAsk, displayStatus) : [];
              const playbackState = thinkingPlaybackStates[turn.id];
              const hasRenderableResult = Boolean(
                (!isDocumentLookupMode && turnAsk.answerBlocks.length) ||
                  (supportsTables && turnAsk.tableResults.length) ||
                  (supportsCitations && turnAsk.citationDocuments.length) ||
                  (isDocumentLookupMode &&
                    (documentLookupResults.length || hasDocumentUrlEvents))
              );
              const isResultReady = hasLegacyProcess
                ? playbackState?.isComplete === true
                : hasRenderableResult || ["done", "error", "cancelled"].includes(displayStatus);
              const isWaitingForPlayback =
                !isResultReady && (displayStatus === "streaming" || displayStatus === "done");
              const isLatestTurn = turn.id === lastVisibleTurn?.id;
              const hasReasoning =
                !isAgentMode &&
                Boolean(
                  hasLegacyProcess ||
                    ((!shouldShowExecutionPanel || !expandExecutionPanelByDefault) &&
                      turnAsk.thinkingBlocks.length) ||
                    turnAsk.infoMessages.length ||
                    (supportsTables && turnAsk.dataSources.length)
                );
              const statusTitle =
                displayStatus === "streaming" || (displayStatus === "done" && !isResultReady)
                  ? `正在${taskName}`
                  : displayStatus === "done"
                    ? `${taskName}完成`
                    : displayStatus === "error"
                      ? `${taskName}失败`
                      : displayStatus === "cancelled"
                        ? "已停止生成"
                        : `已完成${taskName}`;
              const statusDescription =
                  displayStatus === "idle"
                    ? `请发起${taskName}，星数会同步展示 data-hub 返回的真实过程与结果。`
                    : displayStatus === "done" && !isResultReady
                      ? `数据已返回，正在完成${taskName}过程并整理结果。`
                    : displayStatus === "cancelled"
                      ? `本次${taskName}已停止，你可以修改问题后重新发送。`
                    : turnAsk.error?.message ||
                      (turnAsk.done?.failed ? turnAsk.done.summary : undefined) ||
                      (displayStatus === "done"
                        ? `data-hub ${taskName}结果已整理完成。`
                        : `正在连接 data-hub ${taskName} Agent，请稍候。`);
              const aiChartState = aiChartStates[turn.id] ?? { status: "idle" as const };
              const queryAssetTargets =
                isAskMode || isAgentMode
                  ? getDataHubQueryAssetTargets(
                      executionProjection,
                      turn.question,
                      { mainSessionIsAskData: isAskMode }
                    )
                  : [];
              const chartTables =
                isAskMode
                  ? turnAsk.tableResults
                  : isAgentMode
                    ? getDataHubSingleQueryTableResults(executionProjection)
                    : [];
              const queryAssetActionItems = queryAssetTargets.map((target) => ({
                target,
                state:
                  favoriteStates[`${turn.id}::${target.key}`] ??
                  ({ status: "idle" } as const)
              }));
              const recoverySubQuestions =
                turnAsk.decompose?.subQuestions
                  ?.map((question) => question.trim())
                  .filter(Boolean) ?? [];
              const canMaterializeSingleQuery =
                queryAssetTargets.length === 1 &&
                (!isAgentMode ||
                  (executionProjection.subagentSessions.length <= 1 &&
                    recoverySubQuestions.length <= 1));
              const materializationQuestion = canMaterializeSingleQuery
                ? recoverySubQuestions[0] || turn.question
                : undefined;
              const isGeneratingAiChart = aiChartState.status === "loading";
              const resultStageState = isResultReady
                ? hasRenderableResult
                  ? "ready"
                  : "empty"
                : isWaitingForPlayback
                  ? "loading"
                  : "empty";

              return (
                <div
                  className="analysis-turn"
                  data-status={displayStatus}
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
                        {hasReasoning ? (
                          <Button
                            aria-label={isReasoningVisible ? "收起分析过程" : "展开分析过程"}
                            aria-expanded={isReasoningVisible}
                            aria-controls={`analysis-reasoning-${turn.id}`}
                            icon={isReasoningVisible ? <CaretUp size={18} /> : <CaretDown size={18} />}
                            onClick={handleToggleReasoning}
                          />
                        ) : null}
                      </header>
                      {isLatestTurn && (askDataStatusText || workflowStatus) ? (
                        <div className="sr-only" role="status">
                          {[askDataStatusText, workflowStatus].filter(Boolean).join("，")}
                        </div>
                      ) : null}

                      {shouldShowExecutionPanel ? (
                        <DataHubExecutionPanel
                          projection={executionProjection}
                          title={isAgentMode ? "智能编排执行" : `${taskName} Agent 执行`}
                          defaultExpanded={expandExecutionPanelByDefault}
                          onCitationOpen={(content) => {
                            const citation = normalizeExecutionDocument(content);
                            if (!citation) {
                              setWorkflowStatus("原文身份信息不完整，暂无法打开");
                              return;
                            }
                            void handleOpenCitation(citation);
                          }}
                        />
                      ) : null}

                      {hasReasoning ? (
                        <section
                          className="reasoning-block"
                          id={`analysis-reasoning-${turn.id}`}
                          aria-label="思考过程"
                          hidden={!isReasoningVisible}
                        >
                          <h2>{hasLegacyProcess ? "问数过程（5 步）" : `${taskName}思考过程`}</h2>
                          {hasLegacyProcess ? (
                            <DataHubThinkingProcess
                              phases={thinkingPhases}
                              isProcessing={displayStatus === "idle" || displayStatus === "streaming"}
                              turnId={turn.id}
                              onPlaybackChange={handleThinkingPlaybackChange}
                            />
                          ) : turnAsk.thinkingBlocks.length > 0 ? (
                            <DataHubNativeThinking
                              blocks={turnAsk.thinkingBlocks}
                              isProcessing={displayStatus === "streaming"}
                            />
                          ) : null}

                          {supportsTables && turnAsk.dataSources.length > 0 ? (
                            <div className="datahub-data-sources" aria-label="已选择数据源">
                              <span>已选择数据源</span>
                              <div>
                                {turnAsk.dataSources.map((dataSource) => (
                                  <Tag color="blue" key={String(dataSource.datasourceId)}>
                                    {dataSource.datasourceName}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {turnAsk.infoMessages.length > 0 ? (
                            <div className="datahub-info-list">
                              {turnAsk.infoMessages.map((message) => (
                                <p key={message}>{message}</p>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      ) : null}

                      {!(isDocumentLookupMode && hasDocumentUrlEvents) ? (
                        <section className="analysis-output" aria-label="分析结果">
                        <div className="section-title-row">
                          <h2>{modeMeta.resultTitle}</h2>
                          {isAskMode || isAgentMode ? (
                            <div className="analysis-output__actions">
                            {queryAssetFeatureEnabled && isResultReady ? (
                              <DataHubQueryAssetActions
                                items={queryAssetActionItems}
                                onFavorite={(target) =>
                                  void handleFavoriteQuestion(
                                    turn.id,
                                    turnAsk,
                                    target,
                                    queryAssetTargets.length === 1,
                                    materializationQuestion
                                  )
                                }
                                onOpenDashboard={(asset) =>
                                  navigate(
                                    `/dashboard-editor?source=favorites&asset=${encodeURIComponent(asset.id)}&returnTo=${encodeURIComponent(analysisReturnPath)}`
                                  )
                                }
                              />
                            ) : null}
                            {isResultReady && chartTables.length > 0 ? (
                              <Button
                                icon={<MagicWand size={18} />}
                                loading={isGeneratingAiChart}
                                onClick={() => handleGenerateAiChart(turn.id, turn.question, chartTables)}
                              >
                                AI 生成图表
                              </Button>
                            ) : null}
                            {isAskMode &&
                            isResultReady &&
                            isLatestTurn &&
                            turnAsk.tableResults.length > 0 ? (
                              <Button icon={<DownloadSimple size={18} />} onClick={() => handleExport(turnAsk.tableResults)}>
                                导出结果
                              </Button>
                            ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="analysis-result-stage" data-state={resultStageState}>
                          {!isDocumentLookupMode && isResultReady && turnAsk.answerBlocks.length > 0 ? (
                            <DataHubAnswer blocks={turnAsk.answerBlocks} />
                          ) : null}
                          {isResultReady && aiChartState.status !== "idle" ? (
                            <AiChartSuggestionCard
                              state={aiChartState}
                              onTypeChange={(type) => handleChartTypeChange(turn.id, type)}
                            />
                          ) : null}
                          {supportsTables && isResultReady && turnAsk.tableResults.length > 0 ? (
                            <div className="analysis-output__tables">
                              {turnAsk.tableResults.map((table) => (
                                <DataHubResultTable table={table} key={table.tableIndex} />
                              ))}
                            </div>
                          ) : null}
                          {supportsCitations && isResultReady && turnAsk.citationDocuments.length > 0 ? (
                            <DataHubCitationList
                              citations={turnAsk.citationDocuments}
                              onOpen={(citation) => void handleOpenCitation(citation)}
                            />
                          ) : null}
                          {isDocumentLookupMode && isResultReady && documentLookupResults.length > 0 ? (
                            <DataHubDocumentLookupList
                              documents={documentLookupResults}
                              onOpen={(document) => void handleOpenDocumentLookupResult(document)}
                            />
                          ) : null}
                          {isWaitingForPlayback ? (
                            <DataHubResultLoading activePhase={playbackState?.activeTitle} taskName={taskName} />
                          ) : hasRenderableResult || displayStatus === "error" ? null : (
                            <div className="datahub-empty-state" role="status">
                              {isDocumentLookupMode
                                ? turnAsk.done?.failed
                                  ? turnAsk.done.summary || "找文档执行失败，请调整描述后重试。"
                                  : "没有找到符合条件且可打开的文档。"
                                : isKnowledgeMode
                                  ? "知识库中未找到足够信息。"
                                  : isAgentMode
                                    ? "本次编排未返回可展示的最终结果。"
                                    : "本次问数未返回可展示的结构化结果。"}
                            </div>
                          )}
                          {(turnAsk.error?.message || turnAsk.done?.failed) && displayStatus === "error" ? (
                            <div className="datahub-empty-state datahub-empty-state--error" role="alert">
                              {turnAsk.error?.message || turnAsk.done?.summary || `${taskName}执行失败`}
                            </div>
                          ) : null}
                        </div>
                        </section>
                      ) : null}
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
            aria-label={modeMeta.emptyAria}
          >
            <div className="analysis-empty-state__brand xs-page-enter">
              <span className="analysis-empty-state__orbit analysis-empty-state__orbit--outer" aria-hidden="true" />
              <span className="analysis-empty-state__orbit analysis-empty-state__orbit--inner" aria-hidden="true" />
              <span className="analysis-empty-state__star analysis-empty-state__star--a" aria-hidden="true" />
              <span className="analysis-empty-state__star analysis-empty-state__star--b" aria-hidden="true" />
              <img src={assistantMark} alt="" aria-hidden="true" />
            </div>
            <div className="analysis-empty-state__copy xs-page-enter" style={{ animationDelay: "120ms" }}>
              <h1 id="analysis-empty-title">
                {modeMeta.emptyTitle}
              </h1>
              <p>{modeMeta.emptyDescription}</p>
            </div>
            <div className="analysis-empty-state__prompts" aria-label="快捷问题">
              {pageQuickQuestions.map((item, index) => (
                <button
                  type="button"
                  className={`xs-page-enter${selectedQuickQuestion === item.question ? " is-selected" : ""}`}
                  style={{ animationDelay: `${240 + index * 60}ms` }}
                  key={item.question}
                  aria-pressed={selectedQuickQuestion === item.question}
                  onClick={() => {
                    setFollowUpDraft(item.question);
                    setSelectedQuickQuestion(item.question);
                    setWorkflowStatus("已填入快捷问题，确认后即可发送");
                  }}
                >
                  <item.icon size={17} aria-hidden="true" />
                  <span>{item.question}</span>
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
          modelMode={composerMode}
          onModelModeChange={setComposerMode}
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
