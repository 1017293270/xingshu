import {
  ArrowsClockwise,
  AsteriskSimple,
  CaretDown,
  CaretUp,
  Check,
  CircleNotch,
  Copy,
  DownloadSimple,
  FileText,
  PaperPlaneTilt,
  Star,
  StopCircle,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import { Button, Dropdown, Mentions } from "antd";
import type { MentionsOptionProps } from "antd/es/mentions";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  XsArtifactCard,
  XsChatActionButton,
  XsChatActions,
  XsChatAssistant,
  XsChatTurn,
  XsChatUserBubble,
  XsComposerBox,
  XsSidePanel
} from "@/components/xs/conversation";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { copyText } from "@/services/clipboard";
import { resolveDataHubFinalAnswer } from "@/services/dataHubAskDataPresenter";
import {
  createOfficialDocumentDraft,
  downloadOfficialDocumentExport,
  exportOfficialDocumentDraft,
  exportOfficialDocumentTransient,
  getOfficialDocumentDraftContent,
  getOfficialDocumentDraftPreview,
  getOfficialDocumentTransientPreview,
  type OfficialDocumentTransientArtifactInput,
  updateOfficialDocumentDraftContent
} from "@/services/officialDocumentService";
import {
  buildOfficialDocumentPreviewLines,
  buildOfficialDocumentReferenceWritingPlan,
  MAX_REFERENCE_REQUIREMENT_CHARS,
  parseOfficialDocumentReferenceGeneration,
  stripOfficialDocumentAnchors,
  type OfficialDocumentPreviewLine,
  type OfficialDocumentReferenceFixedField,
  type OfficialDocumentReferenceWritingPlan
} from "@/services/officialDocumentFullDraft";
import type {
  OfficialDocumentDraft,
  OfficialDocumentExportFormat,
  OfficialDocumentStructureNode,
  OfficialDocumentTemplate
} from "@/types/officialDocument";
import { formatDate, operationErrorMessage, useUpdateOfficialDocumentWorkspaceCache } from "./officialDocumentMeta";
import { useOfficialDocumentAppChrome } from "./OfficialDocumentAppShell";
import { useOfficialDocumentWorkspace } from "./useOfficialDocumentWorkspace";
import { useWritingChat } from "./useWritingChat";

/** 参考草稿只决定下一轮的 writingContext，会话本身不跟着换，所以 key 固定。 */
const COMPOSE_CHAT_KEY = "compose";

const RETRY_HINT = "请严格按 [[XS_FIXED:slot-id]] 和 [[XS_SECTION:section-id]] 锚点输出完整公文，章节不得新增或遗漏。";

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

/** 每一轮的产物状态。轮次顺序、问题和 streaming/done/error 一律以 messages 为准。 */
type ComposeTurnState = {
  requirement: string;
  reference: { draftTitle: string; templateName: string };
  version: number;
  plan: OfficialDocumentReferenceWritingPlan;
  referenceDraft: OfficialDocumentDraft;
  template: OfficialDocumentTemplate;
  templateNodes: OfficialDocumentStructureNode[];
  artifact?: GeneratedArtifact;
  savedDraft?: OfficialDocumentDraft;
  recoveryDraft?: OfficialDocumentDraft;
  parseError?: string;
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
  draftTitle: string;
  templateName: string;
};

type DraftMentionOption = MentionsOptionProps & {
  key: string;
  searchText: string;
};

const EMPTY_FIXED_FIELDS: OfficialDocumentReferenceFixedField[] = [];
const EMPTY_DRAFTS: OfficialDocumentDraft[] = [];
const EMPTY_TEMPLATES: OfficialDocumentTemplate[] = [];

