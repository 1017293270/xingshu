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
  const articles = Array.from({ length: 24 }, (_, index) => `
    <article data-role="body">
      <div class="structured-draft-editor__block-tools"><span>节点 ${index + 1}</span></div>
      <textarea class="ant-input" rows="4">第 ${index + 1} 段正文，用于确认节点没有被压成横线。</textarea>
    </article>
  `).join("");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`
    <div class="official-document-app" style="height: 900px; box-sizing: border-box">
      <aside class="official-document-rail"></aside>
      <div class="official-document-app__main">
        <header class="official-document-app__bar"></header>
        <div class="official-document-app__workspace" data-stage="draft">
          <div class="official-document-detail official-document-canvas-panel">
            <div class="xs-async-panel__content">
              <div class="official-document-draft-workspace">
                <div class="structured-draft-editor-frame">
                  <section class="structured-draft-editor" aria-label="结构化公文编辑器">
                    <aside class="structured-draft-editor__fields"></aside>
                    <main class="structured-draft-editor__canvas">
                      <header class="structured-draft-editor__canvas-head">
                        <div><strong>结构化正文</strong><small>24 个节点</small></div>
                        <span class="ant-tag">已保存</span>
                      </header>
                      <div class="structured-draft-editor__quick-add"></div>
                      <div class="structured-draft-editor__blocks">${articles}</div>
                    </main>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document-workspace.css") });
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document.css") });
  await page.addStyleTag({ content: ":root{--xs-bg:#f3f8ff;--xs-border:#dce8f6;--xs-radius-card:14px;--xs-shadow-soft:none;--xs-primary:#1677ff;--xs-primary-2:#1264c4;--xs-text:#08244c}*{box-sizing:border-box}.xs-async-panel__content{display:flex;flex:1;min-height:0;flex-direction:column;height:100%}" });

  const articleHeights = await page.locator(".structured-draft-editor__blocks article").evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().height)
  );
  const scrollMetrics = await page.locator(".structured-draft-editor__blocks").evaluate((list) => ({
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight
  }));
  const saveChip = page.locator(".structured-draft-editor__canvas-head .ant-tag");

  expect(Math.min(...articleHeights)).toBeGreaterThanOrEqual(88);
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  await expect(saveChip).toBeVisible();
  expect(await saveChip.evaluate((chip) => chip.parentElement?.classList.contains("structured-draft-editor__canvas-head"))).toBe(true);
});
