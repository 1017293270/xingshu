import { migrateDashboardSchemaToFreeLayout } from "@/features/dashboardStudio/core/dashboardFreeLayout";
import { requestDataHub } from "./dataHubClient";
import { getBrowserDashboardRepository } from "./dashboardRepositoryService";
import type {
  DashboardRefreshResult,
  DashboardRuntime,
  LayoutPlan,
  RefreshSchedule,
  RefreshScheduleInput
} from "@/types/analytics";
import type { DashboardRecord, DashboardSchema, DashboardVersion } from "@/types/dashboardStudio";

const useTestRepository = import.meta.env.MODE === "test";

/** 只给测试环境提供同步首屏数据，生产环境始终由服务端查询。 */
export function getDashboardListInitialData() {
  return useTestRepository ? getBrowserDashboardRepository().list() : undefined;
}

/** null 表示测试仓库中没有可发布运行态；undefined 表示生产环境应发起远程请求。 */
export function getDashboardRuntimeInitialData(id: string | null) {
  if (!useTestRepository) return undefined;
  return id ? getBrowserDashboardRepository().getRuntime(id) ?? null : null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function toPersistedSchema(schema: DashboardSchema) {
  const persisted = clone(schema);
  Object.values(persisted.dataBindings).forEach((binding) => {
    binding.table.rows = [];
    binding.status = "idle";
    binding.error = undefined;
    binding.lastUpdatedAt = undefined;
  });
  return persisted;
}

function hydrateSchema(
  schema: DashboardSchema,
  datasets: DashboardRuntime["datasets"],
  statuses: DashboardRuntime["moduleStatuses"]
) {
  const hydrated = clone(migrateDashboardSchemaToFreeLayout(schema));
  Object.entries(hydrated.dataBindings).forEach(([bindingId, binding]) => {
    const output = datasets[bindingId];
    const status = statuses[bindingId];
    if (output) {
      binding.table = {
        columns: output.columns.map((column) => ({
          columnId: column.columnId,
          key: column.key,
          title: column.label || column.title || column.key,
          type: column.type
        })),
        rows: output.rows,
        totalRows: output.totalRows
      };
      binding.lastUpdatedAt = output.updatedAt;
    }
    binding.status = status === "SUCCESS" || status === "LEGACY_SNAPSHOT"
      ? "success"
      : status === "RUNNING" || status === "WAITING"
        ? "loading"
        : status
          ? "error"
          : binding.status;
    binding.error = status === "PERMISSION_REVOKED"
      ? "当前账号已无权查看该模块"
      : status === "SCHEMA_DRIFT"
        ? "结果结构已变化，需要修复字段绑定"
        : status === "FAILED"
          ? "最近一次刷新失败，当前展示最后成功数据"
          : undefined;
  });
  return hydrated;
}

function hydrateEditorRuntime(runtime: DashboardRuntime) {
  return {
    ...runtime.record,
    schema: hydrateSchema(runtime.record.schema, runtime.datasets, runtime.moduleStatuses)
  } satisfies DashboardRecord;
}

function hydratePublishedRuntime(runtime: DashboardRuntime) {
  const source = runtime.record.publishedSchema ?? runtime.record.schema;
  const publishedSchema = hydrateSchema(source, runtime.datasets, runtime.moduleStatuses);
  return { ...runtime.record, status: "published" as const, schema: publishedSchema, publishedSchema };
}

export async function listDashboards() {
  if (useTestRepository) return getBrowserDashboardRepository().list();
  return requestDataHub<DashboardRecord[]>("/api/analytics/dashboards");
}

export async function getDashboard(id: string) {
  if (useTestRepository) return getBrowserDashboardRepository().get(id);
  return requestDataHub<DashboardRecord>(`/api/analytics/dashboards/${encodeURIComponent(id)}`);
}

export async function getDashboardEditorData(id: string) {
  if (useTestRepository) {
    return getBrowserDashboardRepository().get(id);
  }
  const runtime = await requestDataHub<DashboardRuntime>(
    `/api/analytics/dashboards/${encodeURIComponent(id)}/editor-data`,
    { timeoutMs: 35_000 }
  );
  return hydrateEditorRuntime(runtime);
}

async function requireDashboardEditorData(id: string) {
  const record = await getDashboardEditorData(id);
  if (!record) throw new Error("看板草稿不存在");
  return record;
}

export async function createDashboard(schema: DashboardSchema) {
  if (useTestRepository) return getBrowserDashboardRepository().saveDraft(schema);
  const saved = await requestDataHub<DashboardRecord>("/api/analytics/dashboards/save", {
    method: "POST",
    body: JSON.stringify({ id: schema.id, schema: toPersistedSchema(schema), visibility: "PRIVATE" })
  });
  return requireDashboardEditorData(saved.id);
}

export async function saveDashboard(schema: DashboardSchema, expectedRevision: number, visibility?: "PRIVATE" | "SPACE") {
  if (useTestRepository) return getBrowserDashboardRepository().saveDraft(schema, expectedRevision);
  const saved = await requestDataHub<DashboardRecord>("/api/analytics/dashboards/save", {
    method: "POST",
    body: JSON.stringify({ id: schema.id, expectedRevision, schema: toPersistedSchema(schema), visibility })
  });
  return requireDashboardEditorData(saved.id);
}

export async function publishDashboard(schema: DashboardSchema, expectedRevision: number, visibility?: "PRIVATE" | "SPACE") {
  if (useTestRepository) {
    const saved = getBrowserDashboardRepository().saveDraft(schema, expectedRevision);
    return getBrowserDashboardRepository().publish(saved.id, saved.revision);
  }
  const saved = await requestDataHub<DashboardRecord>("/api/analytics/dashboards/save", {
    method: "POST",
    body: JSON.stringify({ id: schema.id, expectedRevision, schema: toPersistedSchema(schema), visibility })
  });
  await requestDataHub<DashboardRecord>(`/api/analytics/dashboards/${encodeURIComponent(saved.id)}/publish`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: saved.revision })
  });
  return requireDashboardEditorData(saved.id);
}

