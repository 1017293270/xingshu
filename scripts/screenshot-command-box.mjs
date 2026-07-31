import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = "outputs/home-page-design-qa";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const user = { token: "t", userId: 1, username: "张三", isAdmin: true };
  window.localStorage.setItem("xingshu_datahub_token", user.token);
  window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
  window.localStorage.setItem("xingshu_datahub_space_id", "1");
  window.localStorage.setItem("xingshu_onboarding_v1", "done");
});
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

// 1. 选择器关闭态
await page.locator(".xs-command-box").screenshot({ path: `${dir}/cb-icons-closed.png` });

// 2. 展开菜单
await page.locator(".xs-command-model-select").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/cb-icons-menu.png`, clip: { x: 600, y: 30, width: 420, height: 300 } });

// 3. 切到问知模型，看图标+颜色变化
await page.getByRole("menuitem", { name: /问知模型/ }).click();
await page.waitForTimeout(400);
await page.locator(".xs-command-box").screenshot({ path: `${dir}/cb-icons-rag.png` });

await browser.close();
console.log("done");
