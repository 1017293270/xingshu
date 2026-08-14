import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataAssetOverview } from "./dataAssetService";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";

describe("dataAssetService overview", () => {
  beforeEach(() => {
    writeDataHubAuth({ token: "token-a", userId: 11, username: "user-a", isAdmin: false });
    writeDataHubSpaceId(22);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps the single overview endpoint without composing browser-side services", async () => {
    const overview = {
      updatedAt: "2026-08-11T08:00:00Z",
      range: "30D" as const,
      kpis: {
        assetCount: 6,
        dataVolumeBytes: 1024,
        unstructuredCount: 2,
        tableCount: 4,
        dataSourceCount: 1,
        serviceCallCount: 3
      },
      typeDistribution: [{ type: "STRUCTURED", count: 4 }],
      growth: [{ date: "2026-08-11", assetCount: 6, dataVolumeBytes: 1024 }],
      sourceDistribution: [{ type: "DATABASE", count: 1 }],
      usageByScenario: [{ scenario: "ASK_DATA", count: 3 }],
      hotAssets: [{ assetId: "asset-1", assetName: "订单表", assetType: "STRUCTURED", callCount: 3 }]
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ code: 200, message: "success", data: overview }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDataAssetOverview("30D")).resolves.toEqual(overview);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/data-assets/overview?range=30D",
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-a");
    expect(headers.get("X-Space-Id")).toBe("22");
  });
});
