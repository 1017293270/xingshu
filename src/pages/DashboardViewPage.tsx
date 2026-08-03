import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowsClockwise } from "@phosphor-icons/react";
import { Link, useSearchParams } from "react-router";
import { sessionQueryKey, useSessionQueryScope } from "@/app/sessionQuery";
import { GeneratedDashboardView } from "@/features/dashboardStudio/GeneratedDashboardView";
import {
  getDashboardRuntime,
  getDashboardRuntimeInitialData
} from "@/services/dashboardAnalyticsService";

export function DashboardViewPage() {
  const sessionScope = useSessionQueryScope();
  const [searchParams] = useSearchParams();
  const dashboardId = searchParams.get("dashboard");
  const runtimeQuery = useQuery({
    queryKey: sessionQueryKey(sessionScope, "analytics-dashboard-runtime", dashboardId),
    enabled: Boolean(dashboardId),
    initialData: () => getDashboardRuntimeInitialData(dashboardId),
    retry: false,
    queryFn: async () => {
      const record = await getDashboardRuntime(dashboardId!);
      if (!record) throw new Error("未找到运行态大屏");
      return record;
    }
  });

  if (runtimeQuery.isLoading) {
    return (
      <main className="dashboard-fullscreen-view dashboard-fullscreen-view--loading">
        <div className="dashboard-runtime-layout-skeleton" role="status" aria-label="正在校验权限并加载实时看板">
          <span className="sr-only">正在校验权限并加载实时看板…</span>
          {Array.from({ length: 7 }, (_, index) => <i key={index} aria-hidden="true" />)}
        </div>
      </main>
    );
  }

  if (!runtimeQuery.data) {
    return (
      <main className="dashboard-fullscreen-view dashboard-fullscreen-view--error">
        <div className="dashboard-fullscreen-view__error" role="alert">
          <h1>运行态暂不可用</h1>
          <p>{runtimeQuery.error instanceof Error ? runtimeQuery.error.message : "未找到运行态大屏"}</p>
          <button type="button" onClick={() => void runtimeQuery.refetch()}>重试</button>
        </div>
      </main>
    );
  }

  const updatedAt = runtimeQuery.data.publishedAt || runtimeQuery.data.updatedAt;
  return (
    <main className="dashboard-fullscreen-view">
      <header className="dashboard-fullscreen-view__toolbar">
        <Link className="dashboard-fullscreen-view__back" to="/dashboard">
          <ArrowLeft size={18} aria-hidden="true" />
          返回大屏库
        </Link>
        <div className="dashboard-fullscreen-view__meta">
          <strong>{runtimeQuery.data.schema.title}</strong>
          <time dateTime={updatedAt}>最近更新 {new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
        </div>
        <button
          type="button"
          className="dashboard-fullscreen-view__refresh"
          disabled={runtimeQuery.isFetching}
          onClick={() => void runtimeQuery.refetch()}
        >
          <ArrowsClockwise size={18} aria-hidden="true" />
          {runtimeQuery.isFetching ? "刷新中" : "刷新"}
        </button>
      </header>
      <GeneratedDashboardView record={runtimeQuery.data} />
    </main>
  );
}
