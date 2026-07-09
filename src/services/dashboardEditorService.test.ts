import { afterEach, describe, expect, it, vi } from "vitest";
import { probeDashboardEditor } from "./dashboardEditorService";

describe("dashboardEditorService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an unreachable editor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(probeDashboardEditor("http://127.0.0.1:5174/workbenches")).resolves.toEqual({
      ok: false,
      message: "看板编辑器暂时不可用"
    });
  });

  it("reports a reachable editor without reading cross-origin content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ type: "opaque" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeDashboardEditor("http://127.0.0.1:5174/workbenches")).resolves.toEqual({
      ok: true,
      message: "看板编辑器已连接"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:5174/workbenches",
      expect.objectContaining({ mode: "no-cors", signal: expect.any(AbortSignal) })
    );
  });

  it("does not treat a same-origin server error as a reachable editor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "basic", ok: false, status: 503 }));

    await expect(probeDashboardEditor("/workbenches")).resolves.toEqual({
      ok: false,
      message: "看板编辑器暂时不可用"
    });
  });

  it("rejects unsafe editor URLs without issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeDashboardEditor("javascript:alert(1)")).resolves.toEqual({
      ok: false,
      message: "看板编辑器暂时不可用"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels an in-flight probe when its caller aborts", async () => {
    const caller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = probeDashboardEditor("http://127.0.0.1:5174/workbenches", { signal: caller.signal });
    caller.abort();

    await expect(result).resolves.toEqual({ ok: false, message: "看板编辑器暂时不可用" });
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toHaveProperty("aborted", true);
  });
});
