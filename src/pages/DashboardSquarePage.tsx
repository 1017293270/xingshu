import { Button, Input, Pagination, Segmented } from "antd";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { XsEmptyState } from "@/components/xs/XsEmptyState";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { xsEnterStep } from "@/components/xs/motion";
import { queryAssetFeatureEnabled } from "@/config/features";
import { DashboardCard } from "@/features/dashboard/DashboardCard";
import {
  DashboardArchiveDialog,
  DashboardCreateDialog
} from "@/features/dashboard/DashboardLibraryDialogs";
import { writeCurrentDashboardId } from "@/features/dashboard/currentDashboard";
import {
  dashboardEditorPath,
  dashboardRuntimePath,
  useDashboardLibrary
} from "@/features/dashboard/useDashboardLibrary";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { PageFrame } from "./PageFrame";
import "./styles/page-shell.css";
import "./styles/dashboard-list.css";

const pageSize = 9;

export function DashboardSquarePage() {
  const navigate = useNavigate();
  const library = useDashboardLibrary();
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DashboardRecord["status"]>("all");
  const [page, setPage] = useState(1);

  const { dashboardsQuery, records } = library;
  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");
    return records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesQuery = !normalizedQuery || [record.schema.title, record.schema.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("zh-CN").includes(normalizedQuery));
      return matchesStatus && matchesQuery;
    });
  }, [records, searchQuery, statusFilter]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredRecords.length / pageSize)));
  const visibleRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** 设为当前：写下本地指针后回「我的看板」，那边内联渲染的就是这一块。 */
  function setAsCurrent(record: DashboardRecord) {
    writeCurrentDashboardId(record.id);
    navigate("/dashboard");
  }

  return (
    <PageFrame
      className="dashboard-list dashboard-square"
      title="看板广场"
      subtitle="查询数据按当前登录账号权限实时加载，布局与查询版本独立发布。"
      actions={(
        <>
          <Link className="xs-action-link dashboard-square__back" to="/dashboard">
            <ArrowLeft size={16} aria-hidden="true" />
            返回我的看板
          </Link>
          {queryAssetFeatureEnabled ? (
            <Button disabled={library.createMutation.isPending} onClick={() => library.requestCreate("favorites")}>
              从收藏问数创建
            </Button>
          ) : null}
          <Button
            type="primary"
            disabled={library.createMutation.isPending}
            data-testid="create-dashboard-button"
            onClick={() => library.requestCreate("blank")}
          >
            新建看板
          </Button>
        </>
      )}
    >

      {library.operationError ? (
        <XsStatusBar
          slotClassName="dashboard-list__alert-slot"
          tone="error"
          message={library.operationError}
          transitionKey={library.operationError}
        />
      ) : null}

      {records.length > 0 && !dashboardsQuery.isLoading && !dashboardsQuery.isError ? (
        <section className="dashboard-list__toolbar xs-page-enter" style={xsEnterStep(1)} aria-label="筛选看板">
          <Input
            allowClear
            className="dashboard-list__toolbar-search"
            prefix={<MagnifyingGlass size={16} />}
            placeholder="搜索看板名称或说明"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setPage(1);
            }}
          />
          <Segmented
            aria-label="按发布状态筛选"
            value={statusFilter}
            options={[
              { label: "全部", value: "all" },
              { label: "草稿", value: "draft" },
              { label: "已发布", value: "published" }
            ]}
            onChange={(value) => {
              setStatusFilter(value as "all" | DashboardRecord["status"]);
              setPage(1);
            }}
          />
          <span className="dashboard-list__toolbar-count" aria-live="polite">
            {filteredRecords.length} 个看板
          </span>
        </section>
      ) : null}

      {dashboardsQuery.isLoading ? (
        <section className="dashboard-list__grid xs-page-enter" style={xsEnterStep(2)} aria-busy="true" aria-label="正在加载看板广场">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="dashboard-card dashboard-card--skeleton" aria-hidden="true">
              <div className="dashboard-card__preview dashboard-list__skeleton" />
              <div className="dashboard-card__body">
                <span className="dashboard-list__skeleton dashboard-list__skeleton--title" />
                <span className="dashboard-list__skeleton" />
              </div>
            </div>
          ))}
        </section>
      ) : dashboardsQuery.isError ? (
        <XsEmptyState
          tone="error"
          title="看板广场暂不可用"
          description={dashboardsQuery.error instanceof Error ? dashboardsQuery.error.message : "请稍后重试"}
          actionLabel="重试"
          onAction={() => void dashboardsQuery.refetch()}
        />
      ) : records.length === 0 ? (
        <XsEmptyState
          ariaLabel="看板广场空状态"
          eyebrow="暂无看板"
          title="创建第一个看板"
          description="可从空白画布开始，也可在问数结果中收藏并一键生成。"
          secondaryActionLabel={queryAssetFeatureEnabled ? "选择收藏问数" : undefined}
          onSecondaryAction={queryAssetFeatureEnabled ? () => library.requestCreate("favorites") : undefined}
          actionLabel="新建看板"
          onAction={() => library.requestCreate("blank")}
        />
      ) : filteredRecords.length === 0 ? (
        <XsEmptyState
          ariaLabel="看板广场筛选无结果"
          eyebrow="无匹配结果"
          title="没有找到符合条件的看板"
          description="调整关键词或发布状态后重试。"
          actionLabel="清除筛选"
          onAction={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
        />
      ) : (
        <>
        <section className="dashboard-list__grid xs-page-enter" style={xsEnterStep(2)} aria-label="看板广场">
          {visibleRecords.map((record) => (
            <DashboardCard
              key={record.id}
              record={record}
              editorPath={dashboardEditorPath(record.id)}
              runtimePath={dashboardRuntimePath(record.id)}
              shareLink={library.shareLinks[record.id]}
              versionsExpanded={Boolean(expandedVersions[record.id])}
              copying={library.copyMutation.isPending && library.copyMutation.variables?.id === record.id}
              archiving={library.archiveMutation.isPending && library.archiveMutation.variables === record.id}
              rollingBack={library.rollbackMutation.isPending}
              onToggleVersions={() =>
                setExpandedVersions((current) => ({ ...current, [record.id]: !current[record.id] }))}
              onSetCurrent={() => setAsCurrent(record)}
              onCopy={() => library.copyMutation.mutate(record)}
              onShare={() => void library.copyShareLink(record)}
              onArchive={() => library.setArchiveCandidate(record)}
              onRollback={(version) => library.rollbackMutation.mutate({ record, version })}
            />
          ))}
        </section>
        {filteredRecords.length > pageSize ? (
          <Pagination
            className="dashboard-list__pagination"
            current={currentPage}
            pageSize={pageSize}
            total={filteredRecords.length}
            showSizeChanger={false}
            onChange={setPage}
          />
        ) : null}
        </>
      )}

      <DashboardCreateDialog library={library} />
      <DashboardArchiveDialog library={library} />
    </PageFrame>
  );
}
