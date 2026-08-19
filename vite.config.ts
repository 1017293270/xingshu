import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { loadEnv } from "vite";
import path from "node:path";

type ProxyTargetInputs = {
  command: "build" | "serve";
  env: Record<string, string>;
  mode: string;
  processEnv: NodeJS.ProcessEnv;
};

export function resolveDataHubProxyTarget({ command, env, mode, processEnv }: ProxyTargetInputs) {
  const explicitTarget = (processEnv.VITE_DATAHUB_PROXY_TARGET ?? env.VITE_DATAHUB_PROXY_TARGET)?.trim();
  if (explicitTarget) {
    return explicitTarget;
  }

  const bffPort = (processEnv.VITE_DATAHUB_BFF_PORT ?? env.VITE_DATAHUB_BFF_PORT)?.trim();
  if (bffPort) {
    return `http://127.0.0.1:${bffPort}`;
  }

  if (command === "serve" && mode !== "test") {
    throw new Error(
      "启动开发服务前必须显式配置 VITE_DATAHUB_PROXY_TARGET 或 VITE_DATAHUB_BFF_PORT。"
    );
  }

  return "http://127.0.0.1:65535";
}

export function resolveOfficialDocumentProxyTarget({ env, processEnv }: Pick<ProxyTargetInputs, "env" | "processEnv">) {
  return (processEnv.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET ?? env.VITE_OFFICIAL_DOCUMENT_PROXY_TARGET)?.trim() ?? "";
}

export function stripBrowserOriginHeaders(proxyReq: { removeHeader: (name: string) => void }) {
  proxyReq.removeHeader("origin");
  proxyReq.removeHeader("referer");
}

export function createOfficialDocumentBrowserProxy(target: string) {
  if (!target) {
    return {};
  }

  return {
    "/api/official-document": {
      target,
      changeOrigin: true,
      configure(proxy: { on: (event: string, listener: (proxyReq: { removeHeader: (name: string) => void }) => void) => void }) {
        proxy.on("proxyReq", (proxyReq) => {
          stripBrowserOriginHeaders(proxyReq);
        });
      }
    }
  };
}

export function createDataHubBrowserProxy(target: string) {
  return {
    "/api": {
      target,
      changeOrigin: true
    },
    "/platform": {
      target,
      changeOrigin: true
    },
    "/platform-login": {
      target,
      changeOrigin: true
    },
    "/assets": {
      target,
      changeOrigin: true,
      bypass(req: { url?: string }) {
        const pathname = req.url?.split("?")[0] ?? "";
        if (/^\/assets\/[^/]+-[A-Za-z0-9_-]+\.(js|css)$/.test(pathname)) {
          return;
        }
        return false;
      }
    }
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = resolveDataHubProxyTarget({ command, env, mode, processEnv: process.env });
  const officialDocumentProxyTarget = resolveOfficialDocumentProxyTarget({ env, processEnv: process.env }) || proxyTarget;

  return {
    plugins: [react(), vue()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      proxy: {
        // Official-document must be registered before /api so Vite can strip
        // browser Origin before the request reaches the Java CORS filter.
        ...createOfficialDocumentBrowserProxy(officialDocumentProxyTarget),
        // Keep remaining browser requests same-origin. /api is the BFF.
        // /platform and hashed /assets/* let “添加知识库” open DataHub’s UI
        // on this origin so Xingshu can seed platform_token without putting
        // JWT in the URL.
        ...createDataHubBrowserProxy(proxyTarget)
      }
    },
    test: {
      environment: "jsdom",
      setupFiles: ["src/test/setup.ts"],
      globals: true,
      testTimeout: 10_000,
      include: ["src/**/*.{test,spec}.{ts,tsx}"]
    },
    build: {
      chunkSizeWarningLimit: 500
    }
  };
});
