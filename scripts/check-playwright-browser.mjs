import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const executablePath = chromium.executablePath();

if (!existsSync(executablePath)) {
  console.error("未找到 Playwright Chromium。请先运行：npm run test:visual:setup");
  process.exitCode = 1;
}
