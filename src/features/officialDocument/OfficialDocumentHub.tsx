import {
  ArrowClockwise,
  CaretRight,
  Cpu,
  FileDoc,
  FileText,
  MagnifyingGlass,
  Plus,
  ShieldWarning,
  UploadSimple
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Tag } from "antd";
import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { resolveXsAsyncStatus, XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsCountUpText } from "@/components/xs/XsCountUpText";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import {
  loadOfficialDocumentWorkspace,
  uploadOfficialDocumentTemplate
} from "@/services/officialDocumentService";
import type {
  OfficialDocumentDraft,
  OfficialDocumentTemplate,
  OfficialDocumentTemplateStatus
} from "@/types/officialDocument";
import {
  countBlockingRisks,
  draftStatusColor,
  draftStatusLabel,
  formatDate,
  formatFileSize,
  operationErrorMessage,
  templateStatusColor,
  templateStatusLabel,
  useOfficialDocumentWorkspaceKey,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import "./official-document.css";

const STAGGER_MS = 40;
const STAGGER_MAX_MS = 240;

type TemplateFilter = "ALL" | OfficialDocumentTemplateStatus;

const templateFilters: Array<{ key: TemplateFilter; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "NEEDS_REVIEW", label: "待校准" },
  { key: "ANALYZING", label: "分析中" },
  { key: "BLOCKED", label: "已阻断" },
  { key: "FAILED", label: "分析失败" }
];

function staggerDelay(index: number, base: number) {
  return `${base + Math.min(index * STAGGER_MS, STAGGER_MAX_MS)}ms`;
}

function TemplateCard({
  template,
  index,
  onOpen
}: {
  template: OfficialDocumentTemplate;
  index: number;
  onOpen: (template: OfficialDocumentTemplate) => void;
}) {
  const blockingCount = countBlockingRisks(template.currentVersion.analysis);
  return (
    <button
      type="button"
      className="official-document-template-card xs-page-enter"
      style={{ animationDelay: staggerDelay(index, 200) }}
      aria-label={`打开模板 ${template.name}`}
      onClick={() => onOpen(template)}
    >
      <span className="official-document-template-card__paper" aria-hidden="true">
        <span className="official-document-template-card__paper-bar" />
        <Tag bordered={false} color={templateStatusColor[template.status]}>
          {templateStatusLabel[template.status]}
        </Tag>
        <span className="official-document-template-card__paper-lines">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="official-document-template-card__body">
        <span className="official-document-template-card__title">
          <strong>{template.name}</strong>
          <small>v{template.currentVersion.versionNo}</small>
        </span>
        <small>{formatFileSize(template.currentVersion.fileSize)} · 更新于 {formatDate(template.updatedAt)}</small>
        <span className="official-document-template-card__footer">
          {blockingCount > 0 ? <em>{blockingCount} 项阻断</em> : <span>结构可用</span>}
          <small>{template.currentVersion.analysis?.pageCount ? `${template.currentVersion.analysis.pageCount} 页` : "等待分页"}</small>
        </span>
      </span>
    </button>
  );
}

function DraftRow({
  draft,
  index,
  onOpen
}: {
  draft: OfficialDocumentDraft;
  index: number;
  onOpen: (draft: OfficialDocumentDraft) => void;
}) {
  return (
    <button
      type="button"
      className="official-document-draft-row xs-page-enter"
      style={{ animationDelay: staggerDelay(index, 120) }}
      aria-label={`打开草稿 ${draft.title}`}
      onClick={() => onOpen(draft)}
    >
      <span className="official-document-draft-row__icon" aria-hidden="true"><FileText size={20} /></span>
      <span className="official-document-draft-row__body">
        <strong>{draft.title}</strong>
        <small>{draft.templateName} · 文件版本 v{draft.currentFileVersionNo} · {draft.bindings.length} 个问数绑定</small>
      </span>
      <Tag bordered={false} color={draftStatusColor[draft.status]}>{draftStatusLabel[draft.status]}</Tag>
      <small className="official-document-draft-row__time">{formatDate(draft.updatedAt)}</small>
      <CaretRight size={15} aria-hidden="true" />
    </button>
  );
}

