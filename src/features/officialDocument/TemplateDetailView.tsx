import {
  ArrowLeft,
  FileDoc,
  Plus,
  WarningCircle
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Checkbox, Input, Modal, Select, Tag } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import {
  createOfficialDocumentDraft,
  getOfficialDocumentTemplateAnalysis,
  getOfficialDocumentTemplatePreview,
  loadOfficialDocumentWorkspace,
  officialDocumentServiceState,
  publishOfficialDocumentTemplate,
  updateOfficialDocumentTemplateMapping
} from "@/services/officialDocumentService";
import type {
  OfficialDocumentAnalysis,
  OfficialDocumentMappingDefinition,
  OfficialDocumentMappingRole,
  OfficialDocumentStructureNode,
  OfficialDocumentTemplate
} from "@/types/officialDocument";
import {
  calibrationRoleLabel,
  calibrationRoleOptions,
  countBlockingRisks,
  formatDate,
  operationErrorMessage,
  riskColor,
  riskLabel,
  styleVariantId,
  templateStatusColor,
  templateStatusLabel,
  useOfficialDocumentWorkspaceKey,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import "./official-document.css";

function TemplateNotFound() {
  return (
    <div className="official-document-detail__empty xs-card xs-page-enter">
      <FileDoc size={30} aria-hidden="true" />
      <strong>未找到该公文模板</strong>
      <p>模板可能已被移除、尚未发布，或当前账号无权访问。</p>
      <Link to="/writing">返回公文写作</Link>
    </div>
  );
}

function CalibrationPanel({
  template,
  analysis,
  previewUrl,
  isLoadingPreview,
  onLoadPreview,
  onCreateDraft,
  onSaveMapping,
  onPublish,
  canManageTemplate
}: {
  template: OfficialDocumentTemplate;
  analysis?: OfficialDocumentAnalysis;
  previewUrl?: string;
  isLoadingPreview: boolean;
  onLoadPreview: () => void;
  onCreateDraft: () => void;
  onSaveMapping: (mappings: OfficialDocumentMappingDefinition[]) => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  canManageTemplate: boolean;
}) {
  const blockingCount = countBlockingRisks(analysis);
  const canCreateDraft = template.status === "PUBLISHED";
  const canCalibrate = canManageTemplate && template.source === "LIVE" && template.status === "NEEDS_REVIEW";
  const [calibrationNodes, setCalibrationNodes] = useState<OfficialDocumentStructureNode[]>([]);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [bodyRegionStart, setBodyRegionStart] = useState<number>();
  const [bodyRegionEnd, setBodyRegionEnd] = useState<number>();
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [showEmptyParagraphs, setShowEmptyParagraphs] = useState(false);

  useEffect(() => {
    const nextNodes = (analysis?.structureNodes ?? []).map((node) => {
      if (node.paragraphIndex === undefined) return node;
      const role = node.role === "UNKNOWN" ? "PRESERVE" : node.role as OfficialDocumentMappingRole;
      return {
        ...node,
        role,
        roleLabel: calibrationRoleLabel[role],
        variantId: node.variantId ?? styleVariantId(node, role),
        editable: role !== "PRESERVE",
        dataBinding: role === "PRESERVE" ? false : node.dataBinding,
        required: role === "PRESERVE" ? false : node.required
      };
    });
    setCalibrationNodes(nextNodes);
    setSelectedNodeId((current) => nextNodes.some((node) => node.id === current && !node.empty)
      ? current
      : nextNodes.find((node) => !node.empty)?.id ?? nextNodes[0]?.id ?? "");
    const storedBodyRegion = [...(analysis?.mappingProfile?.mappings ?? [])]
      .filter((mapping) => mapping.slotType === "BODY_REGION" && mapping.role === "BODY")
      .sort((left, right) => (right.endParagraphIndex ?? right.paragraphIndex) - right.paragraphIndex
        - ((left.endParagraphIndex ?? left.paragraphIndex) - left.paragraphIndex))[0];
    const blockNodes = nextNodes.filter((node) => node.paragraphIndex !== undefined
      && ["BODY", "HEADING_1", "HEADING_2", "HEADING_3"].includes(node.role));
    const firstBody = blockNodes.find((node) => node.role === "BODY");
    const lastBlock = blockNodes.at(-1);
    setBodyRegionStart(storedBodyRegion?.paragraphIndex ?? firstBody?.paragraphIndex);
    setBodyRegionEnd(storedBodyRegion?.endParagraphIndex ?? lastBlock?.paragraphIndex ?? firstBody?.paragraphIndex);
    setMappingSaved(Boolean(analysis?.mappingProfile?.mappings.length));
  }, [analysis, template.currentVersion.id]);

  const mappedParagraphs = calibrationNodes.filter((node) => node.paragraphIndex !== undefined);
  const mappedTables = calibrationNodes.filter((node) => node.tableIndex !== undefined && node.dataBinding);
  const emptyParagraphCount = calibrationNodes.filter((node) => node.paragraphIndex !== undefined && node.empty).length;
  const visibleCalibrationNodes = showEmptyParagraphs
    ? calibrationNodes
    : calibrationNodes.filter((node) => node.paragraphIndex === undefined || !node.empty);
  const selectedNode = visibleCalibrationNodes.find((node) => node.id === selectedNodeId) ?? visibleCalibrationNodes[0];
  const bodyRegionNodes = mappedParagraphs.filter((node) =>
    ["BODY", "HEADING_1", "HEADING_2", "HEADING_3"].includes(node.role)
  );
  const bodyRegionStartOptions = bodyRegionNodes
    .filter((node) => node.role === "BODY" && !node.dataBinding)
    .map((node) => ({ value: node.paragraphIndex!, label: `段落 ${node.paragraphIndex! + 1} · ${node.preview.slice(0, 24)}` }));
  const bodyRegionEndOptions = bodyRegionNodes
    .filter((node) => bodyRegionStart === undefined || node.paragraphIndex! >= bodyRegionStart)
    .map((node) => ({ value: node.paragraphIndex!, label: `段落 ${node.paragraphIndex! + 1} · ${node.preview.slice(0, 24)}` }));
  const hasTitle = mappedParagraphs.some((node) => node.role === "TITLE");
  const hasBody = mappedParagraphs.some((node) => node.role === "BODY");
  const bodyRegionValid = bodyRegionStart !== undefined && bodyRegionEnd !== undefined && bodyRegionEnd >= bodyRegionStart;
  const mappingValid = mappedParagraphs.length > 0 && hasTitle && hasBody && bodyRegionValid
    && [...mappedParagraphs, ...mappedTables].every((node) => Boolean(node.slotId));

  useEffect(() => {
    const validStarts = bodyRegionStartOptions.map((option) => option.value);
    if (!validStarts.length) {
      if (bodyRegionStart !== undefined) setBodyRegionStart(undefined);
      if (bodyRegionEnd !== undefined) setBodyRegionEnd(undefined);
      return;
    }
    const nextStart = bodyRegionStart !== undefined && validStarts.includes(bodyRegionStart)
      ? bodyRegionStart
      : validStarts[0];
    if (nextStart !== bodyRegionStart) setBodyRegionStart(nextStart);
    const validEnds = bodyRegionNodes
      .map((node) => node.paragraphIndex!)
      .filter((index) => index >= nextStart);
    const nextEnd = bodyRegionEnd !== undefined && validEnds.includes(bodyRegionEnd)
      ? bodyRegionEnd
      : validEnds.at(-1);
    if (nextEnd !== bodyRegionEnd) setBodyRegionEnd(nextEnd);
  }, [bodyRegionEnd, bodyRegionNodes, bodyRegionStart, bodyRegionStartOptions]);

  const updateNodeRole = (nodeId: string, role: OfficialDocumentMappingRole) => {
    setCalibrationNodes((current) => current.map((node) => node.id === nodeId
      ? {
          ...node,
          role,
          roleLabel: calibrationRoleLabel[role],
          variantId: styleVariantId(node, role),
          editable: role !== "PRESERVE",
          dataBinding: role === "PRESERVE" ? false : node.dataBinding,
          required: role === "PRESERVE" ? false : node.required
        }
      : node
    ));
    setMappingSaved(false);
  };

  const updateNodeFlag = (nodeId: string, flag: "dataBinding" | "required", checked: boolean) => {
    setCalibrationNodes((current) => current.map((node) => node.id === nodeId ? { ...node, [flag]: checked } : node));
    setMappingSaved(false);
  };

  const updateTableBinding = (nodeId: string, checked: boolean) => {
    setCalibrationNodes((current) => current.map((node) => node.id === nodeId
      ? {
          ...node,
          role: checked ? "BODY" : "UNKNOWN",
          roleLabel: `表格 ${(node.tableIndex ?? 0) + 1}（${checked ? "问数小表" : "静态保留"}）`,
          editable: checked,
          dataBinding: checked,
          slotType: checked ? "DATA_TABLE" : undefined
        }
      : node
    ));
    setMappingSaved(false);
  };

  const saveMapping = async () => {
    if (!mappingValid || isSavingMapping) return;
    const paragraphMappings: OfficialDocumentMappingDefinition[] = mappedParagraphs.map((node) => ({
      slotId: node.slotId!,
      nodeId: node.id,
      paragraphIndex: node.paragraphIndex!,
      role: node.role as OfficialDocumentMappingRole,
      variantId: node.variantId ?? styleVariantId(node, node.role as OfficialDocumentMappingRole),
      dataBinding: node.dataBinding,
      required: node.required,
      slotType: (node.role === "PRESERVE"
        ? "PRESERVE"
        : node.dataBinding
          ? "DATA_TEXT"
          : node.paragraphIndex === bodyRegionStart
            ? "BODY_REGION"
            : ["BODY", "HEADING_1", "HEADING_2", "HEADING_3"].includes(node.role)
              ? "BODY_REGION"
            : "FIXED_TEXT") as OfficialDocumentMappingDefinition["slotType"],
      endParagraphIndex: node.paragraphIndex === bodyRegionStart ? bodyRegionEnd : node.paragraphIndex,
      metadata: {}
    }));
    const tableMappings: OfficialDocumentMappingDefinition[] = mappedTables.map((node) => ({
      slotId: node.slotId!,
      nodeId: node.id,
      paragraphIndex: node.tableIndex!,
      role: "BODY",
      variantId: node.variantId ?? `table-${node.tableIndex! + 1}`,
      dataBinding: true,
      required: false,
      slotType: "DATA_TABLE",
      endParagraphIndex: node.tableIndex,
      metadata: { target: "table" }
    }));
    const mappings = [...paragraphMappings, ...tableMappings];
    setIsSavingMapping(true);
    const saved = await onSaveMapping(mappings);
    setMappingSaved(saved);
    setIsSavingMapping(false);
  };

  const publishTemplate = async () => {
    if (!mappingSaved || !mappingValid || blockingCount > 0 || isPublishing) return;
    setIsPublishing(true);
    await onPublish();
    setIsPublishing(false);
  };

  return (
    <div className="official-document-calibration">
      <div className="official-document-toolbar xs-page-enter" style={{ animationDelay: "120ms" }}>
        <div className="official-document-calibration__summary">
          <Tag bordered={false} color={hasTitle ? "success" : "warning"}>标题 {hasTitle ? "已标记" : "未标记"}</Tag>
          <Tag bordered={false} color={hasBody ? "success" : "warning"}>正文 {hasBody ? "已标记" : "未标记"}</Tag>
          <Tag bordered={false} color={blockingCount > 0 ? "error" : "success"}>{blockingCount > 0 ? `${blockingCount} 项阻断` : "无阻断项"}</Tag>
        </div>
        <div className="official-document-toolbar__actions">
          {template.source === "LIVE" ? (
            <Button disabled={analysis?.capability.licenseMode !== "FILE"} loading={isLoadingPreview} onClick={onLoadPreview}>原稿 PDF 预览</Button>
          ) : null}
          {canCalibrate ? (
            <>
              <Button disabled={!mappingValid} loading={isSavingMapping} onClick={() => void saveMapping()}>保存角色映射</Button>
              <Button type="primary" disabled={!mappingSaved || !mappingValid || blockingCount > 0} loading={isPublishing} onClick={() => void publishTemplate()}>发布模板</Button>
            </>
          ) : null}
          <Button type={canCalibrate ? "default" : "primary"} icon={<Plus size={16} />} disabled={!canCreateDraft} onClick={onCreateDraft}>按模板新建草稿</Button>
        </div>
      </div>

      <div className="official-document-calibration-workspace xs-page-enter" style={{ animationDelay: "180ms" }}>
        <section className="official-document-calibration-preview" aria-label="原稿版式预览">
          <div className="official-document-workspace-panel-head">
            <div><h4>原稿 PDF 预览</h4><p>只读 · LibreOffice 实际渲染</p></div>
            {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer">新窗口</a> : null}
          </div>
          {previewUrl ? (
            <object data={previewUrl} type="application/pdf" aria-label={`${template.name} PDF 预览`}>
              <a href={previewUrl} target="_blank" rel="noreferrer">当前浏览器无法内嵌 PDF，请在新窗口查看。</a>
            </object>
          ) : (
            <div className="official-document-sidecard__empty">
              <FileDoc size={28} aria-hidden="true" />
              <strong>尚未生成原稿预览</strong>
              <p>生成 PDF 后可逐段对照结构与格式事实。</p>
              {template.source === "LIVE" ? <Button size="small" disabled={analysis?.capability.licenseMode !== "FILE"} loading={isLoadingPreview} onClick={onLoadPreview}>生成原稿预览</Button> : null}
            </div>
          )}
        </section>

        <section className="official-document-calibration-structure" aria-labelledby="structure-heading">
          <div className="official-document-workspace-panel-head">
            <div><h4 id="structure-heading">结构节点</h4><p>选择节点后在右侧确认角色和可编辑属性。</p></div>
            <div className="official-document-structure-head-actions">
              {emptyParagraphCount ? (
                <Button type="text" size="small" onClick={() => setShowEmptyParagraphs((current) => !current)}>
                  {showEmptyParagraphs ? "隐藏空段落" : `显示 ${emptyParagraphCount} 个空段落`}
                </Button>
              ) : null}
              <Tag bordered={false} color="blue">{visibleCalibrationNodes.length} 个节点</Tag>
            </div>
          </div>
          <div className="official-document-static-preserve-note">
            红头若位于页眉、文本框、形状或图片中，会随原稿静态保留，但当前不会进入可编辑结构节点。
          </div>
          {bodyRegionNodes.length ? (
            <div className="official-document-body-region" aria-label="正文区域范围">
              <div><strong>正文区域</strong><small>范围内标题和正文会初始化为草稿节点。</small></div>
              <label><span>起点</span><Select aria-label="正文区域起点" value={bodyRegionStart} options={bodyRegionStartOptions} disabled={!canCalibrate} onChange={(value) => { setBodyRegionStart(value); if (bodyRegionEnd === undefined || bodyRegionEnd < value) setBodyRegionEnd(value); setMappingSaved(false); }} /></label>
              <label><span>终点</span><Select aria-label="正文区域终点" value={bodyRegionEnd} options={bodyRegionEndOptions} disabled={!canCalibrate} onChange={(value) => { setBodyRegionEnd(value); setMappingSaved(false); }} /></label>
            </div>
          ) : null}
          {visibleCalibrationNodes.length ? (
            <ol className="official-document-structure">
              {visibleCalibrationNodes.map((node) => (
                <li key={node.id} data-selected={node.id === selectedNode?.id}>
                  <button type="button" onClick={() => setSelectedNodeId(node.id)}>
                    <span className="official-document-structure__order">{node.order}</span>
                    <span className="official-document-structure__content">
                      <span className="official-document-structure__role"><strong>{node.roleLabel}</strong><Tag bordered={false} color={node.editable ? "success" : "default"}>{node.editable ? "可编辑" : "静态保留"}</Tag></span>
                      <span>{node.preview || "该节点没有可展示文本"}</span>
                      <small>{node.styleSummary.join(" · ") || "暂无格式摘要"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <div className="official-document-inline-empty">尚无结构结果，等待 Word 引擎完成分析。</div>}
        </section>

        <aside className="official-document-calibration-inspector">
          <div className="official-document-workspace-panel-head"><div><h4>节点属性</h4><p>角色、格式事实与绑定权限</p></div></div>
          {selectedNode ? (
            <div className="official-document-inspector-content">
              <label>
                <span>公文角色</span>
                {selectedNode.paragraphIndex !== undefined ? (
                  <Select aria-label={`段落 ${selectedNode.paragraphIndex + 1} 公文角色`} value={selectedNode.role === "UNKNOWN" ? "PRESERVE" : selectedNode.role} options={calibrationRoleOptions} disabled={!canCalibrate} onChange={(role: OfficialDocumentMappingRole) => updateNodeRole(selectedNode.id, role)} />
                ) : <strong>{selectedNode.roleLabel}</strong>}
              </label>
              <div className="official-document-inspector-preview"><span>原文</span><p>当前节点：{selectedNode.preview || "该节点没有可展示文本"}</p></div>
              <div className="official-document-inspector-format">
                <span>提取到的格式</span>
                {selectedNode.styleSummary.length ? selectedNode.styleSummary.map((fact) => <small key={fact}>{fact}</small>) : <small>暂无格式摘要</small>}
              </div>
              <div className="official-document-inspector-flags">
                {selectedNode.paragraphIndex !== undefined ? (
                  <>
                    <Checkbox checked={selectedNode.dataBinding} disabled={!canCalibrate || selectedNode.role === "PRESERVE" || selectedNode.paragraphIndex === bodyRegionStart} onChange={(event) => updateNodeFlag(selectedNode.id, "dataBinding", event.target.checked)}>允许问数绑定</Checkbox>
                    <Checkbox checked={selectedNode.required} disabled={!canCalibrate || selectedNode.role === "PRESERVE"} onChange={(event) => updateNodeFlag(selectedNode.id, "required", event.target.checked)}>必填槽位</Checkbox>
                  </>
                ) : selectedNode.tableIndex !== undefined ? (
                  <Checkbox checked={selectedNode.dataBinding} disabled={!canCalibrate} onChange={(event) => updateTableBinding(selectedNode.id, event.target.checked)}>作为问数二维表槽位</Checkbox>
                ) : null}
              </div>
            </div>
          ) : <div className="official-document-inline-empty">请选择一个结构节点。</div>}

          <section className="official-document-calibration-risks" aria-labelledby="risk-heading">
            <div className="official-document-section-title"><div><h4 id="risk-heading">格式保真与发布风险</h4><p>阻断项清零后才允许发布。</p></div></div>
            {analysis?.risks.length ? (
              <ul className="official-document-risks">
                {analysis.risks.map((risk) => (
                  <li key={risk.id} data-severity={risk.severity.toLocaleLowerCase()}>
                    <WarningCircle size={17} aria-hidden="true" />
                    <div><strong>{risk.title}</strong><p>{risk.detail}</p></div>
                    <Tag bordered={false} color={riskColor[risk.severity]}>{riskLabel[risk.severity]}</Tag>
                  </li>
                ))}
              </ul>
            ) : <div className="official-document-inline-empty">当前分析没有返回风险项。</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}

export function TemplateDetailView({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
  const canManageTemplate = useDataHubAuthStore((state) => state.user?.isAdmin === true);
  const location = useLocation();
  const workspaceKey = useOfficialDocumentWorkspaceKey();
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const previewObjectUrlRef = useRef<string | undefined>(undefined);
  const [operationStatus, setOperationStatus] = useState(
    () => (location.state as { notice?: string } | null)?.notice ?? ""
  );
  const [operationTone, setOperationTone] = useState<XsStatusTone>(
    () => (location.state as { noticeTone?: XsStatusTone } | null)?.noticeTone ?? "info"
  );
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<{ versionId: string; url: string }>();
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

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
  const template = useMemo(
    () => workspaceQuery.data?.templates.find((item) =>
      item.id === templateId && (canManageTemplate || item.status === "PUBLISHED")
    ),
    [canManageTemplate, workspaceQuery.data, templateId]
  );
  const embeddedAnalysis = template?.currentVersion.analysis;
  const analysisQuery = useQuery({
    queryKey: [...workspaceKey, "analysis", template?.id ?? "none", template?.currentVersion.id ?? "none"],
    queryFn: () => getOfficialDocumentTemplateAnalysis(template!.id, template!.currentVersion.id),
    enabled: Boolean(template && !embeddedAnalysis && officialDocumentServiceState.configured)
  });
  const analysis = embeddedAnalysis ?? analysisQuery.data;
  const blockingCount = countBlockingRisks(analysis);

  const announce = (tone: XsStatusTone, message: string) => {
    setOperationTone(tone);
    setOperationStatus(message);
  };

  const clearTemplatePreview = () => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = undefined;
    setTemplatePreview(undefined);
  };

  useEffect(() => clearTemplatePreview, [templateId]);

  const handleLoadPreview = async () => {
    if (!template || isLoadingPreview || analysis?.capability.licenseMode !== "FILE") return;
    setIsLoadingPreview(true);
    announce("loading", `正在用固定 ${analysis?.capability.engineName ?? "Word"} 版本生成原稿 PDF 预览`);
    try {
      const blob = await getOfficialDocumentTemplatePreview(template.id, template.currentVersion.id);
      const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
      if (signature !== "%PDF-") throw new Error("公文服务返回的预览不是有效 PDF，已拒绝展示");
      clearTemplatePreview();
      const url = URL.createObjectURL(blob);
      previewObjectUrlRef.current = url;
      setTemplatePreview({ versionId: template.currentVersion.id, url });
      announce("success", "原稿 PDF 预览已生成，可对照结构树完成人工校准。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSaveMapping = async (mappings: OfficialDocumentMappingDefinition[]) => {
    if (!template) return false;
    announce("loading", "正在保存人工角色映射");
    try {
      const profile = await updateOfficialDocumentTemplateMapping({
        templateId: template.id,
        templateVersionId: template.currentVersion.id,
        mappings
      });
      await workspaceQuery.refetch();
      announce("success", `角色映射 v${profile.versionNo} 已保存；确认风险后可发布模板。`);
      return true;
    } catch (error) {
      announce("error", operationErrorMessage(error));
      return false;
    }
  };

  const handlePublishTemplate = async () => {
    if (!template) return false;
    announce("loading", "正在编译模板并执行格式保真校验");
    try {
      await publishOfficialDocumentTemplate(template.id, template.currentVersion.id);
      await workspaceQuery.refetch();
      announce("success", "模板已发布；现在可以基于该不可变版本创建草稿。");
      return true;
    } catch (error) {
      announce("error", operationErrorMessage(error));
      return false;
    }
  };

  const openDraftModal = () => {
    if (!template || template.status !== "PUBLISHED") return;
    setDraftTitle(`${template.name.replace(/（.*?）/g, "")} - 新草稿`);
    setDraftModalOpen(true);
  };

  const handleCreateDraft = async () => {
    const title = draftTitle.trim();
    if (!template || !title || isCreatingDraft) return;
    setIsCreatingDraft(true);
    try {
      const createdDraft = await createOfficialDocumentDraft({
        templateId: template.id,
        templateVersionId: template.currentVersion.id,
        title
      });
      const draft = { ...createdDraft, templateName: template.name };
      updateWorkspaceCache((current) => ({
        ...current,
        drafts: [draft, ...current.drafts.filter((item) => item.id !== draft.id)]
      }));
      setDraftModalOpen(false);
      navigate(`/writing/drafts/${draft.id}`, {
        state: {
          notice: "草稿已创建，已从模板样本文字初始化结构化正文。",
          noticeTone: "success"
        }
      });
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const previewUrl = template && templatePreview?.versionId === template.currentVersion.id
    ? templatePreview.url
    : undefined;

  return (
    <div className="official-document-detail">
      <nav className="official-document-detail__crumb xs-page-enter" aria-label="返回列表">
        <Link to="/writing"><ArrowLeft size={15} aria-hidden="true" />公文写作</Link>
        <span aria-hidden="true">/</span>
        <span>模板库</span>
      </nav>

      <XsAsyncPanel
        status={workspaceStatus}
        empty={false}
        errorTitle="公文模板不可用"
        error={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "无法加载公文模板。"}
        onRetry={() => void workspaceQuery.refetch()}
        loadingVariant="cards"
        contentKey={workspaceQuery.dataUpdatedAt}
      >
        {!template ? <TemplateNotFound /> : (
          <>
            <header className="official-document-detail-head xs-page-enter" style={{ animationDelay: "60ms" }}>
              <span className="official-document-detail-head__paper-bar" aria-hidden="true" />
              <div className="official-document-detail-head__body">
                <span className="official-document-eyebrow">公文模板 · 版本 v{template.currentVersion.versionNo}</span>
                <h1>{template.name}</h1>
                <div className="official-document-detail-head__meta">
                  <span>{template.currentVersion.fileName}</span>
                  <span>更新于 {formatDate(template.updatedAt)}</span>
                  <Tag bordered={false} color={templateStatusColor[template.status]}>
                    {templateStatusLabel[template.status]}
                  </Tag>
                  {blockingCount > 0 ? (
                    <Tag bordered={false} color="error">{blockingCount} 项阻断</Tag>
                  ) : null}
                </div>
              </div>
            </header>

            {operationStatus ? (
              <XsStatusBar
                tone={operationTone}
                label="操作"
                message={operationStatus}
                transitionKey={`${operationTone}:${operationStatus}`}
              />
            ) : null}

            {analysisQuery.isFetching ? (
              <div className="official-document-analysis__loading" role="status">正在读取模板分析结果…</div>
            ) : null}

            <CalibrationPanel
              template={template}
              analysis={analysis}
              previewUrl={previewUrl}
              isLoadingPreview={isLoadingPreview}
              onLoadPreview={() => void handleLoadPreview()}
              onCreateDraft={openDraftModal}
              onSaveMapping={handleSaveMapping}
              onPublish={handlePublishTemplate}
              canManageTemplate={canManageTemplate}
            />
          </>
        )}
      </XsAsyncPanel>

      {draftModalOpen && template ? (
        <Modal
          title="从模板创建公文草稿"
          open
          okText="创建草稿"
          cancelText="取消"
          confirmLoading={isCreatingDraft}
          okButtonProps={{ disabled: !draftTitle.trim() }}
          onOk={handleCreateDraft}
          onCancel={() => setDraftModalOpen(false)}
        >
          <div className="official-document-modal-copy">
            <p>模板版本：{template.name} · v{template.currentVersion.versionNo}</p>
            <label htmlFor="official-document-draft-title">草稿名称</label>
            <Input id="official-document-draft-title" value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
