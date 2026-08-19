import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";
import { createOfficialDocumentBrowserProxy, stripBrowserOriginHeaders } from "../../vite.config";

const originalAnalyticsTarget = process.env.VITE_ANALYTICS_PROXY_TARGET;
const originalDataHubTarget = process.env.VITE_DATAHUB_PROXY_TARGET;
const originalDataHubPort = process.env.VITE_DATAHUB_BFF_PORT;
const originalOfficialDocumentTarget = process.env.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET;

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

  if (originalOfficialDocumentTarget === undefined) {
    delete process.env.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET;
  } else {
    process.env.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET = originalOfficialDocumentTarget;
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

  it("routes official-document to the dedicated gateway when a target is set", async () => {
    process.env.VITE_DATAHUB_PROXY_TARGET = "http://127.0.0.1:8090";
    process.env.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET = "http://127.0.0.1:8093";

    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      path.resolve(process.cwd(), "vite.config.ts")
    );
    const proxy = loaded?.config.server?.proxy;
    const proxyKeys = Object.keys(proxy ?? {});

    expect(proxy?.["/api/official-document"]).toMatchObject({
      target: "http://127.0.0.1:8093",
      changeOrigin: true
    });
    expect(proxy?.["/api"]).toMatchObject({
      target: "http://127.0.0.1:8090",
      changeOrigin: true
    });
    expect(proxyKeys.indexOf("/api/official-document")).toBeLessThan(proxyKeys.indexOf("/api"));
    expect(typeof proxy?.["/api/official-document"]).toBe("object");
    expect(typeof (proxy?.["/api/official-document"] as { configure?: unknown }).configure).toBe("function");
  });

  it("still isolates official-document on the DataHub target when no dedicated gateway is set", async () => {
    process.env.VITE_DATAHUB_PROXY_TARGET = "http://127.0.0.1:8090";
    process.env.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET = "";

    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "development" },
      path.resolve(process.cwd(), "vite.config.ts")
    );
    const proxy = loaded?.config.server?.proxy;
    const proxyKeys = Object.keys(proxy ?? {});

    expect(proxy?.["/api/official-document"]).toMatchObject({
      target: "http://127.0.0.1:8090",
      changeOrigin: true
    });
    expect(proxyKeys.indexOf("/api/official-document")).toBeLessThan(proxyKeys.indexOf("/api"));
    expect(typeof (proxy?.["/api/official-document"] as { configure?: unknown }).configure).toBe("function");
  });

  it("strips browser Origin before forwarding official-document requests", () => {
    const removed: string[] = [];
    stripBrowserOriginHeaders({
      removeHeader(name) {
        removed.push(name);
      }
    });
    expect(removed).toEqual(["origin", "referer"]);

    const listeners: Array<(proxyReq: { removeHeader: (name: string) => void }) => void> = [];
    const proxy = createOfficialDocumentBrowserProxy("http://127.0.0.1:8093")["/api/official-document"];
    proxy.configure({
      on(_event, listener) {
        listeners.push(listener);
      }
    });
    const forwardedRemoved: string[] = [];
    listeners[0]?.({
      removeHeader(name) {
        forwardedRemoved.push(name);
      }
    });
    expect(forwardedRemoved).toEqual(["origin", "referer"]);
  });
});
