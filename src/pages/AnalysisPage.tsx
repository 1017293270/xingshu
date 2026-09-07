import { Button, Dropdown, Modal, Segmented } from "antd";
import type { MenuProps } from "antd";
import {
  ArrowDown,
  ArrowSquareOut,
  Brain,
  CaretDown,
  ChartLineUp,
  ChartPieSlice,
  CopySimple,
  Database,
  FileText,
  FlowArrow,
  MapPin,
  PresentationChart,
  Star,
  Table,
  TrendUp
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionQueryScope } from "@/app/sessionQuery";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { XsChartCard } from "@/components/xs/XsChartCard";
import { xsEnterStep } from "@/components/xs/motion";
import { XsCommandBox } from "@/components/xs/XsCommandBox";
import { XsSafeMarkdown } from "@/components/xs/XsSafeMarkdown";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import {
  DataHubBusinessExplanation,
  DataHubCitationChips,
  DataHubExecutionPanel,
  DataHubProcessDock,
  DataHubResultTable
} from "@/components/xs/datahub";
import { useClarifyDock, XsClarifyCard, XsClarifyPanel } from "@/components/xs/conversation";
import { clarifyAllModesEnabled, queryAssetFeatureEnabled } from "@/config/features";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { respondToAgentInteraction, streamAgentMessage } from "@/services/agentService";
import { copyText } from "@/services/clipboard";
import { clarificationKey, hasPendingClarification } from "@/services/dataHubClarification";
import { invalidateDataAssetOverview } from "@/services/dataAssetService";
import { appendVoiceTranscript, transcribeVoice } from "@/services/voiceTranscriptionService";
import {
  buildGeneratedChartOption,
  buildGeneratedChartSpec,
  canAutoGenerateAiChart,
  isDataHubScalarResult,
  planAiChart,
  resolveAiChartTables
} from "@/services/aiChartPlannerService";
import {
  buildDataHubBusinessTrace,
  createDataHubAskTurn,
  normalizeDataHubCitationEvidence
} from "@/services/dataHubAskDataPresenter";
import {
  getDataHubChildDocumentResults,
  getDataHubDocumentLookupResults
} from "@/services/dataHubDocumentLookupPresenter";
import {
  projectDataHubExecutionEvents
} from "@/services/dataHubExecutionProjector";
import {
  getDataHubAskTableResults,
  getDataHubChildAnswerBlocks,
  getDataHubQueryAssetTargets,
  type DataHubQueryAssetTarget
} from "@/services/dataHubQueryAssetTargetService";
import { materializeAskArtifact } from "@/services/dataHubQueryAssetMaterializationService";
import { ensureAskArtifact, favoriteAskArtifact } from "@/services/queryAssetService";
import { loadDataHubCitationDocument } from "@/services/dataHubKnowledgeService";
import { buildDataHubAnswerPreamble } from "@/services/dataHubAnswerPreamble";
import { buildDataHubResultSummary } from "@/services/dataHubResultSummary";
import {
  dataHubRootAnsweredAfterChildren,
  dedupeDataHubAnswerBlocks
} from "@/services/dataHubAnswerDedupe";
import { AnalysisCitationPreview, citationPreviewId } from "./AnalysisCitationPreview";
import { citationKnowledgeBaseLabel, citationDisplayTitle, citationLocationText } from "@/components/xs/datahub/citationLabels";
import { formatDataHubCitationFragment, formatDataHubColumnTitle } from "@/services/dataHubFormat";
import { getDataHubResponsePhases } from "@/services/dataHubResponsePhases";
import { getDataHubThinkingSections } from "@/services/dataHubThinkingSections";
import { useUiStore, type AnalysisTurnState } from "@/stores/uiStore";
import type { AiChartType, GeneratedChartSpec } from "@/types/aiChart";
import type {
  DataHubAskDataStatus,
  DataHubAskTurn,
  DataHubChatMode,
  DataHubCitationDocument,
  DataHubContentBlock,
  DataHubDocumentLookupResult,
  DataHubTableResult
} from "@/types/dataHub";
import type { QueryAsset } from "@/types/analytics";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-2x.png";
import userAvatar from "@/assets/brand/analysis-user-avatar-source.png";
import { PageFrame } from "./PageFrame";
import "./styles/analysis-motion.css";

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
    emptyTitle: string;
    emptyDescription: string;
    emptyAria: string;
    placeholder: string;
  }
