import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { baseUrl, feedbackBoard } from "./screenshot-dashboard-fixtures.mjs";

// 用法：node scripts/screenshot-dashboard-runtime.mjs <输出名前缀> [大屏记录id | feedback]
// 从 outputs/dashboard-seed/seed-dashboard.json 读种子大屏记录，路由拦截 runtime 接口后截全屏运行态。
// （dev 模式下 getDashboardRuntimeInitialData 走远程分支，光写 localStorage 是喂不进去的。）
// 传 feedback 时改用 beta0.4 反馈样例：运行态回放的数据集带全称列名、含 0 行结果，看清洗与「暂无数据」。
// 服务地址读 XS_QA_BASE_URL，缺省 http://127.0.0.1:5173。
const prefix = process.argv[2] ?? "dashboard-runtime";
const dashboardId = process.argv[3] ?? "seed-visual-qa";
const feedback = dashboardId === "feedback" ? feedbackBoard() : undefined;
const seed = feedback ? [] : JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const record = feedback?.record ?? seed.find((item) => item.id === dashboardId) ?? seed[0];
const dir = "outputs/ui-audit";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(() => {
  window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
  window.localStorage.setItem(
    "xingshu_datahub_user",
    JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
  );
  window.localStorage.setItem("xingshu_datahub_space_id", "7");
});
// 种子记录的 datasets/moduleStatuses 留空：hydrate 时会保留 schema 里已带的快照行
await page.route(/\/api\/analytics\/dashboards\/[^/]+\/runtime$/, (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      record,
      datasets: feedback?.datasets ?? {},
      moduleStatuses: feedback?.moduleStatuses ?? {}
    })
  })
);
await page.goto(`${baseUrl}/dashboard-view?dashboard=${record.id}`, { waitUntil: "networkidle" });
await page.waitForSelector(".runtime-canvas canvas, .runtime-canvas .chart-renderer", { timeout: 15000 });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${dir}/${prefix}-full.png` });
// 只截画布区域，便于对比预设细节
const canvas = page.locator(".runtime-canvas");
await canvas.screenshot({ path: `${dir}/${prefix}-canvas.png` });
if (feedback) {
  // 表头短名之外，完整原文要留在悬浮提示里。
  const headers = await page.locator(".runtime-canvas .table-renderer th").evaluateAll((nodes) =>
    nodes.map((node) => `${node.textContent?.trim()} ⇢ ${node.getAttribute("title")}`)
  );
  console.log(headers.join("\n"));
}
await browser.close();
console.log("done");
