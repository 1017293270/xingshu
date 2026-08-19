import {
  Database,
  FileText,
  LinkSimple,
  ListChecks,
  WarningCircle
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Drawer, Select, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import {
  createOfficialDocumentBinding,
  detachOfficialDocumentBinding,
  downloadOfficialDocumentExport,
  exportOfficialDocumentDraft,
  loadOfficialDocumentWorkspace,
  refreshOfficialDocumentBindings
} from "@/services/officialDocumentService";
import type {
  DraftDataBinding,
  OfficialDocumentExportFormat,
  OfficialDocumentExportRecord
} from "@/types/officialDocument";
import { StructuredDraftEditor, type StructuredDraftSaveState } from "./StructuredDraftEditor";
import {
  bindingsAreExportable,
  draftStatusColor,
  draftStatusLabel,
  formatDate,
  operationErrorMessage,
  renderingLabel,
  useOfficialDocumentWorkspaceKey,
  useUpdateOfficialDocumentWorkspaceCache,
  type BindingSlotType,
  type QueryBindingOutput
} from "./officialDocumentMeta";
import {
  OFFICIAL_DOCUMENT_DRAFTS_PATH,
  OfficialDocumentAppActions,
  useOfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";
import "./official-document.css";

const outputSupportsSlot = (output: QueryBindingOutput, slotType?: BindingSlotType) => (
  slotType === "DATA_TABLE"
    ? output.supportedRenderings.includes("TABLE")
    : output.supportedRenderings.some((rendering) => rendering !== "TABLE")
);

const preferredRenderingForSlot = (
  output: QueryBindingOutput | undefined,
  slotType?: BindingSlotType
): DraftDataBinding["rendering"] => (
  slotType === "DATA_TABLE"
    ? "TABLE"
    : output?.supportedRenderings.find((rendering) => rendering !== "TABLE") ?? "SCALAR"
);

function DraftNotFound() {
  return (
    <div className="official-document-detail__empty xs-card xs-page-enter">
      <FileText size={30} aria-hidden="true" />
      <strong>未找到该公文草稿</strong>
      <p>草稿可能已被移除，或不属于当前登录用户。</p>
      <Link to={OFFICIAL_DOCUMENT_DRAFTS_PATH}>返回草稿箱</Link>
    </div>
  );
}

export function DraftDetailView({ draftId }: { draftId: string }) {
  const location = useLocation();
  const workspaceKey = useOfficialDocumentWorkspaceKey();
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const [operationStatus, setOperationStatus] = useState(
    () => (location.state as { notice?: string } | null)?.notice ?? ""
  );
  const [operationTone, setOperationTone] = useState<XsStatusTone>(
    () => (location.state as { noticeTone?: XsStatusTone } | null)?.noticeTone ?? "info"
  );
  const [contentSaveState, setContentSaveState] = useState<StructuredDraftSaveState>("loading");
  const [bindingModalOpen, setBindingModalOpen] = useState(false);
  const [bindingAssetId, setBindingAssetId] = useState("");
  const [bindingOutputKey, setBindingOutputKey] = useState("");
  const [bindingRendering, setBindingRendering] = useState<DraftDataBinding["rendering"]>("SCALAR");
  const [bindingColumnIds, setBindingColumnIds] = useState<string[]>([]);
  const [bindingTargetSlot, setBindingTargetSlot] = useState("");
  const [isCreatingBinding, setIsCreatingBinding] = useState(false);
  const [isRefreshingBindings, setIsRefreshingBindings] = useState(false);
  const [detachingBindingId, setDetachingBindingId] = useState<string>();
  const [isExporting, setIsExporting] = useState<OfficialDocumentExportFormat>();
  const [latestExports, setLatestExports] = useState<Record<string, OfficialDocumentExportRecord>>({});
  const [inspectorOpen, setInspectorOpen] = useState(false);

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
  const bindingCandidates = useMemo(
    () => workspaceQuery.data?.queryBindingCandidates ?? [],
    [workspaceQuery.data]
  );
  const draftTemplate = useMemo(
    () => draft
      ? workspaceQuery.data?.templates.find((template) => template.id === draft.templateId
        && template.currentVersion.id === draft.templateVersionId)
      : undefined,
    [workspaceQuery.data, draft]
  );

  useEffect(() => setContentSaveState("loading"), [draftId]);

  useOfficialDocumentAppChrome({
    stage: "draft",
    context: draft?.title ?? "结构化起草",
    contextDetail: draft
      ? `${draft.templateName} · 文件版本 v${draft.currentFileVersionNo}`
      : undefined
  });

  const bindingsReady = draft ? bindingsAreExportable(draft.bindings) : true;
  const canExport = draft?.source === "LIVE"
    && draft.status === "READY"
    && contentSaveState === "saved"
    && bindingsReady;
  const exportDisabledReason = !draft
    ? undefined
    : contentSaveState !== "saved"
      ? "草稿内容保存完成后才能导出"
      : draft.status !== "READY"
        ? "草稿通过服务端校验后才能导出"
        : !bindingsReady
          ? "问数绑定刷新成功后才能导出"
          : draft.source !== "LIVE"
            ? "正式服务不可用，不能导出"
            : undefined;
  const latestExport = draft ? latestExports[draft.id] : undefined;

  const bindingSlots = useMemo(() => {
    if (!draft || draftTemplate?.status !== "PUBLISHED") return [];
    const occupiedSlots = new Set(draft.bindings.map((binding) => binding.targetSlotTag));
    return (draftTemplate.currentVersion.analysis?.structureNodes ?? [])
      .filter((node) => node.dataBinding && node.slotId)
      .map((node) => ({
        value: `xs:binding:${node.slotId}`,
        label: `${node.roleLabel} · ${node.preview.slice(0, 24) || `段落 ${(node.paragraphIndex ?? 0) + 1}`}`,
        slotType: node.slotType ?? "DATA_TEXT"
      }))
      .filter((slot) => !occupiedSlots.has(slot.value));
  }, [draft, draftTemplate]);
  const selectedBindingCandidate = bindingCandidates.find((candidate) => candidate.assetId === bindingAssetId);
  const selectedOutput = selectedBindingCandidate?.outputs.find((output) => output.outputKey === bindingOutputKey);
  const selectedBindingSlot = bindingSlots.find((slot) => slot.value === bindingTargetSlot);
  const compatibleOutputs = (selectedBindingCandidate?.outputs ?? []).filter((output) =>
    outputSupportsSlot(output, selectedBindingSlot?.slotType)
  );
  const compatibleRenderings = (selectedOutput?.supportedRenderings ?? []).filter((rendering) =>
    selectedBindingSlot?.slotType === "DATA_TABLE" ? rendering === "TABLE" : rendering !== "TABLE"
  );

  const announce = (tone: XsStatusTone, message: string) => {
    setOperationTone(tone);
    setOperationStatus(message);
  };

  const openBindingModal = () => {
    const firstSlot = bindingSlots[0];
    const firstCandidate = bindingCandidates.find((candidate) =>
      candidate.outputs.some((output) => outputSupportsSlot(output, firstSlot?.slotType))
    ) ?? bindingCandidates[0];
    const firstOutput = firstCandidate?.outputs.find((output) => outputSupportsSlot(output, firstSlot?.slotType));
    const rendering = preferredRenderingForSlot(firstOutput, firstSlot?.slotType);
    setBindingAssetId(firstCandidate?.assetId ?? "");
    setBindingOutputKey(firstOutput?.outputKey ?? "");
    setBindingRendering(rendering);
    setBindingColumnIds(rendering === "TABLE"
      ? (firstOutput?.columns ?? []).slice(0, 10).map((column) => column.columnId)
      : firstOutput?.columns[0] ? [firstOutput.columns[0].columnId] : []);
    setBindingTargetSlot(firstSlot?.value ?? "");
    setBindingModalOpen(true);
  };

  const handleBindingAssetChange = (assetId: string) => {
    const candidate = bindingCandidates.find((item) => item.assetId === assetId);
    const output = candidate?.outputs.find((item) => outputSupportsSlot(item, selectedBindingSlot?.slotType));
    const rendering = preferredRenderingForSlot(output, selectedBindingSlot?.slotType);
    setBindingAssetId(assetId);
    setBindingOutputKey(output?.outputKey ?? "");
    setBindingRendering(rendering);
    setBindingColumnIds(rendering === "TABLE"
      ? (output?.columns ?? []).slice(0, 10).map((column) => column.columnId)
      : output?.columns[0] ? [output.columns[0].columnId] : []);
  };

  const handleBindingOutputChange = (outputKey: string) => {
    const output = selectedBindingCandidate?.outputs.find((item) => item.outputKey === outputKey);
    const rendering = preferredRenderingForSlot(output, selectedBindingSlot?.slotType);
    setBindingOutputKey(outputKey);
    setBindingRendering(rendering);
    setBindingColumnIds(rendering === "TABLE"
      ? (output?.columns ?? []).slice(0, 10).map((column) => column.columnId)
      : output?.columns[0] ? [output.columns[0].columnId] : []);
  };

  const handleBindingRenderingChange = (rendering: DraftDataBinding["rendering"]) => {
    setBindingRendering(rendering);
    if (rendering === "TABLE") {
      setBindingColumnIds((selectedOutput?.columns ?? []).slice(0, 10).map((column) => column.columnId));
    } else {
      setBindingColumnIds((selectedOutput?.columns[0] ? [selectedOutput.columns[0].columnId] : []));
    }
  };

  const handleBindingTargetChange = (targetSlot: string) => {
    const slot = bindingSlots.find((item) => item.value === targetSlot);
    const output = selectedBindingCandidate?.outputs.find((item) => outputSupportsSlot(item, slot?.slotType));
    const rendering = preferredRenderingForSlot(output, slot?.slotType);
    setBindingTargetSlot(targetSlot);
    setBindingOutputKey(output?.outputKey ?? "");
    setBindingRendering(rendering);
    setBindingColumnIds(rendering === "TABLE"
      ? (output?.columns ?? []).slice(0, 10).map((column) => column.columnId)
      : output?.columns[0] ? [output.columns[0].columnId] : []);
  };

  const handleCreateBinding = async () => {
    if (!draft || !selectedBindingCandidate || !selectedOutput || !selectedBindingSlot || !bindingTargetSlot.trim()) return;
    if ((selectedBindingSlot.slotType === "DATA_TABLE") !== (bindingRendering === "TABLE")
      || !compatibleRenderings.includes(bindingRendering)) {
      announce("error", "写入方式与模板槽位类型不匹配");
      return;
    }
    setIsCreatingBinding(true);
    try {
      const binding = await createOfficialDocumentBinding(draft.id, {
        queryAssetId: selectedBindingCandidate.assetId,
        queryAssetName: selectedBindingCandidate.assetName,
        queryVersionId: selectedBindingCandidate.versionId,
        outputKey: selectedOutput.outputKey,
        targetSlotTag: bindingTargetSlot.trim(),
        rendering: bindingRendering,
        selector: bindingRendering === "TABLE"
          ? { columnIds: bindingColumnIds }
          : { columnId: bindingColumnIds[0], rowIndex: 0 }
      });
      updateWorkspaceCache((current) => ({
        ...current,
        drafts: current.drafts.map((item) => item.id === draft.id
          ? { ...item, bindings: [...item.bindings.filter((existing) => existing.id !== binding.id), binding] }
          : item)
      }));
      setBindingModalOpen(false);
      announce(binding.persisted ? "success" : "warning", binding.persisted
        ? "问数资产已绑定到固定版本；主动刷新成功后才会冻结并写入快照。"
        : "已建立本地绑定预演；没有查询或保存真实企业数据。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsCreatingBinding(false);
    }
  };

  const handleDetachBinding = async (binding: DraftDataBinding) => {
    if (!draft || detachingBindingId) return;
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
      announce("success", "问数绑定已转为普通文本，当前值保留在公文中。");
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
        ? `${unresolved.length} 个绑定未刷新成功，请检查 Schema 或数据权限。`
        : "全部问数绑定已刷新并冻结为新快照。"
      );
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsRefreshingBindings(false);
    }
  };

  const handleExport = async (format: OfficialDocumentExportFormat) => {
    if (!draft || isExporting || !canExport) return;
    setIsExporting(format);
    announce("loading", `正在生成 ${format} 并执行正式保真校验`);
    try {
      const record = await exportOfficialDocumentDraft(draft.id, format);
      setLatestExports((current) => ({ ...current, [draft.id]: record }));
      if (record.status !== "GENERATED") {
        announce("error", record.message ?? "正式导出被保真门禁阻断");
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
      announce("success", `${format} 已生成并通过保真校验，下载已开始。`);
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
        errorTitle="公文草稿不可用"
        error={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "无法加载公文草稿。"}
        onRetry={() => void workspaceQuery.refetch()}
        loadingVariant="cards"
        contentKey={workspaceQuery.dataUpdatedAt}
      >
        {!draft ? <DraftNotFound /> : (
          <>
            {operationStatus ? (
              <XsStatusBar
                tone={operationTone}
                label="操作"
                message={operationStatus}
                transitionKey={`${operationTone}:${operationStatus}`}
              />
            ) : null}

            <div className="official-document-draft-workspace xs-page-enter" style={{ animationDelay: "120ms" }}>
              <StructuredDraftEditor
                key={draft.id}
                draft={draft}
                templateNodes={draftTemplate?.currentVersion.analysis?.structureNodes ?? []}
                onStatus={announce}
                onSaveStateChange={setContentSaveState}
              />
            </div>

            <OfficialDocumentAppActions>
              <Button icon={<Database size={16} />} onClick={openBindingModal}>绑定问数数据</Button>
              {draft.bindings.length ? (
                <Button
                  disabled={draft.source !== "LIVE"}
                  loading={isRefreshingBindings}
                  onClick={() => void handleRefreshBindings()}
                >
                  刷新绑定快照
                </Button>
              ) : null}
              <Button icon={<ListChecks size={16} />} onClick={() => setInspectorOpen(true)}>
                问数与导出
                {draft.bindings.length ? <span className="official-document-app__action-count">{draft.bindings.length}</span> : null}
              </Button>
              <Button
                disabled={!canExport}
                loading={isExporting === "DOCX"}
                title={exportDisabledReason}
                onClick={() => void handleExport("DOCX")}
              >导出 DOCX</Button>
              <Button
                disabled={!canExport}
                loading={isExporting === "PDF"}
                title={exportDisabledReason}
                onClick={() => void handleExport("PDF")}
              >导出 PDF</Button>
            </OfficialDocumentAppActions>
          </>
        )}
      </XsAsyncPanel>

      {draft ? (
        <Drawer
          title="问数与导出"
          width={520}
          open={inspectorOpen}
          destroyOnHidden={false}
          extra={(
            <div className="official-document-inspector-drawer__tags">
              <Tag bordered={false} color={draftStatusColor[draft.status]}>{draftStatusLabel[draft.status]}</Tag>
              <Tag bordered={false} color="blue">{draft.bindings.length} 个问数绑定</Tag>
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
                <div><h4 id="binding-list-heading">问数快照绑定</h4><p>默认使用冻结快照，主动刷新才会更新。</p></div>
                <Button size="small" type="primary" icon={<Database size={15} />} onClick={openBindingModal}>新增绑定</Button>
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
                            disabled={binding.status !== "ACTIVE" || Boolean(detachingBindingId)}
                            loading={detachingBindingId === binding.id}
                            title={binding.status === "ACTIVE" ? undefined : "只有已经冻结有效快照的绑定才能转为普通文本"}
                            onClick={() => void handleDetachBinding(binding)}
                          >
                            转为普通文本
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : <div className="official-document-inline-empty">暂无绑定。绑定问数资产后，数据将以冻结快照写入公文。</div>}
            </section>

            <section className="official-document-export-checks" aria-label="导出前检查">
              <div className="official-document-section-title"><div><h4>导出前检查</h4><p>内容保存、草稿状态和绑定快照满足条件后可正式导出。</p></div></div>
              <ul>
                <li data-ok={contentSaveState === "saved"}><span />结构化内容已保存</li>
                <li data-ok={draft.status === "READY"}><span />草稿通过服务端校验</li>
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

      {bindingModalOpen && draft ? (
        <Drawer
          title="绑定问数数据"
          width={520}
          open
          destroyOnHidden
          extra={<Tag bordered={false} color="blue">冻结快照</Tag>}
          footer={(
            <div className="official-document-binding-drawer__footer">
              <Button onClick={() => setBindingModalOpen(false)}>取消</Button>
              <Button
                type="primary"
                loading={isCreatingBinding}
                disabled={!selectedBindingCandidate
                  || !selectedOutput
                  || !selectedBindingSlot
                  || !compatibleRenderings.includes(bindingRendering)
                  || !bindingColumnIds.length}
                onClick={() => void handleCreateBinding()}
              >
                创建绑定
              </Button>
            </div>
          )}
          onClose={() => setBindingModalOpen(false)}
        >
          <div className="official-document-binding-form">
            <p>将已保存的 QueryAsset 固定到查询版本，并写入发布模板中的数据槽位。</p>
            {!bindingCandidates.length ? (
              <div className="official-document-binding-form__empty"><Database size={20} /><span>没有可绑定的已保存 QueryAsset。</span></div>
            ) : null}
            <label htmlFor="official-document-binding-asset">问数资产</label>
            <Select
              id="official-document-binding-asset"
              aria-label="问数资产"
              value={bindingAssetId || undefined}
              options={bindingCandidates.map((candidate) => ({ value: candidate.assetId, label: candidate.assetName }))}
              onChange={handleBindingAssetChange}
            />
            <small>{selectedBindingCandidate?.versionLabel ?? "只允许绑定固定版本"}</small>
            <label htmlFor="official-document-binding-output">输出结果</label>
            <Select
              id="official-document-binding-output"
              aria-label="输出结果"
              value={bindingOutputKey || undefined}
              options={compatibleOutputs.map((output) => ({ value: output.outputKey, label: output.label }))}
              onChange={handleBindingOutputChange}
            />
            <label htmlFor="official-document-binding-rendering">写入方式</label>
            <Select
              id="official-document-binding-rendering"
              aria-label="写入方式"
              value={bindingRendering}
              options={compatibleRenderings.map((rendering) => ({ value: rendering, label: renderingLabel[rendering] }))}
              onChange={handleBindingRenderingChange}
            />
            <label htmlFor="official-document-binding-columns">数据列</label>
            <Select
              id="official-document-binding-columns"
              aria-label="绑定数据列"
              mode={bindingRendering === "TABLE" ? "multiple" : undefined}
              maxCount={bindingRendering === "TABLE" ? 10 : undefined}
              value={bindingRendering === "TABLE" ? bindingColumnIds : bindingColumnIds[0] || undefined}
              options={(selectedOutput?.columns ?? []).map((column) => ({ value: column.columnId, label: column.label }))}
              onChange={(value) => setBindingColumnIds(Array.isArray(value) ? value : value ? [value] : [])}
            />
            <label htmlFor="official-document-binding-slot">目标绑定槽位</label>
            <Select
              id="official-document-binding-slot"
              aria-label="目标绑定槽位"
              value={bindingTargetSlot || undefined}
              placeholder="请选择已发布模板中的问数槽位"
              options={bindingSlots}
              onChange={handleBindingTargetChange}
            />
            {selectedBindingCandidate && !compatibleOutputs.length ? (
              <div className="official-document-binding-form__empty">
                <WarningCircle size={20} />
                <span>这个问数资产没有与目标槽位兼容的输出，请更换资产或槽位。</span>
              </div>
            ) : null}
            {!bindingSlots.length ? (
              <div className="official-document-binding-form__empty">
                <WarningCircle size={20} />
                <span>当前草稿没有可用绑定槽位。请先在模板校准中勾选“允许问数绑定”并发布模板。</span>
              </div>
            ) : null}
            <small>绑定数据按快照写入；手工改写前必须先解除绑定。</small>
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
