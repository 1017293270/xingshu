import { FileDoc, UploadSimple } from "@phosphor-icons/react";
import { Button, Tag } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { XsUploadDialog } from "@/components/xs/XsUploadDialog";
import { uploadOfficialDocumentTemplate } from "@/services/officialDocumentService";
import type { OfficialDocumentTemplateStatus } from "@/types/officialDocument";
import {
  countBlockingRisks,
  formatDate,
  formatFileSize,
  templateIsUsable,
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

type TemplateFilter = "ALL" | "USABLE" | Exclude<OfficialDocumentTemplateStatus, "NEEDS_REVIEW" | "PUBLISHED">;

const templateFilters: Array<{ key: TemplateFilter; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "USABLE", label: "可用" },
  { key: "ANALYZING", label: "分析中" },
  { key: "BLOCKED", label: "有错误" },
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("ALL");
  const [keyword, setKeyword] = useState("");

  const routeState = location.state as { notice?: string; noticeTone?: XsStatusTone } | null;
  const operationStatus = routeState?.notice ?? "";
  const operationTone: XsStatusTone = routeState?.noticeTone ?? "info";
  const templates = query.data?.templates ?? [];
  const usableCount = templates.filter((template) => templateIsUsable(template.status)).length;
  const searchKeyword = keyword.trim().toLocaleLowerCase();
  const visibleTemplates = templates.filter((template) => (
    (templateFilter === "ALL"
      || (templateFilter === "USABLE" && templateIsUsable(template.status))
      || template.status === templateFilter)
    && (!searchKeyword || template.name.toLocaleLowerCase().includes(searchKeyword))
  ));

  const handleUploadClick = () => {
    setUploadOpen(true);
  };

  // 失败时把错误抛回弹窗：弹窗保持打开、就地显示原因，用户换个文件就能重试。
  const handleUpload = async (file: File) => {
    const result = await uploadOfficialDocumentTemplate(file);
    updateWorkspaceCache((current) => ({
      ...current,
      templates: [result.template, ...current.templates.filter((item) => item.id !== result.template.id)]
    }));
    navigate(`/writing/templates/${result.template.id}`, {
      state: { notice: result.message, noticeTone: result.persisted ? "success" : "warning" }
    });
  };

  return (
    <section className="official-document-view" aria-label="公文模板库">
      <OfficialDocumentAppActions>
        <Button type="primary" icon={<UploadSimple size={17} />} onClick={handleUploadClick}>
          上传 DOCX 模板
        </Button>
      </OfficialDocumentAppActions>

      <OfficialDocumentViewHead description="上传 DOCX 后，结构分析完成即可起草。角色或问数槽位有误时，打开模板直接改。" />

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
        emptyDescription="上传一份 DOCX，分析完成后即可起草。"
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
                : filter.key === "USABLE"
                  ? usableCount
                  : templates.filter((template) => template.status === filter.key).length
            }))}
            filterLabel="模板状态筛选"
            activeFilter={templateFilter}
            onFilterChange={setTemplateFilter}
            summary={`${usableCount} 个模板可用`}
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
                        <em>{blockingCount} 项错误</em>
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

      <XsUploadDialog
        open={uploadOpen}
        title="上传 DOCX 模板"
        description="上传后自动做安全检查和结构分析，完成即可起草。"
        accept={[".docx"]}
        acceptMimeTypes={["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}
        maxBytes={25 * 1024 * 1024}
        submitLabel="上传并分析"
        hint="模板里的角色与问数槽位可在分析完成后调整"
        inputTestId="official-document-template-file"
        onUpload={handleUpload}
        onClose={() => setUploadOpen(false)}
      />
    </section>
  );
}
