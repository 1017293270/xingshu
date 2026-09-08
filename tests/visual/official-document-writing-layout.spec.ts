import { expect, test } from "@playwright/test";
import path from "node:path";

const TOKENS = ":root{--xs-bg:#f3f8ff;--xs-surface:#fff;--xs-border:#dce8f6;--xs-radius-card:14px;--xs-shadow-soft:0 1px 2px rgba(8,36,76,.06);--xs-primary:#1677ff;--xs-primary-2:#1264c4;--xs-text:#08244c;--xs-text-3:#7185a1;--xs-danger:#FF4D4F;--xs-fs-caption:12px;--xs-fs-label:13px;--xs-fs-control:14px;--xs-fs-card:17px;--xs-fw-text:500;--xs-fw-medium:600;--xs-fw-bold:700;--xs-ls-title:-0.012em;--xs-motion-fast:140ms;--xs-motion-ease-out:cubic-bezier(.2,0,0,1);--xs-motion-ease-spring:cubic-bezier(0.18,0.89,0.32,1.08)}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,'PingFang SC',sans-serif}";

async function applyStyles(page: import("@playwright/test").Page) {
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document-workspace.css") });
  await page.addStyleTag({ path: path.resolve("src/features/officialDocument/official-document.css") });
  await page.addStyleTag({ content: TOKENS });
}

function outlineRow(label: string, preview: string, kind: string, depth: number) {
  return `
    <li class="template-outline__item" data-kind="${kind}" data-depth="${depth}">
      <div class="template-outline__row">
        <span class="template-outline__toggle"></span>
        <button type="button" class="template-outline__label">
          <span class="template-outline__kind">${label}</span>
          <span class="template-outline__preview">${preview}</span>
        </button>
      </div>
    </li>`;
}

const OUTLINE = `
  <ul class="template-outline" aria-label="模板大纲">
    ${outlineRow("标题", "关于开展年度经营分析工作的通知", "fixed", 0)}
    ${outlineRow("主送机关", "各分公司、各部门：", "fixed", 0)}
    <li class="template-outline__item" data-kind="heading" data-depth="0">
      <div class="template-outline__row">
        <button type="button" class="template-outline__toggle" aria-expanded="true">▾</button>
        <button type="button" class="template-outline__label">
          <span class="template-outline__kind">一级标题</span>
          <span class="template-outline__preview">一、总体情况</span>
        </button>
      </div>
      <ul class="template-outline__children">
        ${outlineRow("正文", "4 段正文 · 今年以来，公司经营总体…", "body", 1)}
        <li class="template-outline__item" data-kind="heading" data-depth="1">
          <div class="template-outline__row">
            <button type="button" class="template-outline__toggle" aria-expanded="true">▾</button>
            <button type="button" class="template-outline__label">
              <span class="template-outline__kind">二级标题</span>
              <span class="template-outline__preview">（一）收入完成情况</span>
            </button>
          </div>
          <ul class="template-outline__children">
            ${outlineRow("问数表格", "收入分解表", "table", 2)}
            ${outlineRow("正文", "6 段正文 · 分板块看，主营业务收入…", "body", 2)}
          </ul>
        </li>
      </ul>
    </li>
    ${outlineRow("落款", "星数科技有限公司", "fixed", 0)}
    ${outlineRow("原样保留", "12 段随原稿保留", "preserve", 0)}
  </ul>`;

const DOCUMENT_LINES = [
  ["TITLE", "关于开展年度经营分析工作的通知"],
  ["RECIPIENT", "各分公司、各部门："],
  ["HEADING_1", "一、总体情况"],
  ...Array.from({ length: 8 }, (_, index) => ["BODY", `今年以来，公司经营总体平稳，第 ${index + 1} 段正文用于确认首行缩进与行距。`]),
  ["HEADING_2", "（一）收入完成情况"],
  ...Array.from({ length: 6 }, (_, index) => ["BODY", `分板块看，第 ${index + 1} 段说明收入结构变化。`]),
  ["SIGNATURE", "星数科技有限公司"],
  ["DATE", "2026年8月21日"]
];

const DOCUMENT = `
  <div class="template-document">
    <article class="template-document__page">
      ${DOCUMENT_LINES.map(([role, text], index) => `
        <p class="official-document-line template-document__line" data-role="${role}"${index === 10 ? " data-active" : ""}>${text}</p>
      `).join("")}
    </article>
  </div>`;

