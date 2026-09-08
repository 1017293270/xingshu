import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function fixture(page: Page, gallery = false) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-draft-qa");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "draft-qa", isAdmin: true }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  const template = { id: "format-1", name: "年度报告格式", createdAt: "2026-08-01T00:00:00Z", versions: [{
    id: "format-v1", versionNumber: 1, status: "PUBLISHED", originalFileName: "年度报告格式.docx", originalSize: 2048, createdAt: "2026-08-01T00:00:00Z",
    analysis: { structureProfile: { sections: [{}], paragraphs: [
      { index: 0, text: "年度工作报告", format: { styleName: "Title" } },
      { index: 1, text: "一、工作进展", format: { styleName: "Heading 1", outlineLevel: 0 } },
      { index: 2, text: "请填写实际工作进展。", format: { styleName: "Normal" } }
    ], tables: [], headersAndFooters: [] }, engineCapabilityReport: { available: true, licensed: true } }
  }] };
  let drafts = [
    { id: "draft-old", title: "较早报告", templateId: "format-1", templateVersionId: "format-v1", status: "READY", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z", fileVersions: [], bindings: [] },
    { id: "draft-new", title: "最新工作报告", templateId: "format-1", templateVersionId: "format-v1", status: "READY", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z", fileVersions: [], bindings: [] }
  ];
  if (gallery) drafts.push(...Array.from({ length: 10 }, (_, index) => ({ ...drafts[0], id: `draft-gallery-${index}`,
    title: ["年度平台建设与履约工作情况报告——包含长标题与多项工作成果的参考草稿", "关于做好第三季度安全生产工作的通知", "年度重点工作推进情况", "部门协同事项说明"][index % 4],
    status: ["READY", "EDITING", "VALIDATING", "BLOCKED"][index % 4]
  })));
  let content = { revision: 1, fixedValues: [], blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原始正文内容。" }] };
  let renameCount = 0;
  let deleteCount = 0;
  let saveCount = 0;
  let writing: Record<string, unknown> | undefined;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (pathname === "/api/official-document/v1/capabilities") return json({ wordEngine: { available: true, licensed: true }, queryAssets: { available: true }, limits: { acceptedFileTypes: [".docx"], exportFormats: ["DOCX", "PDF"], previewFormats: ["PDF"] } });
    if (pathname === "/api/official-document/v1/templates") return json({ items: [template] });
    if (pathname === "/api/official-document/v1/drafts") return json({ items: drafts });
    if (pathname === "/api/analytics/query-assets") return json({ code: 200, message: "ok", data: [] });
    if (pathname === "/api/official-document/v1/drafts/draft-new/title" && req.method() === "PUT") {
      renameCount++;
      if (renameCount === 1) return json({ code: "RENAME_FAILED", message: "模拟重命名失败，可重试" }, 503);
      const title = req.postDataJSON().title;
      drafts = drafts.map((draft) => draft.id === "draft-new" ? { ...draft, title, updatedAt: "2026-09-07T01:00:00Z" } : draft);
      return json(drafts.find((draft) => draft.id === "draft-new"));
    }
    if (pathname === "/api/official-document/v1/drafts/draft-new/content") {
      if (req.method() === "PUT") {
        const body = req.postDataJSON();
        expect(body.expectedRevision).toBe(content.revision);
        content = { revision: content.revision + 1, fixedValues: body.fixedValues, blocks: body.blocks };
        saveCount++;
      }
      return json(content);
    }
    if (pathname === "/api/official-document/v1/drafts/draft-new" && req.method() === "DELETE") {
      deleteCount++;
      if (deleteCount === 1) return json({ code: "DELETE_FAILED", message: "模拟删除失败，可重试" }, 503);
      drafts = drafts.filter((draft) => draft.id !== "draft-new");
      return route.fulfill({ status: 204 });
    }
    if (pathname === "/api/v1/chat/writing-content-analysis") return json({ code: 200, message: "ok", data: {
      summary: "根据写作要求整理工作进展。", sections: [{ id: "section-1", order: 0, headingRole: "HEADING_1", title: "一、工作进展", purpose: "原写作目的", keyPoints: ["原内容要点"] }], researchNeeds: []
    } });
    if (pathname === "/api/agentScore/chat/completions/stream") {
      writing = req.postDataJSON();
      const ctx = writing!.writingContext as { fixedFields: Array<{ slotId: string }>; referenceSections: Array<{ id: string }> };
      const answer = [...ctx.fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]\n年度工作报告`), ...ctx.referenceSections.map((section) => `[[XS_SECTION:${section.id}]]\n已按确认后的目的与要点组织正文。`)].join("\n\n");
      const identity = { sessionId: writing!.sessionId, chatId: writing!.chatId, globalSessionId: writing!.globalSessionId };
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ ...identity, type: "text", content: answer })}\n\ndata: ${JSON.stringify({ ...identity, type: "done", content: {}, finished: true })}\n\ndata: [DONE]\n\n` });
    }
    return json({ message: `Blocked by isolated fixture: ${pathname}` }, 503);
  });
  return { drafts: () => drafts, content: () => content, renames: () => renameCount, deletes: () => deleteCount, saves: () => saveCount, writing: () => writing };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
}

