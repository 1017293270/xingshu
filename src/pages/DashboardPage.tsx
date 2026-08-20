import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Pagination, Segmented } from "antd";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { XsEmptyState } from "@/components/xs/XsEmptyState";
import { xsEnterStep } from "@/components/xs/motion";
import { queryAssetFeatureEnabled } from "@/config/features";
import { DashboardCard } from "@/features/dashboard/DashboardCard";
import { hasCompletedDashboardOnboarding } from "@/features/dashboard/DashboardOnboarding";
import {
  archiveDashboard,
  copyDashboard,
  createDashboard,
  getDashboardListInitialData,
  listDashboards,
  rollbackDashboard
} from "@/services/dashboardAnalyticsService";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import type { DashboardRecord, DashboardVersion } from "@/types/dashboardStudio";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";
import { PageFrame } from "./PageFrame";
import "./styles/page-shell.css";
import "./styles/dashboard-list.css";

function editorPath(id: string, source?: "favorites") {
  const params = new URLSearchParams({ draft: id });
  if (source) params.set("source", source);
  return `/dashboard-editor?${params.toString()}`;
}

function runtimePath(id: string) {
  return `/dashboard-view?dashboard=${encodeURIComponent(id)}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionScope = useSessionQueryScope();
  const dashboardsKey = sessionQueryKey(sessionScope, "analytics-dashboards");
  const userId = useDataHubAuthStore((state) => state.user?.userId);
  const dashboardOnboardingOpen = useUiStore((state) => state.dashboardOnboardingOpen);
  const setDashboardOnboardingOpen = useUiStore((state) => state.setDashboardOnboardingOpen);
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});
  const [operationError, setOperationError] = useState("");
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DashboardRecord["status"]>("all");
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSource, setCreateSource] = useState<"blank" | "favorites">("blank");
  const [archiveCandidate, setArchiveCandidate] = useState<DashboardRecord | null>(null);
  const pageSize = 9;

  const dashboardsQuery = useQuery({
    queryKey: dashboardsKey,
    queryFn: listDashboards,
    initialData: getDashboardListInitialData,
    retry: false
  });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: dashboardsKey });

  const createMutation = useMutation({
    mutationFn: ({ title }: { source: "blank" | "favorites"; title: string }) =>
      createDashboard(createBlankDashboard({ title })),
    onSuccess: (record, variables) => {
      setCreateDialogOpen(false);
      navigate(editorPath(record.id, variables.source === "favorites" ? "favorites" : undefined));
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "创建看板失败")
  });
  const copyMutation = useMutation({
    mutationFn: copyDashboard,
    onSuccess: (record) => {
      queryClient.setQueryData<DashboardRecord[]>(dashboardsKey, (current = []) => [record, ...current]);
      navigate(editorPath(record.id));
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "复制看板失败")
  });
  const archiveMutation = useMutation({
    mutationFn: archiveDashboard,
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DashboardRecord[]>(dashboardsKey, (current = []) =>
        current.filter((record) => record.id !== id));
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "归档看板失败")
  });
  const rollbackMutation = useMutation({
    mutationFn: ({ record, version }: { record: DashboardRecord; version: DashboardVersion }) =>
      rollbackDashboard(record, version),
    onSuccess: () => void refreshList(),
    onError: (error) => setOperationError(error instanceof Error ? error.message : "回滚版本失败")
  });
  const copyLoginLink = async (record: DashboardRecord) => {
    const link = `${window.location.origin}${runtimePath(record.id)}`;
    try { await navigator.clipboard?.writeText(link); } catch { /* 页面仍会展示链接 */ }
    setShareLinks((current) => ({ ...current, [record.id]: link }));
  };

  const requestCreate = (source: "blank" | "favorites") => {
    setOperationError("");
    setCreateSource(source);
    setCreateTitle("");
    setCreateDialogOpen(true);
  };

  const records = dashboardsQuery.data ?? [];
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
  useEffect(() => {
    if (
      import.meta.env.MODE === "test" ||
      dashboardsQuery.isPending ||
      dashboardsQuery.isError ||
      records.length > 0 ||
      dashboardOnboardingOpen ||
      hasCompletedDashboardOnboarding(userId)
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => setDashboardOnboardingOpen(true), 300);
    return () => window.clearTimeout(timer);
  }, [
    dashboardOnboardingOpen,
    dashboardsQuery.isError,
    dashboardsQuery.isPending,
    records.length,
    setDashboardOnboardingOpen,
    userId
  ]);

  useEffect(
    () => () => setDashboardOnboardingOpen(false),
    [setDashboardOnboardingOpen]
  );

  return (
    <PageFrame
      className="dashboard-list"
      title="大屏库"
      subtitle="查询数据按当前登录账号权限实时加载，布局与查询版本独立发布。"
      actions={(
        <>
          {queryAssetFeatureEnabled ? (
            <Button disabled={createMutation.isPending} onClick={() => requestCreate("favorites")}>
              从收藏问数创建
            </Button>
          ) : null}
          <Button
            type="primary"
            disabled={createMutation.isPending}
            data-testid="create-dashboard-button"
            onClick={() => requestCreate("blank")}
          >
            {createMutation.isPending ? "创建中" : "新建大屏"}
          </Button>
        </>
      )}
    >

      {operationError ? (
        <p className="dashboard-list__alert dashboard-list__alert--error" role="alert">{operationError}</p>
      ) : null}

      {records.length > 0 && !dashboardsQuery.isLoading && !dashboardsQuery.isError ? (
        <section className="dashboard-list__toolbar xs-page-enter" style={xsEnterStep(1)} aria-label="筛选大屏">
          <Input
            allowClear
            prefix={<MagnifyingGlass size={18} />}
            placeholder="搜索大屏名称或说明"
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
          <span>{filteredRecords.length} 个大屏</span>
        </section>
      ) : null}

      {dashboardsQuery.isLoading ? (
        <section className="dashboard-list__grid xs-page-enter" style={xsEnterStep(2)} aria-busy="true" aria-label="正在加载大屏库">
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
          title="大屏库暂不可用"
          description={dashboardsQuery.error instanceof Error ? dashboardsQuery.error.message : "请稍后重试"}
          actionLabel="重试"
          onAction={() => void dashboardsQuery.refetch()}
        />
      ) : records.length === 0 ? (
        <XsEmptyState
          ariaLabel="大屏库空状态"
          eyebrow="暂无大屏"
          title="创建第一个大屏"
          description="可从空白画布开始，也可在问数结果中收藏并一键生成。"
          secondaryActionLabel={queryAssetFeatureEnabled ? "选择收藏问数" : undefined}
          onSecondaryAction={queryAssetFeatureEnabled ? () => requestCreate("favorites") : undefined}
          actionLabel="新建大屏"
          onAction={() => requestCreate("blank")}
        />
      ) : filteredRecords.length === 0 ? (
        <XsEmptyState
          ariaLabel="大屏库筛选无结果"
          eyebrow="无匹配结果"
          title="没有找到符合条件的大屏"
          description="调整关键词或发布状态后重试。"
          actionLabel="清除筛选"
          onAction={() => {
            setSearchQuery("");
            setStatusFilter("all");
          }}
        />
      ) : (
        <>
        <section className="dashboard-list__grid xs-page-enter" style={xsEnterStep(2)} aria-label="大屏库">
          {visibleRecords.map((record) => (
            <DashboardCard
              key={record.id}
              record={record}
              editorPath={editorPath(record.id)}
              runtimePath={runtimePath(record.id)}
              shareLink={shareLinks[record.id]}
              versionsExpanded={Boolean(expandedVersions[record.id])}
              copying={copyMutation.isPending && copyMutation.variables?.id === record.id}
              archiving={archiveMutation.isPending && archiveMutation.variables === record.id}
              rollingBack={rollbackMutation.isPending}
              onToggleVersions={() =>
                setExpandedVersions((current) => ({ ...current, [record.id]: !current[record.id] }))}
              onCopy={() => copyMutation.mutate(record)}
              onShare={() => void copyLoginLink(record)}
              onArchive={() => setArchiveCandidate(record)}
              onRollback={(version) => rollbackMutation.mutate({ record, version })}
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

      <Modal
        title={createSource === "favorites" ? "从收藏问数创建大屏" : "新建大屏"}
        open={createDialogOpen}
        okText={createMutation.isPending ? "创建中" : "创建并进入编辑器"}
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        okButtonProps={{ disabled: !createTitle.trim() }}
        destroyOnHidden
        onCancel={() => setCreateDialogOpen(false)}
        onOk={() => createMutation.mutate({ source: createSource, title: createTitle.trim() })}
      >
        <label className="dashboard-list__create-label" htmlFor="dashboard-create-title">大屏名称</label>
        <Input
          id="dashboard-create-title"
          autoFocus
          maxLength={80}
          placeholder="例如：华东区经营驾驶舱"
          value={createTitle}
          onChange={(event) => setCreateTitle(event.target.value)}
          onPressEnter={() => {
            if (createTitle.trim() && !createMutation.isPending) {
              createMutation.mutate({ source: createSource, title: createTitle.trim() });
            }
          }}
        />
      </Modal>

      <Modal
        title="归档大屏"
        open={Boolean(archiveCandidate)}
        okText="确认归档"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={archiveMutation.isPending}
        destroyOnHidden
        onCancel={() => setArchiveCandidate(null)}
        onOk={() => {
          if (archiveCandidate) {
            archiveMutation.mutate(archiveCandidate.id, {
              onSuccess: () => setArchiveCandidate(null)
            });
          }
        }}
      >
        <p>归档“{archiveCandidate?.schema.title}”？它会从大屏库中移除。</p>
      </Modal>
    </PageFrame>
  );
}
