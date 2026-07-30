import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDataHubCitationDocument } from "./dataHubKnowledgeService";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";
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
});
