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
    <main class="official-document-calibration-workspace">
      <section class="official-document-calibration-structure">
        <div class="official-document-workspace-panel-head"><h4>结构节点</h4></div>
        <ol class="official-document-structure">${nodes}</ol>
      </section>
    </main>
  `);
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document.css") });
  await page.addStyleTag({ content: ":root{--xs-border:#dce8f6;--xs-radius-card:14px;--xs-shadow-soft:none;--xs-primary:#1677ff;--xs-primary-2:#1264c4;--xs-text:#08244c}" });

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
