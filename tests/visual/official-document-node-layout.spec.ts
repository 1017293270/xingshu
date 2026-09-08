import { expect, test } from "@playwright/test";
import path from "node:path";

test("39 个结构节点保持可读并在中栏内部滚动", async ({ page }) => {
  const nodes = Array.from({ length: 39 }, (_, index) => `
    <li${index === 14 ? ' data-selected="true"' : ""}>
      <button type="button">
        <span class="official-document-structure__order">${index + 1}</span>
        <span class="official-document-structure__content">
          <span class="official-document-structure__role"><strong>正文</strong><span>可编辑</span></span>
          <span>第 ${index + 1} 个结构节点正文预览</span>
          <small>仿宋 · 三号 · 两端对齐</small>
        </span>
      </button>
    </li>
  `).join("");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`
    <div class="official-document-app" style="height: 900px; box-sizing: border-box">
      <aside class="official-document-rail"></aside>
      <div class="official-document-app__main">
        <header class="official-document-app__bar"></header>
        <div class="official-document-app__workspace" data-stage="template">
          <main class="official-document-calibration-workspace">
            <section class="official-document-calibration-structure">
              <div class="official-document-workspace-panel-head"><h4>结构节点</h4></div>
              <ol class="official-document-structure">${nodes}</ol>
            </section>
          </main>
        </div>
      </div>
    </div>
  `);
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document-workspace.css") });
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document.css") });
  await page.addStyleTag({ content: ":root{--xs-bg:#f3f8ff;--xs-border:#dce8f6;--xs-radius-card:14px;--xs-shadow-soft:none;--xs-primary:#1677ff;--xs-primary-2:#1264c4;--xs-text:#08244c}*{box-sizing:border-box}" });

  const rowHeights = await page.locator(".official-document-structure > li").evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().height)
  );
  const scrollMetrics = await page.locator(".official-document-structure").evaluate((list) => ({
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight
  }));

  expect(Math.min(...rowHeights)).toBeGreaterThanOrEqual(56);
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
});

test("草稿正文节点保持完整高度并在画布内滚动", async ({ page }) => {
  const template = {
    id: "template-1", name: "通知模板", createdAt: "2026-08-01T00:00:00Z",
    versions: [{ id: "version-1", versionNumber: 1, status: "PUBLISHED", originalFileName: "通知.docx", originalSize: 2048, createdAt: "2026-08-01T00:00:00Z" }]
  };
  const draft = { id: "draft-1", templateId: "template-1", templateVersionId: "version-1", title: "节点滚动验证", status: "READY", bindings: [], createdAt: "2026-08-02T00:00:00Z" };
  const content = { revision: 1, fixedValues: [], blocks: Array.from({ length: 24 }, (_, index) => ({
    id: `body-${index}`, order: index, role: "BODY", variantId: "body-main", text: `第 ${index + 1} 段正文，用于确认节点没有被压成横线。`
  })) };
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "node-layout-token");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ token: "node-layout-token", userId: 1, username: "qa" }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/analytics/")) return route.fulfill({ json: { code: 200, message: "fixture", data: [] } });
    const data = path.endsWith("/capabilities") ? {} : path.endsWith("/templates") ? { items: [template] }
      : path.endsWith("/drafts") ? { items: [draft] } : path.endsWith("/draft-1/content") ? content : {};
    return route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/writing/drafts/draft-1");
  const blocks = page.locator(".structured-draft-editor__blocks");
  await expect(blocks.locator("article[data-block-id]")).toHaveCount(24);
  const metrics = await blocks.evaluate((list) => ({
    clientHeight: list.clientHeight, scrollHeight: list.scrollHeight,
    minimum: Math.min(...Array.from(list.querySelectorAll("article"), (row) => row.getBoundingClientRect().height)),
    pageHeight: document.documentElement.scrollHeight
  }));
  expect(metrics.minimum).toBeGreaterThanOrEqual(88);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.pageHeight).toBeLessThanOrEqual(901);
  await blocks.evaluate((list) => { list.scrollTop = list.scrollHeight; });
  await expect(blocks.locator("article[data-block-id]").last()).toBeInViewport();
  await expect(page.locator(".structured-draft-editor__canvas-head")).toBeVisible();
});
