import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-dashboard-onboarding.mjs
// 截大屏引导弹窗（/dashboard 首访自动弹出）三屏动效的关键帧。
const base = "http://127.0.0.1:5173";
const dir = "outputs/dashboard-onboarding-qa";

const seed = JSON.parse(readFileSync("outputs/dashboard-seed/seed-dashboard.json", "utf8"));
const records = seed.slice(0, 2);

const shots = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1672x941", width: 1672, height: 941 }
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
  await page.addInitScript(() => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
    // 不写入 xingshu_dashboard_onboarding_v1：让大屏引导自动弹出
  });
  // 不存在的后端会让列表接口 401 并踢回登录页，这里 mock 掉
  await page.route(/\/api\/analytics\/dashboards$/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(records) })
  );
  await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });

  // S1 汇聚：散点阶段（自动弹出 700ms + 弹窗过渡）
  await page.waitForSelector(".db-converge", { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/onboarding-${shot.name}-s1-scatter.png` });
  // S1 汇聚：汇聚成形阶段（12s 循环的 48–86%）
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${dir}/onboarding-${shot.name}-s1-converged.png` });

  // S2 编排：卡片入场中段
  await page.getByRole("button", { name: "下一步" }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${dir}/onboarding-${shot.name}-s2-drag.png` });
  // S2 编排：卡片落位后
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${dir}/onboarding-${shot.name}-s2-placed.png` });

  // S3 放映：KPI 滚动 + 图表动画完成后
  await page.getByRole("button", { name: "下一步" }).click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${dir}/onboarding-${shot.name}-s3-present.png` });

  await page.close();
  console.log(`done ${shot.name}`);
}
await browser.close();
