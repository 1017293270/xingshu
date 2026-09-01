import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-dashboard-list.mjs [输出名前缀]
// 「我的看板」已经从卡片网格改成"当前看板内联展示"，脚本随之改成截内联舞台：
// 基于 outputs/dashboard-seed/seed-dashboard.json 派生多条记录，路由拦截
// mock /api/analytics/dashboards，截 1440/1672/2200/390 四档 + 切换菜单 + 空态 + 加载态。
const prefix = process.argv[2] ?? "dashboard-list";
const dir = "outputs/ui-audit";
const seed = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const base = seed[0];

function variant(id, title, status, daysAgo) {
  const updated = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const schema = { ...base.schema, id: `dashboard-${id}`, title };
  return {
    ...base,
    id,
    status,
    updatedAt: updated,
    publishedAt: status === "published" ? updated : undefined,
    schema,
    publishedSchema: status === "published"
      ? { ...(base.publishedSchema ?? base.schema), id: `dashboard-${id}`, title }
      : undefined
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
    window.localStorage.setItem("xs-dashboard-current", "ops-monthly");
    // 空态截图要看的是空状态本身，不是新手引导弹层
    window.localStorage.setItem("xingshu_dashboard_onboarding_v2:1", "done");
  });
  await page.route(/\/api\/analytics\/dashboards$/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(mockRecords) })
  );
  await page.goto("http://127.0.0.1:5173/dashboard", { waitUntil: "networkidle" });
  await page.waitForSelector(
    mockRecords.length > 0 ? ".runtime-canvas" : "[aria-label='我的看板空状态']",
    { timeout: 15000 }
  );
  await page.waitForTimeout(1200);
  if (extra) await extra(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

await shot(`${prefix}-1440`, 1440, 900, records);
await shot(`${prefix}-1672`, 1672, 1000, records);
await shot(`${prefix}-2200`, 2200, 1200, records);
await shot(`${prefix}-390`, 390, 844, records);
await shot(`${prefix}-switch-1440`, 1440, 900, records, async (page) => {
  await page.locator(".dashboard-current__switch .ant-select-selector").click();
  await page.waitForTimeout(400);
});
await shot(`${prefix}-menu-1440`, 1440, 900, records, async (page) => {
  await page.getByRole("button", { name: "当前看板设置" }).click();
  await page.waitForTimeout(400);
});
await shot(`${prefix}-empty-1440`, 1440, 900, []);

await browser.close();
console.log("done");
