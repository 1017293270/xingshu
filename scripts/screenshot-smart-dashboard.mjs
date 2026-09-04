import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-smart-dashboard.mjs
// 打开 preview-smart-dashboard.html，拦截大屏设计 SSE 接口伪造模型回复，
// 走完「自动首轮生成 → 应用 → 对话改版 → 应用」四步，截图到 outputs/ui-audit/smart-dashboard-*.png。
// 最后再跑一遍合同主数据的本地兜底（接口返回 404），产出 smart-dashboard-fallback-contract.png。
const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:5173";
const dir = "outputs/ui-audit";
mkdirSync(dir, { recursive: true });

const sse = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

const generateSpec = {
  narrative: "",
  title: "经营例会营收总览",
  subtitle: "月度营收趋势与区域、渠道结构",
  insight: "营收连续六个月增长，华东贡献最大。",
  themeId: "ice-light",
  archetype: "trend-led",
  widgets: [
    { ref: "k1", role: "kpi", assetId: "asset-total", outputKey: "total", metricKey: "total", valueMode: "first", title: "订单总数" },
    { ref: "k2", role: "kpi", assetId: "asset-revenue", outputKey: "monthly", metricKey: "revenue", valueMode: "latest", showTrend: true, title: "本月营收" },
    { ref: "k3", role: "kpi", assetId: "asset-revenue", outputKey: "monthly", metricKey: "cost", valueMode: "latest", title: "本月成本" },
    { ref: "t1", role: "trend", assetId: "asset-revenue", outputKey: "monthly", variant: "area-soft", dimensionKey: "month", metricKeys: ["revenue", "cost"], title: "营收与成本趋势", emphasis: "hero" },
    { ref: "c1", role: "comparison", assetId: "asset-region", outputKey: "region", variant: "bar-horizontal", dimensionKey: "region", metricKeys: ["sales"], title: "区域销售排行" },
    { ref: "p1", role: "composition", assetId: "asset-region", outputKey: "region", variant: "pie-donut", dimensionKey: "region", metricKeys: ["sales"], title: "区域销售占比" },
    { ref: "d1", role: "detail", assetId: "asset-channel", outputKey: "channel", title: "渠道订单明细" }
  ]
};

const generateEvents = [
  { type: "message", delta: "这块屏给经营例会看：" },
  { type: "message", delta: "顶部三张指标卡先给结论，中间趋势做主图，右侧放区域排行与占比，底部留渠道明细。" },
  { type: "spec", spec: generateSpec },
  { type: "done", modelId: "kimi-k2" }
];

const editEvents = [
  { type: "message", delta: "换成政务藏青深色主题，趋势图仍是主图，副标题标注深色版。" },
  {
    type: "ops",
    ops: {
      narrative: "",
      ops: [
        { op: "set_theme", themeId: "gov-navy" },
        { op: "set_board_title", title: "经营例会营收总览", subtitle: "深色版 · 月度营收趋势与区域、渠道结构" }
      ]
    }
  },
  { type: "done", modelId: "kimi-k2" }
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") console.error(`console error: ${message.text()}`);
});
await page.route("**/api/v1/dashboard-design/generate", (route) => route.fulfill({
  status: 200,
  contentType: "text/event-stream",
  body: sse(generateEvents)
}));
await page.route("**/api/v1/dashboard-design/edit", (route) => route.fulfill({
  status: 200,
  contentType: "text/event-stream",
  body: sse(editEvents)
}));

const query = new URLSearchParams({
  brief: "面向经营例会的营收总览，突出趋势",
  assets: "asset-total,asset-revenue,asset-region,asset-channel"
});
await page.goto(`${BASE}/preview-smart-dashboard.html?${query}`, { waitUntil: "networkidle" });

const card = 'article[aria-label="智享候选方案"]';
await page.waitForSelector(card, { timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/smart-dashboard-1-candidate.png` });
console.log("smart-dashboard-1-candidate.png");

await page.getByRole("button", { name: "应用", exact: true }).click();
await page.waitForSelector("text=已应用到画布", { timeout: 10000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${dir}/smart-dashboard-2-applied.png` });
console.log("smart-dashboard-2-applied.png");

await page.getByLabel("设计需求").fill("换成深色政务主题");
await page.getByRole("button", { name: "发送" }).click();
await page.waitForFunction((selector) => document.querySelectorAll(selector).length >= 2, card, { timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/smart-dashboard-3-edit-candidate.png` });
console.log("smart-dashboard-3-edit-candidate.png");

await page.getByRole("button", { name: "应用", exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll('.smart-design-card[data-status="applied"]').length >= 2, undefined, { timeout: 10000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${dir}/smart-dashboard-4-edited.png` });
console.log("smart-dashboard-4-edited.png");

await page.close();

/* 兜底一遍：后端没部署（404）时，本地规则版应该标题短、指标有数、图表画得出来。 */
const fallback = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
fallback.on("pageerror", (error) => console.error(`page error: ${error.message}`));
fallback.on("console", (message) => {
  if (message.type() === "error") console.error(`console error: ${message.text()}`);
});
await fallback.route("**/api/v1/dashboard-design/**", (route) => route.fulfill({
  status: 404,
  contentType: "application/json",
  body: JSON.stringify({ message: "No message available" })
}));

const fallbackQuery = new URLSearchParams({
  dataset: "contract",
  brief: "帮我设计个企业级的大屏",
  assets: "asset-contract,asset-invoice,asset-equipment,asset-payment"
});
await fallback.goto(`${BASE}/preview-smart-dashboard.html?${fallbackQuery}`, { waitUntil: "networkidle" });
// 404 兜底几乎瞬间就出候选卡，得先等 Vue 设计器挂完，否则「应用」会撞上「设计器尚未就绪」。
await fallback.waitForSelector('section[aria-label="星数大屏设计器"]', { timeout: 20000 });
await fallback.waitForSelector(card, { timeout: 20000 });
await fallback.waitForTimeout(600);
await fallback.screenshot({ path: `${dir}/smart-dashboard-fallback-candidate.png` });
console.log("smart-dashboard-fallback-candidate.png");
await fallback.getByRole("button", { name: "应用", exact: true }).click();
await fallback.waitForSelector("text=已应用到画布", { timeout: 10000 });
await fallback.waitForTimeout(1800);
await fallback.screenshot({ path: `${dir}/smart-dashboard-fallback-contract.png` });
console.log("smart-dashboard-fallback-contract.png");

await browser.close();
