import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = process.argv[2] || "outputs/home-refine/before";

const shots = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1672x941", width: 1672, height: 941 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2200x944", width: 2200, height: 944 },
  { name: "390x844", width: 390, height: 844 }
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
    window.localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `${dir}/home-${shot.name}.png` });
  await page.close();
  console.log(`done ${shot.name}`);
}
await browser.close();
