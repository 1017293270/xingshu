import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOfficialDocumentService
} from "./officialDocumentService";
import { readDataHubSession, writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";

describe("officialDocumentService HTTP client", () => {
  const service = createOfficialDocumentService("/api/official-document");

  beforeEach(() => {
    writeDataHubAuth({ token: "token-a", userId: 11, username: "user-a", isAdmin: false });
    writeDataHubSpaceId(22);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns structured draft content from the real content endpoint", async () => {
    const content = { revision: 3, fixedValues: [{ slotId: "title", value: "通知" }], blocks: [] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(content))));

    await expect(service.getDraftContent("draft-1")).resolves.toEqual(content);
  });

  it("offers only QueryAssets collected by the current user", async () => {
    const queryAsset = (id: string, ownerUserId: number) => ({
      id,
      name: `资产-${id}`,
      originalQuestion: "统计订单",
      resolvedQuestion: "统计订单",
      ownerUserId,
      visibility: "PRIVATE",
      stableVersionId: `${id}-v1`,
      status: "ACTIVE",
      createdAt: "2026-08-11T08:00:00Z",
      updatedAt: "2026-08-11T08:00:00Z",
      stableVersion: {
        id: `${id}-v1`,
        assetId: id,
        versionNo: 1,
        resolvedQuestion: "统计订单",
        engine: "CUBE",
        parameters: [],
        outputs: [{ outputKey: "result", label: "结果", columns: [] }],
        schemaHash: "hash",
        status: "VALIDATED",
        createdAt: "2026-08-11T08:00:00Z"
      }
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/v1/capabilities")) return new Response(JSON.stringify({}));
      if (path.endsWith("/v1/templates") || path.endsWith("/v1/drafts")) {
        return new Response(JSON.stringify([]));
      }
      if (path.endsWith("/api/analytics/query-assets")) {
        return new Response(JSON.stringify({
          code: 200,
          message: "success",
          data: [queryAsset("mine", 11), queryAsset("shared", 22)]
        }));
      }
      throw new Error(`unexpected request: ${path}`);
    }));

    const workspace = await service.loadWorkspace();

    expect(workspace.queryBindingCandidates.map((candidate) => candidate.assetId)).toEqual(["mine"]);
  });

  it("expires the session on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ code: "UNAUTHORIZED", message: "登录已过期" }),
      { status: 401 }
    )));

    await expect(service.getDraftContent("draft-1")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED"
    });
    expect(readDataHubSession().token).toBeNull();
  });

  it("preserves the 409 revision conflict for the editor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        code: "DRAFT_REVISION_CONFLICT",
        message: "草稿已在其他窗口更新，请刷新后继续编辑",
        details: { currentRevision: 4 }
      }),
      { status: 409 }
    )));

    await expect(service.updateDraftContent("draft-1", {
      expectedRevision: 3,
      fixedValues: [],
      blocks: []
    })).rejects.toMatchObject({
      status: 409,
      code: "DRAFT_REVISION_CONFLICT"
    });
  });
});
