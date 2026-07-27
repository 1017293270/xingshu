import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = "outputs/login-page-design-qa";

// 覆盖计划的断点：常规桌面 / 1672 / 1920 / 2200 / 1280 临界（动效隐藏，回退两列）/ 移动
const shots = [
  { name: "v6-1440x900", width: 1440, height: 900 },
  { name: "v6-1672x940", width: 1672, height: 940 },
  { name: "v6-1920x1080", width: 1920, height: 1080 },
  { name: "v6-2200x1200", width: 2200, height: 1200 },
  { name: "v6-1280x800", width: 1280, height: 800 },
  { name: "v6-390x844", width: 390, height: 844 }
];

// 「繁星汇聚成星簇」14s 循环采样：散 ~2s / 聚 ~6.5s / 序 ~10.5s
const phases = [
  { tag: "scatter", wait: 2000 },
  { tag: "gather", wait: 6500 },
  { tag: "cluster", wait: 10500 }
];

const browser = await chromium.launch();
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  let elapsed = 0;
  for (const phase of phases) {
    await page.waitForTimeout(phase.wait - elapsed);
    elapsed = phase.wait;
    await page.screenshot({ path: `${dir}/${shot.name}-${phase.tag}.png` });
  }
  // 检查横向滚动
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.log(`WARN ${shot.name}: horizontal overflow ${overflow}px`);
  await page.close();
  console.log(`done ${shot.name}`);
}
await browser.close();
