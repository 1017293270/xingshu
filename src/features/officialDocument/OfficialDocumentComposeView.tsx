import {
  ArrowsClockwise,
  ArrowUp,
  CaretDown,
  CaretRight,
  CaretUp,
  CircleNotch,
  Copy,
  DownloadSimple,
  FileDoc,
  Files,
  FileText,
  Microphone,
  Paperclip,
  Plus,
  Star,
  Square,
  UploadSimple,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import { Button, Dropdown, Modal } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import appWritingIcon from "@/assets/generated-icons/app-writing.png";
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
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { copyText } from "@/services/clipboard";
import { resolveDataHubFinalAnswer } from "@/services/dataHubAskDataPresenter";
import {
  bindOfficialDocumentContentProfile,
  confirmOfficialDocumentContentProfile,
  createOfficialDocumentTextContentProfile,
  createOfficialDocumentDraft,
  downloadOfficialDocumentExport,
  exportOfficialDocumentDraft,
  exportOfficialDocumentTransient,
  getOfficialDocumentContentProfile,
  getOfficialDocumentDraftContent,
  getOfficialDocumentDraftPreview,
  getOfficialDocumentTransientPreview,
  type OfficialDocumentTransientArtifactInput,
  saveOfficialDocumentContentProfileAnalysis,
  updateOfficialDocumentDraftContent,
  uploadOfficialDocumentTemplate
} from "@/services/officialDocumentService";
import {
  DOCX_PDF_UNSUPPORTED_MESSAGE,
  DocxParseError,
  docxPlainText,
  parseDocx,
  type ParsedDocx
} from "@/services/officialDocumentDocxParser";
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
import { appendVoiceTranscript, transcribeVoice } from "@/services/voiceTranscriptionService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import type {
  OfficialDocumentContentSourceBlock,
  OfficialDocumentDraft,
  OfficialDocumentDraftContent,
  OfficialDocumentExportFormat,
  OfficialDocumentResearchResult,
  OfficialDocumentStructureNode,
  OfficialDocumentTemplate,
  OfficialDocumentWritingLogicPlan
} from "@/types/officialDocument";
import { ComposeAnalyzingCard, ComposeElapsed } from "./ComposeAnalyzingCard";
import { ComposeOutlineCard } from "./ComposeOutlineCard";
import { ComposeReviewPanel } from "./ComposeReviewPanel";
import {
  classifyMaterialFile,
  composeMaterialPayload,
  MAX_DOCX_MATERIAL_BYTES,
  MAX_TEXT_MATERIAL_BYTES,
  resolveComposeMaterials,
  TEXT_MATERIAL_EXTENSIONS,
  type ComposeMaterial
} from "./composeReferenceMaterials";
import {
  formatDate,
  formatFileSize,
  operationErrorMessage,
  templateFileIsMissing,
  templateIsUsable,
  useUpdateOfficialDocumentWorkspaceCache,
  WORD_ENGINE_UNAVAILABLE_ACTION_HINT,
  wordEngineUnavailable
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
import {
  OFFICIAL_DOCUMENT_DRAFTS_PATH,
  useOfficialDocumentAppChrome,
  type OfficialDocumentReturnState
} from "./OfficialDocumentAppShell";
import { ReplicateFrameworkPanel } from "./ReplicateFrameworkPanel";
import {
  buildReplicateFramework,
  readReplicateFramework,
  replicateStyleContent,
  replicateWritingPlan,
  type ReplicateFramework
} from "./replicateFramework";
import { useWritingComposeHostStore, WRITING_HOME_PATH, WRITING_SESSION_PATH } from "./writingComposeNode";
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

/** 首页「我的文稿」只放最近几篇：两列三行一屏看完，再多就该去列表页找了。 */
const RECENT_DRAFT_LIMIT = 6;

const HERO_PLACEHOLDER = "描述你想写的内容，我来给你搭结构";
const CHAT_PLACEHOLDER = "继续描述，输入 @ 更换模板或参考文稿";
const REPLICATE_PLACEHOLDER = "说说这次要写什么，比如「按这个框架写 2026 年版本」";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const VOICE_LABELS = {
  idle: "语音输入",
  permission: "正在请求麦克风权限",
  recording: "停止语音录入",
  processing: "正在转写语音",
  error: "重试语音输入"
} as const;

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

/** 本轮引用的东西：一份结构模板，或一篇带着模板的参考文稿。 */
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

/** 内容复刻那一轮要记住的：原文叫什么、哪几节只写正文不出标题。 */
type ReplicateTurn = {
  sourceName: string;
  bodyOnlySectionIds: string[];
};

/** 原文进参考资料时占第一个位置，单篇与总量上限和其他资料一起算。 */
function replicateSourceMaterial(framework: ReplicateFramework): ComposeMaterial {
  return {
    id: "replicate-source",
    name: framework.source.name,
    size: framework.source.size,
    status: "ready",
    content: framework.sourceText
  };
}

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
  /** 内容复刻出的这一轮：重新生成时优先用左侧最新的框架。 */
  replicate?: ReplicateTurn;
  artifact?: GeneratedArtifact;
  /** 保存中断后复用已创建的方案，避免重试生成重复记录。 */
  contentProfileId?: string;
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

function contentProfileForTurn(state: ComposeTurnState) {
  const sourceBlocks: OfficialDocumentContentSourceBlock[] = [
    { id: "user-requirement", order: 0, kind: "PARAGRAPH", text: state.requirement,
      headingHint: "USER_REQUIREMENT", columns: [], rows: [] },
    ...(state.materials ?? []).map((material, index) => ({
      id: `reference-material-${index + 1}`, order: index + 1, kind: "PARAGRAPH" as const,
      text: material.content, headingHint: material.name, columns: [], rows: []
    }))
  ];
  const plan: OfficialDocumentWritingLogicPlan = state.research?.plan ?? {
    summary: state.requirement,
    sections: state.plan.sections.map((section) => ({
      id: section.id, order: section.order, headingRole: section.headingRole ?? "HEADING_1",
      title: section.title, purpose: section.purpose ?? "", keyPoints: section.keyPoints ?? [], sourceBlockIds: []
    })),
    researchNeeds: [], unassignedSourceBlockIds: [], warnings: []
  };
  const sourceIds = new Set(sourceBlocks.map((block) => block.id));
  const assigned = new Set<string>();
  const sections = plan.sections.map((section) => ({
    ...section,
    sourceBlockIds: (section.sourceBlockIds ?? []).filter((id) => {
      if (!sourceIds.has(id) || assigned.has(id)) return false;
      assigned.add(id);
      return true;
    })
  }));
  // 大纲确认没有逐块分配步骤；共享资料挂到首节，全文上下文仍保留所有原文。
  if (sections.length) sections[0].sourceBlockIds.push(...[...sourceIds].filter((id) => !assigned.has(id)));
  return { sourceBlocks, plan: { ...plan, sections, unassignedSourceBlockIds: [] } };
}

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
  replicate?: ReplicateTurn;
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
  /** 内容复刻的框架。旧记录没有这个字段，形状不对也只丢这一块。 */
  replicate?: ReplicateFramework | null;
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
      planning: saved.planning ? { ...saved.planning, phase: "confirm", progressText: undefined } : null,
      replicate: readReplicateFramework(saved.replicate) ?? null
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
  /** 文风样本取原文正文；框架已经退出时没有样本，原文仍在参考资料里。 */
  replicate?: ReplicateTurn & { styleContent?: OfficialDocumentDraftContent };
};