export function OfficialDocumentHub() {
  const navigate = useNavigate();
  const isAdmin = useDataHubAuthStore((state) => state.user?.isAdmin === true);
  const workspaceKey = useOfficialDocumentWorkspaceKey();
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [operationStatus, setOperationStatus] = useState("");
  const [operationTone, setOperationTone] = useState<XsStatusTone>("info");
  const [isUploading, setIsUploading] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("ALL");
  const [templateKeyword, setTemplateKeyword] = useState("");

  const workspaceQuery = useQuery({ queryKey: workspaceKey, queryFn: loadOfficialDocumentWorkspace });
  const workspaceStatus = resolveXsAsyncStatus({
    isPending: workspaceQuery.isPending,
    isFetching: workspaceQuery.isFetching,
    isError: workspaceQuery.isError,
    hasData: workspaceQuery.data !== undefined
  });
  const templates = (workspaceQuery.data?.templates ?? []).filter((template) =>
    isAdmin || template.status === "PUBLISHED"
  );
  const drafts = workspaceQuery.data?.drafts ?? [];
  const wordEngineAvailable = workspaceQuery.data?.capabilities?.wordEngine.available === true;
  const needsReviewCount = templates.filter((template) =>
    ["NEEDS_REVIEW", "BLOCKED"].includes(template.status) || countBlockingRisks(template.currentVersion.analysis) > 0
  ).length;
  const templateSearchKeyword = templateKeyword.trim().toLocaleLowerCase();
  const filteredTemplates = templates.filter((template) => (
    (templateFilter === "ALL" || template.status === templateFilter)
    && (!templateSearchKeyword || template.name.toLocaleLowerCase().includes(templateSearchKeyword))
  ));

  const announce = (tone: XsStatusTone, message: string) => {
    setOperationTone(tone);
    setOperationStatus(message);
  };

  const handleUploadClick = () => {
    if (isAdmin) uploadInputRef.current?.click();
  };

  const handleCreateDraftClick = () => {
    const template = templates.find((item) => item.status === "PUBLISHED");
    if (!template) {
      announce("warning", "还没有已发布模板，请先上传并完成模板校准。");
      document.getElementById("official-document-template-library")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate(`/writing/templates/${template.id}`, {
      state: { notice: "请点击“按模板新建草稿”，草稿会继承这个不可变模板版本。", noticeTone: "info" }
    });
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isUploading) return;

    setIsUploading(true);
    announce("loading", "正在上传并创建模板分析任务");
    try {
      const result = await uploadOfficialDocumentTemplate(file);
      updateWorkspaceCache((current) => ({
        ...current,
        templates: [result.template, ...current.templates.filter((item) => item.id !== result.template.id)]
      }));
      navigate(`/writing/templates/${result.template.id}`, {
        state: { notice: result.message, noticeTone: result.persisted ? "success" : "warning" }
      });
    } catch (error) {
      announce("error", operationErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="official-document-hub" aria-label="公文写作工作台">
      <header className="official-document-hub-head xs-page-enter">
        <div>
          <span className="official-document-hub-head__crumb">公文写作 / 模板套版</span>
          <h2>公文工作台</h2>
          <p>模板生产 · 结构化起草 · 数据绑定 · 版式保真导出，全链路可追溯</p>
        </div>
        <div className="official-document-hub__actions">
          <Button icon={<Plus size={16} />} onClick={handleCreateDraftClick}>新建草稿</Button>
          {isAdmin ? (
            <Button type="primary" icon={<UploadSimple size={17} />} loading={isUploading} onClick={handleUploadClick}>
              上传 DOCX 模板
            </Button>
          ) : null}
        </div>
      </header>

      {operationStatus ? (
        <XsStatusBar tone={operationTone} label="操作" message={operationStatus} transitionKey={`${operationTone}:${operationStatus}`} />
      ) : null}

      <div className="official-document-stats xs-page-enter" style={{ animationDelay: "100ms" }} aria-label="公文工作台概览">
        <div className="official-document-stats__item">
          <span>模板总数 <i><FileDoc size={17} /></i></span>
          <strong><XsCountUpText value={String(templates.length)} /></strong>
          <small>已发布 {templates.filter((item) => item.status === "PUBLISHED").length} · 其余 {templates.filter((item) => item.status !== "PUBLISHED").length}</small>
        </div>
        <div className="official-document-stats__item" data-state={needsReviewCount > 0 ? "attention" : undefined}>
          <span>待校准 / 阻断 <i><ShieldWarning size={17} /></i></span>
          <strong><XsCountUpText value={String(needsReviewCount)} /></strong>
          <small>风险清零后才可发布</small>
        </div>
        <div className="official-document-stats__item">
          <span>公文草稿 <i><FileText size={17} /></i></span>
          <strong><XsCountUpText value={String(drafts.length)} /></strong>
          <small>结构化内容持久化保存</small>
        </div>
        <div className="official-document-stats__item" data-state={wordEngineAvailable ? "ready" : "unavailable"}>
          <span>Word 引擎 <i><Cpu size={17} /></i></span>
          <strong>{wordEngineAvailable ? "正常" : "不可用"}</strong>
          <small>{wordEngineAvailable ? "格式提取与预览正常" : "引擎未配置或不可达"}</small>
        </div>
      </div>

      <XsAsyncPanel
        status={workspaceStatus}
        empty={templates.length === 0 && drafts.length === 0}
        emptyTitle="还没有可用的公文模板"
        emptyDescription={isAdmin ? "上传一份 DOCX 后开始模板分析。" : "请联系管理员上传并发布公文模板。"}
        emptyActionLabel={isAdmin ? "上传 DOCX 模板" : undefined}
        onEmptyAction={isAdmin ? handleUploadClick : undefined}
        errorTitle="公文工作台不可用"
        error={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "无法加载公文模板和草稿。"}
        onRetry={() => void workspaceQuery.refetch()}
        loadingVariant="cards"
        contentKey={workspaceQuery.dataUpdatedAt}
      >
        <section id="official-document-template-library" className="official-document-library xs-card xs-page-enter" style={{ animationDelay: "160ms" }}>
          <div className="official-document-library__head">
            <div><h2 className="subsection-title">模板库</h2><p className="page-section-description">原始 Word 模板不可覆盖，每次发布生成不可变版本。</p></div>
            <div className="official-document-hub__actions">
              <Input
                allowClear
                prefix={<MagnifyingGlass size={15} />}
                value={templateKeyword}
                placeholder="搜索模板名称"
                aria-label="搜索模板名称"
                onChange={(event) => setTemplateKeyword(event.target.value)}
              />
              <Button icon={<ArrowClockwise size={16} />} onClick={() => void workspaceQuery.refetch()} loading={workspaceQuery.isFetching}>刷新</Button>
            </div>
          </div>
          <div className="official-document-library__filters" role="tablist" aria-label="模板状态筛选">
            {templateFilters.map((filter) => {
              const count = filter.key === "ALL" ? templates.length : templates.filter((item) => item.status === filter.key).length;
              return (
                <button key={filter.key} type="button" role="tab" aria-selected={templateFilter === filter.key} onClick={() => setTemplateFilter(filter.key)}>
                  {filter.label}<span>{count}</span>
                </button>
              );
            })}
          </div>
          {filteredTemplates.length ? (
            <div className="official-document-template-grid" role="list" aria-label="公文模板列表">
              {filteredTemplates.map((template, index) => (
                <TemplateCard key={template.id} template={template} index={index} onOpen={(item) => navigate(`/writing/templates/${item.id}`)} />
              ))}
            </div>
          ) : (
            <div className="official-document-inline-empty">
              {templateKeyword ? `没有找到与“${templateKeyword}”相关的模板。` : "当前筛选状态下暂无模板。"}
            </div>
          )}
        </section>

        <section className="official-document-recent xs-card xs-page-enter" style={{ animationDelay: "240ms" }}>
          <div className="official-document-library__head">
            <div><h2 className="subsection-title">最近编辑的公文草稿</h2><p className="page-section-description">草稿不会反向修改已发布模板。</p></div>
            <span className="section-title-meta">{drafts.length} 篇草稿</span>
          </div>
          {drafts.length ? (
            <div className="official-document-draft-rows" role="list" aria-label="公文草稿列表">
              {drafts.map((draft, index) => (
                <DraftRow key={draft.id} draft={draft} index={index} onOpen={(item) => navigate(`/writing/drafts/${item.id}`)} />
              ))}
            </div>
          ) : <div className="official-document-inline-empty">暂无草稿，从已发布模板创建第一份草稿。</div>}
        </section>
      </XsAsyncPanel>

      {isAdmin ? (
        <input
          ref={uploadInputRef}
          hidden
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          data-testid="official-document-template-file"
          onChange={handleUpload}
        />
      ) : null}

      <div className="official-document-guardrail xs-page-enter" style={{ animationDelay: "300ms" }}>
        <ShieldWarning size={19} aria-hidden="true" />
        <p><strong>失败关闭：</strong>许可失效、结构槽位丢失、Schema 漂移或致命保真差异时，正式导出必须停止。</p>
      </div>
    </section>
  );
}
