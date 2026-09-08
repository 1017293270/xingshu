import { expect, type Page, test } from "@playwright/test";

const templateName = "城市运行管理服务平台年度建设与履约工作情况报告格式模板（2026年正式版）";
const requirement = "请整理年度平台建设情况、主要问题及下一年度安排";
const plan = { summary: "围绕本次要求安排章节与写作重点。", sections: [
  { id: "s1", order: 0, headingRole: "HEADING_1", title: "一、建设情况", purpose: "说明已经完成的主要工作", keyPoints: ["主要成果", "履约情况"] },
  { id: "s2", order: 1, headingRole: "HEADING_1", title: "二、改进安排", purpose: "明确下一步计划", keyPoints: ["问题与措施"] }
], researchNeeds: [] };

async function install(page: Page, research = false) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-codex-writing");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: true }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  const pending: Array<() => Promise<void>> = [];
  let generations = 0;
  let researchRequests = 0;
  const analysisInputs: Record<string, unknown>[] = [];
  const researchReleases: Array<() => Promise<void>> = [];
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
      analysisInputs.push(route.request().postDataJSON());
      pending.push(async () => { await json({ code: 200, message: "ok", data: research ? { ...plan, researchNeeds: [
        { id: "r1", sectionId: "s1", kind: "ASK_KNOWLEDGE", question: "年度建设完成事实", reason: "依据", required: true, preferredOutput: "FACT" },
        { id: "r2", sectionId: "s2", kind: "ASK_KNOWLEDGE", question: "年度改进安排依据", reason: "依据", required: true, preferredOutput: "FACT" }
      ] } : plan }); resolve(); });
    });
    if (pathname === "/api/agentScore/chat/completions/stream") {
      const req = route.request().postDataJSON();
      if (req.chatMode === "rag") {
        researchRequests++;
        return new Promise<void>((resolve) => {
          researchReleases.push(async () => {
            await route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text", content: "资料已查得：年度建设完成，安排已确认。", sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: ${JSON.stringify({ type: "done", content: { summary: "资料已查得：年度建设完成，安排已确认。", citations: [{ kbId: "kb1", docId: "doc1", docName: "年度资料", fragments: ["年度建设完成"] }] }, finished: true, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: [DONE]\n\n` });
            resolve();
          });
        });
      }
      generations++;
      const ctx = req.writingContext as { fixedFields: Array<{ slotId: string }>; referenceSections: Array<{ id: string }> };
      const answer = [...ctx.fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]\n年度履约报告`), ...ctx.referenceSections.map((section) => `[[XS_SECTION:${section.id}]]\n据本次已确认的要求组织报告正文。`)].join("\n\n");
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text", content: answer, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: ${JSON.stringify({ type: "done", content: {}, finished: true, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: [DONE]\n\n` });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated writing fixture" } });
  });
  return { release: async () => { await expect.poll(() => pending.length).toBeGreaterThan(0); await pending.shift()!(); }, generations: () => generations,
    analysisInputs,
    researchRequests: () => researchRequests,
    releaseResearch: async () => { await expect.poll(() => researchReleases.length).toBeGreaterThan(0); await researchReleases.shift()!(); }
  };
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


test("restores an unsaved generated artifact after reload without generating twice", async ({ page }) => {
  const state = await install(page);
  await submit(page);
  await releaseResponse(page, state.release);
  await page.getByRole("button", { name: "确认大纲并生成", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存到草稿箱", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "保存到草稿箱", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "公文生成对话", exact: true })).toContainText(requirement);
  expect(state.generations()).toBe(1);
  await page.addInitScript(() => {
    const key = "xingshu:writing:1:1";
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (saved?.chat?.turns?.[0]) {
      saved.chat.turns[0].events.push({});
      sessionStorage.setItem(key, JSON.stringify(saved));
    }
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "保存到草稿箱", exact: true })).toBeVisible();
  expect(state.generations()).toBe(1);
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `outputs/writing-closure-fixes-2026-09-07/recovered-${width}.png`, fullPage: true, animations: "disabled" });
  }
});

test("attachment informs the outline and edited research questions survive refresh", async ({ page }) => {
  const state = await install(page, true);
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
  await input.fill("@");
  await page.getByRole("option").filter({ hasText: templateName }).click();
  await page.getByTestId("official-document-material-file").setInputFiles({ name: "参考事实.txt", mimeType: "text/plain", buffer: Buffer.from("独有事实：已交付蓝桥站点，完成验收。") });
  await input.fill("根据附件起草年度报告");
  await page.getByRole("button", { name: "生成完整公文", exact: true }).click();
  await releaseResponse(page, state.release);
  expect(JSON.stringify(state.analysisInputs)).toContain("独有事实：已交付蓝桥站点，完成验收。");
  await page.getByRole("textbox", { name: "章节标题：一、建设情况", exact: true }).fill("人员结构");
  await page.getByRole("region", { name: "写作大纲确认", exact: true }).getByText("调整写作思路", { exact: true }).first().click();
  await page.getByRole("textbox", { name: "章节写作目的：人员结构", exact: true }).fill("了解人员分布");
  await expect(page.getByRole("textbox", { name: "资料问题：r1", exact: true })).toHaveValue(/人员结构.*了解人员分布/);
  await page.getByRole("textbox", { name: "资料问题：r1", exact: true }).fill("查询2026年度人员部门分布");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "资料问题：r1", exact: true })).toHaveValue("查询2026年度人员部门分布");
  await expect(page.getByText("参考事实.txt", { exact: true })).toBeVisible();
  expect(state.generations()).toBe(0);
});

test("research checkpoints resume without repeating completed queries and stop ignores late replies", async ({ page }) => {
  const state = await install(page, true);
  await submit(page);
  await releaseResponse(page, state.release);
  await page.getByRole("button", { name: "确认大纲，补资料并生成", exact: true }).click();
  await expect.poll(state.researchRequests).toBe(1);
  await state.releaseResearch();
  await expect.poll(state.researchRequests).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "继续补充资料并生成", exact: true })).toBeVisible();
  await state.releaseResearch();
  expect(state.generations()).toBe(0);
  await page.getByRole("button", { name: "继续补充资料并生成", exact: true }).click();
  await expect.poll(state.researchRequests).toBe(3);
  await page.getByRole("button", { name: "停止补充资料", exact: true }).click();
  await state.releaseResearch();
  expect(state.generations()).toBe(0);
  await page.getByRole("button", { name: "继续补充资料并生成", exact: true }).click();
  await expect.poll(state.researchRequests).toBe(4);
  await state.releaseResearch();
  await expect(page.getByRole("button", { name: "保存到草稿箱", exact: true })).toBeVisible();
  expect(state.generations()).toBe(1);
});
