import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const names = [
  "知识库合同履约情况报告", "请示（红头文件）", "报告（红头文件）",
  "报告（红头文件）", "报告（红头文件）", "善治数字科技2026年上半年经营分析及重点工作推进情况报告",
  "请示（红头文件）", "无文号通知（红头文件）", "无文号函（红头文件）",
  "文号通知（红头文件）", "文号函（红头文件）", "报告（红头文件）",
  "批复（红头文件）", "专题会纪要（红头文件）", "一般红头文件",
  "工作总结", "公文助手_占位符通知模板"
];

test("模板库的筛选、状态与双入口在各尺寸下可用", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: { code: 200, data: [] } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ status: 503, json: { message: "问数资产不参与本次视觉检查" } }));
  await page.route("**/api/official-document/v1/capabilities", (route) => route.fulfill({ json: {
    wordEngine: { available: true }, queryAssets: { available: true },
    limits: { acceptedFileTypes: [".docx"], bindingKinds: ["SCALAR"], exportFormats: ["DOCX", "PDF"], previewFormats: ["PDF"] }
  } }));
  await page.route("**/api/official-document/v1/templates", (route) => route.fulfill({ json: {
    items: names.map((name, index) => ({
      id: `gallery-${index}`, name, createdAt: "2026-09-07T02:30:00Z",
      versions: [{
        id: `gallery-${index}-v1`, versionNumber: index % 3 + 1,
        status: index === 16 ? "FAILED" : index === 15 ? "ANALYZING" : index === 14 ? "READY_FOR_MAPPING" : "PUBLISHED",
        originalFileName: `${name}_${index + 1}.docx`, originalSize: 42000, createdAt: "2026-09-07T02:30:00Z",
        analysis: {
          structureProfile: {
            sections: Array.from({ length: index % 3 + 1 }, (_, section) => ({ index: section })),
            paragraphs: [{ index: 0, text: name, format: { styleName: "Title" }, runs: [] }],
            tables: [], headersAndFooters: [], warnings: []
          },
          engineCapabilityReport: { available: true, warnings: [], blockingReasons: [] }
        }
      }]
    }))
  } }));
  await page.route("**/api/official-document/v1/drafts", (route) => route.fulfill({ json: { items: [] } }));
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "visual-qa", isAdmin: true }));
    localStorage.setItem("xingshu_datahub_space_id", "7");
    localStorage.setItem("xingshu_onboarding_v1", "done");
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/writing/templates");
  await expect(page.locator(".official-document-template-card")).toHaveCount(17);
  for (const [width, height] of [[1440, 1000], [1672, 1080], [1920, 1080], [2200, 1200], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const card = page.locator(".official-document-template-card").first();
    expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `outputs/template-library-neutral/library-${width}.png` });
  }
  await page.getByRole("button", { name: /待处理/ }).click();
  await expect(page.locator(".official-document-template-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "使用模板 工作总结", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "搜索模板" }).fill("找不到的文件");
  await expect(page.getByText("没有符合条件的模板")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.locator(".official-document-template-card")).toHaveCount(17);

  await page.goto("/writing");
  await page.getByRole("textbox", { name: "公文写作要求" }).fill("@");
  await page.getByRole("option", { name: /模板库/ }).click();
  const gallery = page.getByRole("region", { name: "模板库", exact: true });
  await expect(gallery).toBeVisible();
  for (const [width, height] of [[1440, 1000], [1512, 1312], [1672, 1080], [1920, 1080], [2200, 1200], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await gallery.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const header = await gallery.locator(".official-document-templates__head").boundingBox();
    const search = await gallery.getByRole("textbox", { name: "搜索模板" }).boundingBox();
    expect(search!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    if (width === 390) {
      const filters = await gallery.getByRole("group", { name: "按模板状态筛选" }).boundingBox();
      const grid = await gallery.locator(".official-document-templates__grid").boundingBox();
      expect(filters!.y).toBeGreaterThanOrEqual(search!.y + search!.height);
      expect(grid!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height);
    }
    const columns = await gallery.locator(".official-document-templates__grid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width <= 900 ? 1 : 2);
    await page.screenshot({ path: `outputs/template-library-neutral/overlay-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.locator(".official-document-template-card").first().evaluate((element) =>
    parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.01);
  const accessibility = await new AxeBuilder({ page }).include(".official-document-templates").analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "关闭模板库" }).click();
  await expect(gallery).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: "公文写作要求" })).toBeFocused();
});
