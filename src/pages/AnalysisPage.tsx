import { Button, Dropdown, Segmented, Tag } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowDown,
  ArrowSquareOut,
  Brain,
  ChartLineUp,
  ChartPieSlice,
  Check,
  CircleNotch,
  CopySimple,
  Database,
  FileText,
  FlowArrow,
  Function,
  MapPin,
  PresentationChart,
  Star,
  TrendUp,
  WarningCircle
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionQueryScope } from "@/app/sessionQuery";
import { XsChartCard } from "@/components/xs/XsChartCard";
import { xsEnterStep } from "@/components/xs/motion";
import { XsCommandBox } from "@/components/xs/XsCommandBox";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { DataHubExecutionPanel, DataHubResultTable } from "@/components/xs/datahub";
import { useNow } from "@/components/xs/datahub/useNow";
import { queryAssetFeatureEnabled } from "@/config/features";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { streamAgentMessage } from "@/services/agentService";
import { invalidateDataAssetOverview } from "@/services/dataAssetService";
import { appendVoiceTranscript, transcribeVoice } from "@/services/voiceTranscriptionService";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  canAutoGenerateAiChart,
  planAiChart,
  resolveAiChartTables
} from "@/services/aiChartPlannerService";
import {
  createDataHubAskTurn
} from "@/services/dataHubAskDataPresenter";
import { getDataHubDocumentLookupResults } from "@/services/dataHubDocumentLookupPresenter";
import {
  projectDataHubExecutionEvents
} from "@/services/dataHubExecutionProjector";
import {
  getDataHubAskTableResults,
  getDataHubChildAnswerBlocks,
  getDataHubSingleQueryTableResults,
  getDataHubQueryAssetTargets,
  type DataHubQueryAssetTarget
} from "@/services/dataHubQueryAssetTargetService";
import { materializeAskArtifact } from "@/services/dataHubQueryAssetMaterializationService";
import { ensureAskArtifact, favoriteAskArtifact } from "@/services/queryAssetService";
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
import assistantMark from "@/assets/brand/xingshu-assistant-mark-2x.png";
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
    placeholder: string;
  }
> = {
  ask: {
    title: "智能问数",
    taskName: "问数",
    resultTitle: "问数结果",
    emptyTitle: "从一个经营数据问题开始",
    emptyDescription: "",
    emptyAria: "空白问数工作区",
    placeholder: "帮你查数据"
  },
  rag: {
    title: "知识问答",
    taskName: "问知",
    resultTitle: "问知结果",
    emptyTitle: "从一个企业知识问题开始",
    emptyDescription: "",
    emptyAria: "空白问知工作区",
    placeholder: "帮你查知识"
  },
  document_lookup: {
    title: "查找文档",
    taskName: "找文档",
    resultTitle: "文档结果",
    emptyTitle: "从一份企业文档开始",
    emptyDescription: "",
    emptyAria: "空白找文档工作区",
    placeholder: "帮你找文档"
  },
  agent: {
    title: "智能编排",
    taskName: "智能编排",
    resultTitle: "综合结果",
    emptyTitle: "从一个跨数据与知识的任务开始",
    emptyDescription: "",
    emptyAria: "空白智能编排工作区",
    placeholder: "给星数发送消息"
  }
};

const analysisRouteByMode: Record<DataHubChatMode, string> = {
  agent: "/ask-agent",
  ask: "/ask-data",
  rag: "/ask-knowledge",
  document_lookup: "/document-lookup"
};

