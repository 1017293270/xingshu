import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const rows: Array<[string, string]> = [
  ["TITLE", "关于2026年上半年经营工作情况的报告"],
  ["RECIPIENT", "公司董事会："],
  ["BODY", "现将上半年经营工作、重点项目推进情况及下一步安排报告如下。"],
  ["PRESERVE", ""]
];
for (const [index, heading] of ["总体经营情况", "重点工作进展", "存在的问题", "下一步工作安排", "组织保障"].entries()) {
  rows.push(
    ["HEADING_1", `${["一", "二", "三", "四", "五"][index]}、${heading}`],
    ["HEADING_2", "（一）主要进展与工作成效"],
    ["BODY", "各部门按照年度工作计划稳步推进任务，持续完善协同机制，形成可跟踪、可核验的工作记录。"],
    ["BODY", "围绕重点项目建立定期复盘机制，对进度、质量及资源配置进行统一分析，及时解决推进过程中的问题。"],
    ["HEADING_2", "（二）关键措施与实施要求"],
    ["BODY", "进一步明确责任分工与完成时限，加强过程跟踪，确保各项工作有序落实。"],
    ["PRESERVE", ""]
  );
}
rows.push(["BODY", "特此报告。"], ["SIGNATURE", "星数科技有限公司"], ["DATE", "2026年9月7日"]);

function fixtureTemplate(id: string, status: string) {
  return {
    id, name: "报告（红头文件）", createdAt: "2026-09-07T02:00:00Z",
    versions: [{
      id: `${id}-v1`, versionNumber: 1, status,
      originalFileName: "报告（红头文件）.docx", originalSize: 42000,
      createdAt: "2026-09-07T02:00:00Z",
      analysis: {
        structureProfile: {
          sections: [{}],
          paragraphs: rows.map(([role, text], index) => ({
            index, text,
            format: { styleName: role, firstLineIndentPoints: role === "BODY" ? 32 : 0 },
            runs: [{ text, format: { fontName: "仿宋", fontSizePoints: 16 } }]
          })),
          tables: [], headersAndFooters: [], warnings: []
        },
        engineCapabilityReport: { available: true, licensed: true, engineName: "Syncfusion DocIO", warnings: [], blockingReasons: [] }
      },
      mappingProfile: { mappings: rows.map(([role], index) => ({
        nodeId: `paragraph:${index}`, slotId: `slot-${index}`, paragraphIndex: index,
        role, slotType: "FIXED_TEXT", required: false, dataBinding: false
      })) }
    }]
  };
}

test("模板详情和校准视图保留定位、只读状态及小屏滚动", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", (route) => route.fulfill({ json: { code: 200, data: [] } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ status: 503, json: { message: "isolated visual fixture" } }));
  await page.route("**/api/official-document/v1/capabilities", (route) => route.fulfill({ json: {
    wordEngine: { available: true }, queryAssets: { available: false },
    limits: { acceptedFileTypes: [".docx"], bindingKinds: ["SCALAR"], exportFormats: ["DOCX", "PDF"], previewFormats: ["PDF"] }
  } }));
  await page.route("**/api/official-document/v1/templates", (route) => route.fulfill({ json: {
    items: [fixtureTemplate("codex-review", "READY_FOR_MAPPING"), fixtureTemplate("codex-published", "PUBLISHED")]
  } }));
  await page.route("**/api/official-document/v1/drafts", (route) => route.fulfill({ json: { items: [] } }));
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "7");
    localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/writing/templates/codex-review");
  const view = page.locator(".official-document-template-detail");
  const document = page.locator(".template-document");
  const nonemptyCount = rows.filter(([, text]) => text).length;
  await expect(document.locator(".template-document__line")).toHaveCount(nonemptyCount);
  await expect(document.locator('[data-role="TITLE"]')).toHaveCSS("text-align", "center");
  await expect(document.locator('[data-role="BODY"]').first()).toHaveCSS("text-indent", "28px");
  await expect(document.locator('[data-role="BODY"]').first()).toHaveCSS("font-size", "14px");

  await page.getByRole("button", { name: /一级标题 五、组织保障/ }).click();
  const activeHeading = document.locator('[data-role="HEADING_1"]').filter({ hasText: "五、组织保障" });
  await expect(activeHeading).toHaveAttribute("data-active", "true");
  expect(await document.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: /标题 关于2026年/ }).click();
  await expect.poll(() => document.evaluate((node) => node.scrollTop)).toBe(0);

  for (const [width, height] of [[1440, 900], [1672, 1000], [1920, 1080], [2200, 1200], [1024, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "校准结构", exact: true })).toBeVisible();
    await page.screenshot({ path: `outputs/template-detail-codex/read-${width}.png` });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "校准结构", exact: true }).click();
  await expect(page.locator(".official-document-calibration-inspector")).toBeVisible();
  await page.getByRole("button", { name: /标题 关于2026年/ }).click();
  const rolePicker = page.getByRole("combobox", { name: "段落 1 段落角色", exact: true });
  await expect(rolePicker).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "正文区域起点", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /显示 \d+ 个空段落/ }).click();
  await expect(document.locator(".template-document__line")).toHaveCount(rows.length);
  await page.getByRole("button", { name: "隐藏空段落" }).click();

  for (const [width, height] of [[1440, 900], [1672, 1000], [1920, 1080], [2200, 1200], [1024, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width > 1100) {
      const panels = await page.locator(".official-document-calibration-workspace").evaluate((node) =>
        getComputedStyle(node).gridTemplateColumns.split(" ").length);
      expect(panels).toBe(3);
    }
    await page.screenshot({ path: `outputs/template-detail-codex/calibrate-${width}.png` });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await document.press("Home");
  await document.press("PageDown");
  await expect(document).toBeFocused();
  await expect.poll(() => document.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  const accessibility = await new AxeBuilder({ page }).include(".official-document-app").analyze();
  expect(accessibility.violations).toEqual([]);

  await page.goto("/writing/templates/codex-published");
  await page.getByRole("button", { name: "校准结构", exact: true }).click();
  await page.getByRole("button", { name: /标题 关于2026年/ }).click();
  await expect(page.getByRole("combobox", { name: "段落 1 段落角色", exact: true })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "允许问数绑定" })).toBeDisabled();
  await expect(view.getByText("该模板已发布，结构只读。需要改角色请上传新版本。")).toBeVisible();
  await page.screenshot({ path: "outputs/template-detail-codex/readonly-1440.png" });
  await page.getByRole("button", { name: "按此结构新建草稿" }).click();
  await expect(page.getByRole("dialog", { name: "按结构创建报告草稿" })).toBeVisible();
  await page.screenshot({ path: "outputs/template-detail-codex/create-dialog-1440.png" });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(pageErrors).toEqual([]);
});

