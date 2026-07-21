import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = "outputs/home-page-design-qa";

const shots = [
  { name: "home-v2-1440x900", width: 1440, height: 900 },
  { name: "home-v2-1672x941", width: 1672, height: 941 },
  { name: "home-v2-1920x1080", width: 1920, height: 1080 },
  { name: "home-v2-390x844", width: 390, height: 844 }
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
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
  });
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  // 入场阶梯进行中
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${dir}/${shot.name}-enter.png` });
  // 阶梯结束、打字机占位符进行中
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${dir}/${shot.name}-typing.png` });
  await page.close();
  console.log(`done ${shot.name}`);
}
await browser.close();
