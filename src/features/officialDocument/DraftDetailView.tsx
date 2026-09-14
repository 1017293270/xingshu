import {
  FileText,
  FloppyDisk,
  LinkSimple,
  ListChecks,
  Sparkle
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Drawer, Modal, Tag } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import {
  bindOfficialDocumentContentProfile,
  detachOfficialDocumentBinding,
  downloadOfficialDocumentExport,
  exportOfficialDocumentDraft,
  getOfficialDocumentContentProfile,
  loadOfficialDocumentWorkspace,
  refreshOfficialDocumentBindings,
  updateOfficialDocumentDraftContent
} from "@/services/officialDocumentService";
import type {
  DraftDataBinding,
  OfficialDocumentContentProfile,
  OfficialDocumentDraftContent,
  OfficialDocumentDraftContentVersion,
  OfficialDocumentExportFormat,
  OfficialDocumentExportRecord
} from "@/types/officialDocument";
import {
  buildOfficialDocumentWritingContext,
  parseOfficialDocumentFullDraft,
  reviewOfficialDocumentDraftFacts,
  type OfficialDocumentFullDraftPreview,
  type OfficialDocumentWritingAction
} from "@/services/officialDocumentFullDraft";
import {
  MAX_OFFICIAL_DOCUMENT_CHARTS,
  type OfficialDocumentGeneratedDataAsset
} from "@/services/officialDocumentResearchService";
import {
  StructuredDraftEditor,
  type StructuredDraftEditorHandle,
  type StructuredDraftSaveState
} from "./StructuredDraftEditor";
import { WritingChatPanel } from "./WritingChatPanel";
import { DraftHistoryPanel } from "./DraftHistoryPanel";
import { officialDocumentContentText } from "@/services/officialDocumentFactReview";
import { DraftResearchPanel } from "./DraftResearchPanel";
import { ContentProfileWorkspace } from "./ContentProfileWorkspace";
import {
  bindingsAreExportable,
  draftStatusAllowsExport,
  formatDate,
  operationErrorMessage,
  useOfficialDocumentWorkspaceKey,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import {
  OFFICIAL_DOCUMENT_DRAFTS_PATH,
  OfficialDocumentAppActions,
  useOfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";
import "./official-document.css";

function canDetachBinding(binding: DraftDataBinding) {
  return binding.status !== "MANUAL" && Boolean(binding.snapshotId?.trim())
    && binding.resolvedValue !== undefined && binding.resolvedValue !== null;
}

function DraftNotFound() {
  return (
    <div className="official-document-detail__empty xs-card xs-page-enter">
      <FileText size={30} aria-hidden="true" />
      <strong>未找到该报告草稿</strong>
      <p>草稿可能已被移除，或不属于当前登录用户。</p>
      <Link to={OFFICIAL_DOCUMENT_DRAFTS_PATH}>返回草稿箱</Link>
    </div>
  );
}

export function DraftDetailView({ draftId }: { draftId: string }) {
  const workspaceKey = useOfficialDocumentWorkspaceKey();
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const [operationStatus, setOperationStatus] = useState("");
  const [operationTone, setOperationTone] = useState<XsStatusTone>("info");
  const [contentSaveState, setContentSaveState] = useState<StructuredDraftSaveState>("loading");
  const [isRefreshingBindings, setIsRefreshingBindings] = useState(false);
  const [detachingBindingId, setDetachingBindingId] = useState<string>();
  const [isExporting, setIsExporting] = useState<OfficialDocumentExportFormat>();
  const [isSaving, setIsSaving] = useState(false);
  const [latestExports, setLatestExports] = useState<Record<string, OfficialDocumentExportRecord>>({});
  const [inspectorOpen, setInspectorOpen] = useState(false);
  /* 窄屏没有第三栏的位置，智写折成抽屉；宽屏常驻。 */
  const [chatOpen, setChatOpen] = useState(false);
  const [contentProfileOpen, setContentProfileOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [factReviewOpen, setFactReviewOpen] = useState(false);
  const [isReviewingFacts, setIsReviewingFacts] = useState(false);
  const [draftContent, setDraftContent] = useState<OfficialDocumentDraftContent>();
  const [generationRequest, setGenerationRequest] = useState(0);
  const [fullDraftPreview, setFullDraftPreview] = useState<OfficialDocumentFullDraftPreview>();
  const [isApplyingFullDraft, setIsApplyingFullDraft] = useState(false);
  const editorRef = useRef<StructuredDraftEditorHandle>(null);

  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    queryFn: loadOfficialDocumentWorkspace
  });
  const workspaceStatus = resolveXsAsyncStatus({
    isPending: workspaceQuery.isPending,
    isFetching: workspaceQuery.isFetching,
    isError: workspaceQuery.isError,
    hasData: workspaceQuery.data !== undefined
  });
  const draft = useMemo(
    () => workspaceQuery.data?.drafts.find((item) => item.id === draftId),
    [workspaceQuery.data, draftId]
  );
  const draftTemplate = useMemo(
    () => draft
      ? workspaceQuery.data?.templates.find((template) => template.id === draft.templateId
        && template.currentVersion.id === draft.templateVersionId)
      : undefined,
    [workspaceQuery.data, draft]
  );
  const contentProfileQuery = useQuery({
    queryKey: ["official-document", "content-profile", draft?.contentProfileId ?? "legacy"],
    queryFn: () => getOfficialDocumentContentProfile(draft!.contentProfileId!),
    enabled: Boolean(draft?.contentProfileId)
  });
  const contentProfile = contentProfileQuery.data;
  const structureTemplateName = draftTemplate?.name ?? draft?.templateName ?? "报告模板";
  const structureVersionNo = draftTemplate?.currentVersion.versionNo;

  useEffect(() => {
    setContentSaveState("loading");
    setDraftContent(undefined);
    setFullDraftPreview(undefined);
  }, [draftId]);

  useOfficialDocumentAppChrome({
    stage: "draft",
    context: draft?.title ?? "编辑草稿",
    contextDetail: draft
      ? `格式模板：${structureTemplateName} · ${structureVersionNo ? `v${structureVersionNo}` : "版本不可用"}`
      : undefined
  });

  const bindingsReady = draft ? bindingsAreExportable(draft.bindings) : true;
  const statusAllowsExport = draft ? draftStatusAllowsExport(draft.status) : false;
  const pdfExportAvailable = (workspaceQuery.data?.capabilities.exportFormats ?? ["DOCX", "PDF"]).includes("PDF")
    && !(workspaceQuery.data?.capabilities.wordEngine.detail ?? "").includes("LIBREOFFICE");
  const canExportDocx = draft?.source === "LIVE"
    && statusAllowsExport
    && contentSaveState === "saved"
    && bindingsReady;
  const canExportPdf = canExportDocx && pdfExportAvailable;
  const exportDisabledReason = !draft
    ? undefined
    : contentSaveState !== "saved"
      ? "草稿内容保存完成后才能导出"
      : !statusAllowsExport
        ? "草稿通过服务端校验后才能导出"
        : !bindingsReady
          ? "请在导出检查中处理未就绪的问数绑定"
          : draft.source !== "LIVE"
            ? "正式服务不可用，不能导出"
            : undefined;
  const pdfDisabledReason = exportDisabledReason
    ?? (canExportDocx && !pdfExportAvailable ? "PDF 暂时不能生成，请先导出 Word" : undefined);
  const latestExport = draft ? latestExports[draft.id] : undefined;
  const templateNodes = useMemo(
    () => draftTemplate?.currentVersion.analysis?.structureNodes ?? [],
    [draftTemplate]
  );
  const researchResults = draftContent?.researchResults ?? [];
  const terminalResearchStatuses = new Set(["SUCCESS", "NO_RESULT", "FAILED", "SKIPPED"]);
  const requiredResearchBlocked = researchResults.some((result) => result.required
    && !["SUCCESS", "SKIPPED"].includes(result.status));
  const researchReady = researchResults.every((result) => terminalResearchStatuses.has(result.status))
    && !requiredResearchBlocked;
  const resolveWritingContext = useCallback((action: OfficialDocumentWritingAction) => {
    const content = editorRef.current?.getContent() ?? draftContent;
    if (!content) return undefined;
    try {
      return buildOfficialDocumentWritingContext({
        action,
        profile: contentProfile,
        content,
        templateNodes,
        document: {
          title: draft?.title ?? "",
          templateName: structureTemplateName
        }
      });
    } catch {
      return undefined;
    }
  }, [contentProfile, draft, draftContent, structureTemplateName, templateNodes]);
  const sectionOptions = useMemo(() => {
    const blocks = draftContent?.blocks ?? [];
    const plan = contentProfile?.profile.confirmedPlan;
    const existing = new Set(blocks.map((block) => block.sectionId).filter(Boolean));
    return [...(plan?.sections ?? [])]
      .sort((left, right) => left.order - right.order)
      .filter((section) => existing.has(section.id))
      .map((section) => ({
        value: section.id,
        label: section.title,
        searchText: [
          section.purpose,
          ...section.keyPoints,
          ...blocks.filter((block) => block.sectionId === section.id).map((block) => block.text),
          ...(plan?.researchNeeds ?? []).filter((need) => need.sectionId === section.id).map((need) => need.question)
        ].join(" ")
      }));
  }, [contentProfile, draftContent]);
  const standaloneChartCount = (draftContent?.blocks ?? []).filter((block) => (
    block.role === "CHART_IMAGE" && !(block.sourceTaskIds?.length)
  )).length;
  const researchChartCount = researchResults.filter((result) => Boolean(result.chart)).length;
  const chartAllowed = standaloneChartCount + researchChartCount < MAX_OFFICIAL_DOCUMENT_CHARTS;
  const canGenerateFullDraft = Boolean(contentProfile && draftContent) && researchReady;
  const generateDisabledReason = !contentProfile
    ? "草稿没有可用的已确认内容方案"
    : !draftContent
      ? "草稿内容仍在加载"
      : !researchReady
        ? "请先完成资料补全，必需任务失败时需重试或保留待补充"
        : undefined;

  const announce = (tone: XsStatusTone, message: string) => {
    setOperationTone(tone);
    setOperationStatus(message);
  };

  const handleSave = async () => {
    if (!editorRef.current || isSaving) return;
    setIsSaving(true);
    try {
      await editorRef.current.save();
      announce("success", "草稿已保存");
      void workspaceQuery.refetch();
    } catch (error) {
      announce("error", `保存失败：${operationErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const restoreHistoricalContent = async (version: OfficialDocumentDraftContentVersion) => {
    const editor = editorRef.current;
    if (!editor || !draft) throw new Error("草稿编辑器尚未就绪");
    await editor.save();
    const current = editor.getContent();
    if (!current) throw new Error("当前正文尚未加载");
    const restored = await updateOfficialDocumentDraftContent(draft.id, {
      expectedRevision: current.revision, restoreRevision: version.revision,
      fixedValues: version.content.fixedValues, blocks: version.content.blocks
    });
    await editor.reload();
    setDraftContent(editor.getContent() ?? restored);
    await workspaceQuery.refetch();
  };

  const reviewFacts = async (confirm: boolean) => {
    const editor = editorRef.current;
    if (!editor || isReviewingFacts) return;
    setIsReviewingFacts(true);
    try {
      await editor.save();
      const content = editor.getContent();
      if (!content) throw new Error("当前正文尚未加载");
      const textSnapshot = officialDocumentContentText(content);
      const context = resolveWritingContext("FULL_DRAFT") ?? {
        sourceBlocks: contentProfile?.profile.source?.blocks ?? [], researchResults: content.researchResults ?? []
      };
      const reviewedAt = new Date().toISOString();
      await editor.saveFactReview({ reviewedAt, textSnapshot,
        issues: reviewOfficialDocumentDraftFacts(textSnapshot, context),
        ...(confirm ? { confirmedAt: reviewedAt } : {})
      });
      announce("success", confirm ? "已记录你对当前正文来源的核对。" : "已更新事实校对提示；请结合原始来源判断。" );
    } catch (error) { announce("error", operationErrorMessage(error)); }
    finally { setIsReviewingFacts(false); }
  };

  const handleInsertFromChat = (text: string) => {
    const inserted = editorRef.current?.appendText(text) ?? 0;
    announce(
      inserted ? "success" : "error",
      inserted ? `已插入 ${inserted} 个结构化节点，正在自动保存。` : "这段回答没有可插入的正文。"
    );
  };

  const handleInsertDataAsset = async (input: {
    question: string;
    sectionId?: string;
    result: OfficialDocumentGeneratedDataAsset;
  }) => {
    const editor = editorRef.current;
    const content = editor?.getContent();
    if (!editor || !content) throw new Error("草稿编辑器尚未就绪");
    if (!input.result.table || !input.result.querySource) throw new Error("查询结果缺少可回填的数据表");
    const blocks = [...content.blocks];
    let insertionIndex = blocks.length;
    if (input.sectionId) {
      const indices = blocks
        .map((block, index) => block.sectionId === input.sectionId ? index : -1)
        .filter((index) => index >= 0);
      if (!indices.length) throw new Error("目标章节已被删除，请重新选择回填位置");
      insertionIndex = Math.max(...indices) + 1;
    }
    const generated: OfficialDocumentDraftContent["blocks"] = [{
      id: crypto.randomUUID(),
      order: insertionIndex,
      role: "TABLE",
      variantId: "",
      sectionId: input.sectionId,
      sourceTaskIds: [],
      text: input.question,
      table: input.result.table,
      source: input.result.querySource
    }];
    const currentStandaloneCharts = blocks.filter((block) => (
      block.role === "CHART_IMAGE" && !(block.sourceTaskIds?.length)
    )).length;
    const currentResearchCharts = (content.researchResults ?? []).filter((result) => Boolean(result.chart)).length;
    const includeChart = Boolean(input.result.chart) && currentStandaloneCharts + currentResearchCharts < 3;
    if (input.result.chart && includeChart) {
      generated.push({
        id: crypto.randomUUID(),
        order: insertionIndex + 1,
        role: "CHART_IMAGE",
        variantId: "",
        sectionId: input.sectionId,
        sourceTaskIds: [],
        text: input.result.chart.altText,
        chart: input.result.chart,
        source: input.result.querySource
      });
    }
    blocks.splice(insertionIndex, 0, ...generated);
    await editor.applyBlocks(blocks);
    announce(
      "success",
      input.result.chart && !includeChart
        ? "数据表已回填；草稿已达到3张图表上限，本次未插入图表。"
        : `数据表${includeChart ? "和图表" : ""}已回填到${input.sectionId ? "所选章节" : "文末"}。`
    );
  };

  const persistResearchResults = async (results: NonNullable<OfficialDocumentDraftContent["researchResults"]>) => {
    const editor = editorRef.current;
    if (!editor) throw new Error("草稿编辑器尚未就绪");
    await editor.saveResearchResults(results);
  };

  const bindContentProfile = async (profile: OfficialDocumentContentProfile) => {
    if (!draft || !draftContent) throw new Error("草稿内容仍在加载");
    if (contentSaveState !== "saved") throw new Error("请等待草稿内容保存完成后再绑定内容方案");
    const saved = await bindOfficialDocumentContentProfile(draft.id, {
      expectedRevision: draftContent.revision,
      contentProfileId: profile.id
    });
    setDraftContent(saved);
    updateWorkspaceCache((current) => ({
      ...current,
      drafts: current.drafts.map((item) => item.id === draft.id
        ? { ...item, contentProfileId: profile.id, contentProfileName: profile.name }
        : item)
    }));
    setContentProfileOpen(false);
    announce("success", "内容方案已绑定，正文和资料补全任务已初始化。");
  };

  const requestFullDraftGeneration = () => {
    if (!resolveWritingContext("FULL_DRAFT") || !researchReady) {
      announce("error", generateDisabledReason || "当前不能生成全文");
      return;
    }
    setResearchOpen(false);
    setChatOpen(true);
    setGenerationRequest((current) => current + 1);
    announce("loading", "正在根据结构、内容方案和资料结果生成完整正文");
  };

  const previewGeneratedFullDraft = (markdown: string) => {
    if (!contentProfile) return;
    try {
      const preview = parseOfficialDocumentFullDraft({
        markdown,
        profile: contentProfile,
        results: researchResults,
        templateNodes,
        currentBlocks: editorRef.current?.getContent()?.blocks ?? draftContent?.blocks
      });
      setFullDraftPreview(preview);
      announce("success", "全文已生成，请核对章节、原始内容、资料来源和待补充项后确认应用。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    }
  };

  const applyGeneratedFullDraft = async () => {
    if (!fullDraftPreview || isApplyingFullDraft) return;
    const editor = editorRef.current;
    if (!editor) return;
    setIsApplyingFullDraft(true);
    try {
      await editor.applyBlocks(fullDraftPreview.blocks);
      setFullDraftPreview(undefined);
      announce("success", "全文已一次性应用；固定字段和结构模板静态版式保持不变。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsApplyingFullDraft(false);
    }
  };

  const handleDetachBinding = async (binding: DraftDataBinding) => {
    if (!draft || detachingBindingId || !canDetachBinding(binding)) return;
    setDetachingBindingId(binding.id);
    try {
      const detached = await detachOfficialDocumentBinding(draft.id, binding.id);
      updateWorkspaceCache((current) => ({
        ...current,
        drafts: current.drafts.map((item) => item.id === draft.id
          ? {
              ...item,
              bindings: item.bindings.map((existing) => existing.id === detached.id
                ? { ...detached, queryAssetName: existing.queryAssetName }
                : existing)
            }
          : item)
      }));
      announce("success", "问数绑定已转为普通文本，当前值保留在报告中。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setDetachingBindingId(undefined);
    }
  };

  const handleRefreshBindings = async () => {
    if (!draft || isRefreshingBindings) return;
    setIsRefreshingBindings(true);
    announce("loading", "正在按固定 QueryVersion 刷新全部问数快照");
    try {
      const names = new Map(draft.bindings.map((binding) => [binding.queryAssetId, binding.queryAssetName]));
      const bindings = (await refreshOfficialDocumentBindings(draft.id)).map((binding) => ({
        ...binding,
        queryAssetName: names.get(binding.queryAssetId)
      }));
      updateWorkspaceCache((current) => ({
        ...current,
        drafts: current.drafts.map((item) => item.id === draft.id ? { ...item, bindings } : item)
      }));
      const unresolved = bindings.filter((binding) => binding.status !== "ACTIVE" && binding.status !== "MANUAL");
      announce(unresolved.length ? "warning" : "success", unresolved.length
        ? `${unresolved.length} 个绑定未刷新成功，可稍后重试。${unresolved.some(canDetachBinding)
          ? "已保留的上次有效值可在“导出检查”中转为普通文本继续使用。" : "请检查查询结果或数据访问权限。"}`
        : "全部问数绑定已刷新并冻结为新快照。"
      );
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsRefreshingBindings(false);
    }
  };

  const handleExport = async (format: OfficialDocumentExportFormat) => {
    if (!draft || isExporting || (format === "PDF" ? !canExportPdf : !canExportDocx)) return;
    setIsExporting(format);
    announce("loading", format === "PDF" ? "正在生成 PDF" : "正在生成 Word");
    try {
      const normalized = await editorRef.current?.normalizeForExport();
      if (normalized) {
        announce("loading", `已修正 ${normalized} 个标题或样式节点，正在生成${format === "PDF" ? " PDF" : " Word"}`);
      }
      const record = await exportOfficialDocumentDraft(draft.id, format);
      setLatestExports((current) => ({ ...current, [draft.id]: record }));
      if (record.status !== "GENERATED") {
        announce("error", record.message ?? "导出未完成，请稍后重试");
        return;
      }
      const blob = await downloadOfficialDocumentExport(record.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = draft.title.replace(/[^\p{L}\p{N}._-]+/gu, "_");
      anchor.href = url;
      anchor.download = `${safeTitle || "official-document"}.${format.toLocaleLowerCase()}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      announce("success", format === "PDF" ? "PDF 已生成，下载已开始。" : "Word 已生成，下载已开始。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsExporting(undefined);
    }
  };

  return (
    <div className="official-document-detail">
      <XsAsyncPanel
        className="official-document-canvas-panel"
        status={workspaceStatus}
        empty={false}
        errorTitle="报告草稿不可用"
        error={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "无法加载报告草稿。"}
        onRetry={() => void workspaceQuery.refetch()}
        loadingVariant="cards"
        contentKey={draftId}
      >
        {!draft ? <DraftNotFound /> : (
          <>
            {operationStatus ? (
              <XsStatusBar
                tone={operationTone}
                message={operationStatus}
                transitionKey={`${operationTone}:${operationStatus}`}
              />
            ) : null}

            <div
              className="official-document-draft-workspace xs-page-enter"
              data-chat-open={chatOpen || undefined}
              style={{ animationDelay: "128ms" }}
            >
              <StructuredDraftEditor
                key={`${draft.id}:${draft.contentProfileId ?? "empty"}`}
                ref={editorRef}
                draft={draft}
                templateNodes={templateNodes}
                onStatus={announce}
                onSaveStateChange={setContentSaveState}
                onContentChange={setDraftContent}
              />
              <WritingChatPanel
                draftId={draft.id}
                draftTitle={draft.title}
                templateName={draft.templateName}
                onInsert={handleInsertFromChat}
                resolveWritingContext={resolveWritingContext}
                canGenerateFullDraft={canGenerateFullDraft}
                generateDisabledReason={generateDisabledReason}
                generationRequest={generationRequest}
                onFullDraftPreview={previewGeneratedFullDraft}
                sectionOptions={sectionOptions}
                chartAllowed={chartAllowed}
                onInsertDataAsset={handleInsertDataAsset}
              />
            </div>

            <OfficialDocumentAppActions>
              <Button
                type="primary"
                icon={<FloppyDisk size={16} />}
                loading={isSaving}
                disabled={contentSaveState === "loading" || Boolean(isExporting)}
                onClick={() => void handleSave()}
              >保存草稿</Button>
              <Button
                className="official-document-app__chat-toggle"
                icon={<Sparkle size={16} />}
                type={chatOpen ? "primary" : "default"}
                ghost={chatOpen}
                aria-pressed={chatOpen}
                onClick={() => setChatOpen((current) => !current)}
              >
                智写助手
              </Button>
              <Button icon={<FileText size={16} />} onClick={() => setContentProfileOpen(true)}>
                内容方案
              </Button>
              {draft.contentProfileId ? (
                <Button icon={<ListChecks size={16} />} onClick={() => setResearchOpen(true)}>
                  资料补全
                  {researchResults.length ? <span className="official-document-app__action-count">{researchResults.length}</span> : null}
                </Button>
              ) : null}
              {draft.bindings.length ? (
                <Button
                  disabled={draft.source !== "LIVE"}
                  loading={isRefreshingBindings}
                  onClick={() => void handleRefreshBindings()}
                >
                  刷新绑定快照
                </Button>
              ) : null}
              <Button onClick={() => setHistoryOpen(true)}>正文与导出历史</Button>
              <Button onClick={() => setFactReviewOpen(true)}>事实校对</Button>
              <Button icon={<ListChecks size={16} />} onClick={() => setInspectorOpen(true)}>
                导出检查
                {draft.bindings.length ? <span className="official-document-app__action-count">{draft.bindings.length}</span> : null}
              </Button>
              <Button
                disabled={!canExportDocx}
                loading={isExporting === "DOCX"}
                title={exportDisabledReason}
                onClick={() => void handleExport("DOCX")}
              >导出 DOCX</Button>
              <Button
                disabled={!canExportPdf}
                loading={isExporting === "PDF"}
                title={pdfDisabledReason}
                onClick={() => void handleExport("PDF")}
              >导出 PDF</Button>
            </OfficialDocumentAppActions>
          </>
        )}
      </XsAsyncPanel>

      {draft && historyOpen ? <DraftHistoryPanel key={draft.id} draftId={draft.id} title={draft.title}
        open={historyOpen} currentContent={draftContent} onClose={() => setHistoryOpen(false)} onRestore={restoreHistoricalContent} /> : null}

      <Drawer title="事实校对" width={620} open={factReviewOpen} onClose={() => setFactReviewOpen(false)}>
        <p>校对提示用于发现需核对的数字、日期和执行要求，不影响保存或导出。</p>
        {!draftContent ? <p>正在加载正文…</p> : <>
          {draftContent.factReview ? <>
            <XsStatusBar tone={draftContent.factReview.textSnapshot !== officialDocumentContentText(draftContent) ? "warning" : "info"}
              message={draftContent.factReview.textSnapshot !== officialDocumentContentText(draftContent)
                ? "正文已修改，需重新核对；下方为上次校对记录。"
                : draftContent.factReview.confirmedAt ? "当前正文的来源已由你标记为核对完成。" : "当前正文尚未标记为人工核对完成。"} />
            <p>上次校对：{formatDate(draftContent.factReview.reviewedAt)}{draftContent.factReview.confirmedAt ? ` · 人工核对：${formatDate(draftContent.factReview.confirmedAt)}` : ""}</p>
            {draftContent.factReview.issues.length ? <ul>{draftContent.factReview.issues.map((issue, index) => <li key={index}>
              <p>{issue.sentence}</p><small>建议核对：{issue.additions.join("、")}</small>
            </li>)}</ul> : <p>本次自动校对未发现上述类型的新增事实，仍需结合原始来源判断。</p>}
          </> : <p>此草稿尚无保存的事实校对记录。</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button aria-label="重新校对" aria-busy={isReviewingFacts} loading={isReviewingFacts} onClick={() => void reviewFacts(false)}>重新校对</Button>
            <Button aria-label="我已核对当前正文来源" aria-busy={isReviewingFacts} loading={isReviewingFacts} onClick={() => void reviewFacts(true)}>我已核对当前正文来源</Button>
          </div>
        </>}
      </Drawer>

      {draft ? (
        <Drawer
          title="导出检查"
          width={520}
          open={inspectorOpen}
          destroyOnHidden={false}
          extra={(
            <div className="official-document-inspector-drawer__tags">
              <Tag bordered={false} color={canExportDocx ? "success" : "warning"}>
                {canExportDocx ? "可导出" : "暂不可导出"}
              </Tag>
              <Tag bordered={false} color="blue">{draft.bindings.length} 个历史绑定</Tag>
            </div>
          )}
          onClose={() => setInspectorOpen(false)}
        >
          <div className="official-document-draft-inspector">
            <p className="official-document-draft-inspector__meta">
              {draft.templateName} · 更新于 {formatDate(draft.updatedAt)}
            </p>
            <section className="official-document-bindings" aria-labelledby="binding-list-heading">
              <div className="official-document-section-title">
                <div><h4 id="binding-list-heading">历史问数快照</h4><p>仅兼容旧草稿；新流程统一从“资料补全”执行问数。</p></div>
              </div>
              {draft.bindings.length ? (
                <ul>
                  {draft.bindings.map((binding) => (
                    <li key={binding.id}>
                      <span aria-hidden="true"><LinkSimple size={18} /></span>
                      <div>
                        <span className="official-document-binding__title">
                          <strong>{binding.queryAssetName ?? binding.queryAssetId}</strong>
                          <Tag bordered={false} color={binding.status === "ACTIVE" ? "success" : binding.status === "MANUAL" ? "default" : "warning"}>
                            {binding.status}
                          </Tag>
                        </span>
                        <small>{binding.outputKey} → {binding.targetSlotTag}</small>
                        <dl>
                          <div><dt>executionId</dt><dd>{binding.executionId ?? "—"}</dd></div>
                          <div><dt>snapshotId</dt><dd>{binding.snapshotId ?? "—"}</dd></div>
                          <div><dt>固定版本</dt><dd>{binding.queryVersionId}</dd></div>
                        </dl>
                      </div>
                      {binding.status !== "MANUAL" ? (
                        <div className="official-document-binding__actions">
                          <Button
                            size="small"
                            disabled={!canDetachBinding(binding) || Boolean(detachingBindingId)}
                            loading={detachingBindingId === binding.id}
                            title={canDetachBinding(binding) ? undefined : "尚无可保留的有效快照，请先成功刷新绑定"}
                            onClick={() => void handleDetachBinding(binding)}
                          >
                            转为普通文本
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : <div className="official-document-inline-empty">当前草稿没有历史问数绑定。</div>}
            </section>

            <section className="official-document-export-checks" aria-label="导出前检查">
              <div className="official-document-section-title"><div><h4>导出前检查</h4><p>内容保存、草稿状态和绑定快照满足条件后可正式导出。</p></div></div>
              <ul>
                <li data-ok={contentSaveState === "saved"}><span />结构化内容已保存</li>
                <li data-ok={draftStatusAllowsExport(draft.status)}><span />草稿内容可导出</li>
                <li data-ok={bindingsReady}><span />数据绑定无异常</li>
                <li data-ok={draft.source === "LIVE"}><span />正式服务与模板版本可追溯</li>
              </ul>
            </section>

            {latestExport ? (
              <section className="official-document-export-result" aria-label="最近一次正式导出">
                <div>
                  <strong>最近导出：{latestExport.format} · {latestExport.status}</strong>
                  <small>{latestExport.message ?? `SHA-256 ${latestExport.sha256 ?? "未生成"}`}</small>
                </div>
                <Tag bordered={false} color={latestExport.fidelityReport?.passed ? "success" : "warning"}>
                  {latestExport.fidelityReport?.passed ? "保真检查通过" : "等待保真结果"}
                </Tag>
              </section>
            ) : null}
          </div>
        </Drawer>
      ) : null}

      {draft?.contentProfileId ? (
        <Drawer
          title="资料补全"
          width={680}
          open={researchOpen}
          destroyOnHidden={false}
          extra={<Tag bordered={false} color="blue">{researchResults.length} 项任务</Tag>}
          onClose={() => setResearchOpen(false)}
        >
          {contentProfileQuery.isPending || !draftContent ? (
            <XsStatusBar tone="loading" message="正在加载内容方案和资料任务" />
          ) : contentProfileQuery.isError ? (
            <XsStatusBar tone="error" message={contentProfileQuery.error instanceof Error ? contentProfileQuery.error.message : "内容方案加载失败"} />
          ) : (
            <DraftResearchPanel
              profile={contentProfile}
              results={researchResults}
              onPersist={persistResearchResults}
              onStatus={announce}
              onGenerate={requestFullDraftGeneration}
            />
          )}
        </Drawer>
      ) : null}

      {draft ? (
        <Modal
          className="official-document-content-profile-modal"
          title={draft.contentProfileId ? "查看内容方案" : "配置内容方案"}
          width="min(1480px, calc(100vw - 48px))"
          open={contentProfileOpen}
          footer={null}
          destroyOnHidden
          onCancel={() => setContentProfileOpen(false)}
        >
          {!draftTemplate ? (
            <XsStatusBar tone="error" message="当前草稿绑定的结构版本不可用" />
          ) : !draftContent ? (
            <XsStatusBar tone="loading" message="正在加载草稿内容" />
          ) : (
            <ContentProfileWorkspace
              template={draftTemplate}
              analysis={draftTemplate.currentVersion.analysis}
              boundProfileId={draft.contentProfileId}
              onBind={bindContentProfile}
            />
          )}
        </Modal>
      ) : null}

      {fullDraftPreview ? (
        <Modal
          className="official-document-full-draft-preview"
          title="全文结构化预览"
          width="min(980px, calc(100vw - 48px))"
          open
          okText="确认并应用全文"
          cancelText="返回修改"
          confirmLoading={isApplyingFullDraft}
          onOk={() => void applyGeneratedFullDraft()}
          onCancel={() => setFullDraftPreview(undefined)}
        >
          <div className="official-document-full-draft-preview__summary">
            <Tag bordered={false} color="blue">{fullDraftPreview.sectionCount} 个章节</Tag>
            <Tag bordered={false}>{fullDraftPreview.bodyCount} 段正文</Tag>
            <Tag bordered={false}>{fullDraftPreview.tableCount} 个表格</Tag>
            <Tag bordered={false}>{fullDraftPreview.chartCount} 张图表</Tag>
            <Tag bordered={false}>{fullDraftPreview.knowledgeSourceCount} 份问知来源</Tag>
            {fullDraftPreview.pendingCount ? <Tag bordered={false} color="warning">{fullDraftPreview.pendingCount} 项待补充</Tag> : null}
          </div>
          <XsStatusBar
            tone={fullDraftPreview.missingSourceBlockIds.length ? "warning" : "success"}
            message={fullDraftPreview.missingSourceBlockIds.length
              ? `逐字比对有 ${fullDraftPreview.missingSourceBlockIds.length} 个原始内容块未完整保留，请重点复核；确认后才会替换正文。`
              : `已逐字保留 ${fullDraftPreview.preservedSourceBlockIds.length} 个原始内容块。`}
          />
          <div className="official-document-full-draft-preview__blocks">
            {fullDraftPreview.blocks.map((block) => (
              <article key={block.id} data-role={block.role.toLocaleLowerCase()}>
                {block.role === "TABLE" && block.table ? (
                  <div className="structured-draft-editor__table"><table><thead><tr>{block.table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{block.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
                  </table></div>
                ) : block.role === "CHART_IMAGE" && block.chart ? (
                  <figure><img src={`data:${block.chart.mimeType};base64,${block.chart.base64}`} alt={block.chart.altText} /><figcaption>{block.text}</figcaption></figure>
                ) : block.role.startsWith("HEADING_") ? (
                  <h4>{block.text}</h4>
                ) : <p>{block.text}</p>}
              </article>
            ))}
          </div>
          <div className="official-document-full-draft-preview__sources">
            {researchResults.filter((result) => result.querySource?.dataAsOf).map((result) => (
              <small key={result.taskId}>问数 · {result.question} · 数据时间 {result.querySource?.dataAsOf}</small>
            ))}
          </div>
        </Modal>
      ) : null}

    </div>
  );
}
