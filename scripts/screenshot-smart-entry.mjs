import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-smart-entry.mjs
// 打开 preview-smart-entry.html，伪造收藏问数列表，截入口页（空/已选）、首页（1440 与 1280×720）、大屏库与广场页头。
const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:5173";
const dir = "outputs/ui-audit";
mkdirSync(dir, { recursive: true });

const column = (key, label, type = "string") => ({ columnId: key, key, label, type });
const asset = (id, name, question, outputs) => ({
  id,
  name,
  originalQuestion: question,
  resolvedQuestion: question,
  datasourceId: 8,
  ownerUserId: 2,
  visibility: "PRIVATE",
  stableVersionId: `${id}-v1`,
  status: "ACTIVE",
  stableVersion: {
    id: `${id}-v1`,
    versionNo: 1,
    resolvedQuestion: question,
    engine: "CUBE",
    parameters: [],
    outputs,
    schemaHash: `${id}-hash`,
    status: "VALIDATED",
    createdAt: "2026-09-03T00:00:00.000Z"
  },
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z"
});
const assets = [
  asset("asset-revenue", "月度营收", "近六个月每月营收与成本是多少", [
    { outputKey: "monthly", label: "月度营收", rowCount: 6, columns: [column("month", "月份"), column("revenue", "营收", "number"), column("cost", "成本", "number")] }
  ]),
  asset("asset-region", "区域销售", "各区域今年销售额排名", [
    { outputKey: "region", label: "区域销售", rowCount: 5, columns: [column("region", "区域"), column("sales", "销售额", "number")] }
  ]),
  asset("asset-total", "订单合计", "今年订单总数是多少", [
    { outputKey: "total", label: "订单合计", rowCount: 1, columns: [column("total", "订单总数", "number")] }
  ]),
  asset("asset-channel", "渠道订单", "各渠道订单数排行", [
    { outputKey: "channel", label: "渠道订单", rowCount: 14, columns: [column("channel", "渠道"), column("orders", "订单数", "number")] }
  ])
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Playwright 后注册的路由先匹配：兜底放前面，收藏问数放后面才不会被兜底截胡。
await context.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: [], message: "ok" }) }));
await context.route("**/api/analytics/query-assets*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: assets, message: "ok" }) }));
const page = await context.newPage();
page.on("pageerror", (error) => console.error(`page error: ${error.message}`));

/** 首次访问的功能引导弹窗会盖住页面，截图前点掉。 */
async function dismissTour() {
  const skip = page.getByRole("button", { name: "跳过" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(400);
  }
}

await page.goto(`${BASE}/preview-smart-entry.html?page=entry`, { waitUntil: "networkidle" });
await page.waitForSelector('ul[aria-label="收藏问数列表"]', { timeout: 15000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/smart-entry-1-empty.png` });
console.log("smart-entry-1-empty.png");

await page.locator(".smart-entry__asset", { hasText: "月度营收" }).click();
await page.locator(".smart-entry__asset", { hasText: "区域销售" }).click();
await page.getByRole("button", { name: "面向经营例会的营收总览，突出趋势" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/smart-entry-2-selected.png` });
console.log("smart-entry-2-selected.png");

await page.goto(`${BASE}/preview-smart-entry.html?page=home`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await dismissTour();
await page.screenshot({ path: `${dir}/smart-entry-3-home-1440.png` });
console.log("smart-entry-3-home-1440.png");
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${dir}/smart-entry-4-home-1280x720.png` });
console.log("smart-entry-4-home-1280x720.png");

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/preview-smart-entry.html?page=library`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await dismissTour();
await page.screenshot({ path: `${dir}/smart-entry-5-library.png` });
console.log("smart-entry-5-library.png");

await page.goto(`${BASE}/preview-smart-entry.html?page=square`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await dismissTour();
await page.screenshot({ path: `${dir}/smart-entry-6-square.png` });
console.log("smart-entry-6-square.png");

await browser.close();
