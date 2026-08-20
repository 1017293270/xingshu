import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOfficialDocumentService,
  resolveOfficialDocumentErrorMessage
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

  it("passes PDF through the capabilities export formats", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/v1/capabilities")) {
        return new Response(JSON.stringify({
          wordEngine: { available: true },
          queryAssets: { available: true },
          limits: { exportFormats: ["DOCX", "PDF"], previewFormats: ["PDF"] }
        }));
      }
      if (path.endsWith("/v1/templates") || path.endsWith("/v1/drafts")) {
        return new Response(JSON.stringify([]));
      }
      if (path.endsWith("/api/analytics/query-assets")) {
        return new Response(JSON.stringify({ code: 200, message: "success", data: [] }));
      }
      throw new Error(`unexpected request: ${path}`);
    }));

    const workspace = await service.loadWorkspace();
    expect(workspace.capabilities.exportFormats).toEqual(["DOCX", "PDF"]);
  });

  it("detaches a binding through the dedicated endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "bind-1",
      slotId: "slot-title",
      kind: "SCALAR",
      queryAssetId: "asset-1",
      queryVersionId: "version-1",
      outputKey: "result",
      status: "MANUAL"
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(service.detachBinding("draft-1", "bind-1")).resolves.toMatchObject({
      id: "bind-1",
      status: "MANUAL"
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/v1/drafts/draft-1/bindings/bind-1:detach"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("exports a PDF with the requested format", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "export-1",
      draftId: "draft-1",
      status: "GENERATED",
      format: "PDF",
      createdAt: "2026-08-14T00:00:00Z"
    })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(service.exportDraft("draft-1", "PDF")).resolves.toMatchObject({
      id: "export-1",
      format: "PDF",
      status: "GENERATED"
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/drafts/draft-1/exports");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ format: "PDF" });
  });

  it("does not surface raw Forbidden from a CORS 403", async () => {
    const fetchMock = vi.fn(async () => new Response("Invalid CORS request", {
      status: 403,
      statusText: "Forbidden"
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(service.createDraft({
      templateId: "11111111-1111-1111-1111-111111111111",
      templateVersionId: "22222222-2222-2222-2222-222222222222",
      title: "通知"
    })).rejects.toMatchObject({
      status: 403,
      message: "当前页面地址未被公文服务允许。请通过星数同源代理访问，不要直连公文服务。"
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
  });

  it("explains a bare 403 instead of repeating Forbidden", () => {
    expect(resolveOfficialDocumentErrorMessage(403, { status: 403, error: "Forbidden" }, "Forbidden"))
      .toBe("没有完成该操作的权限");
    expect(resolveOfficialDocumentErrorMessage(403, {
      code: "TEMPLATE_ADMIN_REQUIRED",
      message: "模板管理操作仅限系统管理员"
    }, "Forbidden")).toBe("模板管理操作仅限系统管理员");
    expect(resolveOfficialDocumentErrorMessage(404, {
      code: "OBJECT_NOT_FOUND",
      message: "文档对象不存在"
    }, "Not Found")).toBe("该模板的编译文件已丢失，无法创建草稿。请重新上传模板后再试。");
  });
});
