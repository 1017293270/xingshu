import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

const dataHubBffTarget =
  process.env.VITE_DATAHUB_PROXY_TARGET ??
  (process.env.VITE_DATAHUB_BFF_PORT ? `http://127.0.0.1:${process.env.VITE_DATAHUB_BFF_PORT}` : "http://127.0.0.1:8090");
const analyticsTarget = process.env.VITE_ANALYTICS_PROXY_TARGET;

export default defineConfig({
  plugins: [react(), vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  server: {
    proxy: {
      ...(analyticsTarget
        ? {
            "/api/analytics": {
              target: analyticsTarget,
              changeOrigin: true
            }
          }
        : {}),
      "/api": {
        target: dataHubBffTarget,
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
});
