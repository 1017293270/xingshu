import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const shots = [
  { name: "login-v3-1440x900", width: 1440, height: 900 },
  { name: "login-v3-1920x1080", width: 1920, height: 1080 },
  { name: "login-v3-390x844", width: 390, height: 844 }
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `outputs/login-page-design-qa/${shot.name}-typing.png` });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `outputs/login-page-design-qa/${shot.name}-trace.png` });
  await page.close();
  console.log(`done ${shot.name}`);
}
await browser.close();
