import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const user = { token: "t", userId: 1, username: "张三", isAdmin: true };
  window.localStorage.setItem("xingshu_datahub_token", user.token);
  window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
  window.localStorage.setItem("xingshu_datahub_space_id", "1");
  window.localStorage.setItem("xingshu_onboarding_v1", "done");
});
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const el = document.querySelector(".home-page .xs-app-card__desc");
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    display: cs.display,
    lineClamp: cs.webkitLineClamp,
    orient: cs.webkitBoxOrient,
    height: rect.height,
    overflow: cs.overflow
  };
});
console.log(JSON.stringify(info));
await browser.close();
