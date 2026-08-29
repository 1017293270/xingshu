import "@/styles/tokens.css";
import "@/components/xs/xs.css";
import "@/features/dashboardStudio/dashboardStudio.css";
import { mountDashboardRuntime } from "@/features/dashboardStudio/vue/mountDashboardRuntime";
import { createDashboardDraftFromTables } from "@/services/dashboardGenerationService";
import type { DashboardRecord } from "@/types/dashboardStudio";
import type { DataHubTableResult } from "@/types/dataHub";

const col = (key: string, title: string, type = "string") => ({ key, title, type, columnId: key });

const communityTable: DataHubTableResult = {
  columns: [col("community", "社区"), col("count", "上报数量", "int")],
  rows: [
    { community: "苍天工程报事报修群", count: 772 },
    { community: "一号还房二期", count: 341 },
    { community: "（花袷社区）M13-16栋管群", count: 318 }
  ],
  totalRows: 3,
  groupLabel: "事件上报量最多的3个社区"
};

const trendTable: DataHubTableResult = {
  columns: [col("date", "日期", "date"), col("count", "上报数量", "int")],
  rows: [
    { date: "2026-08-06T00:00:00.000", count: 47 },
    { date: "2026-08-07T00:00:00.000", count: 55 },
    { date: "2026-08-08T00:00:00.000", count: 50 },
    { date: "2026-08-09T00:00:00.000", count: 31 },
    { date: "2026-08-10T00:00:00.000", count: 62 },
    { date: "2026-08-11T00:00:00.000", count: 58 },
    { date: "2026-08-12T00:00:00.000", count: 66 }
  ],
  totalRows: 7,
  groupLabel: "近7日事件数量上报趋势"
};

const schema = createDashboardDraftFromTables({
  question: "事件上报量最多的3个社区",
  summary: "苍天工程报事报修群的上报数量最高，为 772 件。",
  tables: [communityTable, trendTable]
});

const record: DashboardRecord = {
  id: "preview", status: "published", revision: 1,
  schema, publishedSchema: schema, publishedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
};

mountDashboardRuntime(document.getElementById("root")!, record, { fullscreen: true });
