import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = "outputs/home-refine/interactions";

const browser = await chromium.launch();

async function newAuthedPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(() => {
    const user = {
      token: "playwright-visual-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
    window.localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2400);
  return page;
}

// 1. 卡片 hover
let page = await newAuthedPage(1440, 900);
const firstCard = page.locator(".home-page .xs-app-card").first();
await firstCard.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/state-card-hover.png` });

// 2. 输入框聚焦
await page.locator(".home-page .xs-command-box__input").click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/state-command-focus.png` });

// 3. 输入文本后的发送激活
await page.locator(".home-page .xs-command-box__input").fill("帮我分析本月经营数据，并生成趋势图表");
await page.waitForTimeout(200);
await page.screenshot({ path: `${dir}/state-command-filled.png` });

// 4. 模型菜单
await page.getByRole("button", { name: "选择模型，当前编排模型" }).click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${dir}/state-model-menu.png` });
await page.getByRole("menuitem", { name: /问知模型/ }).click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${dir}/state-model-rag.png` });

// 5. 键盘 focus-visible（Tab 到第一张卡片）
await page.keyboard.press("Escape");
for (let i = 0; i < 30; i += 1) {
  await page.keyboard.press("Tab");
  const isCardMain = await page.evaluate(() =>
    document.activeElement?.classList.contains("xs-app-card__main")
  );
  if (isCardMain) break;
}
await page.waitForTimeout(250);
await page.screenshot({ path: `${dir}/state-card-focus.png` });

// 6. selected 态：进入智能写作后通过客户端导航返回首页（保留 zustand 选中态）
await page.getByRole("button", { name: /^打开 智能写作/ }).click();
await page.waitForURL(/\/writing$/, { timeout: 8000 });
await page.goBack();
await page.waitForURL(/\/$/, { timeout: 8000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${dir}/state-card-selected.png` });

// 7. 语音状态提示
await page.getByRole("button", { name: "语音" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${dir}/state-voice-status.png` });
await page.close();
console.log("desktop states done");

// 8. 移动端抽屉导航
page = await newAuthedPage(390, 844);
await page.getByRole("button", { name: "打开主导航" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/state-mobile-drawer.png` });
await page.close();
console.log("mobile drawer done");

await browser.close();
