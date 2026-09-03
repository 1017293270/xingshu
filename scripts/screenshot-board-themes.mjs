import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

// 用法：node scripts/screenshot-board-themes.mjs [主题id ...]
// 逐档访问 preview-dashboard.html?theme=<id>，截 1920×1080 全屏到 outputs/ui-audit/board-theme-<id>.png。
// id 列表写死在这里：脚本是 .mjs，import 不了 dashboardBoardThemes.ts；增删主题时同步这一行。
const ALL_THEMES = [
  "ice-light",
  "command-dark",
  "mint-lake",
  "executive-gold",
  "gov-navy",
  "gov-paper",
  "minimal-paper",
  "aurora-violet",
  "forest-green",
  "sunset-warm"
];

const themes = process.argv.slice(2).length ? process.argv.slice(2) : ALL_THEMES;
const dir = "outputs/ui-audit";
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (error) => console.error(`page error: ${error.message}`));

for (const theme of themes) {
  await page.goto(`http://127.0.0.1:5173/preview-dashboard.html?theme=${theme}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".runtime-canvas canvas, .runtime-canvas .chart-renderer", { timeout: 15000 });
  // ECharts 首帧动画 + KPI 数字滚动都要跑完，早截会拍到半截柱子
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/board-theme-${theme}.png` });
  console.log(`board-theme-${theme}.png`);
}

await browser.close();