function templateStage(mode: "write" | "calibrate") {
  return `
  <div class="official-document-app" style="height: 900px">
    <header class="official-document-app__bar"></header>
      <div class="official-document-app__workspace" data-stage="template">
        <div class="official-document-calibration" data-mode="${mode}">
          <div class="official-document-calibration-workspace">
            <section class="official-document-calibration-outline">
              <div class="official-document-workspace-panel-head">
                <div><h4>模板大纲</h4><p>点标题跳到对应段落。</p></div>
              </div>
              ${OUTLINE}
            </section>
            <section class="official-document-calibration-document" aria-label="模板原文">
              <div class="official-document-workspace-panel-head">
                <div><h4>模板原文</h4><p>按角色排版的样本文字。</p></div>
              </div>
              ${DOCUMENT}
            </section>
            ${mode === "calibrate" ? `
            <aside class="official-document-calibration-inspector">
              <div class="official-document-workspace-panel-head"><div><h4>节点属性</h4><p>角色与绑定权限</p></div></div>
            </aside>` : ""}
          </div>
        </div>
      </div>
  </div>`;
}

test("真实 React 页面可通过 @ 搜索并选择草稿", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("xingshu_datahub_token", "visual-token");
    sessionStorage.setItem("xingshu_datahub_user", JSON.stringify({
      token: "visual-token",
      userId: 1,
      username: "visual-user",
      isAdmin: false
    }));
    sessionStorage.setItem("xingshu_datahub_space_id", "7");
  });
  await page.route("**/api/official-document/v1/capabilities", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      wordEngine: { available: true },
      queryAssets: { available: true },
      limits: { exportFormats: ["DOCX", "PDF"], previewFormats: ["PDF"] }
    })
  }));
  await page.route("**/api/official-document/v1/templates", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{
      id: "template-visual",
      name: "经营通报模板",
      createdAt: "2026-08-27T00:00:00Z",
      versions: [{
        id: "version-visual",
        versionNumber: 1,
        status: "PUBLISHED",
        originalFileName: "经营通报模板.docx",
        originalSize: 2048,
        createdAt: "2026-08-27T00:00:00Z",
        analysis: { structureProfile: { paragraphs: [] } }
      }]
    }])
  }));
  await page.route("**/api/official-document/v1/drafts", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([{
      id: "draft-visual",
      templateId: "template-visual",
      templateVersionId: "version-visual",
      title: "季度经营通报",
      createdAt: "2026-08-27T01:00:00Z",
      status: "READY",
      fileVersions: [{ versionNumber: 2, createdAt: "2026-08-27T02:00:00Z" }],
      bindings: []
    }])
  }));
  await page.route("**/api/analytics/query-assets**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ code: 200, message: "success", data: [] })
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求" });
  await expect(input).toBeVisible();
  await expect(page.getByRole("heading", { name: "想写一篇什么公文？" })).toBeVisible();
  const box = page.locator(".official-document-composer");
  const boxBox = (await box.boundingBox())!;
  expect(boxBox.width).toBeLessThanOrEqual(1120);
  await input.pressSequentially("@");
  const menu = page.getByRole("listbox", { name: "引用与动作" });
  await expect(menu).toBeVisible();
  // 浮层与输入盒同宽并浮在它正上方，和 Codex 一样
  const menuBox = (await menu.boundingBox())!;
  expect(Math.round(menuBox.width)).toBe(Math.round(boxBox.width));
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(boxBox.y + 1);
  await page.screenshot({ path: "outputs/report-writing/compose-app-mention-1440.png", fullPage: false });

  await menu.getByRole("option", { name: /季度经营通报/ }).click();
  await expect(page.getByLabel("本轮引用", { exact: true })).toContainText("@季度经营通报");
  await input.fill("撰写2026年第三季度经营工作通报");
  const submit = page.getByRole("button", { name: "生成完整公文" });
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await page.screenshot({ path: "outputs/report-writing/compose-app-selected-1440.png", fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "想写一篇什么公文？" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
  await page.screenshot({ path: "outputs/report-writing/compose-app-selected-390.png", fullPage: false });
});

test("写作视角两栏、校准视角三栏，原文在自己的容器里滚动", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(templateStage("write"));
  await applyStyles(page);

  const columns = await page.locator(".official-document-calibration-workspace > *").evaluateAll(
    (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width))
  );
  expect(columns).toHaveLength(2);
  // 原文栏必须比大纲宽，读稿才是主任务
  expect(columns[1]).toBeGreaterThan(columns[0]);

  const scroll = await page.locator(".template-document").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);

  // 页面本身不横向滚动
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({ path: "outputs/report-writing/template-outline-1440.png", fullPage: false });

  await page.setContent(templateStage("calibrate"));
  await applyStyles(page);
  const calibrateColumns = await page.locator(".official-document-calibration-workspace > *").evaluateAll(
    (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width))
  );
  expect(calibrateColumns).toHaveLength(3);
  await page.screenshot({ path: "outputs/report-writing/template-calibrate-1440.png", fullPage: false });
});

