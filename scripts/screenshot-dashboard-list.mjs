import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-dashboard-list.mjs
// 基于 outputs/dashboard-seed/seed-dashboard.json 派生多条大屏记录，
// 通过路由拦截 mock /api/analytics/dashboards 列表接口，截 /dashboard 卡片网格
// 的 1440/1672/2200/390 四档 + 悬停/菜单/空态。
const dir = "outputs/ui-audit";
const seed = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const base = seed[0];

function variant(id, title, status, daysAgo) {
  const updated = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    ...base,
    id,
    status,
    updatedAt: updated,
    publishedAt: status === "published" ? updated : undefined,
    schema: { ...base.schema, id: `dashboard-${id}`, title }
  };
}

const records = [
  variant("ops-monthly", "经营分析月报大屏", "published", 1),
  variant("sales-live", "实时销售监控", "published", 3),
  variant("draft-supply", "供应链库存草稿", "draft", 6),
  variant("draft-hr", "人力效能分析", "draft", 12)
];

const browser = await chromium.launch();

async function shot(name, width, height, mockRecords, extra) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(() => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
  });
  await page.route(/\/api\/analytics\/dashboards$/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(mockRecords) })
  );
  await page.goto("http://127.0.0.1:5173/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector(
    mockRecords.length > 0 ? ".dashboard-card:not(.dashboard-card--skeleton)" : ".dashboard-list__state--empty",
    { timeout: 15000 }
  );
  await page.waitForTimeout(600);
  if (extra) await extra(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

await shot("dashboard-list-1440", 1440, 900, records);
await shot("dashboard-list-1672", 1672, 1000, records);
await shot("dashboard-list-2200", 2200, 1200, records);
await shot("dashboard-list-390", 390, 844, records);
await shot("dashboard-list-hover-1440", 1440, 900, records, async (page) => {
  await page.locator(".dashboard-card").first().hover();
  await page.waitForTimeout(400);
});
await shot("dashboard-list-menu-1440", 1440, 900, records, async (page) => {
  await page.locator(".dashboard-card").first().hover();
  await page.locator(".dashboard-card__more-trigger").first().click();
  await page.waitForTimeout(300);
});
await shot("dashboard-list-empty-1440", 1440, 900, []);

await browser.close();
console.log("done");
