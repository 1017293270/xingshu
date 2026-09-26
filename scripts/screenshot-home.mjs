import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

// 首页命令框锚点验收：各尺寸 × 编排 / 查数据两种模式截首屏，
// 并打印命令框中心与滚动区中线的偏差、切换模式后命令框的位移。
// 用法：XS_QA_BASE_URL=http://127.0.0.1:5185 node scripts/screenshot-home.mjs [输出目录]
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";
const dir = process.argv[2] || "outputs/home-page-design-qa";
const centerTolerance = 8;

const viewports = [
  { width: 1440, height: 900 },
  { width: 1672, height: 941 },
  { width: 1920, height: 1080 },
  { width: 2200, height: 1100 },
  { width: 1366, height: 720 },
  { width: 390, height: 844 }
];

const modes = [
  { id: "agent", label: "编排", heading: "您好，张三" },
  { id: "ask", label: "问数", heading: "从一个经营数据问题开始" }
];

mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const failures = [];

for (const viewport of viewports) {
  const size = `${viewport.width}x${viewport.height}`;
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => failures.push(`${size} 运行时错误：${error.message}`));
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
  // 首页截图不依赖后端数据，接口一律回空，免得开发代理把请求打到真实环境
  await page.route("**/api/**", (route) => route.fulfill({ json: { code: 200, message: "screenshot fixture", data: [] } }));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });

  let agentTop;
  for (const mode of modes) {
    if (mode.id !== "agent") {
      await page.getByRole("button", { name: `切换到${mode.label}模型` }).click();
    }
    await page.getByRole("heading", { level: 1, name: mode.heading }).waitFor();
    // 等入场动画落定再量，量到的才是静止位置
    await page.evaluate(async () => {
      await document.fonts.ready;
      const finite = document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined));
      await Promise.all(finite);
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    });

    const metrics = await page.evaluate(() => {
      const main = document.querySelector(".xs-shell__main");
      const command = document.querySelector(".home-page .xs-command-box").getBoundingClientRect();
      const midline = main.getBoundingClientRect().top + main.clientHeight / 2;
      return {
        commandTop: command.top,
        centerOffset: command.top + command.height / 2 - midline,
        overflowX: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth
      };
    });
    agentTop ??= metrics.commandTop;
    const shift = metrics.commandTop - agentTop;
    const offset = metrics.centerOffset.toFixed(1).padStart(6);
    console.log(
      `${size.padEnd(10)} ${mode.label.padEnd(3)} 中心偏差 ${offset}px  相对编排位移 ${shift.toFixed(1)}px  横向溢出 ${metrics.overflowX}px`
    );
    if (Math.abs(metrics.centerOffset) > centerTolerance) {
      failures.push(`${size} ${mode.label} 命令框中心偏离中线 ${metrics.centerOffset.toFixed(1)}px`);
    }
    if (Math.abs(shift) > 1) {
      failures.push(`${size} ${mode.label} 切换模式后命令框位移 ${shift.toFixed(1)}px`);
    }
    if (metrics.overflowX > 1) {
      failures.push(`${size} ${mode.label} 横向溢出 ${metrics.overflowX}px`);
    }
    await page.screenshot({ path: `${dir}/home-${mode.id}-${size}.png` });
  }
  await page.close();
}

await browser.close();
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
