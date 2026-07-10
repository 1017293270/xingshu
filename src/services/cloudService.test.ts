import { describe, expect, it } from "vitest";
import {
  createMockCloudService,
  type CloudOperationUpdate
} from "./cloudService";

const noWait = async () => undefined;

describe("cloudService", () => {
  it("reports upload progress and adds a successful file to recent materials", async () => {
    const updates: CloudOperationUpdate[] = [];
    const service = createMockCloudService({
      wait: noWait,
      now: () => "2026-07-10 23:10"
    });
    const file = new File(["region,revenue"], "七月经营数据.csv", {
      type: "text/csv",
      lastModified: 42
    });

    const result = await service.uploadFile(file, (update) => updates.push(update));

    expect(updates.map((update) => update.phase)).toEqual([
      "pending",
      "progress",
      "progress",
      "success"
    ]);
    expect(updates.map((update) => update.progress)).toEqual([0, 36, 78, 100]);
    expect(result.ok).toBe(true);
    expect(result.snapshot.recentMaterials[0]).toMatchObject({
      name: "七月经营数据.csv",
      owner: "当前用户",
      status: "待同步",
      updatedAt: "2026-07-10 23:10"
    });
    expect(result.snapshot.overview).toMatchObject({
      monthlyAdded: 87,
      enterpriseFileCount: 2347
    });
  });

  it("uses the attachment validation boundary before starting an upload", async () => {
    const updates: CloudOperationUpdate[] = [];
    const service = createMockCloudService({ wait: noWait });
    const unsupported = new File(["binary"], "installer.exe", {
      type: "application/x-msdownload"
    });

    const result = await service.uploadFile(unsupported, (update) => updates.push(update));

    expect(result.ok).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ operation: "upload", phase: "error", progress: 0 });
    expect(updates[0]?.message).toContain("暂不支持此文件类型");
    expect(result.snapshot.recentMaterials).toHaveLength(3);
  });

  it("updates the latest sync time and material statuses after syncing", async () => {
    const updates: CloudOperationUpdate[] = [];
    const service = createMockCloudService({
      wait: noWait,
      now: () => "2026-07-10 23:18"
    });

    const result = await service.syncKnowledgeBase((update) => updates.push(update));

    expect(updates.map((update) => update.phase)).toEqual([
      "pending",
      "progress",
      "progress",
      "success"
    ]);
    expect(result.ok).toBe(true);
    expect(result.snapshot.lastSyncedAt).toBe("2026-07-10 23:18");
    expect(result.snapshot.syncStatus).toBe("已同步");
    expect(result.snapshot.recentMaterials.find((item) => item.name.includes("Q2"))).toMatchObject({
      status: "已入库",
      updatedAt: "2026-07-10 23:18"
    });
  });

  it("exposes a controlled error without mutating cloud data", async () => {
    const updates: CloudOperationUpdate[] = [];
    const service = createMockCloudService({
      wait: noWait,
      shouldFail: (operation) => operation === "sync"
    });
    const before = service.getSnapshot();

    const result = await service.syncKnowledgeBase((update) => updates.push(update));

    expect(updates.map((update) => update.phase)).toEqual([
      "pending",
      "progress",
      "error"
    ]);
    expect(result.ok).toBe(false);
    expect(updates.at(-1)).toMatchObject({ operation: "sync", phase: "error" });
    expect(result.snapshot).toEqual(before);
  });
});
