import type { DashboardRecord } from "@/types/dashboardStudio";
import { DashboardRuntimeIsland } from "./DashboardRuntimeIsland";

export function GeneratedDashboardView({
  record
}: {
  record: DashboardRecord;
}) {
  return <DashboardRuntimeIsland record={record} fullscreen />;
}
