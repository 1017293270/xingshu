import { expect, test } from "@playwright/test";

test("dense amount comparisons remain readable, paged and faithful to their source records", async ({ page }) => {
  const title = "合同金额与到账金额对比";
  const amounts = [367200000, 91248000, 72189600, 19136640, 16590000, 8779400, 8480000, 5980000];
  const rows = Array.from({ length: 50 }, (_, index) => ({
    company: index < 8 ? ["示例数字科技（成都）有限公司", "示例电子科技有限公司", "示例电子科技有限公司",
      "示例数字科技（成都）有限公司", "示例数字科技（成都）有限公司", "示例数字科技（成都）有限公司",
      "示例智控科技有限公司", "示例数字科技（成都）有限公司"][index] : `第${index + 1}条示例信息科技有限公司`,
    amount: amounts[index] ?? 4475240 / (index - 7),
    received: index === 7 ? null : [8650000, 0, 0, 797360, 200583.29, 1097425, 0][index] ?? index * 3000
  }));
  let streamRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-readable-chart");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/chat/chart-plan") return route.fulfill({ json: { code: 200, message: "fixture", data: {
      chartable: true, title, reason: "两项金额可逐条比较", chartType: "bar", allowedTypes: ["bar"],
      tableIndex: 0, dimensionKey: "company", metricKeys: ["amount", "received"]
    } } });
    if (path === "/api/agentScore/chat/completions/stream") {
      streamRequests++;
      const request = route.request().postDataJSON();
      const identity = { sessionId: request.sessionId, globalSessionId: request.sessionId, chatId: request.chatId };
      const events = [
        { ...identity, type: "table", content: { columns: [
          { name: "company", title: "合同乙方" }, { name: "amount", title: "合同总金额", type: "number" },
          { name: "received", title: "总贷方发生额", type: "number" }
        ], rows, totalRows: 50, source: "cube", groupLabel: "合同明细" } },
        { ...identity, type: "text", content: "已返回50条合同明细，可比较合同金额与到账金额。" },
        { ...identity, type: "done", content: {}, finished: true }
      ];
      return route.fulfill({ contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated chart fixture" } });
  });
  await page.goto("/ask-data");
  await page.getByRole("textbox", { name: "命令输入", exact: true }).fill("对比合同金额与到账金额");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const card = page.getByRole("region", { name: "智能图表建议", exact: true });
  await expect(card).toContainText("当前显示第 1–8 条");
  await expect(card).toContainText("同名记录未合并");
  const chart = card.locator(".xs-echart__canvas");
  const getChart = () => chart.evaluate(async (element) => {
    const runtime = "/src/services/echartsRuntime.ts";
    const { getInstanceByDom } = await import(runtime);
    const instance = getInstanceByDom(element);
    if (!instance) return null;
    const option = instance.getOption();
    return { categories: option.yAxis[0].data, axisType: option.xAxis[0].type,
      series: option.series.filter(Boolean).map((series: { data: unknown[]; itemStyle: { color: string } }) => ({ data: series.data, color: series.itemStyle.color })),
      tooltip: option.tooltip[0].formatter([{ dataIndex: 0 }]) };
  });
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    await chart.scrollIntoViewIfNeeded();
    await expect.poll(getChart).not.toBeNull();
    const state = (await getChart())!;
    expect(state.categories).toHaveLength(8);
    expect(state.axisType).toBe("value");
    expect(state.series[0].data).toEqual(amounts);
    expect(state.series[1].data[7]).toBeNull();
    expect(state.tooltip).toContain(rows[0].company);
    expect(state.tooltip).toContain("367,200,000");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await card.screenshot({ path: `outputs/readable-amount-chart/chart-${width}.png`, animations: "disabled" });
  }
  const receivedColor = (await getChart())!.series[1].color;
  await card.getByText("总贷方发生额", { exact: true }).click();
  await expect.poll(async () => (await getChart())!.series.length).toBe(1);
  expect((await getChart())!.series[0].color).toBe(receivedColor);
  await card.screenshot({ path: "outputs/readable-amount-chart/received-390.png", animations: "disabled" });
  for (let group = 1; group < 7; group++) await card.getByRole("button", { name: "下一组", exact: true }).click();
  await expect(card).toContainText("当前显示第 49–50 条");
  await expect(card.getByRole("button", { name: "下一组", exact: true })).toBeDisabled();
  expect((await getChart())!.series[0].data).toEqual([144000, 147000]);
  await card.getByText("表格", { exact: true }).click();
  await expect(card).toContainText("全部 50 行");
  await expect(card.getByRole("columnheader", { name: "合同乙方", exact: true })).toBeVisible();
  expect(streamRequests).toBe(1);
});
