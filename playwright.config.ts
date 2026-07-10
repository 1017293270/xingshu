import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/visual",
  outputDir: "outputs/playwright",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 12_000
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "outputs/playwright-report" }]
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "light",
    locale: "zh-CN",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    env: {
      VITE_DASHBOARD_EDITOR_URL: "http://127.0.0.1:5174/workbenches"
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium"
      }
    }
  ]
});
