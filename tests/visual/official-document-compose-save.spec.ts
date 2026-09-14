import { expect, test } from "@playwright/test";
import type { OfficialDocumentContentProfile, OfficialDocumentDraftContent, OfficialDocumentWritingLogicPlan } from "../../src/types/officialDocument";

const materialName = "蓝桥验收事实.txt";
const materialText = "蓝桥站点已完成交付并通过验收，验收记录由项目组归档。";
const generatedText = "根据蓝桥验收事实，蓝桥站点已完成交付并通过验收。";
const templateName = "验收情况报告格式";
const plan: OfficialDocumentWritingLogicPlan = {
  summary: "按验收事实组织报告，保留原始资料来源。",
  sections: [{ id: "s1", order: 0, headingRole: "HEADING_1", title: "一、建设验收情况", purpose: "说明已验收成果", keyPoints: ["交付和验收"], sourceBlockIds: [] }],
  researchNeeds: [{ id: "r1", sectionId: "s1", kind: "ASK_KNOWLEDGE", question: "查询蓝桥项目验收依据", reason: "核对验收事实", required: true, preferredOutput: "FACT" }],
  unassignedSourceBlockIds: [], warnings: []
};

for (const retryAfterReload of [false, true]) {
test(`${retryAfterReload ? "保存失败刷新重试：" : ""}成稿保存并刷新后保留原材料、确认方案和研究结果，再次智写携带完整上下文`, async ({ page }) => {
  const stamp = "2026-09-09T00:00:00Z";
  let profile: OfficialDocumentContentProfile | undefined;
  let draft: Record<string, unknown> | undefined;
  let content: OfficialDocumentDraftContent = { revision: 0, fixedValues: [], blocks: [] };
  const writes: string[] = [];
  const writingRequests: Record<string, unknown>[] = [];
  const rejected: string[] = [];
  let contentSaveAttempts = 0;
  const template = { id: "format-save", name: templateName, createdAt: stamp, versions: [{
    id: "format-save-v1", versionNumber: 1, status: "PUBLISHED", originalFileName: "验收报告.docx", originalSize: 2048, createdAt: stamp,
    analysis: { structureProfile: { sections: [{}], paragraphs: [
      { index: 0, text: "验收报告", format: { styleName: "Title" } },
      { index: 1, text: "一、建设情况", format: { styleName: "Heading 1", outlineLevel: 0 } },
      { index: 2, text: "报告正文。", format: { styleName: "Normal" } }
    ], tables: [], headersAndFooters: [] }, engineCapabilityReport: { available: true, licensed: true } }
  }] };
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-compose-save");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "compose-save", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
    localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    const fail = (message: string) => { rejected.push(message); return json({ code: "FIXTURE_CONTRACT_REJECTED", message }, 422); };
    if (path.endsWith("/v1/capabilities")) return json({ wordEngine: { available: true, licensed: true }, limits: { exportFormats: ["DOCX", "PDF"] } });
    if (path === "/api/official-document/v1/templates") return json({ items: [template] });
    if (path === "/api/analytics/query-assets") return json({ code: 200, message: "ok", data: [] });
    if (path.endsWith("/versions/format-save-v1/content-profiles")) {
      if (request.method() === "GET") return json(profile ? [profile] : []);
      const input = request.postDataJSON();
      if (!input.sourceBlocks?.length) return fail("必须保留原始资料块");
      profile = { id: "profile-save", templateId: "format-save", templateVersionId: "format-save-v1", name: input.name,
        originalFileName: "writing-requirements.txt", originalSize: 100, status: "EXTRACTED", createdBy: "1", createdAt: stamp, updatedAt: stamp,
        profile: { source: { sourceSha256: "fixture-source", blocks: input.sourceBlocks, warnings: [] } } };
      writes.push("profile:create"); return json(profile);
    }
    if (path === "/api/official-document/v1/content-profiles/profile-save") return profile ? json(profile) : fail("方案不存在");
    if (path === "/api/official-document/v1/content-profiles/profile-save/analysis" || path.endsWith("/profile-save/analysis:confirm")) {
      if (!profile) return fail("不能分析不存在的方案");
      const submitted = request.postDataJSON() as OfficialDocumentWritingLogicPlan;
      const assigned = submitted.sections.flatMap((section) => section.sourceBlockIds);
      const accounted = [...assigned, ...submitted.unassignedSourceBlockIds];
      const sources = profile.profile.source!.blocks.map((block) => block.id);
      if (new Set(accounted).size !== accounted.length || sources.some((id) => !accounted.includes(id)) || accounted.some((id) => !sources.includes(id))) return fail("原文块必须完整且不重复归属方案");
      if (!submitted.researchNeeds.length) return fail("本轮研究任务必须保留");
      profile.profile.analysis = submitted;
      const confirm = path.endsWith(":confirm");
      profile.status = confirm ? "CONFIRMED" : "READY_FOR_REVIEW";
      if (confirm) { profile.profile.confirmedPlan = submitted; profile.profile.confirmedAt = stamp; }
      writes.push(confirm ? "profile:confirm" : "profile:analysis"); return json(profile);
    }
    if (path === "/api/official-document/v1/drafts") {
      if (request.method() === "GET") return json({ items: draft ? [{ ...draft, content }] : [] });
      const input = request.postDataJSON();
      if (!profile || profile.status !== "CONFIRMED" || input.contentProfileId !== profile.id) return fail("创建草稿必须绑定已确认方案");
      draft = { ...input, id: "draft-save", status: "READY", createdBy: "1", createdAt: stamp, updatedAt: stamp, fileVersions: [], bindings: [] };
      content = { revision: 0, fixedValues: [], blocks: [], contentProfileId: profile.id,
        researchResults: profile.profile.confirmedPlan!.researchNeeds.map((need) => ({ ...need, taskId: need.id, status: "PENDING", summary: "", citations: [] })) };
      writes.push("draft:create"); return json({ ...draft, content });
    }
    if (path === "/api/official-document/v1/drafts/draft-save/content") {
      if (request.method() === "GET") return json(content);
      const input = request.postDataJSON();
      if (input.expectedRevision !== content.revision) return fail("草稿revision冲突");
      if (input.researchResults?.length && (!profile || draft?.contentProfileId !== profile.id)) return fail("无方案不能保存研究结果");
      if (input.researchResults?.some((result: { taskId: string }) => !profile!.profile.confirmedPlan!.researchNeeds.some((need) => need.id === result.taskId))) return fail("研究任务不属于已确认方案");
      contentSaveAttempts += 1;
      if (retryAfterReload && contentSaveAttempts === 1) return json({ message: "正文保存暂时失败" }, 503);
      content = { ...content, ...input, revision: content.revision + 1 };
      writes.push("draft:content"); return json(content);
    }
    if (path === "/api/v1/chat/writing-content-analysis") return json({ code: 200, message: "ok", data: plan });
    if (path === "/api/agentScore/chat/completions/stream") {
      const input = request.postDataJSON();
      let answer = materialText;
      if (input.chatMode !== "rag") {
        writingRequests.push(input);
        const context = input.writingContext;
        answer = context.action === "REFERENCE_DRAFT"
          ? [...(context.fixedFields ?? []).map((field: { slotId: string }) => `[[XS_FIXED:${field.slotId}]]\n蓝桥验收报告`),
            ...(context.referenceSections ?? []).map((section: { id: string }) => `[[XS_SECTION:${section.id}]]\n${generatedText}`)].join("\n\n")
          : "已结合原始材料和验收依据润色当前正文。";
      }
      const done = input.chatMode === "rag" ? { summary: materialText, citations: [{ kbId: "kb1", docId: "doc1", docName: "蓝桥验收记录", fragments: [materialText] }] } : {};
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text", content: answer, sessionId: input.sessionId, chatId: input.chatId })}\n\ndata: ${JSON.stringify({ type: "done", content: done, finished: true, sessionId: input.sessionId, chatId: input.chatId })}\n\ndata: [DONE]\n\n` });
    }
    return json({ message: "Blocked by isolated compose-save fixture" }, 503);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
  await input.fill("@");
  await page.getByRole("option").filter({ hasText: templateName }).click();
  await page.getByTestId("official-document-material-file").setInputFiles({ name: materialName, mimeType: "text/plain", buffer: Buffer.from(materialText) });
  await input.fill("根据蓝桥验收材料撰写建设情况报告");
  await page.getByRole("button", { name: "生成完整公文", exact: true }).click();
  await page.getByRole("button", { name: "确认大纲，补资料并生成", exact: true }).click();
  await page.getByRole("button", { name: "保存到草稿箱", exact: true }).click();
  if (retryAfterReload) {
    await expect(page.getByText(/草稿已创建，但正文保存失败/)).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "重试保存到草稿箱", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/writing\/drafts\/draft-save$/);
  expect(rejected).toEqual([]);
  expect(writes).toEqual(["profile:create", "profile:analysis", "profile:confirm", "draft:create", "draft:content"]);
  expect(contentSaveAttempts).toBe(retryAfterReload ? 2 : 1);
  expect(profile!.profile.source!.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ headingHint: materialName, text: materialText })]));
  expect(content.researchResults).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: "r1", status: "SUCCESS" })]));
  await page.reload();
  await expect(page.getByRole("textbox", { name: "正文节点 2", exact: true })).toHaveValue(generatedText);
  await page.getByRole("button", { name: "内容方案", exact: true }).click();
  const profileDialog = page.getByRole("dialog", { name: "查看内容方案" });
  await expect(profileDialog.getByText(materialText, { exact: true })).toBeVisible();
  await expect(profileDialog.getByText(materialName, { exact: true })).toBeVisible();
  await expect(profileDialog.locator('input[value="一、建设验收情况"]')).toBeVisible();
  await profileDialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^资料补全\s*1$/ }).click();
  const research = page.getByRole("dialog", { name: "资料补全", exact: true });
  await expect(research.locator('[data-status="success"]')).toContainText(materialText);
  await research.getByRole("button", { name: "关闭", exact: true }).click();
  for (const width of retryAfterReload ? [] : [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `outputs/compose-save-codex/draft-reloaded-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const assistant = page.getByRole("complementary", { name: "报告智写对话" });
  await assistant.getByPlaceholder("续写、润色，或插入数据表").fill("请根据已确认方案和原始材料润色当前正文");
  await assistant.getByPlaceholder("续写、润色，或插入数据表").press("Enter");
  await expect.poll(() => writingRequests.length).toBe(2);
  const context = writingRequests[1].writingContext as Record<string, unknown>;
  expect(context.contentProfileId).toBe("profile-save");
  expect(context.writingLogic).toMatchObject({ sections: [expect.objectContaining({ title: "一、建设验收情况" })] });
  expect(context.sourceBlocks).toEqual(expect.arrayContaining([expect.objectContaining({ headingHint: materialName, text: materialText })]));
  expect(context.researchResults).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: "r1", status: "SUCCESS" })]));
  expect(context.currentDraft).toEqual(expect.arrayContaining([expect.objectContaining({ text: generatedText })]));
  expect(rejected).toEqual([]);
});
}