test("标题居中、正文首行缩进，层级一眼能分出来", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(templateStage("write"));
  await applyStyles(page);

  const title = page.locator('.template-document__line[data-role="TITLE"]').first();
  await expect(title).toHaveCSS("text-align", "center");

  const body = page.locator('.template-document__line[data-role="BODY"]').first();
  const indent = await body.evaluate((element) => getComputedStyle(element).textIndent);
  expect(Number.parseFloat(indent)).toBeGreaterThan(0);

  const weights = await page.evaluate(() => {
    const read = (role: string) => {
      const element = document.querySelector(`.template-document__line[data-role="${role}"]`);
      return element ? Number(getComputedStyle(element).fontWeight) : 0;
    };
    return { title: read("TITLE"), h1: read("HEADING_1"), h2: read("HEADING_2"), body: read("BODY") };
  });
  expect(weights.title).toBeGreaterThan(weights.body);
  expect(weights.h1).toBeGreaterThan(weights.body);
  expect(weights.h1).toBeGreaterThanOrEqual(weights.h2);
});

const CHAT = `
  <aside class="writing-chat" aria-label="报告智写对话">
    <div class="official-document-workspace-panel-head">
      <div><h4>智写助手</h4><p>基于「季度通报模板」续写、扩写与润色</p></div>
    </div>
    <div class="writing-chat__stream">
      <div class="writing-chat__turn">
        <p class="writing-chat__question">帮我拟一版这篇报告的开头段落</p>
        <div class="writing-chat__answer">
          <p>今年以来，公司坚持稳中求进的工作总基调，各项经营指标运行在合理区间。</p>
          <p>现将本季度经营情况报告如下。</p>
          <button class="ant-btn writing-chat__insert" type="button">插入到正文</button>
        </div>
      </div>
      <div class="writing-chat__turn">
        <p class="writing-chat__question">把第一小节扩写成三段</p>
        <div class="writing-chat__answer" data-streaming>
          <p class="writing-chat__thinking">正在起草</p>
        </div>
      </div>
    </div>
    <div class="writing-chat__composer" style="height:76px;background:#f4f8fd;border-radius:10px"></div>
  </aside>`;

function draftStage(chatOpen: boolean) {
  return `
  <div class="official-document-app" style="height: 900px">
    <header class="official-document-app__bar"></header>
      <div class="official-document-app__workspace" data-stage="draft">
        <div class="official-document-draft-workspace"${chatOpen ? " data-chat-open" : ""}>
          <div class="structured-draft-editor-frame">
            <section class="structured-draft-editor" data-fields-collapsed="false">
              <aside class="structured-draft-editor__fields"><div class="structured-draft-editor__panel-head"><div><strong>固定字段</strong></div></div></aside>
              <main class="structured-draft-editor__canvas"><header class="structured-draft-editor__canvas-head"><div><strong>结构化正文</strong></div></header></main>
            </section>
          </div>
          ${CHAT}
        </div>
      </div>
  </div>`;
}

test("宽屏智写常驻第三栏，窄屏收起后点开才浮出", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(draftStage(false));
  await applyStyles(page);

  const chat = page.locator(".writing-chat");
  await expect(chat).toBeVisible();
  const wideBox = await chat.boundingBox();
  expect(Math.round(wideBox!.width)).toBe(360);

  const editorBox = await page.locator(".structured-draft-editor-frame").boundingBox();
  // 并排而不是上下堆叠
  expect(Math.round(editorBox!.y)).toBe(Math.round(wideBox!.y));
  expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(wideBox!.x + 1);

  await page.screenshot({ path: "outputs/report-writing/draft-chat-1440.png", fullPage: false });

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.setContent(draftStage(false));
  await applyStyles(page);
  await expect(page.locator(".writing-chat")).toBeHidden();

  await page.setContent(draftStage(true));
  await applyStyles(page);
  await expect(page.locator(".writing-chat")).toBeVisible();
  await page.screenshot({ path: "outputs/report-writing/draft-chat-1180-open.png", fullPage: false });
});