> = {
  ask: {
    title: "智能问数",
    taskName: "问数",
    emptyTitle: "从一个经营数据问题开始",
    emptyDescription: "",
    emptyAria: "空白问数工作区",
    placeholder: "帮你查数据"
  },
  rag: {
    title: "知识问答",
    taskName: "问知",
    emptyTitle: "从一个企业知识问题开始",
    emptyDescription: "",
    emptyAria: "空白问知工作区",
    placeholder: "帮你查知识"
  },
  document_lookup: {
    title: "查找文档",
    taskName: "找文档",
    emptyTitle: "从一份企业文档开始",
    emptyDescription: "",
    emptyAria: "空白找文档工作区",
    placeholder: "帮你找文档"
  },
  agent: {
    title: "智能编排",
    taskName: "智能编排",
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

function citationSourceLabel(citation: DataHubCitationDocument) {
  const location = citationLocationText(citation);
  return `根据《${citationDisplayTitle(citation)}》${location ? ` ${location}` : ""}`;
}

function citationsAsLookupResults(citations: DataHubCitationDocument[]): DataHubDocumentLookupResult[] {
  return citations.slice(0, 5).map((citation) => ({
    docId: citation.docId,
    docKey: citation.docKey,
    kbId: citation.kbId,
    kbName: citation.kbName,
    title: citation.docName || citation.fileName || citation.docKey || citation.docId,
    sourceAvailable: citation.sourceAvailable
  }));
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
  // 原文按知识库和文档 ID 打开，docKey 仅作显示与旧接口兼容。
  if (!docId || !kbId) {
    return undefined;
  }

  return {
    docId,
    docKey: docKey || undefined,
    kbId,
    kbName: optionalText(record.kbName),
    docName: optionalText(record.docName) || optionalText(record.title),
    fileName: optionalText(record.fileName),
    chapter:
      optionalText(record.chapter) ||
      optionalText(record.sectionName) ||
      optionalText(record.heading),
    pageNumber:
      identityText(record.pageNumber) ||
      identityText(record.page_number) ||
      identityText(record.page) ||
      identityText(record.page_idx) ||
      undefined,
    sourceAvailable: record.sourceAvailable !== false && Boolean(docKey || /^\d+$/.test(docId)),
    markdownAvailable:
      typeof record.markdownAvailable === "boolean"
        ? record.markdownAvailable
        : undefined,
    evidenceFragments: normalizeDataHubCitationEvidence(record.evidenceFragments),
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

function DataHubAnswer({
  blocks,
  streaming = false,
  incomplete = false,
  citations = [],
  onOpenCitation
}: {
  blocks: DataHubContentBlock[];
  streaming?: boolean;
  incomplete?: boolean;
  citations?: DataHubCitationDocument[];
  onOpenCitation?: (citation: DataHubCitationDocument) => void;
}) {
  const [referenceId, setReferenceId] = useState<string>();
  const evidenceMatches = (id: string) => Array.from(new Map(citations.flatMap(citation =>
    (citation.evidenceFragments ?? []).filter(evidence => evidence.evidenceId === id)
      .map(evidence => [JSON.stringify([citation.kbId, citation.docId, evidence.text]), { citation, evidence }] as const)
  )).values());
  const matched = referenceId ? evidenceMatches(referenceId) : [];
  const exact = matched.length === 1 ? matched[0] : undefined;
  const references = citations.length && onOpenCitation ? Object.fromEntries(blocks.flatMap((block) =>
    block.content.split("\n").filter((line) => /(?:见证据|原文引用|证据编号)/.test(line))
      .flatMap((line) => [...line.matchAll(/`(e\d+)`/gi)].map((match) => [match[1], {
        label: evidenceMatches(match[1]).length === 1 ? `${match[1]}：查看引用原文片段`
          : `${match[1]}：查看本轮引用文档（暂未提供准确位置）`,
        onClick: () => setReferenceId(match[1])
      }]))
  )) : undefined;
  const rendered = blocks.filter((block) => block.content.trim());

  if (rendered.length === 0) {
    return null;
  }

  return (
    <div
      className={`datahub-answer${streaming ? " datahub-answer--streaming" : ""}`}
      aria-label={incomplete ? "未完成回答" : "正式回答"}
    >
      {incomplete ? <p>以下为已收到的部分回答，生成未完成。</p> : null}
      {rendered.map((block, index) => (
        <article
          className="datahub-answer__block"
          key={`${block.replyId || "reply"}-${block.modelCallIndex ?? "legacy"}-${index}`}
        >
          <XsSafeMarkdown content={block.content} references={references} />
        </article>
      ))}
      <Modal open={Boolean(referenceId)} title={`引用 ${referenceId ?? ""}`} footer={null}
        onCancel={() => setReferenceId(undefined)} destroyOnHidden>
        {exact ? <section aria-label={`${referenceId} 引用原文片段`}>
          <p>来源：《{citationDisplayTitle(exact.citation)}》 · {citationKnowledgeBaseLabel(exact.citation)}</p>
          <blockquote><XsSafeMarkdown content={exact.evidence.text} /></blockquote>
        </section> : <p>该引用暂未提供准确位置，可查看本轮引用文档核对原文。</p>}
        {onOpenCitation ? <DataHubCitationChips citations={exact ? [exact.citation] : citations} defaultCollapsed={false}
          onOpen={(citation) => { setReferenceId(undefined); onOpenCitation(citation); }} /> : null}
      </Modal>
    </div>
  );
}

function AnalysisResultTables({
  tables,
  onStatus
}: {
  tables: DataHubTableResult[];
  onStatus: (message: string) => void;
}) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const bodyMountedRef = useRef(expanded);
  if (expanded) bodyMountedRef.current = true;
  const totalRows = tables.reduce((total, table) => total + table.totalRows, 0);

  return (
    <section className="analysis-result-tables" data-expanded={expanded || undefined} aria-label="查询结果表">
      <button
        type="button"
        className="analysis-result-tables__toggle"
        aria-controls={bodyId}
        aria-expanded={expanded}
        aria-label={`${expanded ? "收起" : "展开"}结果表，共 ${tables.length} 张表、${totalRows} 行`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="analysis-result-tables__icon"><Table size={18} aria-hidden="true" /></span>
        <span className="analysis-result-tables__copy">
          <strong>结果表 <span className="analysis-result-tables__count">{tables.length} 张</span></strong>
          <small>共 {totalRows} 行数据</small>
        </span>
        <span className="analysis-result-tables__action">
          {expanded ? "收起" : "查看数据"}
          <CaretDown size={16} aria-hidden="true" />
        </span>
      </button>
      <div
        id={bodyId}
        className={`xs-datahub-collapse${expanded ? " xs-datahub-collapse--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="xs-datahub-collapse__inner">
          {bodyMountedRef.current ? (
            <div className="analysis-output__tables analysis-result-tables__body">
              {tables.map((table) => (
                <DataHubResultTable table={table} key={table.tableIndex} onStatus={onStatus} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function groupByKnowledgeBase<T>(items: T[], name: (item: T) => string) {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = name(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return Array.from(groups);
}

function highlightQueryKeywords(text: string, query: string) {
  const quoted = [...query.matchAll(/[《“"]([^》”"]{2,24})[》”"]/g)].map((match) => match[1]);
  const words = query.match(/[A-Za-z0-9_-]{2,}|[\u4e00-\u9fff]{2,8}/g) ?? [];
  const terms = Array.from(new Set([...quoted, ...words]))
    .filter((term) => !/^(帮我|请问|查找|找出|文档|关于|相关|哪些|有没有)$/.test(term))
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);
  if (!terms.length) return text;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(pattern).map((part, index) => (
    terms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase())
      ? <mark key={`${part}:${index}`}>{part}</mark>
      : part
  ));
}

/** 引用原文片段（答案上方）；引用文档 chips 移到结果底部的 DataHubCitationChips。 */
function DataHubCitationQuotes({
  citations,
  onOpen,
  onCopyFragment
}: {
  citations: DataHubCitationDocument[];
  onOpen: (citation: DataHubCitationDocument) => void;
  onCopyFragment?: (text: string) => void;
}) {
  if (!citations.some((citation) => citation.fragments.length > 0)) {
    return null;
  }

  return (
    <details className="knowledge-citations" aria-label="引用原文">
      <summary>引用原文（{citations.reduce((count, citation) => count + citation.fragments.length, 0)} 个片段）</summary>
      <div className="knowledge-citations__quotes">
        {citations.flatMap((citation) =>
          citation.fragments.map((fragment, index) => (
            <blockquote key={`${citationPreviewId(citation)}-${index}`}>
              <XsSafeMarkdown content={formatDataHubCitationFragment(fragment)} />
              <cite>{citationSourceLabel(citation)} · {citationKnowledgeBaseLabel(citation)}</cite>
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
                  aria-label={`查看原文片段：${citation.docName || citation.fileName || citation.docKey || citation.docId}`}
                  disabled={citation.sourceAvailable === false}
                  onClick={() => onOpen(citation)}
                >
                  <ArrowSquareOut size={15} aria-hidden="true" />
                </button>
              </span>
            </blockquote>
          ))
        )}
      </div>
    </details>
  );
}

function DataHubDocumentLookupList({
  documents,
  onOpen,
  query
}: {
  documents: DataHubDocumentLookupResult[];
  onOpen: (document: DataHubDocumentLookupResult) => void;
  query: string;
}) {
  if (documents.length === 0) {
    return null;
  }

  const groups = groupByKnowledgeBase(documents.slice(0, 5), (document) => String(document.kbId));
  return (
    <section className="document-lookup-results" aria-label="匹配文档">
      <p className="document-lookup-results__count">找到 {documents.length} 份文档</p>
      {groups.map(([kbId, items]) => (
        <section className="document-lookup-results__group" key={kbId}>
          <h4>{citationKnowledgeBaseLabel({ kbId, kbName: items[0].kbName })}</h4>
          <div className="document-lookup-results__list">
            {items.map((document) => (
              <button
                type="button"
                className="document-lookup-card"
                key={`${String(document.kbId)}::${String(document.docId)}::${document.docKey ?? ""}`}
                aria-label={`${document.sourceAvailable === false ? "原文不可用" : "打开原文"}：${document.title}`}
                disabled={document.sourceAvailable === false}
                onClick={() => onOpen(document)}
              >
                <span className="document-lookup-card__icon"><FileText size={18} aria-hidden="true" /></span>
                <span className="document-lookup-card__body">
                  <strong>{document.title}</strong>
                  {document.snippet || document.excerpt ? <p>{highlightQueryKeywords(document.snippet || document.excerpt || "", query)}</p> : null}
                  <span className="document-lookup-card__meta">
                    {document.matchReason ? <span>{document.matchReason}</span> : null}
                    {document.score !== undefined ? <span>相关度 {document.score <= 1 ? `${Math.round(document.score * 100)}%` : document.score.toFixed(2)}</span> : null}
                    {document.sourceAvailable === false ? <span>原文不可用</span> : <span>可打开原文</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function DataHubResultLoading({
  taskName = "问数",
  title,
  description
}: {
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
          <span>{description || `正在${taskName}`}</span>
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
  const [showTable, setShowTable] = useState(false);
  const compactChart = useMediaQuery("(max-width: 900px)");
  const [page, setPage] = useState(1);
  const [selectedMetric, setSelectedMetric] = useState("");
  const { totalRows, comparisonBar, pageCount, currentPage, rowOffset, metricKey, repeatedNames, option } = useMemo(() => {
    const totalRows = state.spec.table.rows.length;
    const categoryNames = state.spec.table.rows.map((row) => String(row[state.spec.dimensionKey] ?? ""));
    const comparisonBar = state.activeType === "bar" && (totalRows > 8 || categoryNames.some((name) => name.length > 12));
    const pageCount = Math.max(1, Math.ceil(totalRows / 8));
    const currentPage = Math.min(page, pageCount);
    const rowOffset = (currentPage - 1) * 8;
    const metricKey = state.spec.metricKeys.includes(selectedMetric) ? selectedMetric : undefined;
    return {
      totalRows, comparisonBar, pageCount, currentPage, rowOffset, metricKey,
      repeatedNames: new Set(categoryNames).size < totalRows,
      option: {
        ...buildGeneratedChartOption(comparisonBar ? {
          ...state.spec,
          table: { ...state.spec.table, rows: state.spec.table.rows.slice(rowOffset, rowOffset + 8) }
        } : state.spec, state.activeType, comparisonBar ? { rowOffset, metricKey, compact: compactChart } : undefined),
        title: { show: false }
      }
    };
  }, [state.activeType, state.spec, page, selectedMetric, compactChart]);
  const chartTable = useMemo(() => {
    const selectedKeys = [state.spec.dimensionKey, ...state.spec.metricKeys];
    const columns = selectedKeys.flatMap((key) => state.spec.table.columns.filter((column) => column.key === key));
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

  const viewControl = (
    <Segmented
      size="small"
      aria-label="结果展示方式"
      value={showTable ? "table" : state.activeType}
      options={[
        ...state.spec.allowedTypes.map((type) => ({ label: chartTypeLabel(type), value: type })),
        { label: "表格", value: "table" }
      ]}
      onChange={(value) => {
        setShowTable(value === "table");
        if (value !== "table") onTypeChange(value as AiChartType);
      }}
    />
  );

  return (
    <section className="ai-chart-card ai-chart-card--success" role="region" aria-label="智能图表建议">
      {showTable ? (
        <>
          <div className="ai-chart-card__view-control">{viewControl}</div>
          <DataHubResultTable table={chartTable} />
        </>
      ) : (
      <XsChartCard
        contained={false}
        title={state.spec.title}
        summary={comparisonBar
          ? `共 ${totalRows} 条记录，当前显示第 ${rowOffset + 1}–${Math.min(rowOffset + 8, totalRows)} 条${repeatedNames ? "；同名记录未合并。" : "。"}`
          : ""}
        option={option}
        table={chartTable}
        showDataTable={false}
        chartClassName={`chart-large ai-chart-card__chart${comparisonBar ? " ai-chart-card__chart--comparison" : ""}`}
        action={viewControl}
        beforeChart={(
          <>
            <span className="ai-chart-card__source">来源：{state.spec.tableTitle}</span>
            {comparisonBar && state.spec.metricKeys.length > 1 ? (
              <div className="ai-chart-card__metric-control">
                <span>查看指标</span>
                <Segmented
                  size="small"
                  aria-label="图表指标"
                  value={metricKey ?? ""}
                  options={[
                    { label: "全部对比", value: "" },
                    ...state.spec.metricKeys.map((key) => ({
                      label: formatDataHubColumnTitle(state.spec.table.columns.find((column) => column.key === key)?.title || key, key),
                      value: key
                    }))
                  ]}
                  onChange={(value) => setSelectedMetric(String(value))}
                />
              </div>
            ) : null}
          </>
        )}
        afterChart={comparisonBar ? (
          <div className="ai-chart-card__comparison-footer">
            <span>万、亿为数值缩写；完整名称和数值可在图中或表格查看。</span>
            {pageCount > 1 ? (
              <div className="ai-chart-card__pager" role="group" aria-label="切换图表记录">
                <Button size="small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一组</Button>
                <span>{currentPage} / {pageCount}</span>
                <Button size="small" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>下一组</Button>
              </div>
            ) : null}
          </div>
        ) : undefined}
      />
      )}
    </section>
  );
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
  const resumeAskDataRun = useUiStore((state) => state.resumeAskDataRun);
  const releaseAnalysisTransientBuffers = useUiStore((state) => state.releaseAnalysisTransientBuffers);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [composerMode, setComposerMode] = useState<DataHubChatMode>(mode);
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [selectedQuickQuestion, setSelectedQuickQuestion] = useState("");
  const [aiChartStates, setAiChartStates] = useState<Record<string, AiChartUiState>>({});
  const [citationPreview, setCitationPreview] = useState<{
    citations: DataHubCitationDocument[];
    active: DataHubCitationDocument;
  } | null>(null);
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
  /* beta0.3 后端放开问数/问知/找文档的 ask_user；旧后端用 feature 开关退回编排单口。 */
  const supportsClarification = isAgentMode || clarifyAllModesEnabled;
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
  /* 只有最新一轮可能挂在澄清上；下面的循环本来就要投影每一轮，多投一次不值一提。 */
  const awaitingClarification = Boolean(
    supportsClarification && lastVisibleTurn && hasPendingClarification(
      createDataHubAskTurn(
        lastVisibleTurn.question,
        lastVisibleTurn.events,
        lastVisibleTurn.status,
        lastVisibleTurn.error,
        { sessionId: lastVisibleTurn.sessionId, chatId: lastVisibleTurn.chatId }
      )
    )
  );
  const dock = useClarifyDock(askDataStatus === "streaming");
  const clarifyTargets = supportsClarification
    ? visibleTurns.flatMap((turn) => {
      const ask = createDataHubAskTurn(turn.question, turn.events, turn.status, turn.error, {
        sessionId: turn.sessionId,
        chatId: turn.chatId
      });
      return ask.clarifications.map((clarification, index) => ({
        key: clarificationKey(turn.id, clarification, index),
        turn,
        error: turn.status === "error" ? turn.error : undefined,
        clarification
      }));
    })
    : [];
  /* 刚点过的那张要继续占着浮层，直到这一轮跑完——否则"已确认"一闪而过没人看得见。 */
  /* 答完（后端回了 clarification_response）或被收起的都不再占浮层，见 XsClarifyPanel 注释。 */
  const dockTarget = clarifyTargets.find((item) => (
    !item.clarification.selectedAnswer && !dock.dismissedKeys.includes(item.key)
  ));

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

    try {
      const chartTables = resolveAiChartTables({ question, tables, answer });
      const plan = await planAiChart({ question, tables: chartTables });
      const spec = buildGeneratedChartSpec(plan, chartTables);

      if (!plan.chartable || !spec) {
        const message = plan.reason || "当前结果暂不适合生成图表。";
        setAiChartStates((current) => ({ ...current, [turnId]: { status: "not-chartable", message } }));
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
      if (turnAsk.error || turnAsk.done?.failed) continue;
      const tables = isAskMode || isAgentMode
        ? getDataHubAskTableResults(
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

  /**
   * 回答一张受控澄清卡。答案打到 interactions/respond，事件继续落回**原来那一轮**——
   * 后端把选择记成过程事件而不是第二条用户消息，所以这里不能走 streamDataHubQuestion。
   */
  const answerClarification = (
    turn: AnalysisTurnState,
    interactionId: string | undefined,
    answer: string
  ) => {
    if (!turn.sessionId || !turn.chatId) {
      setWorkflowStatus("会话身份不完整，无法提交这次确认");
      return;
    }

    shouldAutoScrollRef.current = true;
    setIsScrollToBottomVisible(false);
    resumeAskDataRun(turn.id);
    setWorkflowStatus(`已确认：${answer}`);

    const controller = respondToAgentInteraction(
      {
        sessionId: turn.sessionId,
        chatId: turn.chatId,
        chatMode: mode,
        interactionId,
        answer
      },
      {
        onEvent: (event) => {
          appendAskDataEvent(turn.id, event);
          if (event.type === "error" && !event.parentSessionId) {
            const data = event.data as { message?: string } | string | undefined;
            failAskDataRun(
              turn.id,
              typeof data === "string" ? data : data?.message || "确认提交失败，请重试"
            );
          }
        },
        onDone: () => {
          completeAskDataRun(turn.id);
          void invalidateDataAssetOverview(queryClient, sessionScope);
        },
        onError: (error) => failAskDataRun(turn.id, error.message)
      }
    );
    bindAskDataController(turn.id, controller);
  };

  const askDataStatusText = (() => {
    if (isLoadingHistory) {
      return "正在加载历史对话";
    }
    if (askDataStatus === "streaming") {
      return `正在${taskName}`;
    }
    if (askDataStatus === "done") {
      return awaitingClarification ? "等待你补充信息" : `${taskName}已完成`;
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

  /** 次级动作：在新标签打开原文（模态里的「新标签打开」、浏览器内嵌失败时的逃生口）。 */
  const openCitationInNewTab = async (citation: DataHubCitationDocument) => {
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

    setWorkflowStatus(`正在打开原文：${citation.docName || citation.fileName || citation.docKey || citation.docId}`);

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

  /** 主路径：站内弹窗预览原文；group 提供时作为弹窗左侧可切换的文档列表。 */
  const handleOpenCitation = (
    citation: DataHubCitationDocument,
    group?: DataHubCitationDocument[]
  ) => {
    const pool = group?.length ? group : [citation];
    const seen = new Set<string>();
    const citations = pool.filter((item) => {
      const key = citationPreviewId(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    setCitationPreview({ citations, active: citation });
  };

  const handleOpenDocumentLookupResult = (document: DataHubDocumentLookupResult) =>
    handleOpenCitation({
      docId: String(document.docId),
      docKey: document.docKey,
      kbId: String(document.kbId),
      kbName: document.kbName,
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
              const lookupFromDone = getDataHubDocumentLookupResults(turnAsk.done);
              const documentLookupResults =
                lookupFromDone.length > 0
                  ? lookupFromDone
                  : isDocumentLookupMode
                    ? citationsAsLookupResults(turnAsk.citationDocuments)
                    : [];
              const childDocumentResults = isAgentMode
                ? getDataHubChildDocumentResults(executionProjection)
                : [];
              const visibleCitations = isAgentMode
                ? Array.from([
                    ...turnAsk.citationDocuments,
                    ...executionProjection.subagentSessions.flatMap((session) => session.citationDocuments)
                      .map(normalizeExecutionDocument)
                      .filter((citation): citation is DataHubCitationDocument => Boolean(citation))
                  ].reduce((documents, citation) => {
                    const key = citationPreviewId(citation);
                    const previous = documents.get(key);
                    documents.set(key, previous ? { ...previous, ...citation,
                      fragments: Array.from(new Set([...previous.fragments, ...citation.fragments])),
                      evidenceFragments: [...(previous.evidenceFragments ?? []), ...(citation.evidenceFragments ?? [])]
                    } : citation);
                    return documents;
                  }, new Map<string, DataHubCitationDocument>()).values())
                : turnAsk.citationDocuments;
              const askTables = isAskMode || isAgentMode
                ? getDataHubAskTableResults(executionProjection, isAskMode)
                : [];
              const visibleTables = askTables.length > 0 ? askTables : turnAsk.tableResults;
              // 编排根在子结论之后给出的回答就是对它们的综合改写，两者并列等于同一结论说两遍。
              // 根只在派活前说过开场白（或干脆没说）时，子结论仍要顶上来，否则结果区只剩一句「我来帮您查…」。
              const childAnswerBlocks =
                (isAskMode || isAgentMode) && displayStatus !== "error" && displayStatus !== "cancelled"
                  && !dataHubRootAnsweredAfterChildren(turn.events)
                  ? dedupeDataHubAnswerBlocks(getDataHubChildAnswerBlocks(executionProjection))
                  : [];
              const modelAnswerBlocks = dedupeDataHubAnswerBlocks(
                childAnswerBlocks.length ? childAnswerBlocks : turnAsk.answerBlocks
              ).filter((block) => block.content.trim());
              // Markdown 表可能是说明或查询结果的复述，不能作为新的查询产物计数。
              // 保留正文及其表格结构；只有执行事件中的结构化结果进入查询过程。
              const narrativeBlocks = modelAnswerBlocks;
              const summaryTables = !narrativeBlocks.length ? visibleTables : [];
              const resultSummary = supportsTables && displayStatus === "done"
                ? buildDataHubResultSummary(turn.question, summaryTables)
                : "";
              const visibleAnswerBlocks = resultSummary ? [...narrativeBlocks, { content: resultSummary }] : narrativeBlocks;
              const hasRenderableResult = Boolean(
                (supportsClarification && turnAsk.clarifications.length) ||
                (!isDocumentLookupMode && visibleAnswerBlocks.length) ||
                  (supportsTables && visibleTables.length) ||
                  (supportsCitations && visibleCitations.length) ||
                  (isDocumentLookupMode && documentLookupResults.length) ||
                  (isAgentMode && childDocumentResults.length)
              );
              const isResultReady =
                hasRenderableResult || ["done", "error", "cancelled"].includes(displayStatus);
              const isLatestTurn = turn.id === lastVisibleTurn?.id;
              const isHistoryLoadingTurn = isLoadingHistory && isLatestTurn;
              const phases = getDataHubResponsePhases(turn.events, displayStatus, turn.startedAt, turn.endedAt);
              const thinkingSections = getDataHubThinkingSections(executionProjection, turnAsk);
              const hasChildThinking = thinkingSections.some((section) => !section.main);
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
              // 复制的必须与看到的是同一份：直接取渲染用的块，别再拼一次原始文本。
              const answerText = (
                (visibleAnswerBlocks.length > 0
                  ? visibleAnswerBlocks.map((block) => block.content)
                  : [turnAsk.assistantContent || turnAsk.done?.summary || ""]
                )
                  .filter(Boolean)
                  .join("\n\n")
              );
              const nonScalarTables = supportsTables ? visibleTables.filter((table) => !isDataHubScalarResult(table)) : [];
              const queryTables = nonScalarTables;
              const businessKind = isAgentMode
                ? "AGENT"
                : isDocumentLookupMode
                  ? "DOCUMENT_LOOKUP"
                  : isKnowledgeMode
                    ? "ASK_KNOWLEDGE"
                    : "ASK_DATA";
              const businessTrace = buildDataHubBusinessTrace(
                turnAsk,
                turn.question,
                businessKind,
                isAgentMode
                  ? executionProjection.subagentSessions
                      .map((session) => session.label || session.agentName || "子智能体")
                      .filter((name) => !name.includes("数据源选择"))
                  : [],
                {
                  // 数据源选择本身是子智能体，事件带 parentSessionId，不会落进 turnAsk.dataSources；
                  // 四种模式都从执行投影里取，否则「怎么查」写不出数据源名。
                  dataSources: [
                    ...executionProjection.mainSession.dataSources,
                    ...executionProjection.subagentSessions.flatMap(
                      (session) => session.dataSources
                    )
                  ],
                  ...(isAgentMode
                    ? {
                        tableResults: visibleTables,
                        citationDocuments: [
                          ...executionProjection.mainSession.citationDocuments,
                          ...executionProjection.subagentSessions.flatMap(
                            (session) => session.citationDocuments
                          )
                        ]
                      }
                    : {})
                }
              );
              const answerPreamble = buildDataHubAnswerPreamble(businessKind, businessTrace, answerText);

              return (
                <div
                  className={`analysis-turn${!isLatestTurn && displayStatus !== "streaming" ? " analysis-turn--virtualized" : ""}`}
                  data-status={displayStatus}
                  data-result-ready={isResultReady && phases.showResult}
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
                        {queryAssetFeatureEnabled && (isAskMode || isAgentMode) && displayStatus === "done" ? (
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
                      {isLatestTurn && (askDataStatusText || workflowStatus) ? (
                        <div className="sr-only" role="status">
                          {[displayStatus === "error" ? `${taskName}失败` : askDataStatusText, workflowStatus].filter(Boolean).join("，")}
                        </div>
                      ) : null}

                      {!isHistoryLoadingTurn ? (
                        <DataHubProcessDock
                          thinkingContent={turnAsk.thinkingContent}
                          sections={thinkingSections}
                          decompose={turnAsk.decompose}
                          status={hasChildThinking && displayStatus === "streaming" && !phases.showResult ? "running" : phases.thinkingStatus}
                          startedAt={hasChildThinking ? undefined : turn.startedAt}
                          durationMs={hasChildThinking ? undefined : phases.thinkingDurationMs}
                          sourceNote={!hasChildThinking && thinkingSections.length === 1 && turnAsk.thinkingBlocks.length === 1
                            && executionProjection.subagentSessions.length > 0 && displayStatus === "done"
                            ? "本轮仅返回以上公开思考摘要，详细执行步骤可在查询过程查看。" : undefined}
                          showPlaceholder
                        />
                      ) : null}
                      {!isHistoryLoadingTurn && (phases.showQuery || queryTables.length > 0) ? (
                        <DataHubBusinessExplanation
                          kind={businessKind}
                          intent={turn.question}
                          trace={businessTrace}
                          status={phases.queryStatus}
                          startedAt={phases.queryStartedAt}
                          durationMs={phases.queryDurationMs}
                          resultTables={queryTables.length > 0 ? (
                            <AnalysisResultTables tables={queryTables} onStatus={setWorkflowStatus} />
                          ) : undefined}
                        >
                        <DataHubExecutionPanel
                          projection={executionProjection}
                          title={isAgentMode ? "智能编排执行" : "执行细节"}
                          className="analysis-orchestration-panel"
                          defaultExpanded={false}
                          // 单智能体模式的过程就是主智能体那条线性步骤，
                          // 嵌套的辅助子智能体挂在它下面，而不是反过来切成编排画布
                          preferDirectMainExecution={!isAgentMode}
                          // 正式回答已经在结果区完整呈现，过程区不再复述同一段正文
                          answerText={turnAsk.assistantContent}
                          showMainDocumentBlocks
                          onCitationOpen={(content) => {
                            const citation = normalizeExecutionDocument(content);
                            if (!citation) {
                              setWorkflowStatus("原文身份信息不完整，暂无法打开");
                              return;
                            }
                            handleOpenCitation(citation);
                          }}
                        />
                        </DataHubBusinessExplanation>
                      ) : null}

                      {(phases.showResult || isHistoryLoadingTurn) ? (
                      <section className="analysis-output" aria-label="分析结果">
                        <div className="analysis-result-stage" data-state={resultStageState}>
                          {!isDocumentLookupMode &&
                          isResultReady &&
                          visibleAnswerBlocks.length > 0 ? (
                            <div className="analysis-answer-block">
                              <DataHubAnswer
                                blocks={visibleAnswerBlocks}
                                citations={supportsCitations ? visibleCitations : []}
                                onOpenCitation={(citation) => handleOpenCitation(citation, visibleCitations)}
                                streaming={displayStatus === "streaming"}
                                incomplete={displayStatus === "error" || displayStatus === "cancelled"}
                              />
                              {answerPreamble ? (
                                <p className="analysis-answer-preamble">{answerPreamble}</p>
                              ) : null}
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
                          {supportsCitations && isResultReady && visibleCitations.length > 0 ? (
                            <DataHubCitationQuotes
                              citations={visibleCitations}
                              onOpen={(citation) =>
                                handleOpenCitation(citation, visibleCitations)
                              }
                              onCopyFragment={async (text) => {
                                const copied = await copyText(text);
                                setWorkflowStatus(copied ? "已复制原文" : "复制原文失败，请稍后重试");
                              }}
                            />
                          ) : null}
                          {supportsClarification && turnAsk.clarifications.length > 0 ? (
                            <div className="analysis-clarify-stack">
                              {turnAsk.clarifications.map((clarification, index) => {
                                const key = clarificationKey(turn.id, clarification, index);
                                const dismissed = dock.dismissedKeys.includes(key);
                                // 待答且没被收起的那张在输入框上方的浮层里，这里不留副本
                                if (
                                  key === dockTarget?.key ||
                                  (!clarification.selectedAnswer && !dismissed)
                                ) {
                                  return null;
                                }

                                return (
                                  <XsClarifyCard
                                    key={key}
                                    clarification={clarification}
                                    fresh={key === dock.justAnsweredKey}
                                    onExpand={
                                      clarification.selectedAnswer
                                        ? undefined
                                        : () => dock.expand(key)
                                    }
                                  />
                                );
                              })}
                            </div>
                          ) : null}
                          {isResultReady && aiChartState.status === "success" ? (
                            <AiChartSuccessCard
                              state={aiChartState}
                              onTypeChange={(type) => handleChartTypeChange(turn.id, type)}
                            />
                          ) : null}
                          {supportsCitations &&
                          isResultReady &&
                          visibleCitations.length > 0 ? (
                            <DataHubCitationChips
                              citations={visibleCitations}
                              onOpen={(citation) =>
                                handleOpenCitation(citation, visibleCitations)
                              }
                            />
                          ) : null}
                          {isDocumentLookupMode && isResultReady && documentLookupResults.length > 0 ? (
                            <DataHubDocumentLookupList
                              documents={documentLookupResults}
                              query={turn.question}
                              onOpen={(document) => handleOpenDocumentLookupResult(document)}
                            />
                          ) : null}
                          {isAgentMode && isResultReady && childDocumentResults.length > 0 ? (
                            <DataHubDocumentLookupList
                              documents={childDocumentResults}
                              query={turn.question}
                              onOpen={(document) => handleOpenDocumentLookupResult(document)}
                            />
                          ) : null}
                          {displayStatus === "streaming" && !hasRenderableResult ? (
                            <DataHubResultLoading
                              taskName={taskName}
                              title={isHistoryLoadingTurn ? "正在加载历史对话" : undefined}
                              description={isHistoryLoadingTurn ? "历史内容加载完成后会在当前页面直接显示。" : undefined}
                            />
                          ) : visibleAnswerBlocks.length || queryTables.length || aiChartState.status === "success" ||
                            visibleCitations.length || documentLookupResults.length || childDocumentResults.length ||
                            turnAsk.clarifications.length || displayStatus === "error" ? null : (
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
        {hasConversation && isScrollToBottomVisible && !dockTarget ? (
          <Button
            className="analysis-scroll-to-bottom"
            shape="circle"
            aria-label="回到底部"
            icon={<ArrowDown size={18} weight="bold" />}
            title="回到底部"
            onClick={handleScrollToBottom}
          />
        ) : null}
        <div className="xs-clarify-anchor">
        {dockTarget ? (
          <XsClarifyPanel
            clarification={dockTarget.clarification}
            submittingAnswer={
              dock.submittedKey === dockTarget.key ? dock.submittingAnswer : undefined
            }
            error={dockTarget.error || undefined}
            onAnswer={(answer) => {
              dock.submit(dockTarget.key, answer);
              answerClarification(dockTarget.turn, dockTarget.clarification.interactionId, answer);
            }}
            onDismiss={() => dock.dismiss(dockTarget.key)}
          />
        ) : null}
        <XsCommandBox
          value={followUpDraft}
          onChange={setFollowUpDraft}
          onSubmit={handleFollowUp}
          submitOnEnter
          placeholder={
            awaitingClarification
              ? "选择上面的选项，或直接说明你的情况…"
              : analysisModeMeta[composerMode].placeholder
          }
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
        </div>
        <div className="analysis-composer__status-slot">
          <XsStatusBar
            tone={askDataStatus === "streaming" ? "loading" : "info"}
            spinner={false}
            message={workflowStatus}
            transitionKey={workflowStatus}
          />
        </div>
      </div>
      <AnalysisCitationPreview
        open={citationPreview !== null}
        citations={citationPreview?.citations ?? []}
        active={citationPreview?.active ?? null}
        onSelect={(citation) =>
          setCitationPreview((current) =>
            current ? { ...current, active: citation } : current
          )
        }
        onClose={() => setCitationPreview(null)}
        onOpenExternal={(citation) => void openCitationInNewTab(citation)}
      />
    </PageFrame>
  );
}
