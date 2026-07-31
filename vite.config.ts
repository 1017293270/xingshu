import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    process.env.VITE_DATAHUB_PROXY_TARGET ??
    env.VITE_DATAHUB_PROXY_TARGET ??
    (process.env.VITE_DATAHUB_BFF_PORT || env.VITE_DATAHUB_BFF_PORT
      ? `http://127.0.0.1:${process.env.VITE_DATAHUB_BFF_PORT || env.VITE_DATAHUB_BFF_PORT}`
      : "http://132.232.141.234");

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
      chunkSizeWarningLimit: 1300
    }
  };
});
