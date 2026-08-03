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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = resolveDataHubProxyTarget({ command, env, mode, processEnv: process.env });

  return {
    plugins: [react(), vue()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    server: {
      proxy: {
        // Keep browser requests same-origin. Vite forwards them to the selected
        // data-hub BFF, which remains responsible for JWT and space headers.
        "/api": {
          target: proxyTarget,
          changeOrigin: true
        }
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
