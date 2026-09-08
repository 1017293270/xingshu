import { expect, type Page, test } from "@playwright/test";

const templateName = "城市运行管理服务平台年度建设与履约工作情况报告格式模板（2026年正式版）";
const requirement = "请整理年度平台建设情况、主要问题及下一年度安排";
const plan = { summary: "围绕本次要求安排章节与写作重点。", sections: [
  { id: "s1", order: 0, headingRole: "HEADING_1", title: "一、建设情况", purpose: "说明已经完成的主要工作", keyPoints: ["主要成果", "履约情况"] },
  { id: "s2", order: 1, headingRole: "HEADING_1", title: "二、改进安排", purpose: "明确下一步计划", keyPoints: ["问题与措施"] }
], researchNeeds: [] };

async function install(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-codex-writing");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: true }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  const pending: Array<() => Promise<void>> = [];
  let generations = 0;
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (pathname.endsWith("/v1/capabilities")) return json({ wordEngine: { available: true, licensed: true }, limits: { exportFormats: ["DOCX", "PDF"] } });
    if (pathname === "/api/official-document/v1/templates") return json({ items: [{ id: "t1", name: templateName, createdAt: "2026-09-07T00:00:00Z", versions: [{
      id: "v1", versionNumber: 1, status: "PUBLISHED", originalFileName: "年度履约报告.docx", originalSize: 4096, createdAt: "2026-09-07T00:00:00Z",
      analysis: { structureProfile: { sections: [{}], paragraphs: [
        { index: 0, text: "年度履约报告", format: { styleName: "Title" } },
        ...Array.from({ length: 11 }, (_, index) => ({ index: index + 1, text: index === 1 ? "（一）实施范围" : `第 ${index + 1} 章 参考章节`, format: { styleName: index === 1 ? "Heading 2" : "Heading 1", outlineLevel: index === 1 ? 1 : 0 } })),
        { index: 12, text: "参考正文内容。", format: { styleName: "Normal" } }
      ], tables: [], headersAndFooters: [] }, engineCapabilityReport: { available: true, licensed: true } }
    }] }] });
    if (pathname === "/api/official-document/v1/drafts") return json({ items: [] });
    if (pathname === "/api/analytics/query-assets") return json({ code: 200, message: "ok", data: [] });
    if (pathname === "/api/v1/chat/writing-content-analysis") return new Promise<void>((resolve) => {
      pending.push(async () => { await json({ code: 200, message: "ok", data: plan }); resolve(); });
    });
    if (pathname === "/api/agentScore/chat/completions/stream") {
      generations++;
      const req = route.request().postDataJSON();
      const ctx = req.writingContext as { fixedFields: Array<{ slotId: string }>; referenceSections: Array<{ id: string }> };
      const answer = [...ctx.fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]\n年度履约报告`), ...ctx.referenceSections.map((section) => `[[XS_SECTION:${section.id}]]\n据本次已确认的要求组织报告正文。`)].join("\n\n");
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text", content: answer, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: ${JSON.stringify({ type: "done", content: {}, finished: true, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: [DONE]\n\n` });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated writing fixture" } });
  });
  return { release: async () => { await expect.poll(() => pending.length).toBeGreaterThan(0); await pending.shift()!(); }, generations: () => generations };
}

async function submit(page: Page) {
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
  await input.fill("@");
  await page.getByRole("option").filter({ hasText: templateName }).click();
  await input.fill(requirement);
  await page.getByRole("button", { name: "生成完整公文", exact: true }).click();
  const waiting = page.getByRole("region", { name: "写作大纲分析中", exact: true });
  await expect(waiting).toBeVisible();
  return waiting;
}