async function manage(page: Page, title: string, action: string) {
  await page.getByRole("button", { name: `管理草稿 ${title}`, exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

test("draft management preserves rename failures, explicit saves, reopen and confirmed deletion", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/writing");
  await page.getByRole("link", { name: "草稿管理", exact: true }).click();
  const list = page.getByRole("list", { name: "报告草稿列表" });
  await expect(list.getByRole("listitem").first()).toContainText("最新工作报告");
  await page.getByRole("textbox", { name: "搜索草稿标题" }).fill("年度报告格式");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("textbox", { name: "搜索草稿标题" }).fill("最新");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("textbox", { name: "搜索草稿标题" }).clear();
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    await noOverflow(page);
    await expect(page.getByRole("button", { name: "打开草稿 最新工作报告", exact: true })).toBeVisible();
    const grid = list;
    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width >= 1840 ? 4 : width >= 1200 ? 3 : width > 640 ? 2 : 1);
    const manageBox = (await page.getByRole("button", { name: "管理草稿 最新工作报告", exact: true }).boundingBox())!;
    expect(manageBox.x + manageBox.width).toBeLessThanOrEqual(width + 1);
    await page.getByRole("button", { name: "管理草稿 最新工作报告", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "重命名", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "搜索草稿标题" }).click();
    await expect(page.getByRole("menuitem", { name: "重命名", exact: true })).toBeHidden();
    await page.screenshot({ path: `outputs/draft-management/list-${width}.png`, animations: "disabled", fullPage: true });
  }
  await page.setViewportSize({ width: 1672, height: 1050 });
  await manage(page, "最新工作报告", "重命名");
  await page.getByRole("textbox", { name: "草稿名称" }).fill("已重命名工作报告");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await expect(page.getByText("模拟重命名失败，可重试", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "草稿名称" })).toHaveValue("已重命名工作报告");
  await expect(list).toContainText("最新工作报告");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "打开草稿 已重命名工作报告", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "正文节点 1", exact: true });
  await expect(editor).toHaveValue("原始正文内容。");
  await editor.fill("已在编辑页补充工作进展，点击保存草稿持久保存。");
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    await noOverflow(page);
    await expect(page.getByRole("button", { name: "保存草稿", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page.getByRole("button", { name: "保存草稿", exact: true })).toBeEnabled();
    await page.screenshot({ path: `outputs/draft-management/editor-${width}.png`, animations: "disabled", fullPage: true });
  }
  await editor.fill("手工编辑并显式保存的新正文，重新打开后必须保留。");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => state.content().blocks[0].text).toBe("手工编辑并显式保存的新正文，重新打开后必须保留。");
  await page.getByRole("link", { name: "返回草稿管理", exact: true }).click();
  await page.getByRole("button", { name: "打开草稿 已重命名工作报告", exact: true }).click();
  await expect(editor).toHaveValue("手工编辑并显式保存的新正文，重新打开后必须保留。");
  await page.getByRole("link", { name: "返回草稿管理", exact: true }).click();
  await manage(page, "已重命名工作报告", "删除");
  await expect(page.getByRole("dialog")).toContainText("导出的文件链接也将无法访问");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(state.deletes()).toBe(0);
  await manage(page, "已重命名工作报告", "删除");
  await page.getByRole("button", { name: "删除草稿", exact: true }).click();
  await expect(page.getByText("模拟删除失败，可重试", { exact: true })).toBeVisible();
  await expect(list).toContainText("已重命名工作报告");
  await page.getByRole("button", { name: "删除草稿", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("较早报告");
  expect(state.renames()).toBe(2);
  expect(state.deletes()).toBe(2);
  expect(state.saves()).toBeGreaterThanOrEqual(2);
});

