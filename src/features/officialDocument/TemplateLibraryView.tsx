import { Cpu, FileDoc, UploadSimple } from "@phosphor-icons/react";
import { Button, Tag } from "antd";
import { useRef, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { uploadOfficialDocumentTemplate } from "@/services/officialDocumentService";
import type { OfficialDocumentTemplateStatus } from "@/types/officialDocument";
import {
  countBlockingRisks,
  formatDate,
  formatFileSize,
  operationErrorMessage,
  templateStatusColor,
  templateStatusLabel,
  useUpdateOfficialDocumentWorkspaceCache
} from "./officialDocumentMeta";
import {
  OfficialDocumentList,
  OfficialDocumentRow,
  OfficialDocumentRowCell,
  OfficialDocumentRowLead,
  OfficialDocumentToolbar,
  OfficialDocumentViewHead,
  type OfficialDocumentListColumn
} from "./OfficialDocumentListParts";
import { OfficialDocumentAppActions, useOfficialDocumentAppChrome } from "./OfficialDocumentAppShell";
import { useOfficialDocumentWorkspace } from "./useOfficialDocumentWorkspace";
import "./official-document-workspace.css";

type TemplateFilter = "ALL" | OfficialDocumentTemplateStatus;

const templateFilters: Array<{ key: TemplateFilter; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "NEEDS_REVIEW", label: "待校准" },
  { key: "ANALYZING", label: "分析中" },
  { key: "BLOCKED", label: "已阻断" },
  { key: "FAILED", label: "分析失败" }
];

const templateColumns: OfficialDocumentListColumn[] = [
  { key: "name", label: "模板" },
  { key: "status", label: "状态" },
  { key: "structure", label: "结构", optional: true },
  { key: "file", label: "文件", optional: true },
  { key: "updated", label: "更新时间" }
];

const TEMPLATE_GRID = "minmax(0, 2.4fr) 92px minmax(0, 1.1fr) 88px 112px 18px";