export async function getDashboardRuntime(id: string) {
  if (useTestRepository) return getBrowserDashboardRepository().getRuntime(id) ?? null;
  const runtime = await requestDataHub<DashboardRuntime>(`/api/analytics/dashboards/${encodeURIComponent(id)}/runtime`, {
    timeoutMs: 35_000
  });
  return hydratePublishedRuntime(runtime);
}

export async function copyDashboard(record: DashboardRecord) {
  if (useTestRepository) {
    const now = new Date().toISOString();
    return getBrowserDashboardRepository().copy(record.id, {
      id: crypto.randomUUID(), createdAt: now, updatedAt: now
    });
  }
  return requestDataHub<DashboardRecord>(`/api/analytics/dashboards/${encodeURIComponent(record.id)}/copy`, {
    method: "POST",
    body: JSON.stringify({ title: `${record.schema.title} 副本` })
  });
}

export async function archiveDashboard(id: string) {
  if (useTestRepository) return getBrowserDashboardRepository().archive(id);
  await requestDataHub<void>(`/api/analytics/dashboards/${encodeURIComponent(id)}/archive`, { method: "POST" });
  return true;
}

export async function rollbackDashboard(record: DashboardRecord, version: DashboardVersion) {
  if (useTestRepository) return getBrowserDashboardRepository().rollback(record.id, version.version, record.revision);
  return requestDataHub<DashboardRecord>(`/api/analytics/dashboards/${encodeURIComponent(record.id)}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version: version.version, expectedRevision: record.revision })
  });
}

export async function refreshDashboardModules(id: string, moduleIds: string[] = [], force = true) {
  return requestDataHub<DashboardRefreshResult>(`/api/analytics/dashboards/${encodeURIComponent(id)}/refresh`, {
    method: "POST",
    timeoutMs: 35_000,
    body: JSON.stringify({ moduleIds, force })
  });
}

export async function planDashboardLayout(id: string, request: unknown) {
  return requestDataHub<LayoutPlan>(`/api/analytics/dashboards/${encodeURIComponent(id)}/layout-plan`, {
    method: "POST",
    timeoutMs: 70_000,
    body: JSON.stringify(request)
  });
}

export async function saveRefreshSchedule(id: string, moduleId: string, input: RefreshScheduleInput) {
  return requestDataHub<RefreshSchedule>(
    `/api/analytics/dashboards/${encodeURIComponent(id)}/modules/${encodeURIComponent(moduleId)}/schedule`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function upgradeDashboardModule(
  id: string,
  moduleId: string,
  input: {
    queryVersionId: string;
    outputKey?: string;
    expectedRevision: number;
    confirmedSchemaChange: boolean;
    columnMapping?: Record<string, string>;
  }
) {
  return requestDataHub<DashboardRecord>(
    `/api/analytics/dashboards/${encodeURIComponent(id)}/modules/${encodeURIComponent(moduleId)}/upgrade`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function listLegacyLocalDashboards() {
  if (typeof window === "undefined" || useTestRepository) return [];
  return getBrowserDashboardRepository().list();
}

export function importLegacyDashboard(schema: DashboardSchema) {
  return requestDataHub<DashboardRecord>("/api/analytics/dashboards/import-legacy", {
    method: "POST",
    body: JSON.stringify({ schema, confirmed: true })
  });
}