test("其他模板分析轮询保留未发布校准，发布后使用服务端映射", async ({ page }) => {
  let templateReads = 0;
  const review = fixtureTemplate("codex-review", "READY_FOR_MAPPING");
  let mappings = review.versions[0].mappingProfile.mappings;
  await page.route("**/api/**", (route) => route.fulfill({ json: { code: 200, data: [] } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ status: 503, json: { message: "isolated visual fixture" } }));
  await page.route("**/api/official-document/v1/capabilities", (route) => route.fulfill({ json: {
    wordEngine: { available: true, licensed: true }, queryAssets: { available: false },
    limits: { exportFormats: ["DOCX", "PDF"] }
  } }));
  await page.route("**/api/official-document/v1/templates", (route) => {
    templateReads++;
    return route.fulfill({ json: { items: [review, fixtureTemplate("other-upload", "ANALYZING")] } });
  });
  await page.route("**/api/official-document/v1/drafts", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/versions/codex-review-v1/mapping", async (route) => {
    mappings = route.request().postDataJSON().mappings;
    await route.fulfill({ json: { mappings } });
  });
  await page.route("**/versions/codex-review-v1:publish", async (route) => {
    review.versions[0].status = "PUBLISHED";
    review.versions[0].mappingProfile.mappings = mappings;
    await route.fulfill({ json: review.versions[0] });
  });
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-calibration-qa");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "calibration-qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "7");
    localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/writing/templates/codex-review");
  await page.getByRole("button", { name: "校准结构", exact: true }).click();
  await page.getByRole("button", { name: /一级标题 一、总体经营情况/ }).click();
  const picker = page.getByRole("combobox", { name: "段落 5 段落角色", exact: true });
  await picker.locator("xpath=ancestor::*[contains(@class, 'ant-select ')][1]").click();
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option-content").filter({ hasText: /^二级标题$/ }).click();
  await page.getByRole("checkbox", { name: "必填槽位" }).check();
  const heading = page.locator('.template-document [data-node-id="paragraph:4"]');
  await expect(heading).toHaveAttribute("data-role", "HEADING_2");
  const before = templateReads;
  await expect.poll(() => templateReads).toBeGreaterThan(before);
  await expect(page.locator(".official-document-calibration-inspector")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "必填槽位" })).toBeChecked();
  await expect(heading).toHaveAttribute("data-role", "HEADING_2");
  await page.screenshot({ path: "outputs/template-detail-codex/calibration-poll-preserved.png" });
  await page.getByRole("button", { name: "发布结构", exact: true }).click();
  await expect(page.getByRole("button", { name: "按此结构新建草稿" })).toBeVisible();
  expect(await heading.getAttribute("data-role")).toBe("HEADING_2");
  await page.getByRole("button", { name: /二级标题 一、总体经营情况/ }).click();
  await expect(picker).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "必填槽位" })).toBeChecked();
  expect(mappings.find((mapping) => mapping.nodeId === "paragraph:4")).toMatchObject({ role: "HEADING_2", required: true });
  await page.screenshot({ path: "outputs/template-detail-codex/published-mapping-preserved.png" });
});