export function TemplateLibraryView() {
  const navigate = useNavigate();
  const location = useLocation();
  useOfficialDocumentAppChrome({ stage: "library", context: "模板库" });
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const { query, status } = useOfficialDocumentWorkspace();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [operationStatus, setOperationStatus] = useState(
    () => (location.state as { notice?: string } | null)?.notice ?? ""
  );
  const [operationTone, setOperationTone] = useState<XsStatusTone>(
    () => (location.state as { noticeTone?: XsStatusTone } | null)?.noticeTone ?? "info"
  );
  const [isUploading, setIsUploading] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("ALL");
  const [keyword, setKeyword] = useState("");

  const templates = query.data?.templates ?? [];
  const wordEngineAvailable = query.data?.capabilities?.wordEngine.available === true;
  const needsReviewCount = templates.filter((template) => (
    ["NEEDS_REVIEW", "BLOCKED"].includes(template.status)
    || countBlockingRisks(template.currentVersion.analysis) > 0
  )).length;
  const searchKeyword = keyword.trim().toLocaleLowerCase();
  const visibleTemplates = templates.filter((template) => (
    (templateFilter === "ALL" || template.status === templateFilter)
    && (!searchKeyword || template.name.toLocaleLowerCase().includes(searchKeyword))
  ));

  const announce = (tone: XsStatusTone, message: string) => {
    setOperationTone(tone);
    setOperationStatus(message);
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
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
    <section className="official-document-view" aria-label="公文模板库">
      <OfficialDocumentAppActions>
        <span className="official-document-engine-chip" data-state={wordEngineAvailable ? "ready" : "unavailable"}>
          <Cpu size={14} aria-hidden="true" />
          排版引擎 {wordEngineAvailable ? "可用" : "不可用"}
        </span>
        <Button type="primary" icon={<UploadSimple size={17} />} loading={isUploading} onClick={handleUploadClick}>
          上传 DOCX 模板
        </Button>
      </OfficialDocumentAppActions>

      <OfficialDocumentViewHead description="原始 Word 模板不可覆盖，每次发布生成不可变版本。选择模板进入校准页处理角色映射与发布。" />

      {operationStatus ? (
        <XsStatusBar
          tone={operationTone}
          label="操作"
          message={operationStatus}
          transitionKey={`${operationTone}:${operationStatus}`}
        />
      ) : null}

      <XsAsyncPanel
        status={status}
        empty={templates.length === 0}
        emptyTitle="还没有可用的公文模板"
        emptyDescription="上传一份 DOCX 后开始模板分析、校准角色并发布。"
        emptyActionLabel="上传 DOCX 模板"
        onEmptyAction={handleUploadClick}
        errorTitle="模板库不可用"
        error={query.error instanceof Error ? query.error.message : "无法加载公文模板。"}
        onRetry={() => void query.refetch()}
        loadingVariant="rows"
        contentKey={query.dataUpdatedAt}
      >
        <div className="official-document-panel">
          <OfficialDocumentToolbar
            searchValue={keyword}
            searchLabel="搜索模板名称"
            searchPlaceholder="搜索模板名称"
            onSearchChange={setKeyword}
            filters={templateFilters.map((filter) => ({
              key: filter.key,
              label: filter.label,
              count: filter.key === "ALL"
                ? templates.length
                : templates.filter((template) => template.status === filter.key).length
            }))}
            filterLabel="模板状态筛选"
            activeFilter={templateFilter}
            onFilterChange={setTemplateFilter}
            summary={needsReviewCount > 0 ? `${needsReviewCount} 个模板待校准` : "全部模板结构可用"}
            onRefresh={() => void query.refetch()}
            isRefreshing={query.isFetching}
          />
          {visibleTemplates.length ? (
            <OfficialDocumentList
              ariaLabel="公文模板列表"
              columns={templateColumns}
              gridTemplate={TEMPLATE_GRID}
            >
              {visibleTemplates.map((template, index) => {
                const blockingCount = countBlockingRisks(template.currentVersion.analysis);
                const pageCount = template.currentVersion.analysis?.pageCount;
                return (
                  <OfficialDocumentRow
                    key={template.id}
                    index={index}
                    ariaLabel={`打开模板 ${template.name}`}
                    onOpen={() => navigate(`/writing/templates/${template.id}`)}
                  >
                    <OfficialDocumentRowLead
                      glyph={<FileDoc size={18} />}
                      title={template.name}
                      meta={`v${template.currentVersion.versionNo} · ${template.currentVersion.fileName}`}
                    />
                    <OfficialDocumentRowCell>
                      <Tag bordered={false} color={templateStatusColor[template.status]}>
                        {templateStatusLabel[template.status]}
                      </Tag>
                    </OfficialDocumentRowCell>
                    <OfficialDocumentRowCell optional>
                      {template.status === "ANALYZING" ? (
                        <span>正在分析结构</span>
                      ) : blockingCount > 0 ? (
                        <em>{blockingCount} 项阻断</em>
                      ) : (
                        <span>{pageCount ? `${pageCount} 页 · 结构可用` : "结构可用"}</span>
                      )}
                    </OfficialDocumentRowCell>
                    <OfficialDocumentRowCell optional mono>
                      {formatFileSize(template.currentVersion.fileSize)}
                    </OfficialDocumentRowCell>
                    <OfficialDocumentRowCell mono>{formatDate(template.updatedAt)}</OfficialDocumentRowCell>
                  </OfficialDocumentRow>
                );
              })}
            </OfficialDocumentList>
          ) : (
            <div className="official-document-inline-empty">
              {keyword ? `没有找到与“${keyword}”相关的模板。` : "当前筛选状态下暂无模板。"}
            </div>
          )}
        </div>
      </XsAsyncPanel>

      <input
        ref={uploadInputRef}
        hidden
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        data-testid="official-document-template-file"
        onChange={handleUpload}
      />
    </section>
  );
}
