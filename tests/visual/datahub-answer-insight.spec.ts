import { expect, test, type Page } from "@playwright/test";

const insight = {
  insights: [
    { title: "客服部费用明显偏高", detail: "“客服部”30,535.18 元，占全年差旅费用的 37.48%，是唯一超过三成的部门；可能与客服人员外出频次较高有关，建议优先核查其中金额最大的几笔。" },
    { title: "费用与单据笔数不成比例", detail: "“测试部”只有 1 笔却有 5,517.17 元，单笔金额明显高于其他部门，属于低频大额，可以按金额阈值纳入抽样复核。" },
    { title: "后四个部门差距不大", detail: "“行政部”到“测试部”都在 3,500–5,600 元之间，分布比较平均，费用主要集中在前两个部门。" }
  ],
  followUps: ["客服部那 5 笔差旅费具体都是什么费用？", "按月份看全年差旅费用有没有明显的波动？", "把每个部门金额最大的那笔单据单独列出来看看"]
};

const departments = [
  ["客服部", 30535.18, 5], ["销售部", 12812.01, 4], ["行政部", 5612.4, 3], ["产品部", 4980.33, 2],
  ["采购部", 3552.25, 2], ["测试部", 5517.17, 1]
] as const;

async function mockDataHub(page: Page, scalar = false) {
  const streamQuestions: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-answer-insight");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/chat/chart-plan") return route.fulfill({ json: { code: 200, message: "fixture", data: {
      chartable: true, title: "各部门差旅费用", reason: "分类比较", chartType: "bar", allowedTypes: ["bar", "pie"],
      tableIndex: 0, dimensionKey: "dept", metricKeys: ["amount"]
    } } });
    if (path === "/api/v1/chat/answer-insight") {
      return route.fulfill({ json: { code: 200, message: "fixture", data: scalar ? { insights: [], followUps: [
        "各区县的养老机构分别有多少家？", "近三年养老机构数量有什么变化？", "公办和民办养老机构各有多少家？"
      ] } : insight } });
    }
    if (path === "/api/agentScore/chat/completions/stream") {
      const request = route.request().postDataJSON();
      streamQuestions.push(request.message);
      const identity = { sessionId: request.sessionId, globalSessionId: request.sessionId, chatId: request.chatId };
      const table = scalar
        ? { columns: [{ name: "count", title: "养老机构数量（家）", type: "number" }], rows: [{ count: 97 }], totalRows: 1, source: "cube" }
        : { columns: [{ name: "dept", title: "部门" }, { name: "amount", title: "差旅费用（元）", type: "number" },
            { name: "bills", title: "单据笔数", type: "number" }],
          rows: departments.map(([dept, amount, bills]) => ({ dept, amount, bills })), totalRows: 6, source: "cube",
          groupLabel: "各部门全年差旅费用" };
      const text = scalar ? "全市养老机构数量为 97 家。" : "全年差旅费用合计 62,999.34 元，共 17 笔单据；客服部最高，为 30,535.18 元。";
      const events = [
        { ...identity, type: "table", content: table },
        { ...identity, type: "text", content: text },
        { ...identity, type: "done", content: {}, finished: true }
      ];
      return route.fulfill({ contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated answer-insight fixture" } });
  });
  return streamQuestions;
}

async function ask(page: Page, question: string) {
  await page.goto("/ask-data");
  await page.getByRole("textbox", { name: "命令输入", exact: true }).fill(question);
  await page.getByRole("button", { name: "发送", exact: true }).click();
}

test("a set of data reads as answer, table, chart, insight and follow-up questions at every width", async ({ page }) => {
  const streamQuestions = await mockDataHub(page);
  await ask(page, "各部门全年差旅费用分别是多少");
  const insightSection = page.getByRole("region", { name: "数据洞察", exact: true });
  await expect(insightSection.getByRole("listitem")).toHaveCount(3);
  const answer = page.getByLabel("正式回答");
  const table = page.getByRole("region", { name: "表格回答", exact: true });
  const chart = page.getByRole("region", { name: "智能图表建议", exact: true });
  const followUps = page.getByRole("region", { name: "你可能还想问", exact: true });
  await expect(chart.locator(".xs-echart__canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /查询过程/ })).toHaveAttribute("aria-expanded", "false");
  const tops = await Promise.all([answer, table, chart, insightSection, followUps].map(async (node) => (await node.boundingBox())!.y));
  expect([...tops].sort((left, right) => left - right)).toEqual(tops);

  const turn = page.locator(".analysis-turn").first();
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    // 视口要能装下整轮回答，元素截图才不会被滚动区裁掉。
    await page.setViewportSize({ width, height: width === 390 ? 3200 : 2400 });
    await followUps.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await turn.screenshot({ path: `outputs/beta05-answer-insight/set-${width}.png`, animations: "disabled" });
  }

  await page.setViewportSize({ width: 1440, height: 1200 });
  await followUps.getByRole("button", { name: "按月份看全年差旅费用有没有明显的波动？" }).click();
  await expect.poll(() => streamQuestions).toEqual(["各部门全年差旅费用分别是多少", "按月份看全年差旅费用有没有明显的波动？"]);
});

test("a single value gets no table or chart, only the follow-up questions", async ({ page }) => {
  await mockDataHub(page, true);
  await ask(page, "全市养老机构数量是多少");
  const followUps = page.getByRole("region", { name: "你可能还想问", exact: true });
  await expect(followUps.getByRole("button")).toHaveCount(3);
  await expect(page.getByLabel("正式回答")).toContainText("97 家");
  await expect(page.getByRole("region", { name: "表格回答", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "智能图表建议", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "数据洞察", exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1400 });
    await page.locator(".analysis-turn").first().screenshot({ path: `outputs/beta05-answer-insight/scalar-${width}.png`, animations: "disabled" });
  }
});
