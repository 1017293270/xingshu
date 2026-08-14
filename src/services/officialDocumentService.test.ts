import { afterEach, describe, expect, it, vi } from "vitest";
import { writeDataHubSession } from "./dataHubSession";
import { createOfficialDocumentService } from "./officialDocumentService";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("officialDocumentService demo adapter", () => {
  it("makes the unconfigured boundary explicit and returns labeled demo data", async () => {
    const service = createOfficialDocumentService("");
    const workspace = await service.loadWorkspace();

    expect(service.state).toMatchObject({ configured: false, mode: "demo" });
    expect(service.state.message).toContain("不会上传、解析、保存或生成真实公文");
    expect(workspace.source).toBe("DEMO");
    expect(workspace.capabilities.wordEngine.available).toBe(false);
    expect(workspace.capabilities.onlyOffice.available).toBe(false);
    expect(workspace.templates[0]).toMatchObject({ source: "DEMO", status: "DEMO" });
    expect(workspace.templates[0].currentVersion.analysis?.capability).toMatchObject({
      licenseMode: "UNAVAILABLE",
      extractedFeatureCount: 0
    });
  });

  it("creates a deterministic local preview without claiming that a DOCX was persisted", async () => {
    const service = createOfficialDocumentService("");
    const file = new File(["PK\u0003\u0004demo"], "市级工作报告.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      lastModified: 1_800_000_000_000
    });

    const first = await service.uploadTemplate(file);
    const second = await service.uploadTemplate(file);

    expect(first.persisted).toBe(false);
    expect(first.template.id).toBe(second.template.id);
    expect(first.template.currentVersion.analysis?.risks).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ENGINE_NOT_CONFIGURED", severity: "BLOCKING" })])
    );
    expect(first.message).toContain("未读取、未上传");
  });

  it("rejects non-DOCX input before any adapter action", async () => {
    const service = createOfficialDocumentService("");
    const file = new File(["not-word"], "通知.pdf", { type: "application/pdf" });

    await expect(service.uploadTemplate(file)).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE"
    });
  });

  it("rejects DOCX files larger than the shared 25 MB service limit", async () => {
    const service = createOfficialDocumentService("");
    const file = new File(["PK\u0003\u0004"], "超限公文.docx");
    Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 + 1 });

    await expect(service.uploadTemplate(file)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      message: "DOCX 文件不能超过 25 MB"
    });
  });

  it("keeps editor and query binding previews non-persistent while the service is unavailable", async () => {
    const service = createOfficialDocumentService("");
    const draft = await service.createDraft({
      templateId: "template-demo-work-report",
      templateVersionId: "template-version-demo-1",
      title: "测试草稿"
    });
    const editorSession = await service.createEditorSession(draft.id);
    const binding = await service.createBinding(draft.id, {
      queryAssetId: "query-asset-demo-revenue",
      queryAssetName: "本月经营收入（问数绑定示例）",
      queryVersionId: "query-version-demo-1",
      outputKey: "summary",
      targetSlotTag: "xs:binding:经营指标",
      rendering: "SCALAR"
    });

    expect(draft).toMatchObject({ source: "DEMO", status: "DEMO" });
    expect(editorSession).toMatchObject({ mode: "UNAVAILABLE" });
    expect(binding).toMatchObject({ persisted: false, status: "MANUAL" });
  });
});

