import { expect, type Page, test } from "@playwright/test";
import type { OfficialDocumentDraftContent } from "../../src/types/officialDocument";

async function fixture(page: Page) {
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
  let content: OfficialDocumentDraftContent = { revision: 1, fixedValues: [], blocks: [{ id: "body-1", order: 0, role: "BODY", variantId: "body-main", text: "原始正文内容。" }] };
  const history = [{ revision: content.revision, savedAt: "2026-09-07T00:00:00Z", content: structuredClone(content) }];
  const previewed: OfficialDocumentDraftContent[] = [];
  const downloads: string[] = [];
  const writes: Record<string, unknown>[] = [];
  let failSave = false;
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
        if (failSave) return json({ code: "SAVE_FAILED", message: "模拟网络不可用" }, 503);
        writes.push(body);
        expect(body.expectedRevision).toBe(content.revision);
        const target = body.restoreRevision == null ? body : history.find((version) => version.revision === body.restoreRevision)!.content;
        content = { ...target, revision: content.revision + 1, fixedValues: target.fixedValues, blocks: target.blocks };
        history.unshift({ revision: content.revision, savedAt: "2026-09-07T01:00:00Z", content: structuredClone(content) });
        saveCount++;
      }
      return json(content);
    }
    if (pathname === "/api/official-document/v1/drafts/draft-new/content/versions") return json(history);
    if (pathname === "/api/official-document/v1/drafts/draft-new/exports") return json([
      { id: "export-old", draftId: "draft-new", status: "GENERATED", format: "PDF", contentRevision: 1, createdAt: "2026-09-07T00:00:00Z" },
      { id: "export-failed", draftId: "draft-new", status: "BLOCKED", format: "DOCX", contentRevision: 2, createdAt: "2026-09-07T01:00:00Z", message: "模拟导出失败" }
    ]);
    if (pathname === "/api/official-document/v1/exports/export-old/download") {
      downloads.push("export-old");
      return route.fulfill({ contentType: "application/pdf", body: pdfFixture("Historical draft version 1") });
    }
    if (pathname === "/api/official-document/v1/drafts/draft-new/preview") {
      previewed.push(structuredClone(content));
      return route.fulfill({ contentType: "application/pdf", body: pdfFixture(`Saved draft revision ${content.revision}`) });
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
  return { drafts: () => drafts, content: () => content, renames: () => renameCount, deletes: () => deleteCount, saves: () => saveCount, writing: () => writing, history, previewed, downloads, writes, failSaves: (value: boolean) => { failSave = value; } };
}

function pdfFixture(text: string) {
  const stream = `BT /F1 18 Tf 40 720 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function openDraft(page: Page) {
  await page.goto("/writing/drafts");
  await page.getByRole("button", { name: "打开草稿 最新工作报告", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "正文节点 1", exact: true })).toHaveValue("原始正文内容。");
}
test("keeps immediate edits across navigation, failed save and reload", async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page);
  await openDraft(page);
  const editor = page.getByRole("textbox", { name: "正文节点 1", exact: true });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await editor.fill("刚编辑就离开，也应保留这句正文。");
  expect(state.saves()).toBe(0);
  await page.getByRole("link", { name: "返回草稿管理", exact: true }).click();
  await page.getByRole("button", { name: "打开草稿 最新工作报告", exact: true }).click();
  await expect(editor).toHaveValue("刚编辑就离开，也应保留这句正文。");
  await page.clock.resume();
  state.failSaves(true);
  await editor.fill("网络故障时，这次修改也应能恢复。");
  await page.reload();
  await expect(editor).toHaveValue("网络故障时，这次修改也应能恢复。");
  await page.clock.fastForward(1000);
  await expect(page.getByText("模拟网络不可用", { exact: true }).first()).toBeVisible();
  state.failSaves(false);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => state.content().blocks[0].text).toBe("网络故障时，这次修改也应能恢复。");
});

test("previews saved current text, keeps review and restores a historical version with its export", async ({ page }) => {
  const state = await fixture(page);
  await openDraft(page);
  const editor = page.getByRole("textbox", { name: "正文节点 1", exact: true });
  await editor.fill("请提前十五分钟签到，当前版本可直接导出。");
  await page.getByRole("button", { name: "预览当前稿", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "当前稿正文预览", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/当前已保存正文/)).toBeVisible();
  expect(state.previewed[0].blocks[0].text).toBe("请提前十五分钟签到，当前版本可直接导出。");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "事实校对", exact: true }).click();
  const review = page.getByRole("dialog", { name: "事实校对", exact: true });
  await review.getByRole("button", { name: "重新校对", exact: true }).click();
  await expect(review).toContainText("十五分钟");
  const confirmReview = review.getByRole("button", { name: /我已核对当前正文来源/ });
  await expect(confirmReview).not.toHaveClass(/ant-btn-loading/);
  await confirmReview.click();
  await expect(review).toContainText("当前正文的来源已由你标记为核对完成");
  await review.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await expect(editor).toHaveValue("请提前十五分钟签到，当前版本可直接导出。");
  await page.getByRole("button", { name: "事实校对", exact: true }).click();
  await expect(review).toContainText("当前正文的来源已由你标记为核对完成");
  await review.getByRole("button", { name: "关闭", exact: true }).click();
  await editor.fill("改为提前二十分钟签到。");
  await page.getByRole("button", { name: "事实校对", exact: true }).click();
  await expect(review).toContainText("正文已修改，需重新核对");
  await review.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByRole("button", { name: "导出 DOCX", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "正文与导出历史", exact: true }).click();
  const history = page.getByRole("dialog", { name: "正文与导出历史", exact: true });
  await expect(history.getByRole("combobox", { name: "选择正文历史版本", exact: true })).toBeVisible();
  await history.locator(".ant-select-selector").click();
  await page.locator(".ant-select-item-option-content").filter({ hasText: /^正文 v1 ·/ }).click();
  await expect(history.getByRole("region", { name: "历史正文", exact: true })).toContainText("原始正文内容。");
  await expect(page.locator(".ant-select-dropdown")).toBeHidden();
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll("body *")].map((node) => ({ node: node.tagName, class: String(node.className), right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).filter((box) => box.right > innerWidth + 1 && box.width > 0).slice(0, 16) }));
    if (layout.scrollWidth > width + 1) console.log("overflow", layout);
    expect(layout.scrollWidth).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: `outputs/writing-closure-fixes-2026-09-07/history-${width}.png`, fullPage: true, animations: "disabled" });
  }
  await history.getByRole("button", { name: "恢复此版为新版本", exact: true }).click();
  await expect(history).toContainText("历史正文 v1 已恢复为新版本");
  expect(state.writes.some((write) => write.restoreRevision === 1)).toBe(true);
  expect(state.history.some((version) => version.content.blocks[0].text === "改为提前二十分钟签到。")).toBe(true);
  await history.getByRole("tab", { name: "导出记录", exact: true }).click();
  await expect(history.getByRole("button", { name: "下载 DOCX", exact: true })).toHaveCount(0);
  const downloaded = page.waitForEvent("download");
  await history.getByRole("button", { name: "下载 PDF", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toContain("v1.pdf");
  expect(state.downloads).toEqual(["export-old"]);
  await history.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(editor).toHaveValue("原始正文内容。");
});
