import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataHubServiceError } from "./dataHubClient";
import {
  DATA_HUB_KNOWLEDGE_BASE_LIST_PATH,
  listDataHubKnowledgeBases,
  loadDataHubCitationDocument,
  normalizeDataHubKnowledgeBases
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

  it("reads the current space knowledge bases from the pinned list endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer token-123");
      expect(headers.get("X-Space-Id")).toBe("7");
      return new Response(JSON.stringify({
        code: 200,
        message: "ok",
        data: [{ id: "kb-policy", title: "企业制度知识库", docs: 48 }]
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
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${DATA_HUB_KNOWLEDGE_BASE_LIST_PATH}?space_id=7`
    );
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
});