function removeSelectedMention(value: string, optionValue: string) {
  const mention = `@${optionValue}`;
  const index = value.lastIndexOf(mention);
  if (index < 0) return value;
  return `${value.slice(0, index)}${value.slice(index + mention.length)}`.replace(/ {2,}/g, " ").trimStart();
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

export function OfficialDocumentComposeView() {
  const navigate = useNavigate();
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const { query, status } = useOfficialDocumentWorkspace();
  const [value, setValue] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [turnStates, setTurnStates] = useState<Record<string, ComposeTurnState>>({});
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission>();
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [composerError, setComposerError] = useState("");
  const [viewerTurnId, setViewerTurnId] = useState("");
  const finalizedTurnsRef = useRef(new Set<string>());
  const drafts = query.data?.drafts ?? EMPTY_DRAFTS;
  const templates = query.data?.templates ?? EMPTY_TEMPLATES;
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId);
  const { messages, busy: writingBusy, send, stop } = useWritingChat(COMPOSE_CHAT_KEY);
  const composerBusy = writingBusy || Boolean(pendingSubmission);
  const conversationVisible = messages.length > 0 || Boolean(pendingSubmission);

  useOfficialDocumentAppChrome({ stage: "compose", context: "公文写作" });

  const scrollSignature = messages
    .map((message) => `${message.id}:${message.status}:${message.ask.assistantContent.length}`)
    .join("|");
  const conversation = useStickToBottom<HTMLDivElement>({
    signature: `${scrollSignature}|${pendingSubmission ? "pending" : ""}`,
    enabled: conversationVisible
  });

  useEffect(() => {
    if (selectedDraftId && query.data && !selectedDraft) setSelectedDraftId("");
  }, [query.data, selectedDraft, selectedDraftId]);

  const turnStatesRef = useRef(turnStates);
  turnStatesRef.current = turnStates;
  useEffect(() => () => {
    for (const state of Object.values(turnStatesRef.current)) {
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    }
  }, []);

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

  const mentionOptions = useMemo<DraftMentionOption[]>(() => [
    {
      key: "draft-picker-heading",
      value: "draft-picker-heading",
      disabled: true,
      searchText: "",
      label: (
        <span className="official-document-compose__mention-heading">
          <strong>选择参考草稿</strong><small>按更新时间排序</small>
        </span>
      )
    },
    ...drafts.map((draft) => ({
      key: draft.id,
      value: draft.title,
      searchText: `${draft.title} ${draft.templateName}`.toLocaleLowerCase(),
      label: (
        <span className="official-document-compose__mention-option" data-selected={draft.id === selectedDraftId || undefined}>
          <span className="official-document-compose__mention-icon"><FileText size={16} aria-hidden="true" /></span>
          <span><strong>{draft.title}</strong><small>{draft.templateName} · {formatDate(draft.updatedAt)}</small></span>
          {draft.id === selectedDraftId ? <Check size={15} weight="bold" aria-hidden="true" /> : null}
        </span>
      )
    }))
  ], [drafts, selectedDraftId]);

  /**
   * 每一轮结束都试着解析成公文结构；解析不了不再弹红错，而是把回答当普通文字留在对话里，
   * 让用户自己决定是不是要「重出完整版」——多轮追问下解析失败会变常见，红错会淹掉对话。
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
      try {
        const generated = parseOfficialDocumentReferenceGeneration({
          markdown: answer,
          referenceDraftTitle: state.referenceDraft.title,
          sections: state.plan.sections,
          fixedFields: state.plan.fixedFields,
          templateNodes: state.templateNodes
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
              artifact: {
                templateId: existing.referenceDraft.templateId,
                templateVersionId: existing.referenceDraft.templateVersionId,
                templateName: existing.template.name,
                title: generated.title,
                fixedValues: generated.fixedValues,
                blocks: generated.blocks
              }
            }
          };
        });
      } catch (caught) {
        patchTurn(message.id, { raw: answer, parseError: operationErrorMessage(caught), expanded: true });
      }
    }
    // One completed Agent turn becomes a local artifact; persistence is an explicit user action.
  }, [messages, turnStates]);

  const runGeneration = async (
    requirement: string,
    referenceDraft: OfficialDocumentDraft,
    template: OfficialDocumentTemplate,
    extraInstruction = ""
  ) => {
    setPendingSubmission({
      requirement,
      draftTitle: referenceDraft.title,
      templateName: referenceDraft.templateName
    });
    try {
      const content = await getOfficialDocumentDraftContent(referenceDraft.id);
      const templateNodes = template.currentVersion.analysis!.structureNodes;
      const plan = buildOfficialDocumentReferenceWritingPlan({
        referenceDraft: {
          id: referenceDraft.id,
          title: referenceDraft.title,
          templateName: referenceDraft.templateName
        },
        content,
        templateNodes,
        userRequirement: requirement
      });
      const turnId = send(
        extraInstruction ? `${requirement}\n\n${extraInstruction}` : requirement,
        { writingContext: plan.writingContext, purpose: "full-draft", displayQuestion: requirement }
      );
      if (!turnId) throw new Error("写作会话正在处理其他任务，请稍后再试");
      setTurnStates((current) => ({
        ...current,
        [turnId]: {
          requirement,
          reference: { draftTitle: referenceDraft.title, templateName: referenceDraft.templateName },
          version: 0,
          plan,
          referenceDraft,
          template,
          templateNodes
        }
      }));
      setPendingSubmission(undefined);
    } catch (caught) {
      setPendingSubmission(undefined);
      setComposerError(operationErrorMessage(caught));
      setValue((current) => current || requirement);
    }
  };

  const resolveTemplate = (draft: OfficialDocumentDraft) => templates.find((item) => (
    item.id === draft.templateId && item.currentVersion.id === draft.templateVersionId
  ));

  const submit = async () => {
    const requirement = value.trim();
    if (composerBusy) return;
    if (!selectedDraft) {
      setComposerError("请先输入 @ 并选择一个参考草稿");
      return;
    }
    if (!requirement) {
      setComposerError("请描述要生成的公文内容");
      return;
    }
    const template = resolveTemplate(selectedDraft);
    if (!template?.currentVersion.analysis) {
      setComposerError("参考草稿绑定的模板结构不可用，请先在结构模板中检查该版本");
      return;
    }

    setComposerError("");
    setValue("");
    await runGeneration(requirement, selectedDraft, template);
  };

  /** 重试、重新生成、停止后继续、重出完整版都是「用同一要求再来一轮」。 */
  const regenerate = async (turnId: string, extraInstruction = "") => {
    const state = turnStates[turnId];
    if (!state || composerBusy) return;
    setComposerError("");
    await runGeneration(state.requirement, state.referenceDraft, state.template, extraInstruction);
  };

  const cancel = () => {
    if (!writingBusy) return;
    stop();
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
      await updateOfficialDocumentDraftContent(created.id, {
        expectedRevision: initial.revision,
        fixedValues: initial.fixedValues.map((item) => ({
          ...item,
          value: generatedFixedValues.get(item.slotId) ?? ""
        })),
        blocks: state.artifact.blocks
      });
      patchTurn(turnId, {
        savedDraft: created,
        status: { tone: "success", message: "已保存到草稿箱" }
      });
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

  const renderArtifact = (turnId: string, state: ComposeTurnState) => {
    if (!state.artifact) return null;
    const previewing = Boolean(state.previewLoading);
    const saving = busyAction?.turnId === turnId && busyAction.kind === "saving";
    const exporting = busyAction?.turnId === turnId && busyAction.kind === "exporting";

    return (
      <XsArtifactCard
        label="生成的公文文件"
        icon={<FileText size={24} aria-hidden="true" />}
        eyebrow={previewing ? "正在渲染…" : state.savedDraft ? "已保存 · 点击浏览" : "临时成稿 · 点击浏览"}
        title={state.artifact.title}
        badge={state.version > 1 ? `v${state.version}` : undefined}
        meta={`${state.artifact.templateName} · ${state.savedDraft ? "已进入草稿箱" : "未保存"}`}
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
            <p>正在按参考草稿生成完整公文…</p>
            <small><CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />正在处理</small>
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
              <AsteriskSimple size={40} weight="bold" aria-hidden="true" />
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
                      meta={state ? (
                        <>
                          <FileText size={14} aria-hidden="true" />
                          @{state.reference.draftTitle} · {state.reference.templateName}
                        </>
                      ) : undefined}
                    >
                      {message.question}
                    </XsChatUserBubble>
                    <XsChatAssistant error={message.status === "error"}>
                      {renderAssistantTurn(message)}
                    </XsChatAssistant>
                  </XsChatTurn>
                );
              })}

              {pendingSubmission ? (
                <XsChatTurn>
                  <XsChatUserBubble
                    meta={(
                      <>
                        <FileText size={14} aria-hidden="true" />
                        @{pendingSubmission.draftTitle} · {pendingSubmission.templateName}
                      </>
                    )}
                  >
                    {pendingSubmission.requirement}
                  </XsChatUserBubble>
                  <XsChatAssistant>
                    <p>正在读取“{pendingSubmission.draftTitle}”的结构与文风…</p>
                    <small>
                      <CircleNotch className="xs-chat__spinner" size={15} aria-hidden="true" />
                      正在处理
                    </small>
                  </XsChatAssistant>
                </XsChatTurn>
              ) : null}
            </section>
          ) : null}

          {drafts.length ? (
            <XsComposerBox
              className="official-document-compose__box"
              mode={conversationVisible ? "chat" : "hero"}
              busy={composerBusy}
              showScrollToBottom={conversationVisible && conversation.showScrollToBottom}
              onScrollToBottom={conversation.scrollToBottom}
              chip={selectedDraft ? (
                <div className="official-document-compose__reference" aria-label="已选择参考草稿">
                  <FileText size={17} aria-hidden="true" />
                  <span><strong>@{selectedDraft.title}</strong><small>{selectedDraft.templateName}</small></span>
                  <button
                    type="button"
                    aria-label="移除参考草稿"
                    disabled={composerBusy}
                    onClick={() => {
                      setSelectedDraftId("");
                      setComposerError("");
                    }}
                  ><X size={14} aria-hidden="true" /></button>
                </div>
              ) : undefined}
              toolbarLead={<><b>@</b> {conversationVisible ? "更换参考草稿" : "选择参考草稿"}</>}
              toolbarTail={writingBusy ? (
                <Button
                  danger
                  type="text"
                  icon={<StopCircle size={18} weight="fill" />}
                  onClick={cancel}
                >停止</Button>
              ) : (
                <Button
                  type="primary"
                  shape="circle"
                  aria-label="生成完整公文"
                  disabled={composerBusy || !selectedDraft || !value.trim()}
                  icon={<PaperPlaneTilt size={18} weight="fill" />}
                  onClick={() => void submit()}
                />
              )}
              footnote="生成结果先保留在当前会话，确认后再保存到草稿箱。"
            >
              <Mentions
                className="official-document-compose__input"
                aria-label="公文写作要求"
                value={value}
                autoSize={{ minRows: conversationVisible ? 1 : 2, maxRows: 6 }}
                maxLength={MAX_REFERENCE_REQUIREMENT_CHARS}
                disabled={composerBusy}
                placeholder={conversationVisible ? "继续描述，输入 @ 更换参考草稿" : "描述你想写的公文，输入 @ 选择参考草稿"}
                options={mentionOptions}
                placement="bottom"
                popupClassName="official-document-compose-mentions"
                notFoundContent="没有匹配的草稿"
                filterOption={(keyword, option) => (
                  option.key === "draft-picker-heading"
                    ? !keyword
                    : String((option as DraftMentionOption).searchText).includes(keyword.toLocaleLowerCase())
                )}
                onChange={setValue}
                onSelect={(option) => {
                  setSelectedDraftId(String(option.key));
                  setValue((current) => removeSelectedMention(current, String(option.value)));
                  setComposerError("");
                }}
                onPressEnter={(event) => {
                  if (event.shiftKey) return;
                  event.preventDefault();
                  void submit();
                }}
              />
            </XsComposerBox>
          ) : (
            <div className="official-document-compose__empty">
              <FileText size={28} aria-hidden="true" />
              <strong>还没有可参考的草稿</strong>
              <p>先从一个已发布结构创建草稿，准备好后即可在这里 @ 使用。</p>
              <Button type="primary" onClick={() => navigate("/writing/templates")}>去结构模板</Button>
            </div>
          )}

          {composerError ? <XsStatusBar tone="error" message={composerError} /> : null}
        </div>
      </XsAsyncPanel>

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