test("writing outline exposes editable purpose and key points without crowding", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
  await input.fill("@");
  await page.getByRole("option", { name: "年度报告格式 v1 · 年度报告格式.docx", exact: true }).click();
  await input.fill("请按年度报告格式撰写工作进展报告");
  await page.getByRole("button", { name: "生成完整公文", exact: true }).click();
  const outline = page.getByRole("region", { name: "写作大纲确认", exact: true });
  await outline.getByText("调整写作思路", { exact: true }).click();
  await page.getByRole("textbox", { name: "章节写作目的：一、工作进展", exact: true }).fill("明确本阶段成果与后续改进方向");
  await page.getByRole("textbox", { name: "章节内容要点：一、工作进展", exact: true }).fill("已完成的重点工作\n尚未解决的问题\n下一阶段安排");
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    await noOverflow(page);
    await expect(page.getByRole("textbox", { name: "章节写作目的：一、工作进展", exact: true })).toBeVisible();
    await outline.screenshot({ path: `outputs/draft-management/outline-${width}.png`, animations: "disabled" });
  }
  await outline.getByRole("button", { name: "确认大纲并生成", exact: true }).click();
  await expect.poll(() => JSON.stringify(state.writing()?.writingContext ?? {})).toContain("明确本阶段成果与后续改进方向");
  const context = JSON.stringify(state.writing()?.writingContext);
  expect(context).toContain("已完成的重点工作");
  expect(context).toContain("尚未解决的问题");
  expect(context).toContain("下一阶段安排");
});


test("草稿管理复用格式模板的卡片、筛选与响应式轨道", async ({ page }) => {
  await fixture(page, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const readLayout = () => page.locator(".official-document-templates").evaluate((element) => {
    const grid = element.querySelector(".official-document-templates__grid")!;
    const card = element.querySelector(".official-document-template-card")!;
    const title = element.querySelector(".official-document-template-card__text strong")!;
    const search = element.querySelector(".official-document-templates__search")!;
    const filter = element.querySelector(".official-document-templates__filters button")!;
    const bounds = grid.getBoundingClientRect();
    return { x: bounds.x, width: bounds.width, columns: getComputedStyle(grid).gridTemplateColumns.split(" ").map((size) => Math.round(parseFloat(size))),
      radius: getComputedStyle(card).borderRadius, background: getComputedStyle(card).backgroundColor,
      font: getComputedStyle(title).fontSize, searchRadius: getComputedStyle(search).borderRadius,
      filterColor: getComputedStyle(filter).backgroundColor };
  });
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/writing/templates");
    await expect(page.locator(".official-document-template-card")).toHaveCount(1);
    await page.mouse.move(0, 0);
    const reference = await readLayout();
    await page.screenshot({ path: `outputs/draft-template-alignment-2026-09-07/templates-${width}.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("link", { name: "草稿管理", exact: true }).click();
    await expect(page.getByRole("list", { name: "报告草稿列表" }).getByRole("listitem")).toHaveCount(12);
    await page.mouse.move(0, 0);
    expect(await readLayout()).toEqual(reference);
    await noOverflow(page);
    await expect(page.getByRole("heading", { name: "草稿管理", exact: true })).toBeVisible();
    const filters = page.getByRole("group", { name: "草稿状态筛选" });
    for (const label of ["全部", "编辑中", "校验中", "可导出", "有错误"]) {
      await expect(filters.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    expect(await page.locator(".official-document-template-card").evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
    await page.screenshot({ path: `outputs/draft-template-alignment-2026-09-07/drafts-${width}.png`, fullPage: true, animations: "disabled" });
  }
  await page.getByRole("group", { name: "草稿状态筛选" }).getByRole("button", { name: /^有错误/ }).click();
  await expect(page.getByRole("list", { name: "报告草稿列表" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("textbox", { name: "搜索草稿标题" }).fill("找不到的草稿");
  await expect(page.getByText("没有符合条件的草稿", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(page.getByRole("list", { name: "报告草稿列表" }).getByRole("listitem")).toHaveCount(12);
  expect((await new AxeBuilder({ page }).include(".official-document-drafts").analyze()).violations).toEqual([]);
});
