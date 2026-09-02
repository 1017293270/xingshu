import { FileText, Plus } from "@phosphor-icons/react";
import { Button, Tag } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import type { OfficialDocumentDraftStatus } from "@/types/officialDocument";
import {
  draftStatusColor,
  draftStatusLabel,
  formatDate,
  templateIsUsable
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
  { key: "BLOCKED", label: "有错误" }
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
  const usableTemplateCount = (query.data?.templates ?? [])
    .filter((template) => templateIsUsable(template.status)).length;
  const readyCount = drafts.filter((draft) => draft.status === "READY").length;
  const searchKeyword = keyword.trim().toLocaleLowerCase();
  const visibleDrafts = drafts.filter((draft) => (
    (draftFilter === "ALL" || draft.status === draftFilter)
    && (!searchKeyword || draft.title.toLocaleLowerCase().includes(searchKeyword))
  ));

  const handleCreateDraft = () => {
    if (usableTemplateCount === 0) {
      setOperationTone("warning");
      setOperationStatus("还没有可用结构，请先上传并发布结构 DOCX。");
      return;
    }
    navigate(OFFICIAL_DOCUMENT_TEMPLATES_PATH, {
      state: {
        notice: "选择已发布结构创建草稿，内容方案在草稿中上传并确认。",
        noticeTone: "info"
      }
    });
  };

  return (
    <section className="official-document-view" aria-label="报告草稿箱">
      <OfficialDocumentAppActions>
        <Button type="primary" icon={<Plus size={16} />} onClick={handleCreateDraft}>新建草稿</Button>
      </OfficialDocumentAppActions>

      <OfficialDocumentViewHead description="新草稿先绑定已发布结构；内容方案在草稿中上传、确认并冻结。" />

      {operationStatus ? (
        <XsStatusBar
          tone={operationTone}
          message={operationStatus}
          transitionKey={`${operationTone}:${operationStatus}`}
        />
      ) : null}

      <XsAsyncPanel
        status={status}
        empty={drafts.length === 0}
        emptyTitle="还没有报告草稿"
        emptyDescription="选择已发布结构创建第一份草稿，再在草稿中配置内容方案。"
        emptyActionLabel="去结构模板"
        onEmptyAction={() => navigate(OFFICIAL_DOCUMENT_TEMPLATES_PATH)}
        errorTitle="草稿箱不可用"
        error={query.error instanceof Error ? query.error.message : "无法加载报告草稿。"}
        onRetry={() => void query.refetch()}
        loadingVariant="rows"
        contentKey={query.dataUpdatedAt}
      >
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
        <div className="official-document-panel">
          {visibleDrafts.length ? (
            <OfficialDocumentList
              ariaLabel="报告草稿列表"
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
    </section>
  );
}