describe("officialDocumentService HTTP DTO adapter", () => {
  const templateView = {
    id: "0b85a140-308e-4f0d-b283-e110faad8595",
    name: "市级工作情况报告",
    createdAt: "2026-08-03T08:00:00Z",
    versions: [
      {
        id: "e27ed7d0-7b24-4d0f-9ea9-a5b85eaf5f07",
        versionNumber: 2,
        status: "READY_FOR_MAPPING",
        originalSha256: "abc123",
        originalFileName: "工作情况报告.docx",
        originalSize: 2048,
        createdAt: "2026-08-03T08:05:00Z",
        analysisJob: {
          status: "COMPLETED",
          message: "分析完成",
          updatedAt: "2026-08-03T08:06:00Z"
        },
        analysis: {
          structureProfile: {
            engineName: "Syncfusion DocIO for Java",
            engineVersion: "34.1.33",
            sections: [{ index: 0 }],
            paragraphs: [
              {
                index: 0,
                text: "关于推进数据治理工作的报告",
                format: { styleName: "标题", outlineLevel: 0 },
                runs: [{
                  index: 0,
                  text: "关于推进数据治理工作的报告",
                  format: {
                    fontName: "方正小标宋简体",
                    fontSizePoints: 22,
                    color: "Color [A=255, R=255, G=0, B=0]"
                  }
                }]
              }
            ],
            tables: [],
            featureCounts: { paragraphs: 1, sections: 1 },
            warnings: []
          },
          engineCapabilityReport: {
            engineName: "Syncfusion DocIO for Java",
            engineVersion: "34.1.33",
            available: true,
            licensed: true,
            evaluationMode: false,
            capabilities: ["paragraphs"],
            warnings: [],
            blockingReasons: []
          },
          ooxmlAuditReport: { findings: [] },
          warnings: []
        },
        mappingProfile: {
          mappings: [
            {
              slotId: "fd7799fb-5762-4f30-bc62-81c03c48e805",
              nodeId: "paragraph:0",
              paragraphIndex: 0,
              role: "TITLE",
              dataBinding: false,
              required: true
            }
          ]
        }
      }
    ]
  };

  const draftSnapshot = {
    id: "9ec1843e-d63e-44a9-b3f4-0cc35bd61e14",
    templateId: templateView.id,
    templateVersionId: templateView.versions[0].id,
    title: "数据治理工作报告",
    createdAt: "2026-08-03T08:10:00Z",
    status: "READY",
    fileVersions: [{ versionNumber: 3, createdAt: "2026-08-03T08:12:00Z" }],
    bindings: [
      {
        id: "b4cb8bc0-ff56-4683-91c6-2d4765cbfcff",
        slotId: "revenue-slot",
        kind: "SCALAR",
        queryAssetId: "query-1",
        queryVersionId: "query-version-1",
        outputKey: "summary",
        status: "ACTIVE"
      }
    ],
    editorSession: null
  };

  it("normalizes TemplateView, AnalysisView, and DraftSnapshot into engine-independent frontend types", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/capabilities")) return new Response(JSON.stringify({
        wordEngine: { available: true, code: "AVAILABLE", details: { blockingReasons: [] } },
        onlyOffice: { available: false, code: "ONLYOFFICE_DISABLED", details: "ONLYOFFICE 未配置" },
        queryAssets: { available: false, code: "QUERY_ASSET_UNAVAILABLE", details: "问数未配置" },
        limits: {
          acceptedFileTypes: [".docx"],
          bindingKinds: ["SCALAR", "FACT_SUMMARY"],
          exportFormats: ["DOCX"],
          previewFormats: ["PDF"]
        }
      }), { status: 200 });
      if (url.includes("/v1/templates")) return new Response(JSON.stringify([templateView]), { status: 200 });
      if (url.includes("/v1/drafts")) return new Response(JSON.stringify([draftSnapshot]), { status: 200 });
      if (url.includes("/api/analytics/query-assets")) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(undefined, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createOfficialDocumentService("http://127.0.0.1:8092");
    const workspace = await service.loadWorkspace();

    expect(workspace.templates[0]).toMatchObject({
      id: templateView.id,
      status: "NEEDS_REVIEW",
      source: "LIVE",
      currentVersion: {
        versionNo: 2,
        fileName: "工作情况报告.docx",
        sha256: "abc123",
        analysis: {
          sectionCount: 1,
          capability: { engineName: "Syncfusion DocIO for Java", engineVersion: "34.1.33", licenseMode: "FILE" }
        }
      }
    });
    expect(workspace.capabilities).toMatchObject({
      wordEngine: { available: true },
      onlyOffice: { available: false, code: "ONLYOFFICE_DISABLED" },
      bindingKinds: ["SCALAR", "FACT_SUMMARY"],
      exportFormats: ["DOCX"]
    });
    expect(workspace.templates[0].currentVersion.analysis?.structureNodes[0]).toMatchObject({
      role: "TITLE",
      roleLabel: "标题",
      editable: true,
      paragraphIndex: 0,
      slotId: "fd7799fb-5762-4f30-bc62-81c03c48e805",
      dataBinding: false,
      required: true,
      styleSummary: ["样式 标题", "方正小标宋简体", "22pt", "颜色 Color [A=255, R=255, G=0, B=0]"]
    });
    expect(workspace.templates[0].currentVersion.analysis?.mappingProfile?.mappings[0]).toMatchObject({
      role: "TITLE",
      slotId: "fd7799fb-5762-4f30-bc62-81c03c48e805"
    });
    expect(workspace.drafts[0]).toMatchObject({
      templateName: "市级工作情况报告",
      currentFileVersionNo: 3,
      status: "READY",
      bindings: [{ targetSlotTag: "xs:binding:revenue-slot", persisted: true }]
    });
  });

  it("reports an unavailable engine as UNAVAILABLE even when its raw evaluation flag is true", async () => {
    const unavailableTemplate = structuredClone(templateView);
    unavailableTemplate.versions[0].status = "ENGINE_UNAVAILABLE";
    unavailableTemplate.versions[0].analysis.engineCapabilityReport.available = false;
    unavailableTemplate.versions[0].analysis.engineCapabilityReport.licensed = false;
    unavailableTemplate.versions[0].analysis.engineCapabilityReport.evaluationMode = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/templates")) return new Response(JSON.stringify([unavailableTemplate]), { status: 200 });
      if (url.includes("/v1/drafts")) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const workspace = await createOfficialDocumentService("http://127.0.0.1:8092").loadWorkspace();

    expect(workspace.templates[0]).toMatchObject({ status: "BLOCKED" });
    expect(workspace.templates[0].currentVersion.analysis?.capability.licenseMode).toBe("UNAVAILABLE");
  });

  it("suggests common official-document roles while leaving the final mapping for human confirmation", async () => {
    const analysis = {
      ...structuredClone(templateView.versions[0].analysis),
      structureProfile: {
        ...structuredClone(templateView.versions[0].analysis.structureProfile),
        paragraphs: [
          { index: 0, text: "关于推进数据治理工作的通知", format: { styleName: "正文" }, runs: [] },
          { index: 1, text: "各有关部门：", format: {}, runs: [] },
          { index: 2, text: "一、总体要求", format: {}, runs: [] },
          { index: 3, text: "（一）工作目标", format: {}, runs: [] },
          { index: 4, text: "1. 完善数据目录", format: {}, runs: [] },
          { index: 5, text: "现将有关事项通知如下。", format: {}, runs: [] },
          { index: 6, text: "附件：任务清单", format: {}, runs: [] },
          { index: 7, text: "星数数据管理局", format: {}, runs: [] },
          { index: 8, text: "2026年8月3日", format: {}, runs: [] },
          { index: 9, text: "", format: {}, runs: [] }
        ]
      }
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      versionId: templateView.versions[0].id,
      status: "READY_FOR_MAPPING",
      analysisJob: templateView.versions[0].analysisJob,
      analysis,
      mappingProfile: null
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOfficialDocumentService("http://127.0.0.1:8092")
      .getTemplateAnalysis(templateView.id, templateView.versions[0].id);

    expect(result.structureNodes.map((node) => node.role)).toEqual([
      "TITLE",
      "RECIPIENT",
      "HEADING_1",
      "HEADING_2",
      "HEADING_3",
      "BODY",
      "ATTACHMENT_NOTE",
      "SIGNATURE",
      "DATE",
      "PRESERVE"
    ]);
  });

  it("uses the trusted session boundary, maps the signed editor response, and converts binding slot/kind fields", async () => {
    writeDataHubSession({ token: "document-test-token", userId: 42, username: "李四", isAdmin: false }, 7);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/v1/drafts") && init?.method === "POST") {
        return new Response(JSON.stringify(draftSnapshot), { status: 201 });
      }
      if (url.includes("/editor-sessions")) {
        return new Response(JSON.stringify({
          session: {
            id: "5142f005-0e88-47e5-a48a-f17e11447888",
            draftId: draftSnapshot.id,
            actorId: "42",
            expiresAt: "2026-08-03T09:00:00Z",
            readOnly: false
          },
          editor: {
            documentServerApiUrl: "https://docs.example.test/web-apps/apps/api/documents/api.js",
            token: "signed-editor-token",
            config: { documentType: "word", document: { key: "draft-v3" } },
            expiresAt: "2026-08-03T09:00:00Z"
          }
        }), { status: 200 });
      }
      if (url.includes("/bindings/")) {
        return new Response(JSON.stringify({
          ...draftSnapshot.bindings[0],
          id: "0d301d41-169b-46ac-9e97-9081cc5ce25b",
          slotId: "revenue-slot"
        }), { status: 200 });
      }
      return new Response(undefined, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = createOfficialDocumentService("http://127.0.0.1:8092");

    await service.createDraft({
      templateId: templateView.id,
      templateVersionId: templateView.versions[0].id,
      title: "数据治理工作报告"
    });
    const editor = await service.createEditorSession(draftSnapshot.id);
    const binding = await service.createBinding(draftSnapshot.id, {
      queryAssetId: "query-1",
      queryAssetName: "经营收入",
      queryVersionId: "query-version-1",
      outputKey: "summary",
      targetSlotTag: "xs:binding:revenue-slot",
      rendering: "SCALAR"
    });

    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      title: "数据治理工作报告"
    });
    expect(JSON.parse(String(requests[0].init?.body))).not.toHaveProperty("actorId");
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({
      actorName: "李四",
      readOnly: false
    });
    expect(editor).toMatchObject({
      mode: "EDIT",
      documentServerApiUrl: "https://docs.example.test/web-apps/apps/api/documents/api.js",
      token: "signed-editor-token",
      editorConfig: { documentType: "word" }
    });
    expect(JSON.parse(String(requests[2].init?.body))).toMatchObject({
      slotId: "revenue-slot",
      kind: "SCALAR",
      selector: {},
      parameters: {}
    });
    expect(binding).toMatchObject({
      targetSlotTag: "xs:binding:revenue-slot",
      queryAssetName: "经营收入",
      persisted: true
    });
  });

  it("adapts mapping, publish, heartbeat, refresh, detach, and fidelity-checked export contracts", async () => {
    writeDataHubSession({ token: "document-contract-token", userId: 42, username: "李四", isAdmin: false }, 7);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const binding = draftSnapshot.bindings[0];
    const editorView = {
      session: {
        id: "5142f005-0e88-47e5-a48a-f17e11447888",
        draftId: draftSnapshot.id,
        actorId: "42",
        expiresAt: "2026-08-03T09:15:00Z",
        readOnly: false
      },
      editor: {
        documentServerApiUrl: "https://docs.example.test/web-apps/apps/api/documents/api.js",
        token: "renewed-token",
        config: { documentType: "word" },
        expiresAt: "2026-08-03T09:15:00Z"
      }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/preview.pdf")) {
        return new Response("%PDF-demo", { status: 200, headers: { "Content-Type": "application/pdf" } });
      }
      if (url.endsWith("/mapping")) {
        return new Response(JSON.stringify({
          id: "ab075f23-5544-488d-bdc4-af3149896368",
          templateVersionId: templateView.versions[0].id,
          versionNumber: 3,
          mappings: JSON.parse(String(init?.body)).mappings,
          createdAt: "2026-08-03T08:30:00Z"
        }), { status: 200 });
      }
      if (url.endsWith(":publish")) {
        return new Response(JSON.stringify({ ...templateView.versions[0], status: "PUBLISHED" }), { status: 200 });
      }
      if (url.endsWith(":heartbeat")) return new Response(JSON.stringify(editorView), { status: 200 });
      if (url.endsWith("/bindings:refresh")) return new Response(JSON.stringify([binding]), { status: 200 });
      if (url.endsWith(":detach")) return new Response(JSON.stringify({ ...binding, status: "MANUAL" }), { status: 200 });
      if (url.endsWith("/exports")) {
        return new Response(JSON.stringify({
          id: "b2d77b63-b2bf-4177-9d58-835aecaa4e9f",
          draftId: draftSnapshot.id,
          status: "GENERATED",
          format: "DOCX",
          sha256: "export-sha256",
          fidelityReport: {
            passed: true,
            baselineSha256: "baseline-sha256",
            candidateSha256: "candidate-sha256",
            criticalDifferences: [],
            warnings: [],
            checkedAt: "2026-08-03T08:45:00Z"
          },
          createdAt: "2026-08-03T08:45:00Z"
        }), { status: 201 });
      }
      if (url.endsWith("/exports/b2d77b63-b2bf-4177-9d58-835aecaa4e9f/download")) {
        return new Response("generated-docx", {
          status: 200,
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
        });
      }
      return new Response(undefined, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = createOfficialDocumentService("https://gateway.example.test/official-document");
    const mappings = [
      {
        slotId: "fd7799fb-5762-4f30-bc62-81c03c48e805",
        nodeId: "paragraph:0",
        paragraphIndex: 0,
        role: "TITLE" as const,
        variantId: "title-main",
        dataBinding: false,
        required: true
      },
      {
        slotId: "9ef30347-c0dc-4f4f-9383-182bc234b26d",
        nodeId: "paragraph:1",
        paragraphIndex: 1,
        role: "BODY" as const,
        variantId: "body-main",
        dataBinding: true,
        required: false
      }
    ];

    const profile = await service.updateTemplateMapping({
      templateId: templateView.id,
      templateVersionId: templateView.versions[0].id,
      mappings
    });
    const preview = await service.getTemplatePreview(templateView.id, templateView.versions[0].id);
    const published = await service.publishTemplate(templateView.id, templateView.versions[0].id);
    const renewed = await service.heartbeatEditorSession(draftSnapshot.id, editorView.session.id);
    const refreshed = await service.refreshBindings(draftSnapshot.id);
    const detached = await service.detachBinding({ draftId: draftSnapshot.id, bindingId: binding.id });
    const exported = await service.exportDraft(draftSnapshot.id, "DOCX");
    const downloaded = await service.downloadExport(exported.id);

    expect(profile).toMatchObject({ versionNo: 3, mappings: [{ role: "TITLE" }, { role: "BODY", dataBinding: true }] });
    expect(await preview.text()).toBe("%PDF-demo");
    expect(published).toMatchObject({ id: templateView.versions[0].id, versionNo: 2 });
    expect(renewed).toMatchObject({ mode: "EDIT", token: "renewed-token", leaseExpiresAt: "2026-08-03T09:15:00Z" });
    expect(refreshed[0]).toMatchObject({ targetSlotTag: "xs:binding:revenue-slot", status: "ACTIVE" });
    expect(detached).toMatchObject({ status: "MANUAL" });
    expect(exported).toMatchObject({
      status: "GENERATED",
      format: "DOCX",
      fidelityReport: { passed: true, criticalDifferences: [] }
    });
    expect(await downloaded.text()).toBe("generated-docx");

    const mappingRequest = requests.find((request) => request.url.endsWith("/mapping"));
    expect(mappingRequest?.init?.method).toBe("PUT");
    expect(JSON.parse(String(mappingRequest?.init?.body))).toMatchObject({ mappings });
    const mappingHeaders = new Headers(mappingRequest?.init?.headers);
    expect(mappingHeaders.get("Authorization")).toBe("Bearer document-contract-token");
    expect(mappingHeaders.get("X-Space-Id")).toBe("7");
    expect(JSON.parse(String(requests.find((request) => request.url.endsWith(":heartbeat"))?.init?.body))).toEqual({ actorName: "李四" });
    expect(requests.find((request) => request.url.endsWith(":detach"))?.init?.body).toBeUndefined();
    expect(JSON.parse(String(requests.find((request) => request.url.endsWith("/exports"))?.init?.body))).toEqual({ format: "DOCX" });
    const downloadRequest = requests.find((request) => request.url.endsWith("/download"));
    expect(new Headers(downloadRequest?.init?.headers).get("Accept")).toBe("*/*");
  });
});
