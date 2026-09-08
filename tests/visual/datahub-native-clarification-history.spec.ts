import { expect, test } from "@playwright/test";

test("replays suspended label/value choices and resumes the same chat with the submitted value", async ({ page }) => {
  const identity = { sessionId: "native-history", globalSessionId: "native-history", chatId: "native-history-chat" };
  const question = "前述风险事项的整改安排是什么？";
  const interactionId = "source-choice";
  const options = [
    { label: "审计整改问题清单", value: "audit" },
    { label: "合同未结算或逾期款项台账", value: "receivables" },
    { label: "法务案件跟进表", value: "legal" },
    { label: "经营分析记录", value: "operations" }
  ];
  let submissions = 0;
  const events: Array<Record<string, unknown>> = [
    { ...identity, type: "agent_start", agentName: "问数智能体", content: {} },
    { ...identity, type: "activity", content: { kind: "model", label: "理解数据问题", status: "done", durationMs: 12000 } },
    { ...identity, type: "text", content: "请先明确需要查询的事项来源，再继续查询整改安排。" },
    { ...identity, type: "clarification", content: { interactionId, question: "这些事项可能来自不同台账，请确认需要查询哪一类事项，以便继续核对责任部门与整改安排。", options, allowFreeText: true } },
    { ...identity, type: "done", content: { suspended: true }, finished: true }
  ];
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-clarification-qa");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: { code: 200, message: "isolated fixture", data } });
    if (path === "/api/v1/chat/sessions/list") return json([{ ...identity, title: question, chatMode: "ask", updatedAt: "2026-09-07T13:51:00Z" }]);
    if (path === "/api/v1/chat/messages/list") return json([{ ...identity, id: 1, seqNum: 1, role: "user", content: question }]);
    if (path === "/api/v1/chat/events/list") return json(events.map((event, index) => ({ ...identity, id: index + 2,
      seqNum: index + 2, type: event.type, data: JSON.stringify(event) })));
    if (path === "/api/agentScore/chat/interactions/respond/stream") {
      const request = route.request().postDataJSON();
      expect(request).toMatchObject({ sessionId: identity.sessionId, chatId: identity.chatId, interactionId, answer: "receivables", chatMode: "ask" });
      submissions++;
      const resumed = [
        { ...identity, type: "clarification_response", content: { interactionId, answer: request.answer } },
        { ...identity, type: "thinking", isThinking: true, content: "已明确本次查询范围为未结算或逾期款项台账。" },
        { ...identity, type: "text", content: "已根据你选择的款项台账继续处理。" },
        { ...identity, type: "done", content: { summary: "已根据你选择的款项台账继续处理。" }, finished: true }
      ];
      events.push(...resumed);
      return route.fulfill({ contentType: "text/event-stream", body: resumed.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated clarification fixture" } });
  });
  await page.goto("/history");
  await page.getByRole("button", { name: new RegExp(`^${question}`) }).click();
  const panel = page.getByRole("region", { name: "需要你确认", exact: true });
  await expect(panel.getByRole("group", { name: "候选答案" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("status")).toHaveText("等待你补充信息");
  await expect(page.getByRole("region", { name: "思考过程", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "查询过程", exact: true })).toHaveCount(0);
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await expect.poll(async () => {
      const bounds = (await panel.boundingBox())!;
      const input = (await page.locator(".analysis-composer .xs-command-box").boundingBox())!;
      return Math.max(Math.abs(bounds.width - input.width), Math.abs(bounds.x - input.x));
    }).toBeLessThan(0.5);
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(760);
    for (const option of options) {
      const button = panel.getByRole("button", { name: option.label, exact: true });
      await expect(button).toBeInViewport();
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
    await page.screenshot({ path: `outputs/thinking-empty-history/waiting-${width}.png`, fullPage: true, animations: "disabled" });
    await panel.screenshot({ path: `outputs/codex-clarification/panel-${width}.png`, animations: "disabled" });
  }
  await panel.getByRole("button", { name: "稍后再确认", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "去选择", exact: true }).click();
  await panel.getByRole("button", { name: options[1].label, exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => submissions).toBe(1);
  const selected = page.getByRole("region", { name: "已确认的选择", exact: true });
  await expect(selected).toContainText(options[1].label);
  await expect(selected).not.toContainText("receivables");
  await expect(page.getByRole("region", { name: "用户提问", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: /思考过程/ }).click();
  await expect(page.getByLabel("模型思考", { exact: true })).toContainText("已明确本次查询范围");
  await expect(page.getByLabel("正式回答", { exact: true })).toContainText("已根据你选择的款项台账继续处理。");
  await page.goto("/history");
  await page.getByRole("button", { name: new RegExp(`^${question}`) }).click();
  await expect(selected).toContainText(options[1].label);
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("region", { name: "用户提问", exact: true })).toHaveCount(1);
});
