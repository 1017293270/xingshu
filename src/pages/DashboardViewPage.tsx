import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { GeneratedDashboardView } from "@/features/dashboardStudio/GeneratedDashboardView";
import {
  getDashboardRuntime,
  getDashboardRuntimeInitialData
} from "@/services/dashboardAnalyticsService";

export function DashboardViewPage() {
  const [searchParams] = useSearchParams();
  const dashboardId = searchParams.get("dashboard");
  const runtimeQuery = useQuery({
    queryKey: ["analytics-dashboard-runtime", dashboardId],
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

  return <GeneratedDashboardView record={runtimeQuery.data} />;
}
