import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataHubServiceError } from "./dataHubClient";
import {
  DATA_HUB_KNOWLEDGE_BASE_LIST_PATH,
  listDataHubKnowledgeBases,
  listDataHubKnowledgeDocuments,
  loadDataHubCitationDocument,
  loadDataHubKnowledgeMarkdown,
  loadDataHubKnowledgeSource,
  normalizeDataHubKnowledgeBases,
  normalizeDataHubKnowledgeDocuments
} from "./dataHubKnowledgeService";
import { readDataHubSession, writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";
import type { DataHubCitationDocument } from "@/types/dataHub";

const citation: DataHubCitationDocument = {
  docId: "doc-1",
  docKey: "contract-policy",
  kbId: "kb-1",
  docName: "合同管理办法.pdf",
  sourceAvailable: true,
  fragments: []
};

describe("dataHubKnowledgeService", () => {
  beforeEach(() => {
    localStorage.clear();
    writeDataHubAuth({ token: "token-123", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(7);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("uses the authenticated preview endpoint before opening a direct source URL", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-123");
      expect(headers.get("X-Space-Id")).toBe("7");
      return new Response(
        JSON.stringify({
          mode: "direct",
          url: "https://files.example.com/contract-policy.pdf"
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const access = await loadDataHubCitationDocument(citation);

    expect(access.url).toBe("https://files.example.com/contract-policy.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/ai/rag/kb/source_document_preview?space_id=7&kb_id=kb-1&doc_key=contract-policy"
    );
  });

  it("opens a source document with only doc_key", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        mode: "direct",
        url: "https://files.example.com/contract.pdf"
      }),
      { headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const access = await loadDataHubCitationDocument({
      docId: "",
      docKey: "采购合同szsz-2023-cg0005.pdf",
      kbId: "kb-1",
      sourceAvailable: true,
      fragments: []
    });

    expect(access.url).toBe("https://files.example.com/contract.pdf");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "doc_key=%E9%87%87%E8%B4%AD%E5%90%88%E5%90%8Cszsz-2023-cg0005.pdf"
    );
  });

  it("opens a knowledge-base file through the authenticated source-document blob", async () => {
    const createObjectURL = vi.fn(() => "blob:xingshu-source");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-123");
      expect(headers.get("X-Space-Id")).toBe("7");
      expect(String(url)).toContain("/api/ai/rag/kb/source_document?");
      expect(String(url)).not.toContain("source_document_preview");
      return new Response(new Blob(["%PDF-1.4"]), {
        headers: { "Content-Type": "application/pdf" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const access = await loadDataHubKnowledgeSource("kb-1", {
      id: "采购合同.pdf",
      title: "采购合同.pdf",
      docKey: "采购合同.pdf",
      status: "indexed",
      sourceAvailable: true,
      sourceUrl: "http://minio.internal/contract.pdf"
    });

    expect(access.url).toBe("blob:xingshu-source");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens a PDF original even when DataHub omits Content-Type", async () => {
    let capturedBlob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return "blob:xingshu-pdf";
      })
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x37]))));

    const access = await loadDataHubKnowledgeSource("kb-1", {
      id: "contract",
      title: "采购合同.pdf",
      docKey: "采购合同szsz-2023-cg0005_高新技术企业认定咨询合作合同__90552004",
      status: "indexed",
      sourceAvailable: false
    });

    expect(access.url).toBe("blob:xingshu-pdf");
    expect(capturedBlob?.type).toBe("application/pdf");
    expect(access.contentType).toBe("application/pdf");
  });

  it("reads parsed Markdown through the file-content endpoint", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-123");
      expect(headers.get("X-Space-Id")).toBe("7");
      expect(String(url)).toContain("/api/ai/rag/kb/file_content?");
      expect(String(url)).not.toContain("source_document");
      return new Response(JSON.stringify({
        space_id: 7,
        doc_name: "采购合同.pdf",
        content: "# 高新技术企业认定咨询合作合同\n\n甲方..."
      }), {
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadDataHubKnowledgeMarkdown("kb-1", {
      id: "采购合同.pdf",
      title: "采购合同.pdf",
      docKey: "采购合同.pdf",
      status: "indexed",
      sourceAvailable: false,
      markdownAvailable: true
    })).resolves.toEqual({
      markdown: "# 高新技术企业认定咨询合作合同\n\n甲方..."
    });
  });

  it("rejects empty file-content payloads instead of opening a PDF original", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      space_id: 7,
      doc_name: "采购合同.pdf",
      content: ""
    }), {
      headers: { "Content-Type": "application/json" }
    })));

    await expect(loadDataHubKnowledgeMarkdown("kb-1", {
      id: "采购合同.pdf",
      title: "采购合同.pdf",
      docKey: "采购合同.pdf",
      status: "indexed",
      sourceAvailable: false,
      markdownAvailable: true
    })).rejects.toThrow(DataHubServiceError);
  });

  it("falls back to the authenticated source-document blob endpoint", async () => {
    const createObjectURL = vi.fn(() => "blob:xingshu-source");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: "proxy" }), {
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer token-123");
        expect(headers.get("X-Space-Id")).toBe("7");
        return new Response(new Blob(["document"]), {
          headers: { "Content-Type": "application/pdf" }
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const access = await loadDataHubCitationDocument(citation);

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/api/ai/rag/kb/source_document?space_id=7&kb_id=kb-1&doc_key=contract-policy"
    );
    expect(access.url).toBe("blob:xingshu-source");
    access.revoke?.();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:xingshu-source");
  });

  it.each(["text/html", "image/svg+xml"])(
    "forces active %s source content into a download-only blob",
    async (contentType) => {
      let capturedBlob: Blob | undefined;
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn((blob: Blob) => {
          capturedBlob = blob;
          return "blob:xingshu-safe-download";
        })
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: vi.fn()
      });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            new Response(JSON.stringify({ mode: "proxy" }), {
              headers: { "Content-Type": "application/json" }
            })
          )
          .mockResolvedValueOnce(
            new Response("<script>localStorage.setItem('unsafe', '1')</script>", {
              headers: { "Content-Type": contentType }
            })
          )
      );

      const access = await loadDataHubCitationDocument(citation);

      expect(access.url).toBe("blob:xingshu-safe-download");
      expect(capturedBlob?.type).toBe("application/octet-stream");
    }
  );

  it("does not call DataHub when the verified citation says the source is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadDataHubCitationDocument({ ...citation, sourceAvailable: false })
    ).rejects.toThrow("当前文档未保留可读取的原文");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps knowledge-base list payloads with alternate field names", () => {
    expect(normalizeDataHubKnowledgeBases({
      items: [
        { kb_id: "kb-1", kb_name: "制度库", desc: "合同与制度", doc_count: "12", updated_at: "2026-08-13 10:00" },
        { id: "kb-1", title: "重复项应忽略" },
        { kbId: 2, name: "合同法务", documentCount: 4, updateTime: "2026-08-12T08:00:00Z" },
        { title: "缺少 id 的项" }
      ]
    })).toEqual([
      {
        id: "kb-1",
        title: "制度库",
        description: "合同与制度",
        documentCount: 12,
        updatedAt: "2026-08-13 10:00"
      },
      {
        id: "2",
        title: "合同法务",
        description: undefined,
        documentCount: 4,
        updatedAt: "2026-08-12T08:00:00Z"
      }
    ]);
  });

  it("maps DataHub’s { kbs } list payload and file_count", () => {
    expect(normalizeDataHubKnowledgeBases({
      kbs: [
        { kb_id: "kb-policy", name: "企业制度知识库", description: "合同与制度", file_count: 48 },
        { kb_id: "kb-unnamed", file_count: 0 }
      ]
    })).toEqual([
      {
        id: "kb-policy",
        title: "企业制度知识库",
        description: "合同与制度",
        documentCount: 48,
        updatedAt: undefined
      },
      {
        id: "kb-unnamed",
        title: "知识库 kb-unnamed",
        description: undefined,
        documentCount: 0,
        updatedAt: undefined
      }
    ]);
  });

  it("reads the current space knowledge bases from the pinned list endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-123");
      expect(headers.get("X-Space-Id")).toBe("7");
      return new Response(JSON.stringify({
        kbs: [{ kb_id: "kb-policy", name: "企业制度知识库", file_count: 48 }]
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDataHubKnowledgeBases()).resolves.toEqual([
      {
        id: "kb-policy",
        title: "企业制度知识库",
        description: undefined,
        documentCount: 48,
        updatedAt: undefined
      }
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(DATA_HUB_KNOWLEDGE_BASE_LIST_PATH);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("space_id");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });

  it("does not call DataHub when the current space is missing", async () => {
    writeDataHubSpaceId(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDataHubKnowledgeBases()).rejects.toBeInstanceOf(DataHubServiceError);
    await expect(listDataHubKnowledgeBases()).rejects.toThrow("当前空间信息不完整，暂无法读取知识库");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the session when the knowledge-base list returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }))
    );

    await expect(listDataHubKnowledgeBases()).rejects.toMatchObject({ status: 401 });
    expect(readDataHubSession().token).toBeNull();
  });

  it("maps DataHub document list payloads and infers status", () => {
    expect(normalizeDataHubKnowledgeDocuments({
      files: [
        {
          doc_id: "doc-1",
          doc_key: "policy.pdf",
          doc_name: "合同管理办法.pdf",
          size: 2048,
          doc_status: "indexed",
          chunk_count: 12
        },
        {
          file_name: "手册.docx",
          markdown_available: true,
          source_available: false
        }
      ]
    })).toEqual([
      {
        id: "doc-1",
        title: "合同管理办法.pdf",
        docId: "doc-1",
        docKey: "policy.pdf",
        status: "indexed",
        sizeBytes: 2048,
        sourceAvailable: true,
        sourceUrl: undefined,
        markdownAvailable: false,
        chunkCount: 12,
        message: undefined
      },
      {
        id: "手册.docx",
        title: "手册.docx",
        docId: undefined,
        docKey: "手册.docx",
        status: "indexed",
        sizeBytes: undefined,
        sourceAvailable: true,
        sourceUrl: undefined,
        markdownAvailable: true,
        chunkCount: undefined,
        message: undefined
      }
    ]);
  });

  it("keeps MinIO-failed archives openable when the file still has a doc_key", () => {
    expect(normalizeDataHubKnowledgeDocuments({
      files: [
        {
          name: "采购合同szsz-2023-cg0005_高新技术企业认定咨询合作合同__90552004",
          doc_key: "采购合同szsz-2023-cg0005_高新技术企业认定咨询合作合同__90552004",
          doc_status: "indexed",
          source_available: false,
          artifact_job: {
            items: {
              sourceDocument: {
                status: "failed",
                missing_object: true
              }
            }
          }
        }
      ]
    })).toEqual([
      {
        id: "采购合同szsz-2023-cg0005_高新技术企业认定咨询合作合同__90552004",
        title: "采购合同szsz-2023-cg0005_高新技术企业认定咨询合作合同__90552004",
        docId: undefined,
        docKey: "采购合同szsz-2023-cg0005_高新技术企业认定咨询合作合同__90552004",
        status: "indexed",
        sizeBytes: undefined,
        sourceAvailable: true,
        sourceUrl: undefined,
        markdownAvailable: false,
        chunkCount: undefined,
        message: undefined
      }
    ]);
  });

  it("uses file name as doc_key and keeps archived sources openable without doc_id", () => {
    expect(normalizeDataHubKnowledgeDocuments({
      files: [
        {
          name: "采购合同szsz-2023-cg0005.pdf",
          size: 4016037,
          chunk_count: 2,
          message: "制品归档完成",
          doc_status: "indexed",
          artifact_job: {
            items: {
              sourceDocument: {
                status: "completed",
                url: "https://files.example.test/contract.pdf"
              }
            }
          }
        }
      ]
    })).toEqual([
      {
        id: "采购合同szsz-2023-cg0005.pdf",
        title: "采购合同szsz-2023-cg0005.pdf",
        docId: undefined,
        docKey: "采购合同szsz-2023-cg0005.pdf",
        status: "indexed",
        sizeBytes: 4016037,
        sourceAvailable: true,
        sourceUrl: "https://files.example.test/contract.pdf",
        markdownAvailable: false,
        chunkCount: 2,
        message: "制品归档完成"
      }
    ]);
  });

  it("reads knowledge documents from the documents endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-123");
      expect(headers.get("X-Space-Id")).toBe("7");
      return new Response(JSON.stringify({
        files: [{ doc_id: "doc-1", doc_key: "policy.pdf", file_name: "合同管理办法.pdf", doc_status: "indexed" }]
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDataHubKnowledgeDocuments("kb-policy")).resolves.toEqual([
      {
        id: "doc-1",
        title: "合同管理办法.pdf",
        docId: "doc-1",
        docKey: "policy.pdf",
        status: "indexed",
        sizeBytes: undefined,
        sourceAvailable: true,
        sourceUrl: undefined,
        markdownAvailable: false,
        chunkCount: undefined,
        message: undefined
      }
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/ai/rag/kb/documents?space_id=7&kb_id=kb-policy"
    );
  });

  it("falls back to the files endpoint when documents is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "not found" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        files: [{ doc_key: "runtime.pdf", name: "运行时文档", status: "indexed" }]
      })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDataHubKnowledgeDocuments("kb-policy")).resolves.toEqual([
      {
        id: "runtime.pdf",
        title: "运行时文档",
        docId: undefined,
        docKey: "runtime.pdf",
        status: "indexed",
        sizeBytes: undefined,
        sourceAvailable: true,
        sourceUrl: undefined,
        markdownAvailable: false,
        chunkCount: undefined,
        message: undefined
      }
    ]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "/api/ai/rag/kb/files?space_id=7&kb_id=kb-policy"
    );
  });

  it("does not fall back after a 401 on the documents endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listDataHubKnowledgeDocuments("kb-policy")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readDataHubSession().token).toBeNull();
  });
});