function formatDurationZh(ms?: number) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return "";
  }
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 1) {
    return "用时不到 1 秒";
  }
  if (seconds < 60) {
    return `用时 ${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `用时 ${minutes} 分 ${rest} 秒` : `用时 ${minutes} 分`;
}

function stripMarkdownTables(markdown: string) {
  return markdown
    .replace(/(^|\n)(?:[ \t]*\|.*\|[ \t]*\n)+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function copyText(text: string) {
  const value = text.trim();
  if (!value) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function citationSourceLabel(citation: DataHubCitationDocument) {
  const name = citation.docName || citation.fileName || citation.docKey;
  const blob = [name, ...citation.fragments].join(" ");
  const chapter = blob.match(/第[\d一二三四五六七八九十百千]+章[^，。\s]*/)?.[0];
  const page = blob.match(/第?\s*\d+\s*页/)?.[0];
  const location = [chapter, page].filter(Boolean).join(" ");
  return location ? `根据《${name}》${location}` : `根据《${name}》`;
}

function citationsAsLookupResults(citations: DataHubCitationDocument[]): DataHubDocumentLookupResult[] {
  return citations.map((citation) => ({
    docId: citation.docId,
    docKey: citation.docKey,
    kbId: citation.kbId,
    title: citation.docName || citation.fileName || citation.docKey,
    sourceAvailable: citation.sourceAvailable
  }));
}

/**
 * 任务动态：运行中展开为实时编排轨（脉冲 + 走秒 + 阶段链 + 最新动作），
 * 结束后收回成一行摘要，历史轮次不留动效。
 */
function AnalysisTaskDynamics({
  nodes,
  durationMs,
  status,
  phases = [],
  running = false,
  startedAt
}: {
  nodes: string[];
  durationMs?: number;
  status: string;
  phases?: ThinkingPhase[];
  running?: boolean;
  startedAt?: number;
}) {
  const now = useNow(1000, running);
  const duration = formatDurationZh(durationMs);

  if (!running) {
    return (
      <p className="analysis-task-dynamics" aria-label="任务动态">
        <span>任务动态</span>
        {duration ? <span>{duration}</span> : null}
        <span>{nodes.length > 0 ? nodes.join(" → ") : status}</span>
      </p>
    );
  }

  const elapsed = startedAt ? formatDurationZh(Math.max(0, now - startedAt)) : "";
  const activePhase = phases.find((phase) => phase.status === "active");
  const completedCount = phases.filter((phase) => phase.status === "complete").length;
  // 最新动作优先取真实事件明细，事件未到时退回阶段说明，避免这行空着闪烁。
  const detail = activePhase ? activePhase.details.at(-1) || activePhase.description : "";

  return (
    <div className="analysis-live" aria-label="任务动态">
      <p className="analysis-live__head">
        <span className="xs-status-bar__pulse analysis-live__pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="analysis-live__status">{status}</span>
        {elapsed ? <span className="analysis-live__timer">{elapsed}</span> : null}
        {phases.length > 0 ? (
          <span className="analysis-live__count">
            {completedCount}/{phases.length}
          </span>
        ) : null}
      </p>
      {phases.length > 0 ? (
        <ol className="analysis-live__rail">
          {phases.map((phase) => {
            const PhaseIcon = phase.icon;
            return (
              <li
                className="analysis-live__step"
                data-state={phase.status}
                key={phase.id}
                title={phase.description}
              >
                <span className="analysis-live__step-mark" aria-hidden="true">
                  {phase.status === "complete" ? (
                    <Check size={12} weight="bold" />
                  ) : phase.status === "error" ? (
                    <WarningCircle size={13} weight="bold" />
                  ) : (
                    <PhaseIcon size={13} weight="bold" />
                  )}
                </span>
                <span className="analysis-live__step-title">{phase.title}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {detail ? (
        <p className="analysis-live__detail" key={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

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
      <button
        type="button"
        className="analysis-icon-button"
        aria-label={items[0].state.status === "saved" ? "已收藏问数" : "收藏问数"}
        aria-pressed={items[0].state.status === "saved"}
        aria-busy={items[0].state.status === "saving" || undefined}
        disabled={items[0].state.status === "saved" || items[0].state.status === "saving"}
        onClick={() => onFavorite(items[0].target)}
      >
        <Star
          size={16}
          weight={items[0].state.status === "saved" ? "fill" : "regular"}
          aria-hidden="true"
        />
      </button>
    ) : (
      <Dropdown
        menu={{
          items: items.map(
            ({ target, state }): NonNullable<MenuProps["items"]>[number] => ({
              key: target.key,
              icon: (
                <Star
                  size={16}
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
        <button
          type="button"
          className="analysis-icon-button"
          aria-label={
            allSaved
              ? `已收藏全部数据结果（${items.length}）`
              : `收藏数据结果（${items.length}）`
          }
          aria-pressed={allSaved}
          aria-busy={saving || undefined}
          disabled={allSaved || saving}
        >
          <Star size={16} weight={allSaved ? "fill" : "regular"} aria-hidden="true" />
        </button>
      </Dropdown>
    );

  const dashboardControl =
    savedItems.length === 1 ? (
      <button
        type="button"
        className="analysis-icon-button"
        aria-label="加入看板"
        onClick={() => onOpenDashboard(savedItems[0].state.asset)}
      >
        <PresentationChart size={16} aria-hidden="true" />
      </button>
    ) : savedItems.length > 1 ? (
      <Dropdown
        menu={{
          items: savedItems.map(
            ({ target, state }): NonNullable<MenuProps["items"]>[number] => ({
              key: state.asset.id,
              icon: <PresentationChart size={16} />,
              label: `加入看板：${target.label}`,
              onClick: () => onOpenDashboard(state.asset)
            })
          )
        }}
        placement="bottomRight"
        trigger={["click"]}
      >
        <button
          type="button"
          className="analysis-icon-button"
          aria-label={`加入看板（${savedItems.length}）`}
        >
          <PresentationChart size={16} aria-hidden="true" />
        </button>
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

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= autoScrollBottomThreshold;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function getScrollBottom(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function easeOutXingshu(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 4;
}

type SmoothScrollHandle = {
  frameId: number | null;
  aborted: boolean;
};

function cancelSmoothScroll(handle: SmoothScrollHandle) {
  handle.aborted = true;

  if (handle.frameId !== null) {
    window.cancelAnimationFrame(handle.frameId);
    handle.frameId = null;
  }
}

function scrollElementToBottom(
  element: HTMLElement,
  options?: {
    behavior?: ScrollBehavior;
    handle?: SmoothScrollHandle;
  }
) {
  const behavior = options?.behavior ?? "auto";
  const handle = options?.handle;
  const bottom = getScrollBottom(element);

  if (handle) {
    cancelSmoothScroll(handle);
    handle.aborted = false;
  }

  if (Math.abs(element.scrollTop - bottom) <= 1) {
    return;
  }

  if (behavior !== "smooth" || prefersReducedMotion()) {
    element.scrollTop = bottom;
    return;
  }

  const startTop = element.scrollTop;
  const duration = Math.min(520, Math.max(280, Math.abs(bottom - startTop) * 0.32));
  let startTime: number | null = null;
  let lastNow: number | null = null;
  let finished = false;

  const finish = () => {
    finished = true;
    element.scrollTop = getScrollBottom(element);

    if (handle) {
      handle.frameId = null;
    }
  };

  const tick = (now: number) => {
    if (finished || handle?.aborted) {
      return;
    }

    if (startTime === null) {
      startTime = now;
    }

    if (lastNow !== null && now <= lastNow) {
      finish();
      return;
    }

    lastNow = now;
    const t = Math.min(1, (now - startTime) / duration);
    const liveTarget = getScrollBottom(element);
    element.scrollTop = startTop + (liveTarget - startTop) * easeOutXingshu(t);

    if (t >= 1) {
      finish();
      return;
    }

    const nextId = window.requestAnimationFrame(tick);

    if (!finished && handle && !handle.aborted) {
      handle.frameId = nextId;
    }
  };

  const frameId = window.requestAnimationFrame(tick);

  if (!finished && handle && !handle.aborted) {
    handle.frameId = frameId;
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
      description: "识别问数意图，拆解为可执行的查询。",
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
      description: "读取业务语义并生成查询结构。",
      icon: Function,
      details: compactMessages(collectStepDetails(steps, ["plan_with_datasource_skill", "generate_query", "nl2sql_fallback"]))
    },
    {
      id: "execute",
      title: "执行查询",
      description: "执行查询并返回结构化数据结果。",
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

function hasLegacyThinkingProcess(turn: DataHubAskTurn) {
  return Boolean(
    turn.decompose ||
      turn.routingEvents.length ||
      turn.reactSteps.length ||
      turn.toolCalls.length ||
      turn.toolResults.length
  );
}

function DataHubAnswer({
  blocks,
  hideMarkdownTables = false,
  streaming = false
}: {
  blocks: DataHubContentBlock[];
  hideMarkdownTables?: boolean;
  streaming?: boolean;
}) {
  const rendered = blocks
    .map((block) => ({
      ...block,
      content: hideMarkdownTables ? stripMarkdownTables(block.content) : block.content
    }))
    .filter((block) => block.content.trim());

  if (rendered.length === 0) {
    return null;
  }

  return (
    <div
      className={`datahub-answer${streaming ? " datahub-answer--streaming" : ""}`}
      aria-label="正式回答"
    >
      {rendered.map((block, index) => (
        <article
          className="datahub-answer__block"
          key={`${block.replyId || "reply"}-${block.modelCallIndex ?? "legacy"}-${index}`}
        >
          {rendered.length > 1 && block.modelCallIndex !== undefined ? (
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
  onOpen,
  onCopyFragment
}: {
  citations: DataHubCitationDocument[];
  onOpen: (citation: DataHubCitationDocument) => void;
  onCopyFragment?: (text: string) => void;
}) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <section className="knowledge-citations knowledge-citations--chips" aria-label="引用文档">
      <div className="knowledge-citations__chips">
        {citations.map((citation) => {
          const title = citation.docName || citation.fileName || citation.docKey;
          return (
            <button
              type="button"
              className="knowledge-citation-chip"
              key={`${citation.docId}::${citation.docKey}`}
              aria-label={`${citation.sourceAvailable ? "打开原文" : "原文不可用"}：${title}`}
              disabled={!citation.sourceAvailable}
              onClick={() => onOpen(citation)}
            >
              <FileText size={15} aria-hidden="true" />
              <span>{title}</span>
            </button>
          );
        })}
      </div>
      {citations.some((citation) => citation.fragments.length > 0) ? (
        <div className="knowledge-citations__quotes">
          {citations.flatMap((citation) =>
            citation.fragments.map((fragment, index) => (
              <blockquote key={`${citation.docId}-${index}`}>
                <p>{fragment}</p>
                <span className="knowledge-citations__quote-actions">
                  <button
                    type="button"
                    className="analysis-icon-button"
                    aria-label="复制原文"
                    onClick={() => onCopyFragment?.(fragment)}
                  >
                    <CopySimple size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="analysis-icon-button"
                    aria-label={`查看原文片段：${citation.docName || citation.fileName || citation.docKey}`}
                    disabled={!citation.sourceAvailable}
                    onClick={() => onOpen(citation)}
                  >
                    <ArrowSquareOut size={15} aria-hidden="true" />
                  </button>
                </span>
              </blockquote>
            ))
          )}
        </div>
      ) : null}
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
  if (documents.length === 0) {
    return null;
  }

  return (
    <section className="document-lookup-results" aria-label="匹配文档">
      <div className="document-lookup-results__list document-lookup-results__list--names">
        {documents.map((document) => (
          <button
            type="button"
            className="document-lookup-name"
            key={`${String(document.docId)}::${document.docKey}`}
            aria-label={`${document.sourceAvailable === false ? "原文不可用" : "打开原文"}：${document.title}`}
            disabled={document.sourceAvailable === false}
            onClick={() => onOpen(document)}
          >
            <FileText size={16} aria-hidden="true" />
            <span>{document.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DataHubResultLoading({
  activePhase,
  taskName = "问数",
  title,
  description
}: {
  activePhase?: string;
  taskName?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div
      className="datahub-result-loading"
      role="status"
      aria-label={title || `AI 正在生成${taskName}结果`}
      aria-live="polite"
    >
      <div className="datahub-result-loading__head">
        <span className="datahub-result-loading__icon" aria-hidden="true">
          <Brain size={20} weight="bold" />
        </span>
        <div>
          <strong>{title || `AI 正在生成${taskName}结果`}</strong>
          <span>{description || (activePhase ? `当前步骤：${activePhase}` : `正在${taskName}`)}</span>
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
  const queryClient = useQueryClient();
  const sessionScope = useSessionQueryScope();
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
  const releaseAnalysisTransientBuffers = useUiStore((state) => state.releaseAnalysisTransientBuffers);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [composerMode, setComposerMode] = useState<DataHubChatMode>(mode);
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [selectedQuickQuestion, setSelectedQuickQuestion] = useState("");
  const [aiChartStates, setAiChartStates] = useState<Record<string, AiChartUiState>>({});
  const [favoriteStates, setFavoriteStates] = useState<Record<string, AskFavoriteUiState>>({});
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const voiceInput = useVoiceInput({
    onAudioReady: async (audio, signal) => {
      setWorkflowStatus("正在转写语音");
      const text = await transcribeVoice(audio, signal);
      if (signal.aborted) {
        return;
      }
      setFollowUpDraft((current) => appendVoiceTranscript(current, text));
      setWorkflowStatus("");
    },
    onError: setWorkflowStatus
  });
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const smoothScrollHandleRef = useRef<SmoothScrollHandle>({ frameId: null, aborted: false });
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
  const isLoadingHistory = askDataStatus === "streaming" && activeAskDataRunId === null;
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

  useEffect(() => () => {
    releaseAnalysisTransientBuffers();
  }, [releaseAnalysisTransientBuffers]);

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

  useEffect(() => {
    if (!hasConversation) {
      shouldAutoScrollRef.current = true;
      lastWorkspaceScrollTopRef.current = 0;
      liveChartTurnIdsRef.current.clear();
      autoChartAttemptedRef.current.clear();
      chartPlanInFlightRef.current.clear();
      cancelSmoothScroll(smoothScrollHandleRef.current);
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
    cancelSmoothScroll(smoothScrollHandleRef.current);
    const workspace = workspaceRef.current;

    if (workspace && !isNearScrollBottom(workspace)) {
      setIsScrollToBottomVisible(true);
    }
  }, []);

  const scheduleAutoScrollToBottom = useCallback(() => {
    const workspace = workspaceRef.current;

    if (
      !workspace ||
      !shouldAutoScrollRef.current ||
      scrollFrameRef.current !== null ||
      smoothScrollHandleRef.current.frameId !== null
    ) {
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

      cancelSmoothScroll(smoothScrollHandleRef.current);
    };
  }, [hasConversation, scheduleAutoScrollToBottom, scrollSignature]);

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

    scrollElementToBottom(workspace, {
      behavior: "smooth",
      handle: smoothScrollHandleRef.current
    });
    lastWorkspaceScrollTopRef.current = workspace.scrollTop;
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
    tables: DataHubTableResult[],
    answer?: string
  ) => {
    if (chartPlanInFlightRef.current.has(turnId)) {
      return;
    }

    chartPlanInFlightRef.current.add(turnId);
    setAiChartStates((current) => ({ ...current, [turnId]: { status: "loading" } }));
    setWorkflowStatus("正在规划图表");

    try {
      const chartTables = resolveAiChartTables({ question, tables, answer });
      const plan = await planAiChart({ question, tables: chartTables });
      const spec = buildGeneratedChartSpec(plan, chartTables);

      if (!plan.chartable || !spec) {
        const message = plan.reason || "当前结果暂不适合生成图表。";
        setAiChartStates((current) => ({ ...current, [turnId]: { status: "not-chartable", message } }));
        /* 完整理由由结果区的图表卡片承载，状态条只报结论，不复述整段判断 */
        setWorkflowStatus("暂不适合生成图表");
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
      setWorkflowStatus("图表生成失败");
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
      const tables = isAskMode || isAgentMode
        ? getDataHubSingleQueryTableResults(
            projectDataHubExecutionEvents(turn.events, {
              mainSessionId: turn.sessionId || undefined,
              globalSessionId: turn.sessionId || undefined,
              chatId: turn.chatId,
              fallbackAgentName: `${taskName}智能体`,
              terminalStatus: "done"
            }),
            isAskMode
          )
        : [];

      if (!canAutoGenerateAiChart({ question: turn.question, tables, answer: turnAsk.assistantContent })) {
        continue;
      }

      autoChartAttemptedRef.current.add(turn.id);
      void handleGenerateAiChart(turn.id, turn.question, tables, turnAsk.assistantContent);
    }
  }, [
    aiChartStates,
    handleGenerateAiChart,
    isAgentMode,
    isAskMode,
    supportsTables,
    taskName,
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
        onDone: () => {
          completeAskDataRun(runId);
          void invalidateDataAssetOverview(queryClient, sessionScope);
        },
        onError: (error) => failAskDataRun(runId, error.message)
      }
    );
    bindAskDataController(runId, controller);
  };

  const askDataStatusText = (() => {
    if (isLoadingHistory) {
      return "正在加载历史对话";
    }
    if (askDataStatus === "streaming") {
      return `正在${taskName}`;
    }
    if (askDataStatus === "done") {
      return `${taskName}已完成`;
    }
    if (askDataStatus === "error") {
      return `${taskName}失败：${askDataError || "未知错误"}`;
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
      setWorkflowStatus("已打开原文");
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
    <PageFrame title={modeMeta.title} className="analysis-page" track="data" hideHeader>
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
                startedAt: turn.startedAt,
                terminalStatus:
                  displayStatus === "done" ||
                  displayStatus === "error" ||
                  displayStatus === "cancelled"
                    ? displayStatus
                    : undefined,
                terminalTimestamp: turn.endedAt
              });
              const shouldShowExecutionPanel = isAgentMode;
              const expandExecutionPanelByDefault = shouldShowExecutionPanel;
              const preferDirectMainExecution = !isAgentMode;
              const lookupFromDone = getDataHubDocumentLookupResults(turnAsk.done);
              const documentLookupResults =
                lookupFromDone.length > 0
                  ? lookupFromDone
                  : isDocumentLookupMode
                    ? citationsAsLookupResults(turnAsk.citationDocuments)
                    : [];
              const hasLegacyProcess = !isAgentMode && hasLegacyThinkingProcess(turnAsk);
              // 运行中即使编排事件还没到，也先按问数固定阶段链展示（首阶段 active），
              // 否则用户在首个事件到达前看不到任何“正在跑”的证据。
              const thinkingPhases =
                !isAgentMode && (hasLegacyProcess || displayStatus === "streaming")
                  ? buildThinkingPhases(turnAsk, displayStatus)
                  : [];
              const askTables = isAskMode || isAgentMode
                ? getDataHubAskTableResults(executionProjection, isAskMode)
                : [];
              const visibleTables = askTables.length > 0 ? askTables : turnAsk.tableResults;
              const childAnswerBlocks = isAgentMode
                ? getDataHubChildAnswerBlocks(executionProjection).filter((block) =>
                    !turnAsk.answerBlocks.some(
                      (answer) =>
                        answer.content.includes(block.content) ||
                        block.content.includes(answer.content)
                    )
                  )
                : [];
              const visibleAnswerBlocks = [...turnAsk.answerBlocks, ...childAnswerBlocks];
              const hasRenderableResult = Boolean(
                (!isDocumentLookupMode && visibleAnswerBlocks.length) ||
                  (supportsTables && visibleTables.length) ||
                  (supportsCitations && turnAsk.citationDocuments.length) ||
                  (isDocumentLookupMode && documentLookupResults.length)
              );
              const isResultReady =
                hasRenderableResult || ["done", "error", "cancelled"].includes(displayStatus);
              const isLatestTurn = turn.id === lastVisibleTurn?.id;
              const isHistoryLoadingTurn = isLoadingHistory && isLatestTurn;
              const taskNodes = thinkingPhases
                .filter((phase) => phase.status === "complete" || phase.status === "active")
                .map((phase) => phase.title);
              const taskStatus =
                isHistoryLoadingTurn
                  ? "正在加载历史对话"
                  : displayStatus === "streaming"
                    ? `正在${taskName}`
                    : displayStatus === "error"
                      ? `${taskName}失败`
                      : displayStatus === "cancelled"
                        ? "已停止生成"
                        : `${taskName}已完成`;
              const durationMs =
                turn.startedAt && turn.endedAt
                  ? turn.endedAt - turn.startedAt
                  : turnAsk.done?.totalDurationMs;
              const aiChartState = aiChartStates[turn.id] ?? { status: "idle" as const };
              const queryAssetTargets =
                isAskMode || isAgentMode
                  ? getDataHubQueryAssetTargets(
                      executionProjection,
                      turn.question,
                      { mainSessionIsAskData: isAskMode }
                    )
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
              const resultStageState = isResultReady
                ? hasRenderableResult
                  ? "ready"
                  : displayStatus === "streaming"
                    ? "loading"
                    : "empty"
                : displayStatus === "streaming"
                  ? "loading"
                  : "empty";
              const answerText = stripMarkdownTables(
                [
                  turnAsk.assistantContent || turnAsk.done?.summary || "",
                  ...childAnswerBlocks.map((block) => block.content)
                ]
                  .filter(Boolean)
                  .join("\n\n")
              );

              return (
                <div
                  className={`analysis-turn${!isLatestTurn && displayStatus !== "streaming" ? " analysis-turn--virtualized" : ""}`}
                  data-status={displayStatus}
                  data-result-ready={isResultReady}
                  key={turn.id}
                >
                  <section className="analysis-question" aria-label="用户提问">
                    <div>
                      <strong>{turn.question}</strong>
                      <div className="analysis-question__actions">
                        <button
                          type="button"
                          className="analysis-icon-button"
                          aria-label="复制问题"
                          onClick={async () => {
                            const copied = await copyText(turn.question);
                            setWorkflowStatus(copied ? "已复制问题" : "复制问题失败，请稍后重试");
                          }}
                        >
                          <CopySimple size={16} aria-hidden="true" />
                        </button>
                        {queryAssetFeatureEnabled && (isAskMode || isAgentMode) && isResultReady ? (
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
                      </div>
                    </div>
                    <img src={userAvatar} alt="" width={53} height={56} />
                  </section>

                  <section className="analysis-response" aria-label="星数分析结果">
                    <img className="analysis-response__mark" src={assistantMark} alt="" width={160} height={160} />
                    <article className="xs-card analysis-card">
                      <AnalysisTaskDynamics
                        nodes={taskNodes}
                        durationMs={durationMs}
                        status={taskStatus}
                        phases={thinkingPhases}
                        running={displayStatus === "streaming"}
                        startedAt={turn.startedAt}
                      />
                      {isLatestTurn && (askDataStatusText || workflowStatus) ? (
                        <div className="sr-only" role="status">
                          {[askDataStatusText, workflowStatus].filter(Boolean).join("，")}
                        </div>
                      ) : null}

                      {shouldShowExecutionPanel && !isHistoryLoadingTurn ? (
                        <DataHubExecutionPanel
                          projection={executionProjection}
                          title="智能编排执行"
                          defaultExpanded={expandExecutionPanelByDefault}
                          preferDirectMainExecution={preferDirectMainExecution}
                          showMainDocumentBlocks={isAgentMode || isKnowledgeMode}
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

                      <section className="analysis-output" aria-label="分析结果">
                        {isAgentMode &&
                        (hasRenderableResult ||
                          displayStatus === "done" ||
                          displayStatus === "error" ||
                          displayStatus === "cancelled") ? (
                          <div className="section-title-row">
                            <h2>{modeMeta.resultTitle}</h2>
                          </div>
                        ) : null}
                        <div className="analysis-result-stage" data-state={resultStageState}>
                          {supportsTables && isResultReady && turnAsk.dataSources.length > 0 ? (
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
                          {isKnowledgeMode && isResultReady && turnAsk.citationDocuments[0] ? (
                            <p className="knowledge-source-line">
                              {citationSourceLabel(turnAsk.citationDocuments[0])}
                            </p>
                          ) : null}
                          {isKnowledgeMode && isResultReady && turnAsk.citationDocuments.length > 0 ? (
                            <DataHubCitationList
                              citations={turnAsk.citationDocuments}
                              onOpen={(citation) => void handleOpenCitation(citation)}
                              onCopyFragment={async (text) => {
                                const copied = await copyText(text);
                                setWorkflowStatus(copied ? "已复制原文" : "复制原文失败，请稍后重试");
                              }}
                            />
                          ) : null}
                          {!isDocumentLookupMode &&
                          isResultReady &&
                          visibleAnswerBlocks.length > 0 ? (
                            <div className="analysis-answer-block">
                              {isKnowledgeMode ? <p className="knowledge-summary-label">总结</p> : null}
                              <DataHubAnswer
                                blocks={visibleAnswerBlocks}
                                hideMarkdownTables={visibleTables.length > 0}
                                streaming={displayStatus === "streaming"}
                              />
                              {answerText ? (
                                <button
                                  type="button"
                                  className="analysis-icon-button"
                                  aria-label="复制回答"
                                  onClick={async () => {
                                    const copied = await copyText(answerText);
                                    setWorkflowStatus(copied ? "已复制回答" : "复制回答失败，请稍后重试");
                                  }}
                                >
                                  <CopySimple size={16} aria-hidden="true" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          {isResultReady && aiChartState.status !== "idle" ? (
                            <AiChartSuggestionCard
                              state={aiChartState}
                              onTypeChange={(type) => handleChartTypeChange(turn.id, type)}
                            />
                          ) : null}
                          {supportsTables && isResultReady && visibleTables.length > 0 ? (
                            <div className="analysis-output__tables">
                              {visibleTables.map((table) => (
                                <DataHubResultTable
                                  table={table}
                                  key={table.tableIndex}
                                  onStatus={setWorkflowStatus}
                                />
                              ))}
                            </div>
                          ) : null}
                          {supportsCitations &&
                          !isKnowledgeMode &&
                          isResultReady &&
                          turnAsk.citationDocuments.length > 0 ? (
                            <DataHubCitationList
                              citations={turnAsk.citationDocuments}
                              onOpen={(citation) => void handleOpenCitation(citation)}
                              onCopyFragment={async (text) => {
                                const copied = await copyText(text);
                                setWorkflowStatus(copied ? "已复制原文" : "复制原文失败，请稍后重试");
                              }}
                            />
                          ) : null}
                          {isDocumentLookupMode && isResultReady && documentLookupResults.length > 0 ? (
                            <DataHubDocumentLookupList
                              documents={documentLookupResults}
                              onOpen={(document) => void handleOpenDocumentLookupResult(document)}
                            />
                          ) : null}
                          {displayStatus === "streaming" && !hasRenderableResult ? (
                            <DataHubResultLoading
                              taskName={taskName}
                              title={isHistoryLoadingTurn ? "正在加载历史对话" : undefined}
                              description={isHistoryLoadingTurn ? "历史内容加载完成后会在当前页面直接显示。" : undefined}
                            />
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
              <img src={assistantMark} alt="" width={160} height={160} aria-hidden="true" />
            </div>
            <div className="analysis-empty-state__copy xs-page-enter" style={xsEnterStep(1)}>
              <h1 id="analysis-empty-title">
                {modeMeta.emptyTitle}
              </h1>
              {modeMeta.emptyDescription ? <p>{modeMeta.emptyDescription}</p> : null}
            </div>
            <div className="analysis-empty-state__prompts" aria-label="快捷问题">
              {pageQuickQuestions.map((item, index) => (
                <button
                  type="button"
                  className={`xs-page-enter${selectedQuickQuestion === item.question ? " is-selected" : ""}`}
                  style={xsEnterStep(2 + Math.min(index, 3))}
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

      <div className="analysis-composer" data-stage={hasConversation ? "conversation" : "empty"}>
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
          placeholder={analysisModeMeta[composerMode].placeholder}
          onVoice={() => {
            setWorkflowStatus(voiceInput.state === "recording" ? "正在转写语音" : "正在听取语音");
            voiceInput.toggle();
          }}
          onCancelVoice={() => {
            voiceInput.cancel();
            setWorkflowStatus("已取消语音输入");
          }}
          onStop={isLoadingHistory ? undefined : handleStop}
          busy={askDataStatus === "streaming"}
          voiceState={voiceInput.state}
          modelMode={composerMode}
          onModelModeChange={setComposerMode}
        />
        <div className="analysis-composer__status-slot">
          <XsStatusBar
            tone={askDataStatus === "streaming" ? "loading" : "info"}
            spinner={false}
            message={workflowStatus}
            transitionKey={workflowStatus}
          />
        </div>
      </div>
    </PageFrame>
  );
}
