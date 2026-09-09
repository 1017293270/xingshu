import {
  ArrowsClockwise,
  ArrowUp,
  CaretDown,
  CaretUp,
  CircleNotch,
  Copy,
  DownloadSimple,
  FileDoc,
  FileText,
  Paperclip,
  Plus,
  Star,
  Square,
  UploadSimple,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import { Button, Dropdown } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import promptStar from "@/assets/brand/xingshu-prompt-star.svg";
import mentionLibraryIcon from "@/assets/writing-mention-icons/library.svg";
import mentionMaterialIcon from "@/assets/writing-mention-icons/material.svg";
import mentionTemplateIcon from "@/assets/writing-mention-icons/template.svg";
import mentionDraftIcon from "@/assets/writing-mention-icons/draft.svg";
import {
  XsArtifactCard,
  XsChatActionButton,
  XsChatActions,
  XsChatAssistant,
  XsChatTurn,
  XsChatUserBubble,
  XsSidePanel
} from "@/components/xs/conversation";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { XsUploadDialog } from "@/components/xs/XsUploadDialog";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { copyText } from "@/services/clipboard";
import { resolveDataHubFinalAnswer } from "@/services/dataHubAskDataPresenter";
import {
  createOfficialDocumentDraft,
  downloadOfficialDocumentExport,
  exportOfficialDocumentDraft,
  exportOfficialDocumentTransient,
  getOfficialDocumentContentProfile,
  getOfficialDocumentDraftContent,
  getOfficialDocumentDraftPreview,
  getOfficialDocumentTransientPreview,
  type OfficialDocumentTransientArtifactInput,
  updateOfficialDocumentDraftContent,
  uploadOfficialDocumentContentProfile,
  uploadOfficialDocumentTemplate
} from "@/services/officialDocumentService";
import {
  buildOfficialDocumentPreviewLines,
  buildOfficialDocumentReferenceWritingPlan,
  mapResearchResultsToReferenceSections,
  MAX_REFERENCE_REQUIREMENT_CHARS,
  parseOfficialDocumentReferenceGeneration,
  reviewOfficialDocumentDraftFacts,
  stripOfficialDocumentAnchors,
  type OfficialDocumentPreviewLine,
  type OfficialDocumentReferenceFixedField,
  type OfficialDocumentReferenceWritingPlan
} from "@/services/officialDocumentFullDraft";
import { analyzeOfficialDocumentContent } from "@/services/writingContentAnalysisService";
import { executeOfficialDocumentResearchPlan } from "@/services/officialDocumentResearchService";
import { officialDocumentContentText } from "@/services/officialDocumentFactReview";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type {
  OfficialDocumentDraft,
  OfficialDocumentExportFormat,
  OfficialDocumentResearchResult,
  OfficialDocumentStructureNode,
  OfficialDocumentTemplate,
  OfficialDocumentWritingLogicPlan
} from "@/types/officialDocument";
import { ComposeAnalyzingCard, ComposeElapsed } from "./ComposeAnalyzingCard";
import { ComposeOutlineCard } from "./ComposeOutlineCard";
import {
  classifyMaterialFile,
  composeMaterialPayload,
  joinContentProfileBlocks,
  MAX_TEXT_MATERIAL_BYTES,
  resolveComposeMaterials,
  TEXT_MATERIAL_EXTENSIONS,
  type ComposeMaterial
} from "./composeReferenceMaterials";
import {
  ANALYZING_POLL_INTERVAL_MS,
  formatDate,
  formatFileSize,
  operationErrorMessage,
  templateIsUsable,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import { OfficialDocumentComposer } from "./OfficialDocumentComposer";
import { OfficialDocumentMentionMenu } from "./OfficialDocumentMentionMenu";
import {
  filterMentionGroups,
  findMentionQuery,
  flattenMentionItems,
  removeMentionQuery,
  type MentionQuery,
  type OfficialDocumentMentionGroup,
  type OfficialDocumentMentionItem
} from "./officialDocumentMentions";
import { useOfficialDocumentAppChrome } from "./OfficialDocumentAppShell";
import { WRITING_HOME_PATH, WRITING_SESSION_PATH } from "./writingComposeNode";
import { useWritingJobStore, type WritingJobPhase } from "./writingJobStore";
import { WritingSessionNotice } from "./WritingSessionNotice";
import { TemplateGallery } from "./TemplateGallery";
import { useOfficialDocumentWorkspace } from "./useOfficialDocumentWorkspace";
import { useWritingChat, type WritingChatSnapshot } from "./useWritingChat";

/** 引用只决定下一轮的 writingContext，会话本身不跟着换，所以 key 固定。 */
const COMPOSE_CHAT_KEY = "compose";

const RETRY_HINT = "请严格按 [[XS_FIXED:slot-id]] 和 [[XS_SECTION:section-id]] 锚点输出完整公文，章节不得新增或遗漏。";

const MENTION_TEMPLATES_ACTION = "action:templates";
const MENTION_MATERIAL_ACTION = "action:material";

/** DOCX 资料走服务端内容方案抽取，轮询次数够覆盖一次冷启动。 */
const MATERIAL_POLL_LIMIT = 30;

/** 短到一眼看完的回答不值得再给一个折叠开关。 */
function isCollapsibleAnswer(lines: OfficialDocumentPreviewLine[]) {
  return lines.length > 3 || lines.reduce((total, line) => total + line.text.length, 0) > 120;
}

type ArtifactStatus = {
  tone: "success" | "error";
  message: string;
};

type GeneratedArtifact = OfficialDocumentTransientArtifactInput & {
  templateName: string;
};

/** 本轮引用的东西：一份结构模板，或一篇带着模板的参考草稿。 */
export type ComposeReference =
  | { kind: "template"; template: OfficialDocumentTemplate }
  | { kind: "draft"; draft: OfficialDocumentDraft; template: OfficialDocumentTemplate };

function referenceTitle(reference: ComposeReference) {
  return reference.kind === "draft" ? reference.draft.title : reference.template.name;
}

function referenceMeta(reference: ComposeReference) {
  return reference.kind === "draft" ? reference.draft.templateName : "结构模板";
}

type ReferenceMaterialPayload = Array<{ name: string; content: string }>;

/** 每一轮的产物状态。轮次顺序、问题和 streaming/done/error 一律以 messages 为准。 */
type ComposeTurnState = {
  requirement: string;
  reference: ComposeReference;
  version: number;
  plan: OfficialDocumentReferenceWritingPlan;
  templateNodes: OfficialDocumentStructureNode[];
  /** 这一轮发起的时刻，流式还没吐首字时用来给出真实耗时。 */
  startedAt: number;
  /** 成功材料继续复用；失败任务可独立重试。 */
  research?: { plan: OfficialDocumentWritingLogicPlan; results: OfficialDocumentResearchResult[] };
  /** 这一轮带的参考资料，重新生成时同样原样复用。 */
  materials?: ReferenceMaterialPayload;
  artifact?: GeneratedArtifact;
  savedDraft?: OfficialDocumentDraft;
  recoveryDraft?: OfficialDocumentDraft;
  parseError?: string;
  recoveredAsText?: boolean;
  factReview?: ReturnType<typeof reviewOfficialDocumentDraftFacts>;
  factReviewConfirmedAt?: string;
  /** 这一轮的原始成稿文本，Word 引擎渲染失败时用它兜底出结构化预览。 */
  raw?: string;
  status?: ArtifactStatus;
  expanded?: boolean;
  previewUrl?: string;
  previewLoading?: boolean;
  previewError?: string;
};

type BusyAction = {
  turnId: string;
  kind: "saving" | "exporting";
  format?: OfficialDocumentExportFormat;
};

type PendingSubmission = {
  requirement: string;
  reference: ComposeReference;
  startedAt: number;
  materials?: ReferenceMaterialPayload;
};

/** 分析等待态：卡片要按真实耗时推进阶段，也要把参考结构的章节骨架亮出来。 */
type AnalyzingSubmission = PendingSubmission & {
  templateNodes: OfficialDocumentStructureNode[];
};

/** 大纲确认环：分析完成后停在 confirm 等用户拍板，确认后进入 researching 逐条补资料。 */
type ComposePlanning = {
  requirement: string;
  reference: ComposeReference;
  plan: OfficialDocumentWritingLogicPlan;
  phase: "confirm" | "researching";
  progressText?: string;
  failureCount: number;
  materials?: ReferenceMaterialPayload;
  results?: OfficialDocumentResearchResult[];
  researchStarted?: boolean;
  extraInstruction?: string;
};

type ComposeRecovery = {
  version: 1;
  value: string;
  selection: { kind: "template" | "draft"; id: string } | null;
  materials: ComposeMaterial[];
  turnStates: Record<string, ComposeTurnState>;
  planning: ComposePlanning | null;
  interrupted?: PendingSubmission;
  chat: WritingChatSnapshot;
};

function readComposeRecovery(key: string | null): ComposeRecovery | undefined {
  if (!key) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null") as ComposeRecovery | null;
    if (!saved || saved.version !== 1 || typeof saved.value !== "string"
      || !Array.isArray(saved.materials) || !saved.turnStates || !Array.isArray(saved.chat?.turns)
      || typeof saved.chat.sessionId !== "string") return;
    const validReference = (reference: ComposeReference) => Array.isArray(reference?.template?.currentVersion?.analysis?.structureNodes);
    if (Object.values(saved.turnStates).some((turn) => !validReference(turn.reference)
      || !Array.isArray(turn.plan?.sections) || !Array.isArray(turn.plan?.fixedFields))
      || saved.chat.turns.some((turn) => !turn || typeof turn.id !== "string" || typeof turn.question !== "string" || !Array.isArray(turn.events))
      || saved.materials.some((material) => !material || typeof material.name !== "string"
        || (material.content !== undefined && typeof material.content !== "string"))) return;
    if (saved.planning && (!validReference(saved.planning.reference)
      || !Array.isArray(saved.planning.plan?.sections) || !Array.isArray(saved.planning.plan?.researchNeeds))) return;
    return {
      ...saved,
      chat: { ...saved.chat, turns: saved.chat.turns.map((turn) => ({
        ...turn,
        events: turn.events.filter((event) => event && typeof event.type === "string"),
        status: ["done", "error", "cancelled"].includes(turn.status) ? turn.status : "cancelled"
      })) },
      value: saved.value || saved.interrupted?.requirement || "",
      materials: saved.materials.map((material) => material.status === "reading"
        ? { ...material, status: "failed", message: "解析已中断，请重新添加这份资料" } : material),
      planning: saved.planning ? { ...saved.planning, phase: "confirm", progressText: undefined } : null
    };
  } catch {
    return;
  }
}

type GenerationInput = {
  requirement: string;
  reference: ComposeReference;
  extraInstruction?: string;
  research?: { plan: OfficialDocumentWritingLogicPlan; results: OfficialDocumentResearchResult[] };
  materials?: ReferenceMaterialPayload;
};

/** 只把有内容的研究结果注入写作上下文；失败项由正文写「[待补充]」。 */
function usableResearchResults(results: OfficialDocumentResearchResult[]) {
  return results.filter((result) => (
    result.status === "SUCCESS" && (result.summary.trim() || result.table || result.chart)
  ));
}

/** 能进成稿的研究结果：成功且有料的落表格与图表，跳过的落「【待补充】」正文块。 */
function embeddableResearchResults(results: OfficialDocumentResearchResult[]) {
  return results.filter((result) => (
    result.status === "SKIPPED" || result.status === "FAILED" || result.status === "NO_RESULT"
    || (result.status === "SUCCESS" && Boolean(result.summary.trim() || result.table || result.chart))
  ));
}

const EMPTY_FIXED_FIELDS: OfficialDocumentReferenceFixedField[] = [];
const EMPTY_DRAFTS: OfficialDocumentDraft[] = [];
const EMPTY_TEMPLATES: OfficialDocumentTemplate[] = [];

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * 生成中的正文装在限高窗里自己贴底滚动，完成后收起来给文件卡让位。
 * 一篇公文几千字，全量铺在会话流里会让上一轮彻底找不回来。
 */
function ComposeAnswerStream({
  raw,
  fixedFields,
  streaming,
  expanded,
  onToggle
}: {
  raw: string;
  fixedFields: OfficialDocumentReferenceFixedField[];
  streaming: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lines = useMemo(
    () => buildOfficialDocumentPreviewLines(raw, fixedFields),
    [raw, fixedFields]
  );
  const stream = useStickToBottom<HTMLDivElement>({ signature: raw.length, enabled: streaming });
  const collapsible = !streaming && isCollapsibleAnswer(lines);
  const collapsed = collapsible && !expanded;

  return (
    <div
      className="official-document-compose__stream"
      data-streaming={streaming || undefined}
      data-collapsed={collapsed ? "" : undefined}
    >
      <div className="official-document-compose__stream-body" {...stream.containerProps}>
        <article className="official-document-compose__page">
          {lines.map((line, index) => (
            <p className="official-document-line" data-role={line.role} key={`${index}-${line.role}`}>
              {line.text}
            </p>
          ))}
        </article>
      </div>
      {!collapsible ? null : (
        <button
          type="button"
          className="official-document-compose__stream-toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? <CaretUp size={13} aria-hidden="true" /> : <CaretDown size={13} aria-hidden="true" />}
          {expanded ? "收起全文" : "展开全文"}
        </button>
      )}
    </div>
  );
}

function ComposeReferenceMeta({ reference }: { reference: ComposeReference }) {
  return (
    <>
      {reference.kind === "draft"
        ? <FileText size={14} aria-hidden="true" />
        : <FileDoc size={14} aria-hidden="true" />}
      @{referenceTitle(reference)} · {referenceMeta(reference)}
    </>
  );
}

export function OfficialDocumentComposeView() {
  const userId = useDataHubAuthStore((state) => state.user?.userId);
  const spaceId = useDataHubAuthStore((state) => state.currentSpaceId);
  const storageKey = userId != null && spaceId != null ? `xingshu:writing:${userId}:${spaceId}` : null;
  return <ComposeWorkspace key={storageKey ?? "anonymous"} storageKey={storageKey} />;
}

function ComposeWorkspace({ storageKey }: { storageKey: string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const { query, status } = useOfficialDocumentWorkspace();
  const [recovered] = useState(() => readComposeRecovery(storageKey));
  const [value, setValue] = useState(recovered?.value ?? "");
  const [selection, setSelection] = useState<{ kind: "template" | "draft"; id: string } | null>(
    () => {
      const requested = (location.state as { useTemplateId?: unknown } | null)?.useTemplateId;
      return typeof requested === "string" && requested ? { kind: "template", id: requested } : recovered?.selection ?? null;
    }
  );
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeMentionKey, setActiveMentionKey] = useState("");
  const [materials, setMaterials] = useState<ComposeMaterial[]>(recovered?.materials ?? []);
  const materialsRef = useRef(materials);
  const materialTasksRef = useRef(new Map<string, Promise<void>>());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [turnStates, setTurnStates] = useState<Record<string, ComposeTurnState>>(recovered?.turnStates ?? {});
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission>();
  const [analyzingSubmission, setAnalyzingSubmission] = useState<AnalyzingSubmission>();
  const [planning, setPlanning] = useState<ComposePlanning | null>(recovered?.planning ?? null);
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [composerError, setComposerError] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [viewerTurnId, setViewerTurnId] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const finalizedTurnsRef = useRef(new Set(Object.entries(recovered?.turnStates ?? {})
    .filter(([, turn]) => turn.artifact || (turn.raw && !turn.parseError)).map(([id]) => id)));
  /* 「跳过大纲」要能作废一次在途分析：token 不一致的分析结果直接丢弃。 */
  const analyzeTokenRef = useRef(0);
  const generationTokenRef = useRef(0);
  const researchControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const drafts = query.data?.drafts ?? EMPTY_DRAFTS;
  const templates = query.data?.templates ?? EMPTY_TEMPLATES;
  const { messages, busy: writingBusy, send, stop, getSnapshot } = useWritingChat(COMPOSE_CHAT_KEY, recovered?.chat);
  const composerBusy = writingBusy
    || Boolean(pendingSubmission)
    || Boolean(analyzingSubmission)
    || planning !== null;
  /*
   * 两张脸由路径决定：/writing 永远是入口首页，会话与成稿只在 /writing/session。
   * 被收进停放区（用户切去别的模块）时保持上一张脸，别在看不见的地方把会话拆了又搭。
   */
  const faceRef = useRef<"home" | "session">(location.pathname === WRITING_SESSION_PATH ? "session" : "home");
  if (location.pathname === WRITING_SESSION_PATH) faceRef.current = "session";
  else if (location.pathname === WRITING_HOME_PATH) faceRef.current = "home";
  const onSessionPage = faceRef.current === "session";
  const hasSession = messages.length > 0
    || Boolean(pendingSubmission)
    || Boolean(analyzingSubmission)
    || planning !== null;
  const conversationVisible = onSessionPage && hasSession;

  useOfficialDocumentAppChrome({ stage: "compose", context: "公文写作" });

  /*
   * 写作台常驻在壳层里，用户可以切走干别的。进度和成稿要主动报出去，
   * 侧栏指示和完成通知才知道这边发生了什么。
   */
  const jobBusyRef = useRef(false);
  const reportedTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const phase: WritingJobPhase = analyzingSubmission
      ? "analyzing"
      : planning?.phase === "researching"
        ? "researching"
        : (pendingSubmission || writingBusy)
          ? "writing"
          : "idle";
    const job = useWritingJobStore.getState();
    /* 首页提示条只有需求摘录能让人认出这是哪一篇，所以进度里顺带带上它。 */
    const requirement = analyzingSubmission?.requirement
      ?? (planning?.phase === "researching" ? planning.requirement : undefined)
      ?? pendingSubmission?.requirement
      ?? (writingBusy ? messages[messages.length - 1]?.question : undefined);
    job.setPhase(phase, phase === "researching" ? planning?.progressText : undefined, phase === "idle" ? undefined : requirement);

    if (phase !== "idle") {
      jobBusyRef.current = true;
      return;
    }
    const latest = messages[messages.length - 1];
    if (!latest || latest.status !== "done") {
      jobBusyRef.current = false;
      return;
    }
    /* 只认这次挂载里真跑完的那一轮，恢复出来的历史成稿不该再弹一次提醒。 */
    if (jobBusyRef.current) {
      jobBusyRef.current = false;
      reportedTurnRef.current = latest.id;
    }
    if (reportedTurnRef.current !== latest.id) return;
    /* 标题要等正文解析完才准，这一轮还没落地就先不报，免得提醒里挂着用户自己那句要求。 */
    const state = turnStates[latest.id];
    if (state && !state.artifact && !state.parseError && !state.raw) return;
    const title = state?.artifact?.title?.trim();
    job.reportResult(latest.id, title || latest.question.slice(0, 30) || "未命名公文");
  }, [analyzingSubmission, messages, pendingSubmission, planning, turnStates, writingBusy]);

  /*
   * 刷新后会话是从 sessionStorage 认回来的，store 却是空的：首页会以为什么都没发生过。
   * 把最后那一份已完成的成稿补进 store，只为让提示条有东西可点——
   * 记成已提醒、已看过，所以不弹提醒也不亮未读圆点。
   */
  useEffect(() => {
    const turns = recovered?.chat.turns ?? [];
    const latest = turns[turns.length - 1];
    if (!latest || latest.status !== "done") return;
    const state = recovered?.turnStates[latest.id];
    if (!state) return;
    /* 只认真落地过的那一份：解析失败或半截的文本不算成稿。 */
    if (!state.artifact && !(state.raw && !state.parseError)) return;
    const title = state.artifact?.title?.trim();
    useWritingJobStore.getState().restoreResult(latest.id, title || latest.question.slice(0, 30) || "未命名公文");
  }, [recovered]);

  /* 能 @ 的必须真能出成稿：模板要已发布、编译文件还在，结构也已分析完。 */
  const usableTemplates = useMemo(
    () => templates.filter((template) => templateIsUsable(template) && template.currentVersion.analysis),
    [templates]
  );
  /* 草稿再生成要靠它自己那一版模板，模板用不了这份草稿也就引用不了。 */
  const referenceableDrafts = useMemo(
    () => drafts.filter((draft) => usableTemplates.some((template) => (
      template.id === draft.templateId && template.currentVersion.id === draft.templateVersionId
    ))),
    [drafts, usableTemplates]
  );
  const reference = useMemo<ComposeReference | null>(() => {
    if (!selection) return null;
    if (selection.kind === "template") {
      const template = usableTemplates.find((item) => item.id === selection.id);
      return template ? { kind: "template", template } : null;
    }
    const draft = referenceableDrafts.find((item) => item.id === selection.id);
    if (!draft) return null;
    const template = usableTemplates.find((item) => (
      item.id === draft.templateId && item.currentVersion.id === draft.templateVersionId
    ));
    return template ? { kind: "draft", draft, template } : null;
  }, [referenceableDrafts, selection, usableTemplates]);

  const scrollSignature = messages
    .map((message) => `${message.id}:${message.status}:${message.ask.assistantContent.length}`)
    .join("|");
  const conversation = useStickToBottom<HTMLDivElement>({
    signature: `${scrollSignature}|${pendingSubmission ? "pending" : ""}|${analyzingSubmission ? "analyzing" : ""}|${planning ? `${planning.phase}:${planning.progressText ?? ""}` : ""}`,
    enabled: conversationVisible
  });

  const turnStatesRef = useRef(turnStates);
  turnStatesRef.current = turnStates;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      analyzeTokenRef.current += 1;
      generationTokenRef.current += 1;
      researchControllerRef.current?.abort();
      for (const state of Object.values(turnStatesRef.current)) {
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      }
    };
  }, []);

  const recoveryRef = useRef({ value, selection, materials, turnStates, planning, interrupted: analyzingSubmission ?? pendingSubmission });
  recoveryRef.current = { value, selection, materials, turnStates, planning, interrupted: analyzingSubmission ?? pendingSubmission };
  const saveRecovery = useCallback(() => {
    if (!storageKey || !getSnapshot) return;
    const current = recoveryRef.current;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        ...current,
        version: 1,
        turnStates: Object.fromEntries(Object.entries(current.turnStates).map(([id, turn]) => [id, {
          ...turn, previewUrl: undefined, previewLoading: undefined, previewError: undefined
        }])),
        chat: getSnapshot()
      }));
      if (mountedRef.current) setRecoveryError("");
    } catch {
      if (mountedRef.current) setRecoveryError("本地恢复暂不可用，请将成稿保存到草稿箱或复制正文后离开。");
    }
  }, [storageKey, getSnapshot]);
  useEffect(() => {
    window.addEventListener("pagehide", saveRecovery);
    return () => {
      window.removeEventListener("pagehide", saveRecovery);
      saveRecovery();
    };
  }, [saveRecovery]);
  useEffect(() => {
    const timer = window.setTimeout(saveRecovery, 200);
    return () => window.clearTimeout(timer);
  }, [saveRecovery, value, selection, materials, turnStates, planning, analyzingSubmission, pendingSubmission, messages]);

  const viewerState = viewerTurnId ? turnStates[viewerTurnId] : undefined;
  const viewer = viewerState?.artifact
    ? {
      turnId: viewerTurnId,
      state: viewerState,
      /* Word 引擎失败时的兜底：结构化预览至少让人读到内容 */
      lines: buildOfficialDocumentPreviewLines(viewerState.raw ?? "", viewerState.plan.fixedFields)
    }
    : undefined;

  const patchTurn = (turnId: string, patch: Partial<ComposeTurnState>) => {
    setTurnStates((current) => (
      current[turnId] ? { ...current, [turnId]: { ...current[turnId], ...patch } } : current
    ));
  };

  const resolvedMaterials = useMemo(() => resolveComposeMaterials(materials), [materials]);

  const mentionGroups = useMemo<OfficialDocumentMentionGroup[]>(() => [
    {
      key: "actions",
      title: "添加",
      items: [
        {
          key: MENTION_TEMPLATES_ACTION,
          label: "模板库",
          description: "浏览全部结构模板",
          icon: <img src={mentionLibraryIcon} alt="" aria-hidden="true" />,
          searchText: "模板库 template library"
        },
        {
          key: MENTION_MATERIAL_ACTION,
          label: "上传参考资料",
          description: "文本或 DOCX，作为本轮素材",
          icon: <img src={mentionMaterialIcon} alt="" aria-hidden="true" />,
          searchText: "上传参考资料 material upload"
        }
      ]
    },
    {
      key: "templates",
      title: "模板",
      items: usableTemplates.map((template) => ({
        key: `template:${template.id}`,
        label: template.name,
        description: [
          `v${template.currentVersion.versionNo}`,
          template.currentVersion.fileName,
          template.currentVersion.analysis?.pageCount ? `${template.currentVersion.analysis.pageCount} 页` : ""
        ].filter(Boolean).join(" · "),
        icon: <img src={mentionTemplateIcon} alt="" aria-hidden="true" />,
        searchText: `${template.name} ${template.currentVersion.fileName}`.toLocaleLowerCase()
      }))
    },
    {
      key: "drafts",
      title: "参考草稿",
      items: referenceableDrafts.map((draft) => ({
        key: `draft:${draft.id}`,
        label: draft.title,
        description: `${draft.templateName} · ${formatDate(draft.updatedAt)}`,
        icon: <img src={mentionDraftIcon} alt="" aria-hidden="true" />,
        searchText: `${draft.title} ${draft.templateName}`.toLocaleLowerCase()
      }))
    }
  ], [referenceableDrafts, usableTemplates]);

  const visibleMentionGroups = useMemo(
    () => (mention ? filterMentionGroups(mentionGroups, mention.keyword) : []),
    [mention, mentionGroups]
  );
  const mentionItems = useMemo(() => flattenMentionItems(visibleMentionGroups), [visibleMentionGroups]);

  useEffect(() => {
    setActiveMentionKey((current) => (
      mentionItems.some((item) => item.key === current) ? current : mentionItems[0]?.key ?? ""
    ));
  }, [mentionItems]);

  const focusInput = () => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const syncMention = (next: string) => {
    const caret = inputRef.current?.selectionStart ?? next.length;
    setMention(findMentionQuery(next, caret));
  };

  const openMaterialPicker = () => {
    materialInputRef.current?.click();
  };

  const useTemplate = (template: OfficialDocumentTemplate) => {
    setSelection({ kind: "template", id: template.id });
    setGalleryOpen(false);
    setComposerError("");
    focusInput();
  };

  const selectMention = (item: OfficialDocumentMentionItem) => {
    if (mention) setValue((current) => removeMentionQuery(current, mention));
    setMention(null);
    if (item.key === MENTION_TEMPLATES_ACTION) {
      setGalleryOpen(true);
      return;
    }
    if (item.key === MENTION_MATERIAL_ACTION) {
      openMaterialPicker();
      return;
    }
    const [kind, id] = item.key.split(":");
    if (kind !== "template" && kind !== "draft") return;
    setSelection({ kind, id });
    setComposerError("");
    focusInput();
  };

  /**
   * 每轮结束整理为可编辑草稿；模型格式不规整时保留原文为文字草稿。
   * 旧会话中曾解析失败的成稿会在重新打开时用当前解析规则重新整理。
   */
  useEffect(() => {
    for (const message of messages) {
      if (finalizedTurnsRef.current.has(message.id) || message.status === "streaming") continue;
      const state = turnStates[message.id];
      if (!state) continue;
      finalizedTurnsRef.current.add(message.id);
      if (message.status !== "done") continue;

      const answer = resolveDataHubFinalAnswer(
        message.ask.done?.summary,
        message.ask.assistantContent,
        false,
        { keepRicherStreamedAnswer: true }
      );
      const factReview = reviewOfficialDocumentDraftFacts(answer, state.plan.writingContext,
        Object.values(turnStates)
          .filter((previous) => previous.startedAt < state.startedAt && previous.reference.template.id === state.reference.template.id)
          .map((previous) => previous.requirement));
      try {
        /* 研究拿到的表格与图表跟着正文一起进这一轮成稿；章节锚点与大纲 id 已恒等，映射只是防御。 */
        const research = state.research;
        const generated = parseOfficialDocumentReferenceGeneration({
          markdown: answer,
          referenceDraftTitle: referenceTitle(state.reference),
          sections: state.plan.sections,
          fixedFields: state.plan.fixedFields,
          templateNodes: state.templateNodes,
          researchResults: research
            ? mapResearchResultsToReferenceSections(
                embeddableResearchResults(research.results),
                research.plan.sections,
                state.plan.sections
              )
            : undefined
        });
        setTurnStates((current) => {
          const existing = current[message.id];
          if (!existing) return current;
          const version = Object.values(current).filter((item) => item.artifact).length + 1;
          return {
            ...current,
            [message.id]: {
              ...existing,
              version,
              raw: answer,
              parseError: undefined,
              recoveredAsText: generated.recoveredAsText,
              factReview,
              artifact: {
                templateId: existing.reference.template.id,
                templateVersionId: existing.reference.template.currentVersion.id,
                templateName: existing.reference.template.name,
                title: generated.title,
                fixedValues: generated.fixedValues,
                blocks: generated.blocks
              }
            }
          };
        });
      } catch (caught) {
        patchTurn(message.id, { raw: answer, factReview, parseError: operationErrorMessage(caught), expanded: true });
      }
    }
    // One completed Agent turn becomes a local artifact; persistence is an explicit user action.
  }, [messages, turnStates]);

  const runGeneration = async (input: GenerationInput) => {
    const { requirement, reference: turnReference, extraInstruction = "", research } = input;
    const startedAt = Date.now();
    const token = ++generationTokenRef.current;
    const template = turnReference.template;
    setPendingSubmission({ requirement, reference: turnReference, startedAt, materials: input.materials });
    try {
      /* 模板引用没有旧正文可读：章节骨架直接由结构节点的标题推出来。 */
      const content = turnReference.kind === "draft"
        ? await getOfficialDocumentDraftContent(turnReference.draft.id)
        : { revision: 0, fixedValues: [], blocks: [] };
      if (!mountedRef.current || generationTokenRef.current !== token) return;
      const templateNodes = template.currentVersion.analysis!.structureNodes;
      const materialPayload = input.materials ?? composeMaterialPayload(resolvedMaterials);
      const planInput = {
        referenceDraft: {
          id: turnReference.kind === "draft" ? turnReference.draft.id : template.id,
          title: referenceTitle(turnReference),
          templateName: template.name
        },
        content,
        templateNodes,
        userRequirement: requirement,
        ...(materialPayload.length ? { referenceMaterials: materialPayload } : {}),
        /* 走过大纲确认环时章节骨架以用户拍板的方案为准：改过的标题、删掉的节、purpose/keyPoints 都在这里进上下文。 */
        ...(research ? { confirmedPlan: research.plan } : {})
      };
      /* 研究结果按内容大纲标注章节，先建一次计划拿到参考章节锚点再做映射注入。 */
      const basePlan = buildOfficialDocumentReferenceWritingPlan(planInput);
      const injectable = research ? usableResearchResults(research.results) : [];
      const plan = injectable.length
        ? buildOfficialDocumentReferenceWritingPlan({
            ...planInput,
            researchResults: mapResearchResultsToReferenceSections(
              injectable,
              research!.plan.sections,
              basePlan.sections
            )
          })
        : basePlan;
      const turnId = send(
        extraInstruction ? `${requirement}\n\n${extraInstruction}` : requirement,
        { writingContext: plan.writingContext, purpose: "full-draft", displayQuestion: requirement }
      );
      if (!turnId) throw new Error("写作会话正在处理其他任务，请稍后再试");
      setTurnStates((current) => ({
        ...current,
        [turnId]: {
          requirement,
          reference: turnReference,
          version: 0,
          plan,
          templateNodes,
          startedAt,
          research,
          ...(materialPayload.length ? { materials: materialPayload } : {})
        }
      }));
      setPendingSubmission(undefined);
    } catch (caught) {
      if (!mountedRef.current || generationTokenRef.current !== token) return;
      setPendingSubmission(undefined);
      setComposerError(operationErrorMessage(caught));
      setValue((current) => current || requirement);
    }
  };

  /**
   * 提交先走大纲确认环：分析出章节与研究清单让用户拍板，确认后自动补资料再生成。
   * 分析失败或返回空大纲时退回一步到位的老路径，不挡用户。
   */
  const submit = async () => {
    const requirement = value.trim();
    if (composerBusy) return;
    if (!reference) {
      setComposerError(selection
        ? "这份引用绑定的模板结构不可用，请在模板库中检查该版本"
        : "请先通过 @ 选择模板或参考草稿");
      return;
    }
    if (!requirement) {
      setComposerError("请描述要生成的公文内容");
      return;
    }

    setComposerError("");
    setValue("");
    setMention(null);
    /* 首页只管开头：一提交就进会话页看过程，已有的会话在那边接着往下写。 */
    if (!onSessionPage) navigate(WRITING_SESSION_PATH);
    const turnReference = reference;
    const structureNodes = turnReference.template.currentVersion.analysis!.structureNodes;
    const token = ++analyzeTokenRef.current;
    setAnalyzingSubmission({
      requirement,
      reference: turnReference,
      startedAt: Date.now(),
      templateNodes: structureNodes
    });
    let materialPayload: ReferenceMaterialPayload = [];
    try {
      await Promise.allSettled([...materialTasksRef.current.values()]);
      if (analyzeTokenRef.current !== token || !mountedRef.current) return;
      materialPayload = composeMaterialPayload(resolveComposeMaterials(materialsRef.current));
      setAnalyzingSubmission((current) => current ? { ...current, materials: materialPayload } : current);
      const logicPlan = await analyzeOfficialDocumentContent({
        structureNodes,
        sourceBlocks: [{
          id: "user-requirement",
          order: 0,
          kind: "PARAGRAPH",
          text: requirement,
          headingHint: "USER_REQUIREMENT",
          columns: [],
          rows: []
        }, ...materialPayload.map((material, index) => ({
          id: `reference-material-${index + 1}`,
          order: index + 1,
          kind: "PARAGRAPH" as const,
          text: material.content,
          headingHint: material.name,
          columns: [],
          rows: []
        }))]
      });
      if (analyzeTokenRef.current !== token) return;
      setAnalyzingSubmission(undefined);
      if (!logicPlan.sections.length) {
        await runGeneration({ requirement, reference: turnReference, materials: materialPayload });
        return;
      }
      setPlanning({
        requirement,
        reference: turnReference,
        plan: logicPlan,
        phase: "confirm",
        failureCount: 0,
        materials: materialPayload
      });
    } catch {
      if (analyzeTokenRef.current !== token) return;
      setAnalyzingSubmission(undefined);
      await runGeneration({ requirement, reference: turnReference, materials: materialPayload });
    }
  };

  const skipAnalyzing = async () => {
    const current = analyzingSubmission;
    if (!current) return;
    analyzeTokenRef.current += 1;
    setAnalyzingSubmission(undefined);
    await runGeneration({ requirement: current.requirement, reference: current.reference, materials: current.materials });
  };

  /** 取消等待：作废在途分析，要求回到输入框，用户可以改完再来一次。 */
  const cancelAnalyzing = () => {
    const current = analyzingSubmission;
    if (!current) return;
    analyzeTokenRef.current += 1;
    setAnalyzingSubmission(undefined);
    setValue((existing) => existing || current.requirement);
  };

  const updatePlanningSection = (sectionId: string, changes: { title?: string; purpose?: string; keyPoints?: string[] }) => {
    setPlanning((current) => {
      if (!current) return current;
      const sections = current.plan.sections.map((section) => section.id === sectionId ? { ...section, ...changes } : section);
      const section = sections.find((item) => item.id === sectionId);
      if (!section) return current;
      return {
        ...current,
        results: current.results?.filter((result) => result.sectionId !== sectionId),
        plan: {
          ...current.plan,
          sections,
          researchNeeds: current.plan.researchNeeds.map((need) => need.sectionId === sectionId ? {
            ...need,
            question: `为“${section.title}”补充${need.kind === "ASK_DATA" ? "数据" : "资料"}：${[section.purpose, ...section.keyPoints].filter(Boolean).join("；")}`,
            reason: "已按修改后的章节更新，可继续调整资料问题"
          } : need)
        }
      };
    });
  };

  const updateResearchQuestion = (taskId: string, question: string) => {
    setPlanning((current) => current && ({
      ...current,
      results: current.results?.filter((result) => result.taskId !== taskId),
      plan: { ...current.plan, researchNeeds: current.plan.researchNeeds.map((need) => (
        need.id === taskId ? { ...need, question } : need
      )) }
    }));
  };

  const removePlanningSection = (sectionId: string) => {
    setPlanning((current) => {
      if (!current) return current;
      const sections = current.plan.sections.filter((section) => section.id !== sectionId);
      return {
        ...current,
        results: current.results?.filter((result) => result.sectionId !== sectionId),
        plan: {
          ...current.plan,
          sections,
          // 章节删了，挂在它名下的研究需求一并作废
          researchNeeds: current.plan.researchNeeds.filter((need) => (
            sections.some((section) => section.id === need.sectionId)
          ))
        }
      };
    });
  };

  const runPlannedGeneration = async (current: ComposePlanning, retryMissing = false) => {
    const controller = new AbortController();
    researchControllerRef.current?.abort();
    researchControllerRef.current = controller;
    const settled = new Map((current.results ?? []).map((result) => [result.taskId, result]));
    const needs = current.plan.researchNeeds.filter((need) => {
      const result = settled.get(need.id);
      return !result || (retryMissing && result.status !== "SUCCESS");
    });
    setPlanning({ ...current, phase: "researching", researchStarted: true, progressText: "正在补充资料…", failureCount: 0 });
    try {
      const results = await executeOfficialDocumentResearchPlan(needs, {
        signal: controller.signal,
        existingChartCount: [...settled.values()].filter((result) => result.status === "SUCCESS" && result.chart).length,
        onResult: (result) => {
          if (controller.signal.aborted || !mountedRef.current) return;
          settled.set(result.taskId, result);
          setPlanning((state) => state && ({ ...state, results: [...settled.values()] }));
        },
        onProgress: (progress) => {
          if (controller.signal.aborted || !mountedRef.current) return;
          setPlanning((state) => state && ({
            ...state,
            progressText: progress.status === "running"
              ? `正在补充资料 ${progress.index + 1}/${progress.total}：${progress.need.question.slice(0, 40)}`
              : state.progressText,
            failureCount: state.failureCount + (progress.status === "failed" ? 1 : 0)
          }));
        }
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      for (const result of results) settled.set(result.taskId, result);
      setPlanning(null);
      await runGeneration({
        requirement: current.requirement,
        reference: current.reference,
        extraInstruction: current.extraInstruction,
        research: { plan: current.plan, results: [...settled.values()] },
        materials: current.materials
      });
    } catch (caught) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setComposerError(operationErrorMessage(caught));
      setPlanning((state) => state && ({ ...state, phase: "confirm" }));
    } finally {
      if (researchControllerRef.current === controller) researchControllerRef.current = null;
    }
  };

  const confirmPlanning = async () => {
    if (!planning || planning.phase !== "confirm") return;
    await runPlannedGeneration(planning);
  };

  const skipPlanning = async () => {
    const current = planning;
    if (!current || current.phase !== "confirm") return;
    setPlanning(null);
    const settled = new Map((current.results ?? []).map((result) => [result.taskId, result]));
    await runGeneration({
      requirement: current.requirement,
      reference: current.reference,
      materials: current.materials,
      ...(current.researchStarted ? { research: {
        plan: current.plan,
        results: current.plan.researchNeeds.map((need): OfficialDocumentResearchResult => settled.get(need.id) ?? {
          taskId: need.id, sectionId: need.sectionId, kind: need.kind, question: need.question,
          required: need.required, preferredOutput: need.preferredOutput, status: "SKIPPED",
          summary: "用户选择使用现有资料生成", citations: []
        })
      } } : {})
    });
  };

  const cancelPlanning = () => {
    if (!planning) return;
    if (planning.phase === "researching") {
      researchControllerRef.current?.abort();
      setPlanning((current) => current && ({ ...current, phase: "confirm", progressText: "已停止补充资料，完成的结果已保留。" }));
      return;
    }
    setPlanning(null);
    setValue((existing) => existing || planning.requirement);
  };

  const regenerate = async (turnId: string, extraInstruction = "") => {
    const state = turnStates[turnId];
    if (!state || composerBusy) return;
    setComposerError("");
    if (state.research?.results.some((result) => result.status !== "SUCCESS")) {
      await runPlannedGeneration({
        requirement: state.requirement,
        reference: state.reference,
        plan: state.research.plan,
        results: state.research.results,
        phase: "confirm", failureCount: 0,
        materials: state.materials ?? [],
        extraInstruction
      }, true);
      return;
    }
    await runGeneration({
      requirement: state.requirement, reference: state.reference, extraInstruction,
      research: state.research, materials: state.materials ?? []
    });
  };

  const cancel = () => {
    if (writingBusy) stop();
    if (planning?.phase === "researching") cancelPlanning();
    if (pendingSubmission) {
      generationTokenRef.current += 1;
      setValue((current) => current || pendingSubmission.requirement);
      setPendingSubmission(undefined);
    }
  };

  const updateMaterials = (update: (current: ComposeMaterial[]) => ComposeMaterial[]) => {
    materialsRef.current = update(materialsRef.current);
    setMaterials(materialsRef.current);
  };

  const patchMaterial = (id: string, patch: Partial<ComposeMaterial>) => {
    updateMaterials((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  /** DOCX 资料复用内容方案抽取管线，所以必须先有一份模板结构可以挂靠。 */
  const extractDocxMaterial = async (template: OfficialDocumentTemplate, file: File) => {
    let profile = await uploadOfficialDocumentContentProfile(
      template.id,
      template.currentVersion.id,
      file,
      file.name
    );
    for (let attempt = 0; profile.status === "EXTRACTING" && attempt < MATERIAL_POLL_LIMIT; attempt += 1) {
      await delay(ANALYZING_POLL_INTERVAL_MS);
      profile = await getOfficialDocumentContentProfile(profile.id);
    }
    if (profile.status === "FAILED") {
      throw new Error(profile.profile.failureMessage || "这份 DOCX 没能解析出正文");
    }
    const text = joinContentProfileBlocks(profile.profile.source?.blocks ?? []);
    if (!text) throw new Error("这份 DOCX 没能解析出正文");
    return text;
  };

  const addMaterial = async (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = { id, name: file.name, size: file.size };
    const kind = classifyMaterialFile(file);
    if (kind === "unsupported") {
      updateMaterials((current) => [...current, {
        ...base,
        status: "failed",
        message: "暂不支持解析该格式，请转为 DOCX 或文本"
      }]);
      return;
    }
    if (kind === "text" && file.size > MAX_TEXT_MATERIAL_BYTES) {
      updateMaterials((current) => [...current, {
        ...base,
        status: "failed",
        message: `文本资料不能超过 ${formatFileSize(MAX_TEXT_MATERIAL_BYTES)}`
      }]);
      return;
    }
    if (kind === "docx" && !reference) {
      updateMaterials((current) => [...current, {
        ...base,
        status: "failed",
        message: "请先 @ 选择模板或参考草稿，再上传 DOCX 资料"
      }]);
      return;
    }

    const template = reference?.template;
    updateMaterials((current) => [...current, { ...base, status: "reading" }]);
    const task = (async () => {
      try {
        const content = kind === "text" ? await file.text() : await extractDocxMaterial(template!, file);
        if (mountedRef.current) patchMaterial(id, { status: "ready", content });
      } catch (caught) {
        if (mountedRef.current) patchMaterial(id, { status: "failed", message: operationErrorMessage(caught) });
      }
    })();
    materialTasksRef.current.set(id, task);
    await task;
    materialTasksRef.current.delete(id);
  };

  const handleUploadTemplate = async (file: File) => {
    const result = await uploadOfficialDocumentTemplate(file);
    updateWorkspaceCache((current) => ({
      ...current,
      templates: [result.template, ...current.templates.filter((item) => item.id !== result.template.id)]
    }));
    setUploadOpen(false);
    setGalleryOpen(true);
  };

  const copyAnswer = async (turnId: string, answer: string) => {
    const copied = await copyText(answer);
    patchTurn(turnId, {
      status: {
        tone: copied ? "success" : "error",
        message: copied ? "已复制回答" : "复制失败，请手动选中正文"
      }
    });
  };

  const saveGeneratedArtifact = async (turnId: string) => {
    const state = turnStates[turnId];
    if (!state?.artifact || state.savedDraft || state.recoveryDraft || busyAction) return;
    let created: OfficialDocumentDraft | undefined;
    setBusyAction({ turnId, kind: "saving" });
    patchTurn(turnId, { status: undefined });
    try {
      const snapshot = await createOfficialDocumentDraft({
        templateId: state.artifact.templateId,
        templateVersionId: state.artifact.templateVersionId,
        title: state.artifact.title
      });
      created = { ...snapshot, templateName: state.artifact.templateName };
      updateWorkspaceCache((workspace) => ({
        ...workspace,
        drafts: [created!, ...workspace.drafts.filter((draft) => draft.id !== created!.id)]
      }));
      const initial = await getOfficialDocumentDraftContent(created.id);
      const generatedFixedValues = new Map(state.artifact.fixedValues.map((item) => [item.slotId, item.value]));
      /* 这一轮的问数/问知原样跟着落库：草稿里再走 FULL_DRAFT 才有出处和材料可用，
         口径与草稿编辑器一致——失败项也留着，资料面板要按状态列全量任务。 */
      const roundResearch = state.research?.results ?? [];
      const fixedValues = initial.fixedValues.map((item) => ({
        ...item, value: generatedFixedValues.get(item.slotId) ?? ""
      }));
      await updateOfficialDocumentDraftContent(created.id, {
        expectedRevision: initial.revision,
        fixedValues,
        blocks: state.artifact.blocks,
        factReview: {
          reviewedAt: new Date().toISOString(),
          issues: state.factReview ?? [],
          confirmedAt: state.factReviewConfirmedAt,
          textSnapshot: officialDocumentContentText({ fixedValues, blocks: state.artifact.blocks })
        },
        ...(roundResearch.length ? { researchResults: roundResearch } : {})
      });
      patchTurn(turnId, {
        savedDraft: created,
        status: { tone: "success", message: "已保存到草稿箱" }
      });
      // 成稿可编辑是主路径：保存成功直接进入草稿编辑页继续加工
      navigate(`/writing/drafts/${created.id}`);
    } catch (caught) {
      patchTurn(turnId, {
        recoveryDraft: created,
        status: {
          tone: "error",
          message: created
            ? `草稿已创建，但正文保存失败：${operationErrorMessage(caught)}`
            : `保存失败：${operationErrorMessage(caught)}`
        }
      });
    } finally {
      setBusyAction(undefined);
    }
  };

  const downloadGeneratedDraft = async (turnId: string, format: OfficialDocumentExportFormat) => {
    const state = turnStates[turnId];
    if (!state?.artifact || busyAction) return;
    setBusyAction({ turnId, kind: "exporting", format });
    patchTurn(turnId, { status: undefined });
    try {
      let blob: Blob;
      if (state.savedDraft) {
        const record = await exportOfficialDocumentDraft(state.savedDraft.id, format);
        if (record.status !== "GENERATED") throw new Error(record.message || "导出未完成，请稍后重试");
        blob = await downloadOfficialDocumentExport(record.id);
      } else {
        blob = await exportOfficialDocumentTransient(state.artifact, format);
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = state.artifact.title.replace(/[^\p{L}\p{N}._-]+/gu, "_");
      anchor.href = url;
      anchor.download = `${safeTitle || "official-document"}.${format.toLocaleLowerCase()}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      patchTurn(turnId, {
        status: { tone: "success", message: `${format === "PDF" ? "PDF" : "Word"} 下载已开始` }
      });
    } catch (caught) {
      patchTurn(turnId, { status: { tone: "error", message: `下载失败：${operationErrorMessage(caught)}` } });
    } finally {
      setBusyAction(undefined);
    }
  };

  /**
   * 打开侧栏才去要服务端 Word 引擎渲染的 PDF：那是和导出完全一致的排版。
   * 不预取——用户不看的轮次不该白花一次服务端往返。
   */
  const ensurePreview = async (turnId: string) => {
    const state = turnStatesRef.current[turnId];
    if (!state?.artifact || state.previewUrl || state.previewLoading) return;
    patchTurn(turnId, { previewLoading: true, previewError: undefined });
    try {
      const blob = state.savedDraft
        ? await getOfficialDocumentDraftPreview(state.savedDraft.id)
        : await getOfficialDocumentTransientPreview(state.artifact);
      patchTurn(turnId, { previewUrl: URL.createObjectURL(blob), previewLoading: false });
    } catch (caught) {
      patchTurn(turnId, {
        previewLoading: false,
        previewError: `Word 引擎渲染失败：${operationErrorMessage(caught)}`
      });
    }
  };

  const openViewer = (turnId: string) => {
    setViewerTurnId(turnId);
    void ensurePreview(turnId);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentionItems.length) {
      const index = mentionItems.findIndex((item) => item.key === activeMentionKey);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = (index + step + mentionItems.length) % mentionItems.length;
        setActiveMentionKey(mentionItems[next].key);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const active = mentionItems[index] ?? mentionItems[0];
        event.preventDefault();
        selectMention(active);
        return;
      }
    }
    if (event.key === "Escape" && mention) {
      event.preventDefault();
      setMention(null);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const renderArtifact = (turnId: string, state: ComposeTurnState) => {
    if (!state.artifact) return null;
    const previewing = Boolean(state.previewLoading);
    const saving = busyAction?.turnId === turnId && busyAction.kind === "saving";
    const exporting = busyAction?.turnId === turnId && busyAction.kind === "exporting";
    const tableCount = state.artifact.blocks.filter((block) => block.role === "TABLE").length;
    const chartCount = state.artifact.blocks.filter((block) => block.role === "CHART_IMAGE").length;
    const mixedMeta = [
      tableCount ? `${tableCount} 表` : "",
      chartCount ? `${chartCount} 图` : ""
    ].filter(Boolean).join(" ");

    return (
      <XsArtifactCard
        label="生成的公文文件"
        icon={<FileText size={24} aria-hidden="true" />}
        eyebrow={previewing ? "正在渲染…" : state.savedDraft ? "已保存 · 点击浏览" : state.recoveredAsText ? "文字草稿 · 点击浏览" : "临时成稿 · 点击浏览"}
        title={state.artifact.title}
        badge={state.version > 1 ? `v${state.version}` : undefined}
        meta={[
          state.artifact.templateName,
          state.savedDraft ? "已进入草稿箱" : "未保存",
          mixedMeta
        ].filter(Boolean).join(" · ")}
        active={viewerTurnId === turnId}
        openLabel={`浏览 ${state.artifact.title}`}
        onOpen={() => openViewer(turnId)}
        actions={
          <>
            {state.savedDraft ? (
              <Button
                className="xs-artifact-card__action"
                type="text"
                shape="circle"
                aria-label="打开已保存草稿"
                title="已保存到草稿箱，点击打开"
                data-on
                icon={<Star size={20} weight="fill" aria-hidden="true" />}
                onClick={() => navigate(`/writing/drafts/${state.savedDraft!.id}`)}
              />
            ) : state.recoveryDraft ? (
              <Button
                className="xs-artifact-card__action"
                type="text"
                shape="circle"
                aria-label="打开保存失败的草稿"
                title="草稿已创建，点击继续修复"
                icon={<Star size={20} aria-hidden="true" />}
                onClick={() => navigate(`/writing/drafts/${state.recoveryDraft!.id}`)}
              />
            ) : (
              <Button
                className="xs-artifact-card__action"
                type="text"
                shape="circle"
                aria-label="保存到草稿箱"
                title="保存到草稿箱"
                loading={saving}
                icon={<Star size={20} aria-hidden="true" />}
                onClick={() => void saveGeneratedArtifact(turnId)}
              />
            )}
            <Dropdown
              trigger={["click"]}
              menu={{
                items: (query.data?.capabilities.exportFormats ?? ["DOCX"]).map((format) => ({
                  key: format,
                  label: format === "PDF" ? "下载 PDF" : "下载 Word"
                })),
                onClick: ({ key }) => void downloadGeneratedDraft(turnId, key as OfficialDocumentExportFormat)
              }}
            >
              <Button
                type="text"
                loading={exporting}
                icon={<DownloadSimple size={17} aria-hidden="true" />}
              >下载</Button>
            </Dropdown>
          </>
        }
      />
    );
  };

  const renderAssistantTurn = (message: (typeof messages)[number]) => {
    const state = turnStates[message.id];
    const streaming = message.status === "streaming";
    const failed = message.status === "error";
    const cancelled = message.status === "cancelled";
    const raw = resolveDataHubFinalAnswer(
      message.ask.done?.summary,
      message.ask.assistantContent,
      failed,
      { keepRicherStreamedAnswer: true }
    );
    const answer = stripOfficialDocumentAnchors(raw);
    const canCopy = Boolean(answer) && !streaming;

    return (
      <>
        {failed ? (
          <p>
            <WarningCircle size={15} weight="bold" aria-hidden="true" />
            {message.error || "公文生成失败，请重试。"}
          </p>
        ) : null}
        {cancelled ? <p>已停止生成，写作要求仍保留在这一轮里。</p> : null}
        {streaming && !answer ? (
          <>
            <p>正在按所选结构生成完整公文…</p>
            <small>
              <CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />
              正在处理
              {state ? <ComposeElapsed startedAt={state.startedAt} /> : null}
            </small>
          </>
        ) : null}

        {answer ? (
          <ComposeAnswerStream
            raw={raw}
            fixedFields={state?.plan.fixedFields ?? EMPTY_FIXED_FIELDS}
            streaming={streaming}
            expanded={Boolean(state?.expanded)}
            onToggle={() => patchTurn(message.id, { expanded: !state?.expanded })}
          />
        ) : null}

        {state?.parseError ? (
          <p className="official-document-compose__parse-note">
            <WarningCircle size={14} aria-hidden="true" />
            这一版没能解析成公文结构：{state.parseError}
          </p>
        ) : null}

        {state?.factReview?.length ? (
          <section aria-label="事实校对" className="official-document-compose__parse-note">
            <div>
              <strong>以下内容需核对来源</strong>
              <p>未在已提供的需求与资料中匹配到这些时间、数量或执行要求；原文已保留，请确认后采用。</p>
              <ul>{state.factReview.map((issue, index) => (
                <li key={index}>核对“{issue.additions.join("、")}”：{issue.sentence}</li>
              ))}</ul>
              <Button type="text" size="small" onClick={() => patchTurn(message.id, {
                factReviewConfirmedAt: state.factReviewConfirmedAt ? undefined : new Date().toISOString()
              })}>
                {state.factReviewConfirmedAt ? "已核对来源 · 撤销确认" : "我已核对来源"}
              </Button>
            </div>
          </section>
        ) : null}

        {state?.research?.results.some((result) => result.status !== "SUCCESS") ? (
          <section aria-label="未补齐的资料" className="official-document-compose__parse-note">
            <div>
              <strong>部分资料未补齐，可重试或继续使用当前成稿</strong>
              <ul>{state.research.results.filter((result) => result.status !== "SUCCESS").map((result) => (
                <li key={result.taskId}>{result.question}：{result.summary || "未取得可用结果"}</li>
              ))}</ul>
            </div>
          </section>
        ) : null}
        {state?.research?.results.some((result) => result.kind === "ASK_KNOWLEDGE" && result.status === "SUCCESS" && !result.citations.length) ? (
          <p className="official-document-compose__parse-note">部分资料未附来源链接，内容已保留供参考。</p>
        ) : null}

        {state?.artifact ? renderArtifact(message.id, state) : null}

        {streaming ? null : (
          <XsChatActions>
            {canCopy ? (
              <XsChatActionButton
                icon={<Copy size={14} aria-hidden="true" />}
                label="复制回答"
                text="复制"
                onClick={() => void copyAnswer(message.id, answer)}
              />
            ) : null}
            {state ? (
              <XsChatActionButton
                icon={<ArrowsClockwise size={14} aria-hidden="true" />}
                label={state.research?.results.some((result) => result.status !== "SUCCESS")
                  ? "重试缺失资料并重新生成"
                  : failed ? "重试" : cancelled ? "继续生成" : state.parseError ? "重出完整版" : "重新生成"}
                disabled={composerBusy}
                onClick={() => void regenerate(message.id, state.parseError ? RETRY_HINT : "")}
              />
            ) : null}
          </XsChatActions>
        )}

        {state?.status ? (
          <small
            className="xs-chat__status"
            role="status"
            data-error={state.status.tone === "error" || undefined}
          >
            {state.status.message}
          </small>
        ) : null}
      </>
    );
  };

  const composerChips = (
    <>
      {reference ? (
        <span className="official-document-compose__chip" data-tone="reference" aria-label="本轮引用">
          {reference.kind === "draft"
            ? <FileText size={14} aria-hidden="true" />
            : <FileDoc size={14} aria-hidden="true" />}
          <span>@{referenceTitle(reference)}</span>
          <button
            type="button"
            aria-label="移除本轮引用"
            disabled={composerBusy}
            onClick={() => {
              setSelection(null);
              setComposerError("");
            }}
          ><X size={12} aria-hidden="true" /></button>
        </span>
      ) : null}
      {resolvedMaterials.map((material) => (
        <span
          key={material.id}
          className="official-document-compose__chip"
          data-tone={material.status === "failed" ? "error" : undefined}
          title={material.message}
        >
          <Paperclip size={14} aria-hidden="true" />
          <span>{material.name}</span>
          <em>
            {material.status === "reading"
              ? "解析中"
              : material.status === "failed"
                ? "读取失败"
                : material.truncated
                  ? "已截断"
                  : formatFileSize(material.size)}
          </em>
          <button
            type="button"
            aria-label={`移除参考资料 ${material.name}`}
            disabled={composerBusy}
            onClick={() => updateMaterials((current) => current.filter((item) => item.id !== material.id))}
          ><X size={12} aria-hidden="true" /></button>
        </span>
      ))}
    </>
  );

  return (
    <section
      className="official-document-compose"
      aria-label="公文写作"
      data-viewer={viewer ? "" : undefined}
    >
      <XsAsyncPanel
        status={status}
        empty={false}
        errorTitle="公文写作暂不可用"
        error={query.error instanceof Error ? query.error.message : "无法加载报告草稿。"}
        onRetry={() => void query.refetch()}
        loadingVariant="cards"
        contentKey={query.dataUpdatedAt}
      >
        <div
          className="official-document-compose__content xs-page-enter"
          data-conversation={conversationVisible || undefined}
        >
          {!conversationVisible ? (
            <header>
              <img src={promptStar} alt="" width={24} height={24} aria-hidden="true" />
              <h2>想写一篇什么公文？</h2>
            </header>
          ) : null}

          {conversationVisible ? (
            <section
              className="xs-chat"
              aria-label="公文生成对话"
              tabIndex={-1}
              {...conversation.containerProps}
            >
              {messages.map((message) => {
                const state = turnStates[message.id];
                return (
                  <XsChatTurn key={message.id}>
                    <XsChatUserBubble
                      meta={state ? <ComposeReferenceMeta reference={state.reference} /> : undefined}
                    >
                      {message.question}
                    </XsChatUserBubble>
                    <XsChatAssistant error={message.status === "error"}>
                      {renderAssistantTurn(message)}
                    </XsChatAssistant>
                  </XsChatTurn>
                );
              })}

              {analyzingSubmission ? (
                <XsChatTurn>
                  <XsChatUserBubble meta={<ComposeReferenceMeta reference={analyzingSubmission.reference} />}>
                    {analyzingSubmission.requirement}
                  </XsChatUserBubble>
                  <XsChatAssistant>
                    <ComposeAnalyzingCard
                      startedAt={analyzingSubmission.startedAt}
                      templateName={analyzingSubmission.reference.template.name}
                      templateNodes={analyzingSubmission.templateNodes}
                      onSkip={() => void skipAnalyzing()}
                      onCancel={cancelAnalyzing}
                    />
                  </XsChatAssistant>
                </XsChatTurn>
              ) : null}

              {planning ? (
                <XsChatTurn>
                  <XsChatUserBubble meta={<ComposeReferenceMeta reference={planning.reference} />}>
                    {planning.requirement}
                  </XsChatUserBubble>
                  <XsChatAssistant>
                    <ComposeOutlineCard
                      plan={planning.plan}
                      phase={planning.phase}
                      progressText={planning.progressText}
                      failureCount={planning.failureCount}
                      completedCount={planning.results?.filter((result) => result.status === "SUCCESS").length}
                      researchStarted={planning.researchStarted}
                      onChangeResearchQuestion={updateResearchQuestion}
                      onChangeSectionTitle={(sectionId, title) => updatePlanningSection(sectionId, { title })}
                      onChangeSectionLogic={updatePlanningSection}
                      onRemoveSection={removePlanningSection}
                      onConfirm={() => void confirmPlanning()}
                      onSkip={() => void skipPlanning()}
                      onCancel={cancelPlanning}
                    />
                  </XsChatAssistant>
                </XsChatTurn>
              ) : null}

              {pendingSubmission ? (
                <XsChatTurn>
                  <XsChatUserBubble meta={<ComposeReferenceMeta reference={pendingSubmission.reference} />}>
                    {pendingSubmission.requirement}
                  </XsChatUserBubble>
                  <XsChatAssistant>
                    <p>正在读取“{referenceTitle(pendingSubmission.reference)}”的结构与文风…</p>
                    <small>
                      <CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />
                      正在处理
                      <ComposeElapsed startedAt={pendingSubmission.startedAt} />
                    </small>
                  </XsChatAssistant>
                </XsChatTurn>
              ) : null}
            </section>
          ) : null}

          {templates.length || drafts.length ? (
            <div className="official-document-compose__composer-block">
              <OfficialDocumentComposer
                mode={conversationVisible ? "chat" : "hero"}
                label="公文写作输入"
                value={value}
                ariaLabel="公文写作要求"
                placeholder={conversationVisible
                  ? "继续描述，输入 @ 更换模板或参考草稿"
                  : "描述你想写的公文，输入 @ 选择模板或参考草稿"}
                maxLength={MAX_REFERENCE_REQUIREMENT_CHARS}
                busy={composerBusy}
                textareaRef={inputRef}
                showScrollToBottom={conversationVisible && conversation.showScrollToBottom}
                onScrollToBottom={conversation.scrollToBottom}
                overlay={mention ? (
                  <OfficialDocumentMentionMenu
                    groups={visibleMentionGroups}
                    activeKey={activeMentionKey}
                    emptyText="没有匹配的模板或草稿"
                    onHover={setActiveMentionKey}
                    onSelect={selectMention}
                  />
                ) : null}
                lead={(
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        { key: "material", label: "上传参考资料" },
                        { key: "template", label: "上传结构 DOCX" },
                        { key: "library", label: "模板库" }
                      ],
                      onClick: ({ key }) => {
                        if (key === "material") openMaterialPicker();
                        if (key === "template") setUploadOpen(true);
                        if (key === "library") setGalleryOpen(true);
                      }
                    }}
                  >
                    <Button
                      className="official-document-composer__plus"
                      type="text"
                      shape="circle"
                      aria-label="添加模板或参考资料"
                      disabled={composerBusy}
                      icon={<Plus size={16} aria-hidden="true" />}
                    />
                  </Dropdown>
                )}
                chips={composerChips}
                tail={onSessionPage && (writingBusy || planning?.phase === "researching" || pendingSubmission) ? (
                  <Button
                    className="official-document-composer__stop"
                    type="text"
                    shape="circle"
                    aria-label="停止"
                    title="停止"
                    icon={<Square size={12} weight="fill" aria-hidden="true" />}
                    onClick={cancel}
                  />
                ) : (
                  <Button
                    className="official-document-composer__send"
                    type="primary"
                    shape="circle"
                    aria-label="生成完整公文"
                    disabled={composerBusy || !reference || !value.trim()}
                    icon={<ArrowUp size={18} weight="bold" />}
                    onClick={() => void submit()}
                  />
                )}
                footnote={!onSessionPage && composerBusy
                  ? "正在生成中，完成后可继续提交。"
                  : "写作内容自动保留在当前标签页，可刷新后继续；正式留存请保存到草稿箱。"}
                onChange={(next) => {
                  setValue(next);
                  syncMention(next);
                }}
                onKeyDown={handleComposerKeyDown}
                onSelectionChange={() => syncMention(inputRef.current?.value ?? "")}
                onBlur={() => setMention(null)}
              />
              {/* 首页不展开会话，那边有活在跑或有成稿就在这里给一条回去的路。 */}
              {!onSessionPage ? <WritingSessionNotice onOpen={() => navigate(WRITING_SESSION_PATH)} /> : null}
            </div>
          ) : (
            <div className="official-document-compose__empty">
              <FileDoc size={28} aria-hidden="true" />
              <strong>还没有可用的结构模板</strong>
              <p>上传一份结构 DOCX，分析完成后就能在这里 @ 它，直接生成公文。</p>
              <Button type="primary" onClick={() => setUploadOpen(true)}>上传结构 DOCX</Button>
            </div>
          )}

          {composerError ? <XsStatusBar tone="error" message={composerError} /> : null}
          {recoveryError ? <XsStatusBar tone="error" message={recoveryError} /> : null}
        </div>
      </XsAsyncPanel>

      <input
        ref={materialInputRef}
        className="official-document-compose__file"
        type="file"
        multiple
        accept={[...TEXT_MATERIAL_EXTENSIONS, ".docx"].join(",")}
        data-testid="official-document-material-file"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          for (const file of files) void addMaterial(file);
        }}
      />

      {galleryOpen ? (
        <TemplateGallery
          overlay
          label="模板库"
          templates={templates}
          actions={(
            <>
              <Button icon={<UploadSimple size={16} aria-hidden="true" />} onClick={() => setUploadOpen(true)}>
                上传结构 DOCX
              </Button>
              <Button
                className="official-document-templates__close"
                type="text"
                shape="circle"
                aria-label="关闭模板库"
                icon={<X size={16} aria-hidden="true" />}
                onClick={() => {
                  setGalleryOpen(false);
                  focusInput();
                }}
              />
            </>
          )}
          empty={(
            <div className="official-document-compose__empty">
              <FileDoc size={28} aria-hidden="true" />
              <strong>还没有可用的结构模板</strong>
              <p>上传一份结构 DOCX，分析完成后它就会出现在这里。</p>
            </div>
          )}
          onUse={useTemplate}
          onOpen={(template) => navigate(`/writing/templates/${template.id}`)}
        />
      ) : null}

      <XsUploadDialog
        open={uploadOpen}
        title="上传结构 DOCX"
        description="上传后自动做安全检查和结构分析；示例文字只用于识别结构。"
        accept={[".docx"]}
        acceptMimeTypes={["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}
        maxBytes={25 * 1024 * 1024}
        submitLabel="上传并分析"
        hint="结构角色与问数槽位可在发布前校准"
        inputTestId="official-document-template-file"
        onUpload={handleUploadTemplate}
        onClose={() => setUploadOpen(false)}
      />

      {viewer ? (
        <XsSidePanel
          label="公文预览"
          icon={<FileText size={18} aria-hidden="true" />}
          title={viewer.state.artifact?.title}
          titleHint={viewer.state.artifact?.title}
          meta={(
            <>
              {viewer.state.artifact?.templateName}
              {viewer.state.version > 1 ? ` · 第 ${viewer.state.version} 版` : ""}
              {viewer.state.savedDraft ? " · 已进入草稿箱" : " · 未保存"}
            </>
          )}
          onClose={() => setViewerTurnId("")}
          actions={(
            <>
              {viewer.state.savedDraft ? (
                <Button
                  size="small"
                  icon={<Star size={15} weight="fill" aria-hidden="true" />}
                  onClick={() => navigate(`/writing/drafts/${viewer.state.savedDraft!.id}`)}
                >打开草稿</Button>
              ) : (
                <Button
                  size="small"
                  type="primary"
                  icon={<Star size={15} aria-hidden="true" />}
                  loading={busyAction?.turnId === viewer.turnId && busyAction.kind === "saving"}
                  onClick={() => void saveGeneratedArtifact(viewer.turnId)}
                >保存到草稿箱</Button>
              )}
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: (query.data?.capabilities.exportFormats ?? ["DOCX"]).map((format) => ({
                    key: format,
                    label: format === "PDF" ? "下载 PDF" : "下载 Word"
                  })),
                  onClick: ({ key }) => void downloadGeneratedDraft(viewer.turnId, key as OfficialDocumentExportFormat)
                }}
              >
                <Button
                  size="small"
                  loading={busyAction?.turnId === viewer.turnId && busyAction.kind === "exporting"}
                  icon={<DownloadSimple size={15} aria-hidden="true" />}
                >下载</Button>
              </Dropdown>
            </>
          )}
        >
          {viewer.state.previewUrl ? (
            <iframe src={viewer.state.previewUrl} title="生成公文 PDF 预览" />
          ) : viewer.state.previewError ? (
            <div className="official-document-viewer__fallback">
              <p className="official-document-compose__parse-note">
                <WarningCircle size={14} aria-hidden="true" />
                {viewer.state.previewError}
              </p>
              <article className="official-document-compose__page">
                {viewer.lines.map((line, index) => (
                  <p className="official-document-line" data-role={line.role} key={`${index}-${line.role}`}>
                    {line.text}
                  </p>
                ))}
              </article>
              <Button size="small" onClick={() => void ensurePreview(viewer.turnId)}>重新渲染</Button>
            </div>
          ) : (
            <p className="official-document-viewer__loading" role="status">
              <CircleNotch className="xs-chat__spinner" size={16} aria-hidden="true" />
              正在用 Word 引擎渲染全文…
            </p>
          )}
        </XsSidePanel>
      ) : null}
    </section>
  );
}
