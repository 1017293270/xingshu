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
    vi.stubGlobal("fetch", vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(content))));

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
    vi.stubGlobal("fetch", vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(
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
    vi.stubGlobal("fetch", vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(
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

  it("识别文号、发文机关和真正标题，不把红头公司名并入正文区域", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/v1/capabilities")) return new Response(JSON.stringify({}));
      if (path.endsWith("/v1/templates")) return new Response(JSON.stringify([{
        id: "template-redhead",
        name: "报告（红头文件）",
        createdAt: "2026-08-27T00:00:00Z",
        versions: [{
          id: "version-redhead",
          versionNumber: 1,
          status: "READY_FOR_MAPPING",
          originalFileName: "报告（红头文件）.docx",
          originalSize: 2048,
          createdAt: "2026-08-27T00:00:00Z",
          analysis: {
            structureProfile: {
              paragraphs: [
                { index: 0, text: "XXXX〔2024〕XX号                       签发人：张 三", format: {}, runs: [] },
                { index: 1, text: "XXXXXXXXXX公司", format: {}, runs: [] },
                { index: 2, text: "关于XXXXXXXXXXXX的报告", format: {}, runs: [] },
                { index: 3, text: "主送单位：", format: {}, runs: [] },
                { index: 4, text: "现将有关情况报告如下。", format: {}, runs: [] }
              ]
            }
          }
        }]
      }]));
      if (path.endsWith("/v1/drafts")) return new Response(JSON.stringify([]));
      if (path.endsWith("/api/analytics/query-assets")) {
        return new Response(JSON.stringify({ code: 200, message: "success", data: [] }));
      }
      throw new Error(`unexpected request: ${path}`);
    }));

    const workspace = await service.loadWorkspace();
    expect(workspace.templates[0].currentVersion.analysis?.structureNodes.slice(0, 5).map((node) => node.role))
      .toEqual(["PRESERVE", "ISSUING_AUTHORITY", "TITLE", "RECIPIENT", "BODY"]);
  });

  it("detaches a binding through the dedicated endpoint", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
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
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({
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

  it("previews and downloads a transient artifact without creating a draft", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(
      new Blob(["document"]),
      { headers: { "Content-Type": "application/octet-stream" } }
    ));
    vi.stubGlobal("fetch", fetchMock);
    const artifact = {
      templateId: "template-1",
      templateVersionId: "version-1",
      title: "临时成稿",
      fixedValues: [{ slotId: "title-slot", value: "临时成稿" }],
      blocks: [{ id: "body-1", order: 0, role: "BODY" as const, variantId: "body-v1", text: "正文" }]
    };

    await service.getTransientPreview(artifact);
    await service.exportTransient(artifact, "PDF");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/drafts/:preview");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/v1/drafts/:export");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      templateId: "template-1",
      title: "临时成稿",
      content: { revision: 0, fixedValues: artifact.fixedValues, blocks: artifact.blocks }
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ format: "PDF" });
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it("上传返回被包了一层信封时照样解析，不抛原生 TypeError", async () => {
    const templateView = {
      id: "33333333-3333-3333-3333-333333333333",
      name: "通知模板",
      createdAt: "2026-08-21T02:00:00Z",
      versions: [{
        id: "44444444-4444-4444-4444-444444444444",
        versionNumber: 1,
        status: "ANALYZING",
        originalFileName: "通知.docx",
        originalSize: 2048,
        createdAt: "2026-08-21T02:00:00Z"
      }]
    };
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(
      JSON.stringify({ code: 0, message: "ok", data: templateView }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["docx"], "通知.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    await expect(service.uploadTemplate(file)).resolves.toMatchObject({
      persisted: true,
      template: { id: templateView.id, name: "通知模板", status: "ANALYZING" }
    });
  });

  it("上传返回缺少 versions 时报出可读原因，并把原始响应带在 details 里", async () => {
    const payload = { id: "33333333-3333-3333-3333-333333333333", name: "通知模板" };
    vi.stubGlobal("fetch", vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(
      JSON.stringify(payload),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )));

    const file = new File(["docx"], "通知.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    await expect(service.uploadTemplate(file)).rejects.toMatchObject({
      code: "TEMPLATE_VIEW_MALFORMED",
      message: "报告服务返回的模板结构无法识别，请把接口响应反馈给管理员",
      details: payload
    });
  });

  it("does not surface raw Forbidden from a CORS 403", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("Invalid CORS request", {
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
      message: "当前页面地址未被报告服务允许。请通过星数同源代理访问，不要直连报告服务。"
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
