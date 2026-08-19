import { FileText, Plus, ShieldWarning } from "@phosphor-icons/react";
import { Button, Tag } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import type { OfficialDocumentDraftStatus } from "@/types/officialDocument";
import {
  draftStatusColor,
  draftStatusLabel,
  formatDate
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
import {
  OFFICIAL_DOCUMENT_TEMPLATES_PATH,
  OfficialDocumentAppActions,
  useOfficialDocumentAppChrome
} from "./OfficialDocumentAppShell";
import { useOfficialDocumentWorkspace } from "./useOfficialDocumentWorkspace";
import "./official-document-workspace.css";

type DraftFilter = "ALL" | OfficialDocumentDraftStatus;

const draftFilters: Array<{ key: DraftFilter; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "EDITING", label: "编辑中" },
  { key: "VALIDATING", label: "校验中" },
  { key: "READY", label: "可导出" },
  { key: "BLOCKED", label: "已阻断" }
];

const draftColumns: OfficialDocumentListColumn[] = [
  { key: "title", label: "草稿" },
  { key: "status", label: "状态" },
  { key: "bindings", label: "问数绑定", optional: true },
  { key: "version", label: "文件版本", optional: true },
  { key: "updated", label: "更新时间" }
];

const DRAFT_GRID = "minmax(0, 2.4fr) 92px 96px 92px 112px 18px";

export function DraftLibraryView() {
  const navigate = useNavigate();
  const location = useLocation();
  useOfficialDocumentAppChrome({ stage: "drafts", context: "草稿箱" });
  const { query, status } = useOfficialDocumentWorkspace();
  const [operationStatus, setOperationStatus] = useState(
    () => (location.state as { notice?: string } | null)?.notice ?? ""
  );
  const [operationTone, setOperationTone] = useState<XsStatusTone>(
    () => (location.state as { noticeTone?: XsStatusTone } | null)?.noticeTone ?? "info"
  );
  const [draftFilter, setDraftFilter] = useState<DraftFilter>("ALL");
  const [keyword, setKeyword] = useState("");

  const drafts = query.data?.drafts ?? [];
  const publishedTemplateCount = (query.data?.templates ?? [])
    .filter((template) => template.status === "PUBLISHED").length;
  const readyCount = drafts.filter((draft) => draft.status === "READY").length;
  const searchKeyword = keyword.trim().toLocaleLowerCase();
  const visibleDrafts = drafts.filter((draft) => (
    (draftFilter === "ALL" || draft.status === draftFilter)
    && (!searchKeyword || draft.title.toLocaleLowerCase().includes(searchKeyword))
  ));

  const handleCreateDraft = () => {
    if (publishedTemplateCount === 0) {
      setOperationTone("warning");
      setOperationStatus("还没有已发布模板，请先在模板库上传 DOCX 并完成校准。");
      return;
    }
    navigate(OFFICIAL_DOCUMENT_TEMPLATES_PATH, {
      state: {
        notice: "选择一个已发布模板，进入校准页后点击“按模板新建草稿”。",
        noticeTone: "info"
      }
    });
  };

  return (
    <section className="official-document-view" aria-label="公文草稿箱">
      <OfficialDocumentAppActions>
        <Button type="primary" icon={<Plus size={16} />} onClick={handleCreateDraft}>新建草稿</Button>
      </OfficialDocumentAppActions>

      <OfficialDocumentViewHead description="草稿继承创建时的不可变模板版本，不会反向修改已发布模板。" />

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
        empty={drafts.length === 0}
        emptyTitle="还没有公文草稿"
        emptyDescription="从已发布模板创建第一份草稿。"
        emptyActionLabel="去模板库"
        onEmptyAction={() => navigate(OFFICIAL_DOCUMENT_TEMPLATES_PATH)}
        errorTitle="草稿箱不可用"
        error={query.error instanceof Error ? query.error.message : "无法加载公文草稿。"}
        onRetry={() => void query.refetch()}
        loadingVariant="rows"
        contentKey={query.dataUpdatedAt}
      >
        <div className="official-document-panel">
          <OfficialDocumentToolbar
            searchValue={keyword}
            searchLabel="搜索草稿标题"
            searchPlaceholder="搜索草稿标题"
            onSearchChange={setKeyword}
            filters={draftFilters.map((filter) => ({
              key: filter.key,
              label: filter.label,
              count: filter.key === "ALL"
                ? drafts.length
                : drafts.filter((draft) => draft.status === filter.key).length
            }))}
            filterLabel="草稿状态筛选"
            activeFilter={draftFilter}
            onFilterChange={setDraftFilter}
            summary={`${readyCount} 篇可导出`}
            onRefresh={() => void query.refetch()}
            isRefreshing={query.isFetching}
          />
          {visibleDrafts.length ? (
            <OfficialDocumentList
              ariaLabel="公文草稿列表"
              columns={draftColumns}
              gridTemplate={DRAFT_GRID}
            >
              {visibleDrafts.map((draft, index) => (
                <OfficialDocumentRow
                  key={draft.id}
                  index={index}
                  ariaLabel={`打开草稿 ${draft.title}`}
                  onOpen={() => navigate(`/writing/drafts/${draft.id}`)}
                >
                  <OfficialDocumentRowLead
                    glyph={<FileText size={18} />}
                    title={draft.title}
                    meta={draft.templateName}
                  />
                  <OfficialDocumentRowCell>
                    <Tag bordered={false} color={draftStatusColor[draft.status]}>
                      {draftStatusLabel[draft.status]}
                    </Tag>
                  </OfficialDocumentRowCell>
                  <OfficialDocumentRowCell optional>{draft.bindings.length} 个</OfficialDocumentRowCell>
                  <OfficialDocumentRowCell optional mono>v{draft.currentFileVersionNo}</OfficialDocumentRowCell>
                  <OfficialDocumentRowCell mono>{formatDate(draft.updatedAt)}</OfficialDocumentRowCell>
                </OfficialDocumentRow>
              ))}
            </OfficialDocumentList>
          ) : (
            <div className="official-document-inline-empty">
              {keyword ? `没有找到与“${keyword}”相关的草稿。` : "当前筛选状态下暂无草稿。"}
            </div>
          )}
        </div>
      </XsAsyncPanel>

      <p className="official-document-view__note">
        <ShieldWarning size={16} aria-hidden="true" />
        <span>许可失效、结构槽位丢失、Schema 漂移或致命保真差异时，正式导出会自动停止。</span>
      </p>
    </section>
  );
}
