import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

const originalAnalyticsTarget = process.env.VITE_ANALYTICS_PROXY_TARGET;
const originalDataHubTarget = process.env.VITE_DATAHUB_PROXY_TARGET;

afterEach(() => {
  if (originalAnalyticsTarget === undefined) {
    delete process.env.VITE_ANALYTICS_PROXY_TARGET;
  } else {
    process.env.VITE_ANALYTICS_PROXY_TARGET = originalAnalyticsTarget;
  }

  if (originalDataHubTarget === undefined) {
    delete process.env.VITE_DATAHUB_PROXY_TARGET;
  } else {
    process.env.VITE_DATAHUB_PROXY_TARGET = originalDataHubTarget;
  }
});

describe("Vite data-hub proxy", () => {
  it("keeps Analytics requests behind the BFF even when a direct target is present", async () => {
    process.env.VITE_ANALYTICS_PROXY_TARGET = "http://127.0.0.1:18088";
    process.env.VITE_DATAHUB_PROXY_TARGET = "http://127.0.0.1:8090";

    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      path.resolve(process.cwd(), "vite.config.ts")
    );
    const proxy = loaded?.config.server?.proxy;

    expect(proxy?.["/api/analytics"]).toBeUndefined();
    expect(proxy?.["/api"]).toMatchObject({
      target: "http://127.0.0.1:8090",
      changeOrigin: true
    });
  });
});
