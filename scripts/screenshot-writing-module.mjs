import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-writing-module.mjs
// 截智能写作模块重构后的列表页与两个详情页：1440/1672/1920/390 四档。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

const browser = await chromium.launch();

async function newPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: { code: 200, message: "visual qa fixture", data: [] },
      status: 200
    })
  );
  await page.addInitScript(() => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
    window.localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  return page;
}

async function shot(name, width, height, path, readySelector, extra) {
  const page = await newPage(width, height);
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(readySelector, { timeout: 15000 });
  await page.waitForTimeout(700);
  if (extra) await extra(page);
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

await shot("writing-hub-1440", 1440, 900, "/writing", ".official-document-template-card");
await shot("writing-hub-1672", 1672, 1000, "/writing", ".official-document-template-card");
await shot("writing-hub-1920", 1920, 1080, "/writing", ".official-document-template-card");
await shot("writing-hub-390", 390, 844, "/writing", ".official-document-template-card");
await shot("writing-hub-general-1440", 1440, 900, "/writing", ".official-document-template-card", async (page) => {
  await page.getByRole("tab", { name: /通用写作/ }).click();
  await page.waitForSelector(".writing-panel");
  await page.waitForTimeout(500);
});
await shot(
  "writing-template-detail-1440",
  1440,
  1100,
  "/writing/templates/template-demo-work-report",
  ".official-document-structure li"
);
await shot(
  "writing-template-detail-390",
  390,
  844,
  "/writing/templates/template-demo-work-report",
  ".official-document-structure li"
);
await shot(
  "writing-draft-detail-1440",
  1440,
  1100,
  "/writing/drafts/draft-demo-1",
  ".structured-draft-editor__blocks article"
);
await shot(
  "writing-draft-detail-390",
  390,
  844,
  "/writing/drafts/draft-demo-1",
  ".structured-draft-editor__blocks article"
);

await browser.close();
console.log("done");