async function releaseResponse(page: Page, release: () => Promise<void>) {
  const response = page.waitForResponse("**/api/v1/chat/writing-content-analysis");
  await release();
  await response;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test("compact waiting keeps reference folded, animates honestly and transitions into an editable outline", async ({ page }) => {
  await page.clock.install();
  const state = await install(page);
  const waiting = await submit(page);
  const details = waiting.locator("details");
  const title = waiting.getByRole("status");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(waiting.getByText("第 1 章 参考章节", { exact: true })).toBeHidden();
  const style = await waiting.evaluate((node) => ({ border: getComputedStyle(node).borderTopWidth, background: getComputedStyle(node).backgroundColor }));
  expect(style).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)" });
  const before = await title.evaluate((node) => getComputedStyle(node).backgroundPosition);
  await page.clock.runFor(200);
  const after = await title.evaluate((node) => ({ position: getComputedStyle(node).backgroundPosition, animation: getComputedStyle(node).animationName }));
  expect(after.animation).toBe("xs-skeleton-shimmer");
  expect(after.position).not.toBe(before);
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `outputs/codex-writing/page-waiting-${width}.png`, animations: "disabled", fullPage: true });
    await waiting.screenshot({ path: `outputs/codex-writing/waiting-${width}.png`, animations: "disabled" });
    await details.locator("summary").click();
    await expect(waiting.getByText(`《${templateName}》· 11 个章节`, { exact: true })).toBeVisible();
    await expect(waiting.locator('li[data-depth="1"]')).toHaveText("（一）实施范围");
    await expect(waiting.getByText("还有 3 个章节", { exact: true })).toBeVisible();
    await expect(waiting.getByText("第 9 章 参考章节", { exact: true })).toHaveCount(0);
    await waiting.screenshot({ path: `outputs/codex-writing/reference-${width}.png`, animations: "disabled" });
    await details.locator("summary").click();
  }
  await details.locator("summary").click();
  await page.clock.fastForward(61_000);
  await expect(details).toHaveAttribute("open", "");
  await expect(waiting).toContainText("仍在等待大纲返回，可以继续等待或跳过大纲直接生成。");
  await expect(title).toHaveText("正在梳理写作大纲");
  await expect(waiting.locator('[data-state="done"]')).toHaveCount(0);
  await releaseResponse(page, state.release);
  await expect(waiting).toHaveCount(0);
  const outline = page.getByRole("region", { name: "写作大纲确认", exact: true });
  await expect(outline.getByText("确认写作大纲", { exact: true })).toBeVisible();
  await outline.getByText("调整写作思路", { exact: true }).first().click();
  await outline.getByRole("textbox", { name: "章节写作目的：一、建设情况", exact: true }).fill("强调本阶段可核验的建设成果");
  await outline.getByRole("textbox", { name: "章节内容要点：一、建设情况", exact: true }).fill("实际交付内容\n尚待改进事项");
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `outputs/codex-writing/page-outline-${width}.png`, animations: "disabled", fullPage: true });
    await outline.screenshot({ path: `outputs/codex-writing/outline-${width}.png`, animations: "disabled" });
  }
});

test("cancel and skip keep late analysis responses from reappearing or generating twice", async ({ page }) => {
  const state = await install(page);
  let waiting = await submit(page);
  await waiting.getByRole("button", { name: "取消", exact: true }).click();
  await expect(waiting).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "公文写作要求", exact: true })).toHaveValue(requirement);
  await releaseResponse(page, state.release);
  await expect(page.getByRole("region", { name: "写作大纲确认", exact: true })).toHaveCount(0);
  expect(state.generations()).toBe(0);
  await page.getByRole("button", { name: "生成完整公文", exact: true }).click();
  waiting = page.getByRole("region", { name: "写作大纲分析中", exact: true });
  await waiting.getByRole("button", { name: "跳过大纲直接生成", exact: true }).click();
  await expect.poll(state.generations).toBe(1);
  await releaseResponse(page, state.release);
  await expect(waiting).toHaveCount(0);
  await expect(page.getByRole("region", { name: "写作大纲确认", exact: true })).toHaveCount(0);
  expect(state.generations()).toBe(1);
});

test("reduced motion and forced colors preserve readable static waiting titles", async ({ page }) => {
  for (const media of [{ reducedMotion: "reduce" as const }, { reducedMotion: "no-preference" as const, forcedColors: "active" as const }]) {
    await page.emulateMedia(media);
    await install(page);
    const waiting = await submit(page);
    const style = await waiting.getByRole("status").evaluate((node) => {
      const style = getComputedStyle(node);
      return { animation: style.animationName, background: style.backgroundImage, fill: style.webkitTextFillColor };
    });
    expect(style.animation).toBe("none");
    expect(style.background).toBe("none");
    expect(style.fill).not.toBe("rgba(0, 0, 0, 0)");
    await waiting.getByRole("button", { name: "取消", exact: true }).click();
  }
});
