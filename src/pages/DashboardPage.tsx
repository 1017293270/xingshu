import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import dashboardEmptyIcon from "@/assets/icon-kit/xingshu-image2-v1/icon-business-dashboard.png";
import { queryAssetFeatureEnabled } from "@/config/features";
import { DashboardCard } from "@/features/dashboard/DashboardCard";
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
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});
  const [operationError, setOperationError] = useState("");
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});

  const dashboardsQuery = useQuery({
    queryKey: ["analytics-dashboards"],
    queryFn: listDashboards,
    initialData: getDashboardListInitialData,
    retry: false
  });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["analytics-dashboards"] });

  const createMutation = useMutation({
    mutationFn: (_source: "blank" | "favorites") =>
      createDashboard(createBlankDashboard({ title: "未命名大屏" })),
    onSuccess: (record, source) => navigate(editorPath(record.id, source === "favorites" ? "favorites" : undefined)),
    onError: (error) => setOperationError(error instanceof Error ? error.message : "创建看板失败")
  });
  const copyMutation = useMutation({
    mutationFn: copyDashboard,
    onSuccess: (record) => {
      queryClient.setQueryData<DashboardRecord[]>(["analytics-dashboards"], (current = []) => [record, ...current]);
      navigate(editorPath(record.id));
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : "复制看板失败")
  });
  const archiveMutation = useMutation({
    mutationFn: archiveDashboard,
    onSuccess: (_result, id) => {
      queryClient.setQueryData<DashboardRecord[]>(["analytics-dashboards"], (current = []) =>
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

  const records = dashboardsQuery.data ?? [];
  return (
    <main className="dashboard-list">
      <header className="dashboard-list__header xs-page-enter">
        <div className="dashboard-list__title-group">
          <h1>大屏库</h1>
          <p>查询数据按当前登录账号权限实时加载，布局与查询版本独立发布。</p>
        </div>
        <div className="dashboard-list__header-actions">
          {queryAssetFeatureEnabled ? (
            <button
              className="dashboard-list__secondary-action"
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate("favorites")}
            >
              从收藏问数创建
            </button>
          ) : null}
          <button
            className="dashboard-list__primary-action"
            type="button"
            disabled={createMutation.isPending}
            data-testid="create-dashboard-button"
            onClick={() => createMutation.mutate("blank")}
          >{createMutation.isPending ? "创建中" : "新建大屏"}</button>
        </div>
      </header>

      {operationError ? (
        <p className="dashboard-list__alert dashboard-list__alert--error" role="alert">{operationError}</p>
      ) : null}

      {dashboardsQuery.isLoading ? (
        <section className="dashboard-list__grid xs-page-enter" aria-busy="true" aria-label="正在加载大屏库">
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
        <section className="dashboard-list__state dashboard-list__state--error" role="alert">
          <p className="dashboard-list__eyebrow">加载失败</p>
          <h2>大屏库暂不可用</h2>
          <p>{dashboardsQuery.error instanceof Error ? dashboardsQuery.error.message : "请稍后重试"}</p>
          <button type="button" onClick={() => void dashboardsQuery.refetch()}>重试</button>
        </section>
      ) : records.length === 0 ? (
        <section className="dashboard-list__state dashboard-list__state--empty" aria-label="大屏库空状态">
          <div className="dashboard-list__empty-visual" aria-hidden="true">
            <span className="dashboard-list__empty-orbit dashboard-list__empty-orbit--outer" />
            <span className="dashboard-list__empty-orbit dashboard-list__empty-orbit--inner" />
            <img src={dashboardEmptyIcon} alt="" />
          </div>
          <p className="dashboard-list__eyebrow">暂无大屏</p>
          <h2>创建第一个大屏</h2>
          <p>可从空白画布开始，也可在问数结果中收藏并一键生成。</p>
          <div className="dashboard-list__state-actions">
            {queryAssetFeatureEnabled ? (
              <button className="dashboard-list__secondary-action" type="button" onClick={() => createMutation.mutate("favorites")}>
                选择收藏问数
              </button>
            ) : null}
            <button className="dashboard-list__primary-action" type="button" onClick={() => createMutation.mutate("blank")}>
              新建大屏
            </button>
          </div>
        </section>
      ) : (
        <section className="dashboard-list__grid xs-page-enter" aria-label="大屏库">
          {records.map((record) => (
            <DashboardCard
              key={record.id}
              record={record}
              editorPath={editorPath(record.id)}
              runtimePath={runtimePath(record.id)}
              shareLink={shareLinks[record.id]}
              versionsExpanded={Boolean(expandedVersions[record.id])}
              copying={copyMutation.isPending}
              archiving={archiveMutation.isPending}
              rollingBack={rollbackMutation.isPending}
              onToggleVersions={() =>
                setExpandedVersions((current) => ({ ...current, [record.id]: !current[record.id] }))}
              onCopy={() => copyMutation.mutate(record)}
              onShare={() => void copyLoginLink(record)}
              onArchive={() => {
                if (window.confirm(`归档“${record.schema.title}”？它会从大屏库中移除。`)) {
                  archiveMutation.mutate(record.id);
                }
              }}
              onRollback={(version) => rollbackMutation.mutate({ record, version })}
            />
          ))}
        </section>
      )}
    </main>
  );
}
