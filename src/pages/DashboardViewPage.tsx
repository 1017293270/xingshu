import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { GeneratedDashboardView } from "@/features/dashboardStudio/GeneratedDashboardView";
import { getBrowserDashboardRepository } from "@/services/dashboardRepositoryService";

export function DashboardViewPage() {
  const [searchParams] = useSearchParams();
  const repository = useMemo(() => getBrowserDashboardRepository(), []);
  const dashboardId = searchParams.get("dashboard");
  const shareToken = searchParams.get("share");
  const record = shareToken
    ? repository.getShared(shareToken)
    : dashboardId
      ? repository.getRuntime(dashboardId)
      : null;
  if (!record) {
    return (
      <main className="dashboard-fullscreen-view dashboard-fullscreen-view--error">
        <div className="dashboard-fullscreen-view__error" role="alert">
          <h1>运行态暂不可用</h1>
          <p>未找到运行态大屏</p>
          <button type="button" onClick={() => window.location.reload()}>重试</button>
        </div>
      </main>
    );
  }

  return <GeneratedDashboardView record={record} />;
}
