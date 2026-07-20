import type { DashboardRecord, DashboardSchema, DashboardVersion } from "@/types/dashboardStudio";
import { migrateDashboardSchemaToFreeLayout } from "@/features/dashboardStudio/core/dashboardFreeLayout";

type DashboardRepositoryOptions = {
  now?: () => Date;
  storageKey?: string;
};

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;

const defaultStorageKey = "xingshu.dashboard.records.v1";

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function readRecords(storage: Storage, storageKey: string): DashboardRecord[] {
  const value = storage.getItem(storageKey);
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (record): record is DashboardRecord =>
            typeof record === "object" &&
            record !== null &&
            "id" in record &&
            "schema" in record &&
            "revision" in record
        ).map((record) => ({
          ...record,
          schema: migrateDashboardSchemaToFreeLayout(record.schema),
          publishedSchema: record.publishedSchema
            ? migrateDashboardSchemaToFreeLayout(record.publishedSchema)
            : undefined
        }))
      : [];
  } catch {
    return [];
  }
}

export class DashboardRevisionConflictError extends Error {
  constructor() {
    super("看板已被其他操作更新，请刷新后重试");
    this.name = "DashboardRevisionConflictError";
  }
}

export function createDashboardRepository(storage: Storage, options: DashboardRepositoryOptions = {}) {
  const storageKey = options.storageKey ?? defaultStorageKey;
  const now = options.now ?? (() => new Date());

  function persist(records: DashboardRecord[]) {
    storage.setItem(storageKey, JSON.stringify(records));
  }

  function list() {
    return readRecords(storage, storageKey)
      .filter((record) => !record.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  function get(id: string) {
    const record = readRecords(storage, storageKey).find((item) => item.id === id && !item.archivedAt);
    return record ? clone(record) : null;
  }

  function saveDraft(schema: DashboardSchema, expectedRevision?: number) {
    const records = readRecords(storage, storageKey);
    const existingIndex = records.findIndex((record) => record.id === schema.id);
    const existing = existingIndex >= 0 ? records[existingIndex] : undefined;

    if (existing?.archivedAt) {
      throw new Error("已归档的大屏不能继续编辑");
    }

    if (existing && expectedRevision !== undefined && existing.revision !== expectedRevision) {
      throw new DashboardRevisionConflictError();
    }

    const timestamp = now().toISOString();
    const nextSchema = clone({ ...schema, updatedAt: timestamp });
    const nextRecord: DashboardRecord = {
      id: schema.id,
      status: "draft",
      revision: (existing?.revision ?? 0) + 1,
      schema: nextSchema,
      publishedSchema: existing?.publishedSchema ? clone(existing.publishedSchema) : undefined,
      publishedAt: existing?.publishedAt,
      versions: existing?.versions ? clone(existing.versions) : undefined,
      shareToken: existing?.shareToken,
      createdAt: existing?.createdAt ?? schema.createdAt,
      updatedAt: timestamp
    };

    if (existingIndex >= 0) {
      records[existingIndex] = nextRecord;
    } else {
      records.push(nextRecord);
    }
    persist(records);
    return clone(nextRecord);
  }

  function publish(id: string, expectedRevision?: number) {
    const records = readRecords(storage, storageKey);
    const index = records.findIndex((record) => record.id === id);
    const existing = index >= 0 ? records[index] : undefined;
    if (!existing) {
      throw new Error("看板草稿不存在，无法发布");
    }
    if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
      throw new DashboardRevisionConflictError();
    }

    const timestamp = now().toISOString();
    const publishedSchema = clone({ ...existing.schema, updatedAt: timestamp });
    const versions = [...(existing.versions ?? [])];
    const version: DashboardVersion = {
      id: `${existing.id}-version-${versions.length + 1}`,
      version: versions.length + 1,
      schema: clone(publishedSchema),
      publishedAt: timestamp
    };
    const nextRecord: DashboardRecord = {
      ...existing,
      status: "published",
      revision: existing.revision + 1,
      schema: clone(publishedSchema),
      publishedSchema,
      publishedAt: timestamp,
      versions: [...versions, version],
      updatedAt: timestamp
    };
    records[index] = nextRecord;
    persist(records);
    return clone(nextRecord);
  }

  function remove(id: string) {
    const records = readRecords(storage, storageKey);
    const filtered = records.filter((record) => record.id !== id);
    if (filtered.length === records.length) {
      return false;
    }
    persist(filtered);
    return true;
  }

  function copy(id: string, schemaIdentity: Pick<DashboardSchema, "id" | "createdAt" | "updatedAt">) {
    const source = get(id);
    if (!source) throw new Error("找不到要复制的大屏");
    const schema: DashboardSchema = {
      ...clone(source.schema),
      id: schemaIdentity.id,
      title: `${source.schema.title} 副本`,
      createdAt: schemaIdentity.createdAt,
      updatedAt: schemaIdentity.updatedAt
    };
    return saveDraft(schema);
  }

  function archive(id: string) {
    const records = readRecords(storage, storageKey);
    const index = records.findIndex((record) => record.id === id && !record.archivedAt);
    if (index < 0) return false;
    const timestamp = now().toISOString();
    records[index] = {
      ...records[index],
      status: "draft",
      publishedSchema: undefined,
      publishedAt: undefined,
      shareToken: undefined,
      archivedAt: timestamp,
      revision: records[index].revision + 1,
      updatedAt: timestamp
    };
    persist(records);
    return true;
  }

  function unpublish(id: string, expectedRevision?: number) {
    const records = readRecords(storage, storageKey);
    const index = records.findIndex((record) => record.id === id && !record.archivedAt);
    const existing = index >= 0 ? records[index] : undefined;
    if (!existing) throw new Error("找不到要取消发布的大屏");
    if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
      throw new DashboardRevisionConflictError();
    }
    const timestamp = now().toISOString();
    const next: DashboardRecord = {
      ...existing,
      status: "draft",
      revision: existing.revision + 1,
      publishedSchema: undefined,
      publishedAt: undefined,
      shareToken: undefined,
      updatedAt: timestamp
    };
    records[index] = next;
    persist(records);
    return clone(next);
  }

  function createShareToken(id: string) {
    const records = readRecords(storage, storageKey);
    const index = records.findIndex((record) => record.id === id && !record.archivedAt);
    const existing = index >= 0 ? records[index] : undefined;
    if (!existing || existing.status !== "published" || !existing.publishedSchema) {
      throw new Error("只有已发布的大屏可以分享");
    }
    const shareToken = existing.shareToken
      ?? globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    records[index] = { ...existing, shareToken };
    persist(records);
    return shareToken;
  }

  function getShared(token: string) {
    const record = readRecords(storage, storageKey).find(
      (item) => !item.archivedAt && item.shareToken === token && item.status === "published" && item.publishedSchema
    );
    return record ? clone(record) : null;
  }

  function getRuntime(id: string) {
    const record = readRecords(storage, storageKey).find(
      (item) => item.id === id && !item.archivedAt && item.status === "published" && item.publishedSchema
    );
    return record ? clone(record) : null;
  }

  function listVersions(id: string) {
    const record = get(id);
    return clone(record?.versions ?? []).sort((left, right) => right.version - left.version);
  }

  function rollback(id: string, versionNumber: number, expectedRevision?: number) {
    const records = readRecords(storage, storageKey);
    const index = records.findIndex((record) => record.id === id && !record.archivedAt);
    const existing = index >= 0 ? records[index] : undefined;
    if (!existing) throw new Error("找不到要回滚的大屏");
    if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
      throw new DashboardRevisionConflictError();
    }
    const version = existing.versions?.find((item) => item.version === versionNumber);
    if (!version) throw new Error("找不到指定的大屏版本");
    const timestamp = now().toISOString();
    const schema = clone({ ...version.schema, updatedAt: timestamp });
    const next: DashboardRecord = {
      ...existing,
      status: "published",
      revision: existing.revision + 1,
      schema,
      publishedSchema: clone(schema),
      publishedAt: timestamp,
      shareToken: undefined,
      updatedAt: timestamp
    };
    records[index] = next;
    persist(records);
    return clone(next);
  }

  return {
    list,
    get,
    getRuntime,
    getShared,
    listVersions,
    saveDraft,
    publish,
    unpublish,
    copy,
    archive,
    rollback,
    createShareToken,
    remove
  };
}

let browserRepository: DashboardRepository | null = null;

export function getBrowserDashboardRepository() {
  if (typeof window === "undefined") {
    throw new Error("浏览器看板仓储只能在客户端使用");
  }
  browserRepository ??= createDashboardRepository(window.localStorage);
  return browserRepository;
}
