import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson, XingshuServiceError } from "./httpClient";

describe("httpClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests JSON from the configured base URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const result = await requestJson<{ ok: boolean }>("/health", {
      baseUrl: "https://api.example.test"
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/health",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it("throws a typed service error for non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "BAD_REQUEST", message: "参数错误" }), {
            status: 400
          })
      )
    );

    await expect(
      requestJson("/bad", {
        baseUrl: "https://api.example.test"
      })
    ).rejects.toMatchObject({
      name: "XingshuServiceError",
      status: 400,
      code: "BAD_REQUEST",
      message: "参数错误"
    });
  });

  it("exposes XingshuServiceError for manual error checks", () => {
    const error = new XingshuServiceError("请求失败", {
      status: 500,
      code: "SERVER_ERROR"
    });

    expect(error.status).toBe(500);
    expect(error.code).toBe("SERVER_ERROR");
  });
});
