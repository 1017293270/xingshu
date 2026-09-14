import {
  FileDoc,
  PencilSimpleLine,
  SlidersHorizontal,
  WarningCircle
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Checkbox, Input, Modal, Select, Tag } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
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
  ANALYZING_POLL_INTERVAL_MS,
  buildOfficialDocumentMappings,
  calibrationRoleLabel,
  calibrationRoleOptions,
  countBlockingRisks,
  hasAnalyzingTemplate,
  operationErrorMessage,
  riskColor,
  riskLabel,
  styleVariantId,
  useOfficialDocumentWorkspaceKey,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import {
  OFFICIAL_DOCUMENT_TEMPLATES_PATH,
  OfficialDocumentAppActions,
  useOfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";
import { buildTemplateOutline } from "./templateOutline";
import { TemplateOutlineMissingHint, TemplateOutlineTree } from "./TemplateOutlineTree";
import { TemplateDocumentPreview } from "./TemplateDocumentPreview";
import "./official-document.css";
import "./official-document-template-detail.css";

function TemplateNotFound() {
  return (
    <div className="official-document-detail__empty xs-card xs-page-enter">
      <FileDoc size={30} aria-hidden="true" />
      <strong>未找到该结构模板</strong>
      <p>结构模板可能已被移除，或当前账号无权访问。</p>
      <Link to={OFFICIAL_DOCUMENT_TEMPLATES_PATH}>返回结构模板</Link>
    </div>
  );
}

function CalibrationPanel({
  template,
  analysis,
  previewUrl,
  isLoadingPreview,
  onLoadPreview,
  onPublish,
  onCreateDraft,
  isPublishing
}: {
  template: OfficialDocumentTemplate;
  analysis?: OfficialDocumentAnalysis;
  previewUrl?: string;
  isLoadingPreview: boolean;
  onLoadPreview: () => void;
  onPublish: (mappings: OfficialDocumentMappingDefinition[]) => void;
  onCreateDraft: () => void;
  isPublishing: boolean;
}) {
  const blockingCount = countBlockingRisks(analysis);
  const canEditStructure = template.source === "LIVE" && template.status === "NEEDS_REVIEW";
  const calibrationDirty = useRef(false);
  const [calibrationNodes, setCalibrationNodes] = useState<OfficialDocumentStructureNode[]>([]);
  const [bodyRegionStart, setBodyRegionStart] = useState<number>();
  const [bodyRegionEnd, setBodyRegionEnd] = useState<number>();
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [showEmptyParagraphs, setShowEmptyParagraphs] = useState(false);
  /* 默认落在写作视角；逐段校准是少数人的动作，收进次级入口。 */
  const [calibrating, setCalibrating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (calibrationDirty.current && canEditStructure) return;
    calibrationDirty.current = false;
    const nextNodes = (analysis?.structureNodes ?? []).map((node) => {
      if (node.paragraphIndex === undefined) return node;
      const role = node.role === "UNKNOWN" ? "PRESERVE" : node.role as OfficialDocumentMappingRole;
      return {
        ...node,
        role,
        roleLabel: calibrationRoleLabel[role],
        variantId: styleVariantId({ ...node, role }, role),
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
  }, [analysis, template.currentVersion.id, canEditStructure]);

  const mappedParagraphs = calibrationNodes.filter((node) => node.paragraphIndex !== undefined);
  const mappedTables = calibrationNodes.filter((node) => node.tableIndex !== undefined
    && (node.dataBinding || node.slotType === "FIXED_TABLE_TEXT"));
  const mappedHeaderFooters = calibrationNodes.filter((node) => node.headerFooterIndex !== undefined
    && node.slotType === "FIXED_HEADER_FOOTER_TEXT");
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
    && [...mappedParagraphs, ...mappedTables, ...mappedHeaderFooters].every((node) => Boolean(node.slotId));

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
    calibrationDirty.current = true;
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
  };

  const updateNodeFlag = (nodeId: string, flag: "dataBinding" | "required", checked: boolean) => {
    calibrationDirty.current = true;
    setCalibrationNodes((current) => current.map((node) => node.id === nodeId ? { ...node, [flag]: checked } : node));
  };

  const updateTableMode = (
    nodeId: string,
    mode: "PRESERVE" | "TABLE_TEXT" | "ISSUING_AUTHORITY" | "DATA_TABLE"
  ) => {
    calibrationDirty.current = true;
    setCalibrationNodes((current) => {
      const target = current.find((node) => node.id === nodeId);
      if (!target) return current;
      return current.map((node) => {
        if (node.id === nodeId) {
          const editableText = mode === "TABLE_TEXT" || mode === "ISSUING_AUTHORITY";
          return {
            ...node,
            role: mode === "ISSUING_AUTHORITY" ? "ISSUING_AUTHORITY"
              : mode === "TABLE_TEXT" ? "TABLE_TEXT" : mode === "DATA_TABLE" ? "BODY" : "UNKNOWN",
            roleLabel: mode === "ISSUING_AUTHORITY" ? calibrationRoleLabel.ISSUING_AUTHORITY
              : mode === "TABLE_TEXT" ? node.roleLabel
                : `表格 ${(node.tableIndex ?? 0) + 1}（${mode === "DATA_TABLE" ? "问数小表" : "版式"}）`,
            editable: mode !== "PRESERVE",
            dataBinding: mode === "DATA_TABLE",
            required: false,
            slotType: editableText ? "FIXED_TABLE_TEXT" : mode === "DATA_TABLE" ? "DATA_TABLE" : undefined
          } as OfficialDocumentStructureNode;
        }
        if (node.tableIndex !== target.tableIndex) return node;
        if (mode === "DATA_TABLE" && node.tableRowIndex !== undefined) {
          return { ...node, role: "UNKNOWN", editable: false, slotType: undefined };
        }
        if ((mode === "TABLE_TEXT" || mode === "ISSUING_AUTHORITY")
          && node.tableRowIndex === undefined && node.dataBinding) {
          return { ...node, role: "UNKNOWN", editable: false, dataBinding: false, slotType: undefined };
        }
        return node;
      });
    });
  };

  const updateHeaderFooterMode = (nodeId: string, editable: boolean) => {
    calibrationDirty.current = true;
    setCalibrationNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      role: editable ? "HEADER_FOOTER" : "PRESERVE",
      editable,
      slotType: editable ? "FIXED_HEADER_FOOTER_TEXT" : undefined
    } : node));
  };

  const outline = useMemo(() => buildTemplateOutline(calibrationNodes), [calibrationNodes]);
  const documentNodes = showEmptyParagraphs
    ? calibrationNodes.filter((node) => node.paragraphIndex !== undefined
      || node.tableIndex !== undefined || node.headerFooterIndex !== undefined)
    : outline.documentNodes;

  const canPublish = template.source === "LIVE"
    && template.status === "NEEDS_REVIEW"
    && mappingValid
    && blockingCount === 0;
  const publishDisabledReason = template.status === "PUBLISHED"
    ? undefined
    : template.status === "ANALYZING"
      ? "结构分析完成后即可发布"
    : blockingCount > 0
      ? "结构模板存在错误，先处理后再发布"
      : outline.missingRoles.length
        ? `结构模板里没有识别到${outline.missingRoles.join("和")}，请先校准`
        : !mappingValid
          ? "请先在校准结构里确认正文区域"
          : template.source !== "LIVE"
            ? "正式服务不可用，不能发布结构"
            : undefined;

  return (
    <div className="official-document-calibration" data-mode={calibrating ? "calibrate" : "write"}>
      <OfficialDocumentAppActions>
        {template.source === "LIVE" ? (
          <Button
            icon={<FileDoc size={16} />}
            disabled={analysis?.capability.licenseMode !== "FILE"}
            loading={isLoadingPreview}
            onClick={() => {
              setPreviewOpen(true);
              if (!previewUrl) onLoadPreview();
            }}
          >
            原稿 PDF
          </Button>
        ) : null}
        <Button
          icon={<SlidersHorizontal size={16} />}
          type={calibrating ? "primary" : "default"}
          ghost={calibrating}
          aria-pressed={calibrating}
          onClick={() => setCalibrating((current) => !current)}
        >
          校准结构
        </Button>
        <Button
          type="primary"
          icon={<PencilSimpleLine size={16} />}
          disabled={template.status !== "PUBLISHED" && !canPublish}
          loading={template.status !== "PUBLISHED" && isPublishing}
          title={publishDisabledReason}
          onClick={() => template.status === "PUBLISHED"
            ? onCreateDraft()
            : onPublish(canEditStructure
              ? buildOfficialDocumentMappings(calibrationNodes, bodyRegionStart, bodyRegionEnd)
              : [])}
        >
          {template.status === "PUBLISHED" ? "按此结构新建草稿" : "发布结构"}
        </Button>
      </OfficialDocumentAppActions>

      <div className="official-document-calibration-workspace xs-page-enter" style={{ animationDelay: "160ms" }}>
        <section className="official-document-calibration-outline" aria-labelledby="structure-heading">
          <div className="official-document-workspace-panel-head">
            <div>
              <h4 id="structure-heading">结构大纲</h4>
              <p>点标题跳到对应段落。</p>
            </div>
            <div className="official-document-structure-head-actions">
              {emptyParagraphCount ? (
                <Button type="text" size="small" onClick={() => setShowEmptyParagraphs((current) => !current)}>
                  {showEmptyParagraphs ? "隐藏空段落" : `显示 ${emptyParagraphCount} 个空段落`}
                </Button>
              ) : null}
              <Tag bordered={false} color="blue">{documentNodes.length} 段</Tag>
            </div>
          </div>
          <div className="official-document-calibration__summary">
            <Tag bordered={false} color={hasTitle ? "success" : "warning"}>标题 {hasTitle ? "已识别" : "未识别"}</Tag>
            <Tag bordered={false} color={hasBody ? "success" : "warning"}>正文 {hasBody ? "已识别" : "未识别"}</Tag>
            <Tag bordered={false} color={blockingCount > 0 ? "error" : "success"}>
              {blockingCount > 0 ? `${blockingCount} 项错误` : "无错误"}
            </Tag>
          </div>
          <TemplateOutlineMissingHint missingRoles={outline.missingRoles} />
          <TemplateOutlineTree
            items={outline.items}
            activeNodeId={selectedNode?.id}
            onSelect={setSelectedNodeId}
          />
        </section>

        <section className="official-document-calibration-document" aria-label="结构模板原文">
          <div className="official-document-workspace-panel-head">
            <div>
              <h4>结构模板原文</h4>
              <p>示例文字只用于识别结构，不会进入最终文稿。</p>
            </div>
          </div>
          <TemplateDocumentPreview
            nodes={documentNodes}
            activeNodeId={selectedNode?.id}
            onVisibleNodeChange={setSelectedNodeId}
            onSelect={setSelectedNodeId}
          />
        </section>

        {calibrating ? (
          <aside className="official-document-calibration-inspector">
            <div className="official-document-workspace-panel-head">
              <div><h4>节点属性</h4><p>角色、格式事实与绑定权限</p></div>
            </div>
            <div className="official-document-static-preserve-note">
              {canEditStructure
                ? "所有提取到的文字都可设为可编辑；红线、Logo、图片和形状继续随原稿保留。"
                : "该模板已发布，结构只读。需要改角色请上传新版本。"}
            </div>
            {bodyRegionNodes.length ? (
              <div className="official-document-body-region" aria-label="正文区域范围">
                <div><strong>正文区域</strong><small>范围内标题和正文会初始化为草稿节点。</small></div>
                <label><span>起点</span><Select aria-label="正文区域起点" value={bodyRegionStart} options={bodyRegionStartOptions} disabled={!canEditStructure} onChange={(value) => { calibrationDirty.current = true; setBodyRegionStart(value); if (bodyRegionEnd === undefined || bodyRegionEnd < value) setBodyRegionEnd(value); }} /></label>
                <label><span>终点</span><Select aria-label="正文区域终点" value={bodyRegionEnd} options={bodyRegionEndOptions} disabled={!canEditStructure} onChange={(value) => { calibrationDirty.current = true; setBodyRegionEnd(value); }} /></label>
              </div>
            ) : null}
            {selectedNode ? (
              <div className="official-document-inspector-content">
                <label>
                  <span>节点角色</span>
                  {selectedNode.paragraphIndex !== undefined ? (
                    <Select aria-label={`段落 ${selectedNode.paragraphIndex + 1} 段落角色`} value={selectedNode.role === "UNKNOWN" ? "PRESERVE" : selectedNode.role} options={calibrationRoleOptions.filter((option) => !["TABLE_TEXT", "HEADER_FOOTER"].includes(option.value))} disabled={!canEditStructure} onChange={(role: OfficialDocumentMappingRole) => updateNodeRole(selectedNode.id, role)} />
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
                      <Checkbox checked={selectedNode.dataBinding} disabled={!canEditStructure || selectedNode.role === "PRESERVE" || selectedNode.paragraphIndex === bodyRegionStart} onChange={(event) => updateNodeFlag(selectedNode.id, "dataBinding", event.target.checked)}>允许问数绑定</Checkbox>
                      <Checkbox checked={selectedNode.required} disabled={!canEditStructure || selectedNode.role === "PRESERVE"} onChange={(event) => updateNodeFlag(selectedNode.id, "required", event.target.checked)}>必填槽位</Checkbox>
                    </>
                  ) : selectedNode.tableIndex !== undefined ? (
                    <label>
                      <span>表格用途</span>
                      <Select
                        aria-label={`表格 ${selectedNode.tableIndex + 1} 用途`}
                        value={selectedNode.slotType === "FIXED_TABLE_TEXT"
                          ? selectedNode.role === "ISSUING_AUTHORITY" ? "ISSUING_AUTHORITY" : "TABLE_TEXT"
                          : selectedNode.dataBinding ? "DATA_TABLE" : "PRESERVE"}
                        disabled={!canEditStructure}
                        options={selectedNode.tableRowIndex === undefined ? [
                          { value: "PRESERVE", label: "保留表格版式" },
                          { value: "DATA_TABLE", label: "问数二维表" }
                        ] : [
                          { value: "TABLE_TEXT", label: "可编辑文字" },
                          { value: "ISSUING_AUTHORITY", label: "发文机关（红头）" },
                          { value: "PRESERVE", label: "静态保留" }
                        ]}
                        onChange={(mode: "PRESERVE" | "TABLE_TEXT" | "ISSUING_AUTHORITY" | "DATA_TABLE") => updateTableMode(selectedNode.id, mode)}
                      />
                    </label>
                  ) : selectedNode.headerFooterIndex !== undefined ? (
                    <label>
                      <span>页眉页脚用途</span>
                      <Select
                        aria-label={`页眉页脚 ${selectedNode.headerFooterIndex + 1} 用途`}
                        value={selectedNode.slotType === "FIXED_HEADER_FOOTER_TEXT" ? "EDITABLE" : "PRESERVE"}
                        disabled={!canEditStructure}
                        options={[
                          { value: "EDITABLE", label: "可编辑文字" },
                          { value: "PRESERVE", label: "静态保留" }
                        ]}
                        onChange={(mode: "EDITABLE" | "PRESERVE") => updateHeaderFooterMode(selectedNode.id, mode === "EDITABLE")}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ) : <div className="official-document-inline-empty">请在大纲或原文里选中一个段落。</div>}

            <section className="official-document-calibration-risks" aria-labelledby="risk-heading">
              <div className="official-document-section-title"><div><h4 id="risk-heading">文档兼容性提示</h4><p>系统会尽量保留原稿；只有标为“错误”的项目会阻止发布。</p></div></div>
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
        ) : null}
      </div>

      <Modal
        className="official-document-preview-modal official-document-template-dialog"
        title="原稿 PDF 预览"
        width="min(980px, calc(100vw - 48px))"
        open={previewOpen}
        footer={(
          <div className="official-document-preview-modal__footer">
            <span>原稿只读对照</span>
            {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer">新窗口查看</a> : null}
          </div>
        )}
        onCancel={() => setPreviewOpen(false)}
      >
        {previewUrl ? (
          <object data={previewUrl} type="application/pdf" aria-label={`${template.name} PDF 预览`}>
            <a href={previewUrl} target="_blank" rel="noreferrer">当前浏览器无法内嵌 PDF，请在新窗口查看。</a>
          </object>
        ) : (
          <div className="structured-draft-editor__preview-empty">
            <FileDoc size={28} aria-hidden="true" />
            <strong>{isLoadingPreview ? "正在生成原稿预览" : "尚未生成原稿预览"}</strong>
            <p>生成 PDF 后可逐段对照结构与格式事实。</p>
            {template.source === "LIVE" ? (
              <Button size="small" disabled={analysis?.capability.licenseMode !== "FILE"} loading={isLoadingPreview} onClick={onLoadPreview}>生成原稿预览</Button>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function TemplateDetailView({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
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
  const [draftCreateError, setDraftCreateError] = useState("");
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isPublishingStructure, setIsPublishingStructure] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    queryFn: loadOfficialDocumentWorkspace,
    refetchInterval: (query) => (
      hasAnalyzingTemplate(query.state.data?.templates ?? []) ? ANALYZING_POLL_INTERVAL_MS : false
    )
  });
  const workspaceStatus = resolveXsAsyncStatus({
    isPending: workspaceQuery.isPending,
    isFetching: workspaceQuery.isFetching,
    isError: workspaceQuery.isError,
    hasData: workspaceQuery.data !== undefined
  });
  const template = useMemo(
    () => workspaceQuery.data?.templates.find((item) => item.id === templateId),
    [workspaceQuery.data, templateId]
  );
  const embeddedAnalysis = template?.currentVersion.analysis;
  const analysisQuery = useQuery({
    queryKey: [...workspaceKey, "analysis", template?.id ?? "none", template?.currentVersion.id ?? "none"],
    queryFn: () => getOfficialDocumentTemplateAnalysis(template!.id, template!.currentVersion.id),
    enabled: Boolean(template && officialDocumentServiceState.configured && (
      template.status === "ANALYZING" || !embeddedAnalysis
    )),
    refetchInterval: template?.status === "ANALYZING" ? ANALYZING_POLL_INTERVAL_MS : false
  });
  const analysis = template?.status === "ANALYZING"
    ? (analysisQuery.data ?? embeddedAnalysis)
    : (embeddedAnalysis ?? analysisQuery.data);

  useOfficialDocumentAppChrome({
    stage: "template",
    context: template?.name ?? "模板结构",
    contextDetail: template
      ? `${template.currentVersion.fileName} · 版本 v${template.currentVersion.versionNo}`
      : undefined
  });

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
    announce("loading", "正在生成浏览");
    try {
      const blob = await getOfficialDocumentTemplatePreview(template.id, template.currentVersion.id);
      const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
      if (signature !== "%PDF-") throw new Error("报告服务返回的预览不是有效 PDF，已拒绝展示");
      clearTemplatePreview();
      const url = URL.createObjectURL(blob);
      previewObjectUrlRef.current = url;
      setTemplatePreview({ versionId: template.currentVersion.id, url });
      announce("success", "原稿 PDF 预览已生成，可对照结构树检查版式。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePublishStructure = async (mappings: OfficialDocumentMappingDefinition[]) => {
    if (!template || template.status !== "NEEDS_REVIEW" || isPublishingStructure) return;
    if (!mappings.length) {
      announce("warning", "结构还不完整，请先确认标题、正文区域和节点角色。");
      return;
    }
    setIsPublishingStructure(true);
    announce("loading", "正在发布不可变结构版本");
    try {
      await updateOfficialDocumentTemplateMapping({
        templateId: template.id,
        templateVersionId: template.currentVersion.id,
        mappings
      });
      const publishedVersion = await publishOfficialDocumentTemplate(template.id, template.currentVersion.id);
      updateWorkspaceCache((current) => ({
        ...current,
        templates: current.templates.map((item) => item.id === template.id
          ? { ...item, currentVersion: publishedVersion, status: "PUBLISHED" as const }
          : item)
      }));
      announce("success", "结构版本已发布，可以按此结构新建草稿。");
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsPublishingStructure(false);
    }
  };

  const openDraftModal = () => {
    if (!template || template.status !== "PUBLISHED") return;
    setDraftTitle(`${template.name.replace(/（.*?）/g, "")} - 新草稿`);
    setDraftCreateError("");
    setDraftModalOpen(true);
  };

  const handleCreateDraft = async () => {
    const title = draftTitle.trim();
    if (!template || !title || isCreatingDraft) return;
    setIsCreatingDraft(true);
    setDraftCreateError("");
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
      navigate(`/writing/drafts/${draft.id}`);
    } catch (error) {
      const message = operationErrorMessage(error);
      setDraftCreateError(message);
      announce("error", message);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const previewUrl = template && templatePreview?.versionId === template.currentVersion.id
    ? templatePreview.url
    : undefined;

  return (
    <div className="official-document-detail official-document-template-detail">
      <XsAsyncPanel
        className="official-document-canvas-panel"
        status={workspaceStatus}
        empty={false}
        errorTitle="报告模板不可用"
        error={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "无法加载报告模板。"}
        onRetry={() => void workspaceQuery.refetch()}
        loadingVariant="cards"
        contentKey={`${templateId}:${template?.currentVersion.id ?? "loading"}`}
      >
        {!template ? <TemplateNotFound /> : (
          <div className="official-document-template-detail-scroll">
            {operationStatus ? (
              <XsStatusBar
                tone={operationTone}
                message={operationStatus}
                transitionKey={`${operationTone}:${operationStatus}`}
              />
            ) : null}

            {template.status === "ANALYZING" || analysisQuery.isFetching ? (
              <XsStatusBar tone="loading" message="正在分析模板结构" />
            ) : null}

            <CalibrationPanel
              template={template}
              analysis={analysis}
              previewUrl={previewUrl}
              isLoadingPreview={isLoadingPreview}
              onLoadPreview={() => void handleLoadPreview()}
              onPublish={(mappings) => void handlePublishStructure(mappings)}
              onCreateDraft={openDraftModal}
              isPublishing={isPublishingStructure}
            />
          </div>
        )}
      </XsAsyncPanel>

      {draftModalOpen && template ? (
        <Modal
          className="official-document-template-dialog"
          title="按结构创建报告草稿"
          open
          okText="创建草稿"
          cancelText="取消"
          zIndex={2000}
          confirmLoading={isCreatingDraft}
          okButtonProps={{ disabled: !draftTitle.trim() }}
          onOk={handleCreateDraft}
          onCancel={() => setDraftModalOpen(false)}
        >
          <div className="official-document-modal-copy">
            <p>结构版本：{template.name} · v{template.currentVersion.versionNo}</p>
            <p>创建后在草稿页上传文章并确认内容方案。</p>
            <label htmlFor="official-document-draft-title">草稿名称</label>
            <Input
              id="official-document-draft-title"
              value={draftTitle}
              maxLength={120}
              status={draftCreateError ? "error" : undefined}
              onChange={(event) => {
                setDraftTitle(event.target.value);
                if (draftCreateError) setDraftCreateError("");
              }}
            />
            {draftCreateError ? (
              <p role="alert" className="official-document-modal-copy__error">{draftCreateError}</p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
