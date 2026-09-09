import { expect, type Page, test } from "@playwright/test";

const templateName = "城市运行管理服务平台年度建设与履约工作情况报告格式模板（2026年正式版）";
const requirement = "仅使用这些测试事实：召开系统验收会；参会人员测试小组。请整理年度平台建设情况与下一年度安排。";
const plan = { summary: "围绕本次要求安排章节与写作重点。", sections: [
  { id: "s1", order: 0, headingRole: "HEADING_1", title: "一、建设情况", purpose: "说明已经完成的主要工作", keyPoints: ["主要成果", "履约情况"] }
], researchNeeds: [] };

/** 校对面板要有料才好看：正文里塞进需求里查不到的时间与数量，逐句都会被标出来。 */
const body = [
  "会议定于2026年9月10日上午10:00召开，请参会人员提前十五分钟到场签到。",
  "全年累计完成平台建设投入3800万元，较上一年度增长12%。",
  "本年度共接入市级业务系统46个，覆盖12个区县。",
  "平台日均处理各类工单2300件，按期办结率达到98%。",
  "全年组织专项培训18场次，参训人员累计1200人。",
  "运维团队保持7×24小时值守，平均响应时长控制在15分钟以内。",
  "完成安全等级保护三级测评2次，整改隐患37项。",
  "数据资源目录新增编目1560条，共享调用超过420万次。",
  "移动端注册用户突破25万人，月活跃用户8.6万人。",
  "全年发布版本迭代24个，修复各类缺陷312个。",
  "下一年度计划新增财政预算2600万元，重点推进3个子平台建设。",
  "拟于2027年3月31日前完成全部验收工作，并形成年度总结报告1份。"
].join("\n\n");

/** 未补齐的资料里三条同因、一条异因，正好照出去重脚注。 */
const sharedReason = "历史问数缺少完整可执行查询，请重新问数后收藏";
const missingResults = [
  { taskId: "n1", sectionId: "s1", kind: "ASK_DATA", question: "年度平台建设投入与同比变化", required: true, preferredOutput: "SCALAR", status: "NO_RESULT", summary: sharedReason, citations: [] },
  { taskId: "n2", sectionId: "s1", kind: "ASK_DATA", question: "各区县业务系统接入进度明细", required: true, preferredOutput: "TABLE", status: "FAILED", summary: sharedReason, citations: [] },
  { taskId: "n3", sectionId: "s1", kind: "ASK_DATA", question: "工单按期办结率月度趋势", required: false, preferredOutput: "TABLE", status: "SKIPPED", summary: sharedReason, citations: [] },
  { taskId: "n4", sectionId: "s1", kind: "ASK_DATA", question: "下一年度财政预算安排", required: true, preferredOutput: "FACT", status: "PENDING", summary: "预算编制尚未完成，暂时取不到口径一致的数字", citations: [] },
  { taskId: "n5", sectionId: "s1", kind: "ASK_KNOWLEDGE", question: "平台建设政策依据", required: true, preferredOutput: "FACT", status: "SUCCESS", summary: "已取得相关政策口径。", citations: [] }
];

async function install(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-codex-writing");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: true }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  const pending: Array<() => Promise<void>> = [];
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
      const req = route.request().postDataJSON();
      const ctx = req.writingContext as { fixedFields: Array<{ slotId: string }>; referenceSections: Array<{ id: string }> };
      const answer = [
        ...ctx.fixedFields.map((field) => `[[XS_FIXED:${field.slotId}]]\n关于系统验收会的通知`),
        ...ctx.referenceSections.slice(0, 1).map((section) => `[[XS_SECTION:${section.id}]]\n# 一、建设情况\n${body}`)
      ].join("\n\n");
      return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "text", content: answer, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: ${JSON.stringify({ type: "done", content: {}, finished: true, sessionId: req.sessionId, chatId: req.chatId })}\n\ndata: [DONE]\n\n` });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated writing fixture" } });
  });
  return { release: async () => { await expect.poll(() => pending.length).toBeGreaterThan(0); await pending.shift()!(); } };
}

test("成稿核对面板把三类提醒收进一块有边界的容器", async ({ page }) => {
  const state = await install(page);
  await page.goto("/writing");
  const input = page.getByRole("textbox", { name: "公文写作要求", exact: true });
  await input.fill("@");
  await page.getByRole("option").filter({ hasText: templateName }).click();
  await input.fill(requirement);
  await page.getByRole("button", { name: "生成完整公文", exact: true }).click();
  const response = page.waitForResponse("**/api/v1/chat/writing-content-analysis");
  await state.release();
  await response;
  await page.getByRole("button", { name: "确认大纲并生成", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存到草稿箱", exact: true })).toBeVisible();

  // 研究结果只能由真实问数产生；这里写进恢复态，把「未补齐」与「缺来源链接」一次凑齐。
  // 必须走 addInitScript：页面卸载时 pagehide 会用内存状态回写，直接改当前页会被盖掉。
  await page.addInitScript((results) => {
    const key = "xingshu:writing:1:1";
    const saved = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!saved?.turnStates) return;
    for (const turn of Object.values(saved.turnStates) as Array<Record<string, unknown>>) {
      turn.research = { plan: { sections: [], researchNeeds: [] }, results };
    }
    sessionStorage.setItem(key, JSON.stringify(saved));
  }, missingResults);
  await page.reload();

  const panel = page.getByRole("region", { name: "成稿核对", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("需核对来源");
  await expect(panel.getByRole("button", { name: /^展开全部 \d+ 处$/ })).toBeVisible();
  await expect(panel).toContainText("有 4 项资料未补齐");
  await expect(panel).toContainText(`以上 3 项：${sharedReason}`);
  await expect(panel).toContainText("部分资料未附来源链接");
  await expect(panel.getByRole("listitem")).toHaveCount(3 + 4);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `outputs/compose-result/review-panel-${width}.png`, fullPage: true, animations: "disabled" });
  }
});
