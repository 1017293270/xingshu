import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5173";
const dir = "outputs/login-page-design-qa";

const shots = [
  { name: "login-v5-1280x720", width: 1280, height: 720 },
  { name: "login-v5-1440x900", width: 1440, height: 900 },
  { name: "login-v5-1920x1080", width: 1920, height: 1080 },
  { name: "login-v5-2560x1440", width: 2560, height: 1440 },
  { name: "login-v5-1024x768", width: 1024, height: 768 },
  { name: "login-v5-390x844", width: 390, height: 844 }
];

// 与演示节奏对齐的采样点（页面加载后的累计毫秒）：打字中 / 思考骨架 / 图表生成 / 结论+停留
const phases = [
  { tag: "typing", wait: 1200 },
  { tag: "thinking", wait: 2600 },
  { tag: "chart", wait: 3800 },
  { tag: "answer", wait: 6000 }
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
  await page.close();
  console.log(`done ${shot.name}`);
}
await browser.close();
