import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-dashboard-square.mjs [输出名前缀]
// 看板广场是卡片网格页，工具条（搜索 + 分段器 + 计数）是这里要看的重点。
// 和 screenshot-dashboard-list.mjs 同一套 mock：种子派生记录 + 路由拦截 /api/analytics/dashboards。
const prefix = process.argv[2] ?? "dashboard-square";
const dir = "outputs/ui-audit";
const seed = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const base = seed[0];

function variant(id, title, status, daysAgo) {
  const updated = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const shape = (source) => ({ ...source, id: `dashboard-${id}`, title });
  return {
    ...base,
    id,
    status,
    updatedAt: updated,
    publishedAt: status === "published" ? updated : undefined,
    schema: shape(base.schema),
    publishedSchema: status === "published" ? shape(base.publishedSchema ?? base.schema) : undefined
  };
}

const records = [
  variant("ops-monthly", "经营分析月报大屏", "published", 1),
  variant("sales-live", "实时销售监控", "published", 2),
  variant("finance-cost", "费用结构分析", "published", 3),
  variant("market-funnel", "市场转化漏斗", "published", 4),
  variant("service-sla", "客服时效看板", "published", 5),
  variant("draft-supply", "供应链库存草稿", "draft", 6),
  variant("draft-hr", "人力效能分析", "draft", 8),
  variant("draft-risk", "风险预警草稿", "draft", 10),
  variant("draft-asset", "资产盘点草稿", "draft", 12)
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
    window.localStorage.setItem("xingshu_dashboard_onboarding_v2:1", "done");
  });
  await page.route(/\/api\/analytics\/dashboards$/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(mockRecords) })
  );
  await page.goto("http://127.0.0.1:5173/dashboard/square", { waitUntil: "networkidle" });
  await page.waitForSelector(
    mockRecords.length > 0 ? ".dashboard-list__toolbar" : "[aria-label='看板广场空状态']",
    { timeout: 15000 }
  );
  await page.waitForTimeout(1000);
  if (extra) await extra(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

await shot(`${prefix}-1440`, 1440, 900, records);
await shot(`${prefix}-1672`, 1672, 1000, records);
// 工具条特写：页头三颗动作 + 扁平工具条一起入镜，用来核对间距与计数字号
await shot(`${prefix}-toolbar-1440`, 1440, 520, records);
await shot(`${prefix}-draft-1440`, 1440, 900, records, async (page) => {
  // 分段项的 radio input 是视觉隐藏的，点 label
  await page.locator(".dashboard-list__toolbar .ant-segmented-item-label", { hasText: "草稿" }).click();
  await page.waitForTimeout(400);
});
await shot(`${prefix}-820`, 820, 900, records);
await shot(`${prefix}-390`, 390, 844, records);
await shot(`${prefix}-empty-1440`, 1440, 900, []);

await browser.close();
console.log("done");
