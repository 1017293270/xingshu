import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const out = "outputs/login-page-design-qa";
const shots = [
  { name: "login-v3-1280x800", width: 1280, height: 800 },
  { name: "login-v3-1440x720-short", width: 1440, height: 720 }
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(6800);
  await page.screenshot({ path: `${out}/${shot.name}-trace.png` });
  await page.close();
  console.log(`done ${shot.name}`);
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.getByLabel("用户名").click();
await page.getByLabel("用户名").fill("zhangsan");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/login-v3-1440x900-focus.png` });
await page.getByRole("button", { name: "登录" }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/login-v3-1440x900-validation.png` });
await page.close();
console.log("done states");
await browser.close();
