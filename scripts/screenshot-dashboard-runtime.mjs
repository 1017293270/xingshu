import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-dashboard-runtime.mjs <输出名前缀> [大屏记录id]
// 从 outputs/dashboard-seed/seed-dashboard.json 读种子大屏记录，注入 localStorage 后截运行态
const prefix = process.argv[2] ?? "dashboard-runtime";
const dashboardId = process.argv[3] ?? "seed-visual-qa";
const records = readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8");
const dir = "outputs/ui-audit";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(
  ([seedRecords]) => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
    window.localStorage.setItem("xingshu.dashboard.records.v1", seedRecords);
  },
  [records]
);
await page.goto(`http://127.0.0.1:5173/dashboard-view?dashboard=${dashboardId}`, { waitUntil: "networkidle" });
await page.waitForSelector(".runtime-canvas canvas, .runtime-canvas .chart-renderer", { timeout: 15000 });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${dir}/${prefix}-full.png` });
// 只截画布区域，便于对比预设细节
const canvas = page.locator(".runtime-canvas");
await canvas.screenshot({ path: `${dir}/${prefix}-canvas.png` });
await browser.close();
console.log("done");
