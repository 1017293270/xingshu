import { describe, expect, it } from "vitest";
import { createBlankDashboard } from "./dashboardGenerationService";
import {
  DashboardRevisionConflictError,
  createDashboardRepository
} from "./dashboardRepositoryService";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("dashboardRepositoryService", () => {
  it("saves drafts, publishes immutable snapshots, and lists newest first", () => {
    const storage = new MemoryStorage();
    let now = new Date("2026-07-10T08:00:00.000Z");
    const repository = createDashboardRepository(storage, { now: () => now });
    const schema = createBlankDashboard({ title: "经营总览", idFactory: (prefix) => `${prefix}-1`, now });

    const first = repository.saveDraft(schema);
    expect(first).toMatchObject({ status: "draft", revision: 1 });

    now = new Date("2026-07-10T09:00:00.000Z");
    const renamed = { ...first.schema, title: "经营总览 2026" };
    const second = repository.saveDraft(renamed, first.revision);
    expect(second).toMatchObject({ revision: 2 });

    const published = repository.publish(second.schema.id, second.revision);
    expect(published).toMatchObject({ status: "published", revision: 3 });
    expect(published.publishedSchema?.title).toBe("经营总览 2026");

    const laterSchema = createBlankDashboard({
      title: "客户分析",
      idFactory: (prefix) => `${prefix}-2`,
      now: new Date("2026-07-10T10:00:00.000Z")
    });
    now = new Date("2026-07-10T10:00:00.000Z");
    repository.saveDraft(laterSchema);

    expect(repository.list().map((item) => item.schema.title)).toEqual(["客户分析", "经营总览 2026"]);
  });

  it("rejects stale saves instead of overwriting a newer dashboard revision", () => {
    const repository = createDashboardRepository(new MemoryStorage());
    const schema = createBlankDashboard({ title: "风险看板", idFactory: (prefix) => `${prefix}-1` });
    const saved = repository.saveDraft(schema);

    repository.saveDraft({ ...saved.schema, title: "风险看板新版" }, saved.revision);

    expect(() => repository.saveDraft({ ...saved.schema, title: "旧标题" }, saved.revision)).toThrow(
      DashboardRevisionConflictError
    );
  });

  it("returns safe clones so callers cannot mutate persisted snapshots", () => {
    const repository = createDashboardRepository(new MemoryStorage());
    const schema = createBlankDashboard({ title: "供应链大屏", idFactory: (prefix) => `${prefix}-1` });
    const saved = repository.saveDraft(schema);

    saved.schema.title = "被外部修改";

    expect(repository.get(schema.id)?.schema.title).toBe("供应链大屏");
  });

  it("upgrades stored grid drafts and published snapshots to free pixel layout", () => {
    const storage = new MemoryStorage();
    const schema = createBlankDashboard({ title: "旧版草稿", idFactory: (prefix) => `${prefix}-legacy` });
    schema.schemaVersion = 1;
    schema.widgets = [
      {
        id: "metric-legacy",
        type: "metric",
        title: "旧指标",
        mapping: {},
        position: { x: 1, y: 2, w: 3, h: 2 },
        style: {}
      }
    ];
    const record = {
      id: schema.id,
      status: "published" as const,
      revision: 2,
      schema,
      publishedSchema: structuredClone(schema),
      publishedAt: schema.updatedAt,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };
    storage.setItem("legacy-layout", JSON.stringify([record]));

    const repository = createDashboardRepository(storage, { storageKey: "legacy-layout" });
    const loaded = repository.get(schema.id);

    expect(loaded?.schema.schemaVersion).toBe(2);
    expect(loaded?.schema.widgets[0].position).toEqual({ x: 173, y: 226, w: 466, h: 202 });
    expect(loaded?.publishedSchema?.schemaVersion).toBe(2);
  });

  it("keeps the last published snapshot available while a newer draft is edited", () => {
    const repository = createDashboardRepository(new MemoryStorage());
    const schema = createBlankDashboard({ title: "经营运行态", idFactory: (prefix) => `${prefix}-runtime` });
    const draft = repository.saveDraft(schema);
    const published = repository.publish(schema.id, draft.revision);

    const edited = repository.saveDraft(
      { ...published.schema, title: "经营运行态（新草稿）" },
      published.revision
    );

    expect(edited.status).toBe("draft");
    expect(edited.publishedSchema?.title).toBe("经营运行态");
    expect(repository.getRuntime(schema.id)).toBeNull();
  });

  it("creates published versions and rolls back to a selected snapshot", () => {
    const storage = new MemoryStorage();
    let now = new Date("2026-07-10T08:00:00.000Z");
    const repository = createDashboardRepository(storage, { now: () => now });
    const schema = createBlankDashboard({ title: "版本一", idFactory: (prefix) => `${prefix}-versions`, now });
    const draft = repository.saveDraft(schema);
    const versionOne = repository.publish(schema.id, draft.revision);

    now = new Date("2026-07-10T09:00:00.000Z");
    const secondDraft = repository.saveDraft({ ...versionOne.schema, title: "版本二" }, versionOne.revision);
    const versionTwo = repository.publish(schema.id, secondDraft.revision);

    expect(repository.listVersions(schema.id).map((version) => version.version)).toEqual([2, 1]);

    const rolledBack = repository.rollback(schema.id, 1, versionTwo.revision);
    expect(rolledBack.schema.title).toBe("版本一");
    expect(rolledBack.publishedSchema?.title).toBe("版本一");
    expect(rolledBack.status).toBe("published");
  });

  it("shares only published records and invalidates access when archived", () => {
    const repository = createDashboardRepository(new MemoryStorage());
    const schema = createBlankDashboard({ title: "分享大屏", idFactory: (prefix) => `${prefix}-share` });
    const draft = repository.saveDraft(schema);

    expect(() => repository.createShareToken(schema.id)).toThrow("只有已发布的大屏可以分享");

    const published = repository.publish(schema.id, draft.revision);
    const token = repository.createShareToken(schema.id);
    expect(repository.getShared(token)?.publishedSchema?.title).toBe("分享大屏");

    expect(repository.archive(published.id)).toBe(true);
    expect(repository.getShared(token)).toBeNull();
    expect(repository.get(published.id)).toBeNull();
  });
});