const EMPTY_CONTENT: OfficialDocumentDraftContent = { revision: 0, fixedValues: [], blocks: [] };

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

function ComposeReferenceMeta({ reference, replicate }: { reference: ComposeReference; replicate?: ReplicateTurn }) {
  return (
    <>
      {replicate
        ? <Files size={14} aria-hidden="true" />
        : reference.kind === "draft"
          ? <FileText size={14} aria-hidden="true" />
          : <FileDoc size={14} aria-hidden="true" />}
      {replicate ? `复刻 ${replicate.sourceName} · ` : ""}@{referenceTitle(reference)} · {referenceMeta(reference)}
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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replicateUploadOpen, setReplicateUploadOpen] = useState(false);
  /* 弹窗里刚新建的那份模板：分析、待发布、可用各有一句话和一个去处。 */
  const [uploadedTemplate, setUploadedTemplate] = useState<{ id: string; persisted: boolean; message: string } | null>(null);
  const [replicate, setReplicate] = useState<ReplicateFramework | null>(recovered?.replicate ?? null);
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
  const engineDown = wordEngineUnavailable(query.data?.capabilities);
  /*
   * 写作台常驻：用户切去别的模块时它仍然挂着，只是被收进隐藏停放区。
   * 弹窗是传送到 body 上的，不看这个就会盖在别的页面上。独立渲染（没有宿主）时视为在场。
   */
  const hostStarted = useWritingComposeHostStore((state) => state.started);
  const hostFace = useWritingComposeHostStore((state) => state.face);
  const onScreen = !hostStarted || hostFace !== null;
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
  /* 内容复刻只在会话页展开成左右两栏；首页只留一条回去的提示。 */
  const replicateLayout = onSessionPage && replicate !== null;
  const composerMode = conversationVisible || replicateLayout ? "chat" : "hero";

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
  /* 首页「我的文稿」：按最近更新排，只取头几篇。 */
  const recentDrafts = useMemo(
    () => [...drafts]
      .sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0))
      .slice(0, RECENT_DRAFT_LIMIT),
    [drafts]
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

  const recoveryRef = useRef({
    value, selection, materials, turnStates, planning, replicate, interrupted: analyzingSubmission ?? pendingSubmission
  });
  recoveryRef.current = {
    value, selection, materials, turnStates, planning, replicate, interrupted: analyzingSubmission ?? pendingSubmission
  };
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
      if (mountedRef.current) setRecoveryError("本地恢复暂不可用，请将成稿保存到我的文稿或复制正文后离开。");
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
  }, [saveRecovery, value, selection, materials, turnStates, planning, replicate, analyzingSubmission, pendingSubmission, messages]);

  /*
   * 模板库独立页点「使用」是带着 useTemplateId 跳回来的。写作台常驻不重挂，
   * 初始化只吃得到第一次，之后每次导航都要在这里认一遍；首屏那次已经由初始值用掉了。
   */
  const requestedTemplateId = (location.state as { useTemplateId?: unknown } | null)?.useTemplateId;
  const appliedLocationKeyRef = useRef(location.key);
  useEffect(() => {
    if (appliedLocationKeyRef.current === location.key) return;
    appliedLocationKeyRef.current = location.key;
    if (typeof requestedTemplateId !== "string" || !requestedTemplateId) return;
    setSelection({ kind: "template", id: requestedTemplateId });
    setComposerError("");
  }, [location.key, requestedTemplateId]);

  const voiceInput = useVoiceInput({
    onAudioReady: async (audio, signal) => {
      const text = await transcribeVoice(audio, signal);
      if (signal.aborted) return;
      setValue((current) => appendVoiceTranscript(current, text));
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  });
  const cancelVoice = voiceInput.cancel;
  /* 人切去别的模块了：麦克风不该还在后台开着，弹窗也别等人回来时又自己冒出来。 */
  useEffect(() => {
    if (onScreen) return;
    cancelVoice();
    setTemplatesOpen(false);
    setUploadOpen(false);
    setReplicateUploadOpen(false);
  }, [cancelVoice, onScreen]);

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

  /* 复刻时原文先占参考资料额度，芯片上的「已截断」要按真正发出去的算。 */
  const resolvedMaterials = useMemo(() => (
    replicate
      ? resolveComposeMaterials([replicateSourceMaterial(replicate), ...materials]).slice(1)
      : resolveComposeMaterials(materials)
  ), [materials, replicate]);

  const mentionGroups = useMemo<OfficialDocumentMentionGroup[]>(() => [
    {
      key: "actions",
      title: "添加",
      items: [
        {
          key: MENTION_TEMPLATES_ACTION,
          label: "公文模板",
          description: "浏览、使用或新建模板",
          icon: <img src={mentionLibraryIcon} alt="" aria-hidden="true" />,
          searchText: "公文模板 模板库 template library"
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
      title: "参考文稿",
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

  const openTemplates = () => {
    setMention(null);
    setTemplatesOpen(true);
  };

  const closeTemplates = () => {
    setTemplatesOpen(false);
    focusInput();
  };

  const applyTemplate = (template: OfficialDocumentTemplate) => {
    setSelection({ kind: "template", id: template.id });
    setTemplatesOpen(false);
    setComposerError("");
    focusInput();
  };

  /* 从写作台进模板详情，细头部原路返回写作台；弹窗先关，不然它会跟着盖在详情页上。 */
  const openTemplateDetail = (template: OfficialDocumentTemplate) => {
    setTemplatesOpen(false);
    const state: OfficialDocumentReturnState = { returnTo: onSessionPage ? WRITING_SESSION_PATH : WRITING_HOME_PATH };
    navigate(`/writing/templates/${template.id}`, { state });
  };

  const selectMention = (item: OfficialDocumentMentionItem) => {
    if (mention) setValue((current) => removeMentionQuery(current, mention));
    setMention(null);
    if (item.key === MENTION_TEMPLATES_ACTION) {
      setTemplatesOpen(true);
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
   * 每轮结束整理为可编辑文稿；模型格式不规整时保留原文为文字草稿。
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
    const replicateTurn: ReplicateTurn | undefined = input.replicate
      ? { sourceName: input.replicate.sourceName, bodyOnlySectionIds: input.replicate.bodyOnlySectionIds }
      : undefined;
    setPendingSubmission({ requirement, reference: turnReference, startedAt, materials: input.materials, replicate: replicateTurn });
    try {
      /*
       * 模板引用没有旧正文可读：章节骨架直接由结构节点的标题推出来。
       * 内容复刻的文风样本是原文正文，引用的文稿只提供模板，不再去读它的正文。
       */
      const content = input.replicate
        ? input.replicate.styleContent ?? EMPTY_CONTENT
        : turnReference.kind === "draft"
          ? await getOfficialDocumentDraftContent(turnReference.draft.id)
          : EMPTY_CONTENT;
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
        ...(research ? { confirmedPlan: research.plan } : {}),
        ...(replicateTurn ? {
          bodyOnlySectionIds: replicateTurn.bodyOnlySectionIds,
          replicateSourceName: replicateTurn.sourceName
        } : {})
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
          ...(plan.writingContext.contextTruncation ? { status: {
            tone: "success" as const,
            message: "材料较长，本次生成采用部分节选；本轮资料和大纲仍会随文稿保存。"
          } } : {}),
          ...(materialPayload.length ? { materials: materialPayload } : {}),
          ...(replicateTurn ? { replicate: replicateTurn } : {})
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

  /** 没选模板时告诉用户去哪儿选；连一份能用的都没有，就指向新建。 */
  const missingReferenceMessage = () => {
    if (selection) return "这份引用绑定的模板结构不可用，请在模板库中检查该版本";
    return usableTemplates.length
      ? "请先选择公文模板：点输入框下方的「公文模板」，或输入 @ 选择"
      : "还没有可用的公文模板：点输入框下方的「公文模板」新建一份，发布后就能用";
  };

  /**
   * 内容复刻不走分析：左侧框架就是用户拍过板的大纲，直接按它生成。
   * 原文排在参考资料第一位，和用户另外加的资料一起受单篇、总量两道上限约束。
   */
  const submitReplicate = async (requirement: string, turnReference: ComposeReference, framework: ReplicateFramework) => {
    const token = generationTokenRef.current;
    const { plan, bodyOnlySectionIds } = replicateWritingPlan(framework);
    const replicateTurn = { sourceName: framework.source.name, bodyOnlySectionIds };
    setPendingSubmission({ requirement, reference: turnReference, startedAt: Date.now(), replicate: replicateTurn });
    await Promise.allSettled([...materialTasksRef.current.values()]);
    /* 等资料读完的这会儿用户可能已经点了停止 */
    if (!mountedRef.current || generationTokenRef.current !== token) return;
    const materialPayload = composeMaterialPayload(resolveComposeMaterials([
      replicateSourceMaterial(framework),
      ...materialsRef.current
    ]));
    await runGeneration({
      requirement,
      reference: turnReference,
      research: { plan, results: [] },
      materials: materialPayload,
      replicate: { ...replicateTurn, styleContent: replicateStyleContent(framework) }
    });
  };

  /**
   * 提交先走大纲确认环：分析出章节与研究清单让用户拍板，确认后自动补资料再生成。
   * 分析失败或返回空大纲时退回一步到位的老路径，不挡用户。
   */
  const submit = async () => {
    const requirement = value.trim();
    if (composerBusy) return;
    if (!reference) {
      setComposerError(missingReferenceMessage());
      return;
    }
    if (!requirement) {
      setComposerError(replicate ? "说说这次要写什么，比如「按这个框架写 2026 年版本」" : "请描述要生成的公文内容");
      return;
    }
    const untitledIndex = replicate?.sections.findIndex((section) => section.level !== "BODY" && !section.title.trim()) ?? -1;
    if (untitledIndex >= 0) {
      setComposerError(`内容框架第 ${untitledIndex + 1} 节是标题但还没写名字：补上标题，或把层级改成「无标题段落」`);
      return;
    }

    setComposerError("");
    setValue("");
    setMention(null);
    /* 首页只管开头：一提交就进会话页看过程，已有的会话在那边接着往下写。 */
    if (!onSessionPage) navigate(WRITING_SESSION_PATH);
    if (replicate) {
      await submitReplicate(requirement, reference, replicate);
      return;
    }
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
    if (state.replicate) {
      /* 同一份原文还在左侧就用最新的框架；已经退出或换了原文，按那一轮当时的框架重来。 */
      const current = replicate?.source.name === state.replicate.sourceName ? replicate : null;
      const latest = current ? replicateWritingPlan(current) : null;
      await runGeneration({
        requirement: state.requirement,
        reference: state.reference,
        extraInstruction,
        research: latest ? { plan: latest.plan, results: [] } : state.research,
        materials: state.materials ?? [],
        replicate: latest
          ? { sourceName: state.replicate.sourceName, bodyOnlySectionIds: latest.bodyOnlySectionIds, styleContent: replicateStyleContent(current!) }
          : state.replicate
      });
      return;
    }
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

  /**
   * 参考资料都在浏览器本地读：文本直接读，DOCX 就地解析成纯文本。
   * 不经过模板和 Word 引擎，所以没选模板、引擎不可用时照样能加资料。
   */
  const addMaterial = async (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = { id, name: file.name, size: file.size };
    const kind = classifyMaterialFile(file);
    const rejection = kind === "pdf"
      ? DOCX_PDF_UNSUPPORTED_MESSAGE
      : kind === "unsupported"
        ? "暂不支持解析该格式，请转为 DOCX 或文本"
        : kind === "text" && file.size > MAX_TEXT_MATERIAL_BYTES
          ? `文本资料不能超过 ${formatFileSize(MAX_TEXT_MATERIAL_BYTES)}`
          : kind === "docx" && file.size > MAX_DOCX_MATERIAL_BYTES
            ? `DOCX 资料不能超过 ${formatFileSize(MAX_DOCX_MATERIAL_BYTES)}`
            : "";
    if (rejection) {
      updateMaterials((current) => [...current, { ...base, status: "failed", message: rejection }]);
      return;
    }

    updateMaterials((current) => [...current, { ...base, status: "reading" }]);
    const task = (async () => {
      try {
        const content = kind === "text" ? await file.text() : docxPlainText(await parseDocx(file));
        if (!content.trim()) throw new Error("这份文档里没有读到正文");
        if (mountedRef.current) patchMaterial(id, { status: "ready", content });
      } catch (caught) {
        if (mountedRef.current) patchMaterial(id, { status: "failed", message: operationErrorMessage(caught) });
      }
    })();
    materialTasksRef.current.set(id, task);
    await task;
    materialTasksRef.current.delete(id);
  };

  /* 新建完留在弹窗里：分析结果和「去发布」都在这里接着给，不把人甩去详情页。 */
  const handleUploadTemplate = async (file: File) => {
    const result = await uploadOfficialDocumentTemplate(file);
    updateWorkspaceCache((current) => ({
      ...current,
      templates: [result.template, ...current.templates.filter((item) => item.id !== result.template.id)]
    }));
    setUploadedTemplate({ id: result.template.id, persisted: result.persisted, message: result.message });
    setUploadOpen(false);
    setTemplatesOpen(true);
  };

  /**
   * 内容复刻的入口。PDF、旧版 .doc 和加载失败抛回上传弹窗就地提示，换个文件就能重试；
   * 读得出来但没章节、甚至什么都没读出来，照样进左右结构，让用户在左边手动搭。
   */
  const handleReplicateUpload = async (file: File) => {
    let parsed: ParsedDocx | undefined;
    let parseError: string | undefined;
    try {
      parsed = await parseDocx(file);
    } catch (caught) {
      if (caught instanceof DocxParseError && caught.code !== "NOT_DOCX") throw caught;
      parseError = operationErrorMessage(caught);
    }
    setReplicate(buildReplicateFramework(parsed, file, parseError));
    setReplicateUploadOpen(false);
    setComposerError("");
    if (!onSessionPage) navigate(WRITING_SESSION_PATH);
    focusInput();
  };

  /* 退出只收起框架；已经生成的成稿留在对话里。没有对话可看就回首页。 */
  const exitReplicate = () => {
    setReplicate(null);
    setComposerError("");
    if (onSessionPage && !hasSession) navigate(WRITING_HOME_PATH);
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
    if (!state?.artifact || state.savedDraft || busyAction) return;
    let created = state.recoveryDraft;
    setBusyAction({ turnId, kind: "saving" });
    patchTurn(turnId, { status: undefined });
    try {
      const source = contentProfileForTurn(state);
      const profile = state.contentProfileId
        ? await getOfficialDocumentContentProfile(state.contentProfileId)
        : await createOfficialDocumentTextContentProfile(state.artifact.templateId, state.artifact.templateVersionId, {
            name: state.artifact.title.slice(0, 200), text: "", sourceBlocks: source.sourceBlocks
          });
      patchTurn(turnId, { contentProfileId: profile.id });
      if (profile.status !== "CONFIRMED") {
        await saveOfficialDocumentContentProfileAnalysis(profile.id, source.plan);
        await confirmOfficialDocumentContentProfile(profile.id, source.plan);
      }
      const snapshot = created ?? await createOfficialDocumentDraft({
        templateId: state.artifact.templateId,
        templateVersionId: state.artifact.templateVersionId,
        contentProfileId: profile.id,
        title: state.artifact.title
      });
      created = { ...snapshot, contentProfileId: profile.id, templateName: state.artifact.templateName };
      updateWorkspaceCache((workspace) => ({
        ...workspace,
        drafts: [created!, ...workspace.drafts.filter((draft) => draft.id !== created!.id)]
      }));
      let initial = await getOfficialDocumentDraftContent(created.id);
      // 兼容此前正文保存失败留下的空草稿；服务端会保护已有正文不被重新绑定覆盖。
      if (state.recoveryDraft && !initial.contentProfileId) {
        initial = await bindOfficialDocumentContentProfile(created.id, {
          expectedRevision: initial.revision, contentProfileId: profile.id
        });
      }
      const generatedFixedValues = new Map(state.artifact.fixedValues.map((item) => [item.slotId, item.value]));
      /* 这一轮的问数/问知原样跟着落库：草稿里再走 FULL_DRAFT 才有出处和材料可用，
         口径与草稿编辑器一致——失败项也留着，资料面板要按状态列全量任务。 */
      const completed = new Map((state.research?.results ?? []).map((result) => [result.taskId, result]));
      const roundResearch = initial.researchResults?.map((result) => ({ ...result, ...completed.get(result.taskId) }))
        ?? state.research?.results ?? [];
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
        recoveryDraft: undefined,
        status: { tone: "success", message: "已保存到我的文稿" }
      });
      // 成稿可编辑是主路径：保存成功直接进入文稿编辑页继续加工
      navigate(`/writing/drafts/${created.id}`);
    } catch (caught) {
      patchTurn(turnId, {
        recoveryDraft: created,
        status: {
          tone: "error",
          message: created
            ? `文稿已创建，但正文保存失败：${operationErrorMessage(caught)}`
            : `保存失败：${operationErrorMessage(caught)}`
        }
      });
    } finally {
      setBusyAction(undefined);
    }
  };

  const downloadGeneratedDraft = async (turnId: string, format: OfficialDocumentExportFormat) => {
    const state = turnStates[turnId];
    if (!state?.artifact || busyAction || engineDown) return;
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
    /* 引擎明说不可用就不白跑一趟：直接给结构化预览，并说清楚是为什么。 */
    if (engineDown) {
      patchTurn(turnId, { previewError: `${WORD_ENGINE_UNAVAILABLE_ACTION_HINT}，先看结构化预览` });
      return;
    }
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

  /* 文件卡和预览侧栏共用一个下载入口；引擎不可用时提前置灰并说明原因，别让人点了再失败。 */
  const renderDownload = (turnId: string, placement: "card" | "panel") => (
    <Dropdown
      trigger={["click"]}
      disabled={engineDown}
      menu={{
        items: (query.data?.capabilities.exportFormats ?? ["DOCX"]).map((format) => ({
          key: format,
          label: format === "PDF" ? "下载 PDF" : "下载 Word"
        })),
        onClick: ({ key }) => void downloadGeneratedDraft(turnId, key as OfficialDocumentExportFormat)
      }}
    >
      <Button
        type={placement === "card" ? "text" : "default"}
        size={placement === "panel" ? "small" : undefined}
        disabled={engineDown}
        title={engineDown ? WORD_ENGINE_UNAVAILABLE_ACTION_HINT : undefined}
        loading={busyAction?.turnId === turnId && busyAction.kind === "exporting"}
        icon={<DownloadSimple size={placement === "card" ? 17 : 15} aria-hidden="true" />}
      >下载</Button>
    </Dropdown>
  );

  const renderArtifact = (turnId: string, state: ComposeTurnState) => {
    if (!state.artifact) return null;
    const previewing = Boolean(state.previewLoading);
    const saving = busyAction?.turnId === turnId && busyAction.kind === "saving";
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
          state.savedDraft ? "已进入我的文稿" : "未保存",
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
                aria-label="打开已保存文稿"
                title="已保存到我的文稿，点击打开"
                data-on
                icon={<Star size={20} weight="fill" aria-hidden="true" />}
                onClick={() => navigate(`/writing/drafts/${state.savedDraft!.id}`)}
              />
            ) : state.recoveryDraft ? (
              <Button
                className="xs-artifact-card__action"
                type="text"
                shape="circle"
                aria-label="重试保存到我的文稿"
                title="复用已创建的文稿，重试保存完整正文"
                loading={saving}
                icon={<Star size={20} aria-hidden="true" />}
                onClick={() => void saveGeneratedArtifact(turnId)}
              />
            ) : (
              <Button
                className="xs-artifact-card__action"
                type="text"
                shape="circle"
                aria-label="保存到我的文稿"
                title="保存到我的文稿"
                loading={saving}
                icon={<Star size={20} aria-hidden="true" />}
                onClick={() => void saveGeneratedArtifact(turnId)}
              />
            )}
            {renderDownload(turnId, "card")}
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

        {state ? (
          <ComposeReviewPanel
            factReview={state.factReview}
            factReviewConfirmedAt={state.factReviewConfirmedAt}
            researchResults={state.research?.results}
            busy={composerBusy}
            onConfirmFactReview={() => patchTurn(message.id, {
              factReviewConfirmedAt: state.factReviewConfirmedAt ? undefined : new Date().toISOString()
            })}
            onRetryMissing={() => void regenerate(message.id)}
          />
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
                label={failed ? "重试" : cancelled ? "继续生成" : state.parseError ? "重出完整版" : "重新生成"}
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

  const voiceState = voiceInput.state;
  const voiceActive = voiceState === "permission" || voiceState === "recording" || voiceState === "processing";
  const voiceStatus = voiceState === "recording"
    ? { tone: "loading" as const, message: "正在听取语音，再点一次麦克风结束" }
    : voiceState === "permission"
      ? { tone: "loading" as const, message: "正在请求麦克风权限" }
      : voiceState === "processing"
        ? { tone: "loading" as const, message: "正在转写语音" }
        : voiceState === "error" && voiceInput.error
          ? { tone: "error" as const, message: voiceInput.error }
          : null;
  const generating = writingBusy || planning?.phase === "researching" || Boolean(pendingSubmission);

  const chatSection = (
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
              meta={state ? <ComposeReferenceMeta reference={state.reference} replicate={state.replicate} /> : undefined}
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
          <XsChatUserBubble
            meta={<ComposeReferenceMeta reference={pendingSubmission.reference} replicate={pendingSubmission.replicate} />}
          >
            {pendingSubmission.requirement}
          </XsChatUserBubble>
          <XsChatAssistant>
            <p>
              {pendingSubmission.replicate
                ? `正在按“${pendingSubmission.replicate.sourceName}”的内容框架准备生成…`
                : `正在读取“${referenceTitle(pendingSubmission.reference)}”的结构与文风…`}
            </p>
            <small>
              <CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />
              正在处理
              <ComposeElapsed startedAt={pendingSubmission.startedAt} />
            </small>
          </XsChatAssistant>
        </XsChatTurn>
      ) : null}
    </section>
  );

  const composer = (
    <OfficialDocumentComposer
      mode={composerMode}
      label="公文写作输入"
      value={value}
      ariaLabel="公文写作要求"
      placeholder={replicateLayout ? REPLICATE_PLACEHOLDER : conversationVisible ? CHAT_PLACEHOLDER : HERO_PLACEHOLDER}
      maxLength={MAX_REFERENCE_REQUIREMENT_CHARS}
      busy={composerBusy}
      textareaRef={inputRef}
      showScrollToBottom={conversationVisible && conversation.showScrollToBottom}
      onScrollToBottom={conversation.scrollToBottom}
      overlay={mention ? (
        <OfficialDocumentMentionMenu
          groups={visibleMentionGroups}
          activeKey={activeMentionKey}
          emptyText="没有匹配的模板或文稿"
          onHover={setActiveMentionKey}
          onSelect={selectMention}
        />
      ) : null}
      lead={(
        <>
          <Button
            className="official-document-composer__plus"
            type="text"
            shape="circle"
            aria-label="上传参考资料"
            title="上传参考资料：TXT、MD、CSV、JSON 或 DOCX"
            disabled={composerBusy}
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={openMaterialPicker}
          />
          <Button
            className="official-document-composer__tool"
            type="text"
            disabled={composerBusy}
            icon={<FileDoc size={16} aria-hidden="true" />}
            onClick={openTemplates}
          >公文模板</Button>
          <Button
            className="official-document-composer__tool"
            type="text"
            aria-pressed={replicate !== null}
            title={replicate ? "换一份原文重新复刻" : "上传一篇范文，按它的内容框架写新的"}
            disabled={composerBusy}
            icon={<Files size={16} aria-hidden="true" />}
            onClick={() => setReplicateUploadOpen(true)}
          >内容复刻</Button>
        </>
      )}
      chips={composerChips}
      tail={(
        <>
          {voiceActive ? (
            <Button
              className="official-document-composer__icon"
              type="text"
              shape="circle"
              aria-label="取消语音输入"
              title="取消语音输入"
              icon={<X size={16} aria-hidden="true" />}
              onClick={cancelVoice}
            />
          ) : null}
          <Button
            className="official-document-composer__icon"
            type="text"
            shape="circle"
            aria-label={VOICE_LABELS[voiceState]}
            title={VOICE_LABELS[voiceState]}
            aria-pressed={voiceState === "recording"}
            disabled={voiceState === "permission" || voiceState === "processing"}
            icon={<Microphone size={18} aria-hidden="true" />}
            onClick={voiceInput.toggle}
          />
          {onSessionPage && generating ? (
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
              title={reference ? "生成完整公文" : "先选公文模板再生成"}
              disabled={composerBusy || !value.trim()}
              icon={<ArrowUp size={18} weight="bold" />}
              onClick={() => void submit()}
            />
          )}
        </>
      )}
      footnote={!onSessionPage && composerBusy
        ? "正在生成中，完成后可继续提交。"
        : "写作内容自动保留在当前标签页，可刷新后继续；正式留存请保存到我的文稿。"}
      onChange={(next) => {
        setValue(next);
        syncMention(next);
      }}
      onKeyDown={handleComposerKeyDown}
      onSelectionChange={() => syncMention(inputRef.current?.value ?? "")}
      onBlur={() => setMention(null)}
    />
  );

  /* 复刻时没选模板要当面说清：成稿按模板排成 Word，这一步躲不开，但不该靠置灰发送让人猜。 */
  const templateMissingNotice = replicateLayout && !reference ? (
    <XsStatusBar
      tone="warning"
      message="还没选公文模板"
      detail="成稿要按模板排成 Word：点输入框下方的「公文模板」选一份，或输入 @ 选择。"
      action={<Button size="small" onClick={openTemplates}>选择模板</Button>}
    />
  ) : null;

  const statusBars = (
    <>
      {voiceStatus ? <XsStatusBar tone={voiceStatus.tone} message={voiceStatus.message} transitionKey={voiceStatus.message} /> : null}
      {composerError ? <XsStatusBar tone="error" message={composerError} /> : null}
      {recoveryError ? <XsStatusBar tone="error" message={recoveryError} /> : null}
    </>
  );

  const homeExtras = (
    <>
      {engineDown ? (
        <XsStatusBar
          tone="warning"
          message="Word 引擎暂不可用"
          detail="新建模板、下载 Word/PDF 和排版预览会失败，写作和保存到我的文稿不受影响。请联系管理员检查 Word 引擎许可证或服务状态，恢复后刷新页面即可。"
        />
      ) : null}
      {replicate ? (
        <div className="official-document-compose__replicate-notice" role="group" aria-label="内容复刻进行中">
          <Files size={18} aria-hidden="true" />
          <span className="official-document-compose__replicate-notice-text">
            <span title={replicate.source.name}>内容复刻进行中：{replicate.source.name}</span>
            <small>{replicate.sections.length} 节框架 · 在这里提交也会按这份框架写</small>
          </span>
          <Button type="text" size="small" onClick={() => navigate(WRITING_SESSION_PATH)}>继续复刻</Button>
          <Button type="text" size="small" onClick={exitReplicate}>退出</Button>
        </div>
      ) : null}
      <WritingSessionNotice onOpen={() => navigate(WRITING_SESSION_PATH)} />
    </>
  );

  const recentDraftsBlock = recentDrafts.length ? (
    <section className="official-document-compose__recent" aria-labelledby="official-document-recent-title">
      <div className="official-document-compose__recent-head">
        <h3 id="official-document-recent-title">我的文稿</h3>
        <Link className="xs-action-link" to={OFFICIAL_DOCUMENT_DRAFTS_PATH} aria-label="查看全部文稿">
          更多
          <CaretRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="official-document-compose__recent-list">
        {recentDrafts.map((draft) => (
          <li key={draft.id}>
            <Link className="official-document-compose__recent-item" to={`${OFFICIAL_DOCUMENT_DRAFTS_PATH}/${draft.id}`}>
              <FileText size={16} aria-hidden="true" />
              <span title={draft.title}>{draft.title}</span>
              <time dateTime={draft.updatedAt}>{formatDate(draft.updatedAt)}</time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  const uploadedTemplateRecord = uploadedTemplate
    ? templates.find((template) => template.id === uploadedTemplate.id)
    : undefined;
  const uploadedTemplateNotice = (() => {
    if (!uploadedTemplate) return null;
    const template = uploadedTemplateRecord;
    if (!uploadedTemplate.persisted || !template) {
      return <XsStatusBar tone="warning" message={uploadedTemplate.message || "模板没有保存成功，请重新上传"} />;
    }
    const name = `《${template.name}》`;
    const detailAction = (label: string) => (
      <Button size="small" onClick={() => openTemplateDetail(template)}>{label}</Button>
    );
    if (template.status === "ANALYZING") {
      return <XsStatusBar tone="loading" message={`${name}正在分析结构`} detail="分析完成后要在模板详情里核对并发布，发布后才能用来写。" />;
    }
    if (template.status === "NEEDS_REVIEW") {
      return <XsStatusBar tone="info" message={`${name}已分析完，待发布`} detail="核对结构没问题就发布，发布后就能在这里使用。" action={detailAction("去发布")} />;
    }
    if (template.status === "FAILED" || template.status === "BLOCKED") {
      return <XsStatusBar tone="error" message={`${name}${template.status === "FAILED" ? "分析失败" : "有需要处理的问题"}`} action={detailAction("查看原因")} />;
    }
    if (templateFileIsMissing(template)) {
      return <XsStatusBar tone="warning" message={`${name}的文件已从服务器丢失，请重新上传`} />;
    }
    return (
      <XsStatusBar
        tone="success"
        message={`${name}已发布，可以使用`}
        action={<Button size="small" type="primary" onClick={() => applyTemplate(template)}>使用</Button>}
      />
    );
  })();

  const newTemplateButton = (label: string, primary = false) => (
    <Button
      type={primary ? "primary" : "default"}
      icon={<UploadSimple size={16} aria-hidden="true" />}
      disabled={engineDown}
      title={engineDown ? WORD_ENGINE_UNAVAILABLE_ACTION_HINT : "上传一份结构 DOCX，分析后发布为模板"}
      onClick={() => setUploadOpen(true)}
    >{label}</Button>
  );

  const templateModalNotice: ReactNode = (
    <>
      {engineDown ? (
        <XsStatusBar tone="warning" message="Word 引擎暂不可用，暂时不能新建模板" detail="已发布的模板照常可以使用。请联系管理员处理后再新建。" />
      ) : null}
      {uploadedTemplateNotice}
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
        error={query.error instanceof Error ? query.error.message : "无法加载公文模板和文稿。"}
        onRetry={() => void query.refetch()}
        loadingVariant="cards"
        /*
         * 不按 dataUpdatedAt 换 key：有模板在分析时列表每 2 秒轮询一次，
         * 换 key 会把整个写作台重挂——输入框和左侧框架正打着字就丢焦点。
         */
      >
        {/* 预览全文时让出左栏：公文本身比框架更需要地方，关掉预览框架就回来。 */}
        {replicateLayout && replicate && !viewer ? (
          <div className="official-document-compose__content official-document-compose__split xs-page-enter" data-replicate="">
            <ReplicateFrameworkPanel
              framework={replicate}
              busy={composerBusy}
              onChange={setReplicate}
              onReupload={() => setReplicateUploadOpen(true)}
              onExit={exitReplicate}
            />
            <div className="official-document-compose__split-main" data-conversation={hasSession || undefined}>
              {hasSession ? chatSection : (
                <div className="official-document-compose__replicate-intro">
                  <h2>按左侧框架写一篇新的</h2>
                  <p>
                    左边是从原文读出的内容框架，可以改标题、调层级、增删章节、写要点。
                    在下面说明这次要写什么，每次生成都按左侧最新的框架出稿；原文会作为参考资料一起发给模型。
                  </p>
                  {reference ? (
                    <p className="official-document-compose__replicate-template">
                      <FileDoc size={15} aria-hidden="true" />
                      成稿模板：{referenceTitle(reference)}
                    </p>
                  ) : null}
                </div>
              )}
              <div className="official-document-compose__composer-block">
                {templateMissingNotice}
                {composer}
                {statusBars}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="official-document-compose__content xs-page-enter"
            data-conversation={conversationVisible || undefined}
          >
            {!conversationVisible ? (
              <header>
                <img src={appWritingIcon} alt="" width={28} height={28} aria-hidden="true" />
                <h2>公文模板化复刻</h2>
              </header>
            ) : null}

            {conversationVisible ? chatSection : null}

            <div className="official-document-compose__composer-block">
              {composer}
              {/* 首页不展开会话，那边有活在跑、有成稿或复刻做到一半，就在这里给一条回去的路。 */}
              {!onSessionPage ? homeExtras : null}
              {statusBars}
            </div>

            {!conversationVisible && !onSessionPage ? recentDraftsBlock : null}
          </div>
        )}
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

      <Modal
        open={templatesOpen && onScreen}
        title="公文模板"
        width={1040}
        footer={null}
        centered
        destroyOnHidden
        className="official-document-template-modal"
        onCancel={closeTemplates}
      >
        <TemplateGallery
          label="模板库"
          templates={templates}
          autoFocusSearch
          notice={templateModalNotice}
          toolbarActions={newTemplateButton("新建模板")}
          empty={(
            <div className="official-document-compose__empty">
              <FileDoc size={28} aria-hidden="true" />
              <strong>还没有公文模板</strong>
              <p>上传一份结构 DOCX，分析并发布后就能在这里使用。</p>
              {newTemplateButton("新建模板", true)}
            </div>
          )}
          onUse={applyTemplate}
          onOpen={openTemplateDetail}
        />
      </Modal>

      <XsUploadDialog
        open={uploadOpen && onScreen}
        title="新建模板"
        description="上传一份结构 DOCX：自动做安全检查和结构分析，核对后发布即可使用；示例文字只用于识别结构。"
        accept={[".docx"]}
        acceptMimeTypes={[DOCX_MIME_TYPE]}
        maxBytes={25 * 1024 * 1024}
        submitLabel="上传并分析"
        hint="结构角色与问数槽位可在发布前校准"
        inputTestId="official-document-template-file"
        onUpload={handleUploadTemplate}
        onClose={() => setUploadOpen(false)}
      />

      <XsUploadDialog
        open={replicateUploadOpen && onScreen}
        title="内容复刻"
        description={replicate
          ? "上传新的原文会替换左侧当前的内容框架；已经生成的成稿保留在对话里。"
          : "上传一篇范文，读出它的章节框架。之后左边改框架、右边对话写新的，成稿仍按所选公文模板排版。"}
        accept={[".docx"]}
        acceptMimeTypes={[DOCX_MIME_TYPE]}
        maxBytes={MAX_DOCX_MATERIAL_BYTES}
        submitLabel="读取框架"
        hint={DOCX_PDF_UNSUPPORTED_MESSAGE}
        inputTestId="official-document-replicate-file"
        onUpload={handleReplicateUpload}
        onClose={() => setReplicateUploadOpen(false)}
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
              {viewer.state.savedDraft ? " · 已进入我的文稿" : " · 未保存"}
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
                >打开文稿</Button>
              ) : (
                <Button
                  size="small"
                  type="primary"
                  icon={<Star size={15} aria-hidden="true" />}
                  loading={busyAction?.turnId === viewer.turnId && busyAction.kind === "saving"}
                  onClick={() => void saveGeneratedArtifact(viewer.turnId)}
                >保存到我的文稿</Button>
              )}
              {renderDownload(viewer.turnId, "panel")}
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
              <Button
                size="small"
                disabled={engineDown}
                title={engineDown ? WORD_ENGINE_UNAVAILABLE_ACTION_HINT : undefined}
                onClick={() => void ensurePreview(viewer.turnId)}
              >重新渲染</Button>
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
