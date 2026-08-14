import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

const originalAnalyticsTarget = process.env.VITE_ANALYTICS_PROXY_TARGET;
const originalDataHubTarget = process.env.VITE_DATAHUB_PROXY_TARGET;
const originalDataHubPort = process.env.VITE_DATAHUB_BFF_PORT;

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

  if (originalDataHubPort === undefined) {
    delete process.env.VITE_DATAHUB_BFF_PORT;
  } else {
    process.env.VITE_DATAHUB_BFF_PORT = originalDataHubPort;
  }
});

describe("Vite data-hub proxy", () => {
  it("fails closed when no DataHub proxy target is configured", async () => {
    // Explicitly shadow any developer-local .env.local values so this test
    // verifies the fail-closed branch in every workspace configuration.
    process.env.VITE_DATAHUB_PROXY_TARGET = "";
    process.env.VITE_DATAHUB_BFF_PORT = "";

    await expect(loadConfigFromFile(
      { command: "serve", mode: "development" },
      path.resolve(process.cwd(), "vite.config.ts")
    )).rejects.toThrow("VITE_DATAHUB_PROXY_TARGET");
  });

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
    expect(proxy?.["/platform"]).toMatchObject({
      target: "http://127.0.0.1:8090",
      changeOrigin: true
    });
    expect(proxy?.["/platform-login"]).toMatchObject({
      target: "http://127.0.0.1:8090",
      changeOrigin: true
    });
  });
});
