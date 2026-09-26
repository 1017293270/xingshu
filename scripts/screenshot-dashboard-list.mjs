import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { baseUrl, feedbackBoard } from "./screenshot-dashboard-fixtures.mjs";

// 用法：node scripts/screenshot-dashboard-list.mjs [输出名前缀]
// 「我的看板」已经从卡片网格改成"当前看板内联展示"，脚本随之改成截内联舞台：
// 基于 outputs/dashboard-seed/seed-dashboard.json 派生多条记录，路由拦截
// mock /api/analytics/dashboards，截 1440/1672/2200/390 四档 + 切换菜单 + 空态 + 加载态。
// 另有 beta0.4 反馈样例「善治经营看板」（数据截至、短表头、暂无数据）与删除入口：
// 登录用户 userId 1 名下的板可删，同事（userId 42）共享到空间的板没有删除按钮。
// 服务地址读 XS_QA_BASE_URL，缺省 http://127.0.0.1:5173。
const prefix = process.argv[2] ?? "dashboard-list";
const dir = "outputs/ui-audit";
const seed = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const base = seed[0];

function variant(id, title, status, daysAgo, reshape, owner = { ownerUserId: 1, visibility: "PRIVATE" }) {
  const updated = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const shape = (source) => {
    const next = { ...source, id: `dashboard-${id}`, title };
    return reshape ? reshape(next) : next;
  };
  return {
    ...base,
    ...owner,
    id,
    status,
    updatedAt: updated,
    publishedAt: status === "published" ? updated : undefined,
    schema: shape(base.schema),
    publishedSchema: status === "published" ? shape(base.publishedSchema ?? base.schema) : undefined
  };
}

// 自动构图会按内容把画布撑高（fitDashboardCanvasHeight），这类"高画布"是内联舞台最容易
// 出问题的形状：种子是 16:9，只有把画布拉到 4:3 才能验证宽度铺满。底部一行同步拉到画布底边，
// 免得画布下半截空着、看不出缩放到底以哪条边为准。
const TALL_CANVAS_HEIGHT = 1440;
function toTallCanvas(schema) {
  const gutter = schema.canvas.height - Math.max(...schema.widgets.map((w) => w.position.y + w.position.h));
  const bottom = Math.max(...schema.widgets.map((w) => w.position.y + w.position.h));
  return {
    ...schema,
    canvas: { ...schema.canvas, height: TALL_CANVAS_HEIGHT },
    widgets: schema.widgets.map((widget) => (
      widget.position.y + widget.position.h < bottom
        ? widget
        : { ...widget, position: { ...widget.position, h: TALL_CANVAS_HEIGHT - gutter - widget.position.y } }
    ))
  };
}

const feedback = feedbackBoard({ id: "feedback-board" });
const records = [
  variant("ops-monthly", "经营分析月报大屏", "published", 1),
  variant("tall-canvas", "自动构图高画布", "published", 2, toTallCanvas),
  { ...feedback.record, updatedAt: new Date(Date.now() - 2.5 * 86400000).toISOString() },
  variant("sales-live", "实时销售监控", "published", 3),
  variant("shared-by-colleague", "同事共享的区域看板", "published", 4, undefined, { ownerUserId: 42, visibility: "SPACE" }),
  variant("draft-supply", "供应链库存草稿", "draft", 6),
  variant("draft-hr", "人力效能分析", "draft", 12)
];

const browser = await chromium.launch();

async function shot(name, width, height, mockRecords, extra, currentId = "ops-monthly") {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript((activeId) => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
    window.localStorage.setItem("xs-dashboard-current", activeId);
    // 空态截图要看的是空状态本身，不是新手引导弹层
    window.localStorage.setItem("xingshu_dashboard_onboarding_v2:1", "done");
  }, currentId);
  await page.route(/\/api\/analytics\/dashboards$/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(mockRecords) })
  );
  // 运行态接口也要拦：反馈样例的行只在回放的数据集里，列名是后端原样的全称。
  await page.route(/\/api\/analytics\/dashboards\/([^/]+)\/runtime$/, (route) => {
    const id = decodeURIComponent(route.request().url().match(/dashboards\/([^/]+)\/runtime$/)[1]);
    const record = mockRecords.find((item) => item.id === id);
    const replay = id === feedback.record.id ? feedback : { datasets: {}, moduleStatuses: {} };
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ record, datasets: replay.datasets, moduleStatuses: replay.moduleStatuses })
    });
  });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
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
await shot(`${prefix}-tall-1440`, 1440, 900, records, undefined, "tall-canvas");
await shot(`${prefix}-tall-2200`, 2200, 1200, records, undefined, "tall-canvas");
await shot(`${prefix}-tall-390`, 390, 844, records, undefined, "tall-canvas");
// 高画布超出一屏，滚到底的这张用来确认画布下半截还在、没有被舞台裁掉
await shot(`${prefix}-tall-1440-scrolled`, 1440, 900, records, async (page) => {
  await page.locator(".xs-shell__main").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(500);
}, "tall-canvas");
await shot(`${prefix}-switch-1440`, 1440, 900, records, async (page) => {
  await page.locator(".dashboard-current__switch .ant-select-selector").click();
  await page.waitForTimeout(400);
});
await shot(`${prefix}-menu-1440`, 1440, 900, records, async (page) => {
  await page.getByRole("button", { name: "当前看板设置" }).click();
  await page.waitForTimeout(400);
});
// 当前是同事共享的板：齿轮菜单里没有删除。
await shot(`${prefix}-menu-shared-1440`, 1440, 900, records, async (page) => {
  await page.getByRole("button", { name: "当前看板设置" }).click();
  await page.waitForTimeout(400);
}, "shared-by-colleague");
// 从切换器里删一块不是当前的板：只截确认框，不点确认；确认框要写明删除后无法恢复。
await shot(`${prefix}-delete-confirm-1440`, 1440, 900, records, async (page) => {
  await page.locator(".dashboard-current__switch .ant-select-selector").click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "删除看板「实时销售监控」" }).click();
  await page.getByRole("dialog", { name: "删除看板" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
});
await shot(`${prefix}-feedback-1440`, 1440, 900, records, async (page) => {
  await page.waitForSelector(".runtime-canvas .table-renderer th", { timeout: 15000 });
  await page.waitForTimeout(600);
  const meta = await page.locator(".dashboard-current").first().innerText();
  console.log(meta.split("\n").filter((line) => /更新于|数据截至/.test(line)).join(" / "));
}, "feedback-board");
await shot(`${prefix}-feedback-390`, 390, 844, records, undefined, "feedback-board");
await shot(`${prefix}-empty-1440`, 1440, 900, []);

await browser.close();
console.log("done");
