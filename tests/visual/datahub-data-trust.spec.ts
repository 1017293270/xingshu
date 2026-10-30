import { expect, test, type Page } from "@playwright/test";

type TrustLevel = "TRUSTED" | "PARTIAL" | "NOT_TRUSTED";

const salesRows = [
  ["张三", 1280.5, 960.2],
  ["李四", 1046.3, 880],
  ["王五", 932.8, 701.6],
  ["赵六", 815, 652.4]
] as const;

/** 与后端 DataTrustAccumulator 的快照同形：level、usedMeasures、unstructuredData 与计数。 */
const snapshots: Record<TrustLevel, Record<string, unknown>> = {
  TRUSTED: {
    level: "TRUSTED",
    usedMeasures: [
      { datasourceId: 1000002, model: "ContractList", member: "ContractList.contractAmount", title: "合同金额", trusted: true, trustHash: "h-1", source: "SEMANTIC_LAYER" },
      { datasourceId: 1000002, model: "ContractList", member: "ContractList.paidAmount", title: "回款金额", trusted: true, trustHash: "h-2", source: "SEMANTIC_LAYER" }
    ],
    unstructuredData: false,
    trustedCount: 2,
    untrustedCount: 0
  },
  PARTIAL: {
    level: "PARTIAL",
    usedMeasures: [
      { model: "ContractList", member: "ContractList.contractAmount", title: "合同金额", trusted: true, trustHash: "h-1" },
      // 同一指标定义变化后后端会多计一条，前端按名字合并。
      { model: "ContractList", member: "ContractList.contractAmount", title: "合同金额", trusted: true, trustHash: "h-1b" },
      { model: "ContractList", member: "ContractList.paidAmount", title: "回款金额", trusted: false, trustHash: "h-2" },
      { model: "ContractList", member: "ContractList.contractCount", title: "合同数", trusted: true, trustHash: "h-3" },
      { model: "ContractList", member: "ContractList.avgCollectionDays", title: "近十二个月滚动平均回款周期（天）", trusted: false },
      { model: "ContractList", member: "ContractList.receivable", title: "应收余额", trusted: false },
      { model: "ContractList", member: "ContractList.overdueAmount", title: "逾期金额", trusted: false },
      { model: "ContractList", member: "ContractList.badDebt", title: "坏账金额", trusted: false },
      { model: "ContractList", member: "ContractList.discount", title: "折让金额", trusted: false }
    ],
    unstructuredData: true,
    trustedCount: 3,
    untrustedCount: 6
  },
  NOT_TRUSTED: {
    level: "NOT_TRUSTED",
    usedMeasures: [
      { model: "ContractList", member: "ContractList.contractAmount", title: "合同金额", trusted: false },
      { model: "ContractList", member: "ContractList.paidAmount", title: "回款金额", trusted: false }
    ],
    unstructuredData: false,
    trustedCount: 0,
    untrustedCount: 2
  }
};

async function mockDataHub(page: Page, level: TrustLevel) {
  await page.addInitScript(() => {
    localStorage.setItem("xingshu_datahub_token", "isolated-data-trust");
    localStorage.setItem("xingshu_datahub_user", JSON.stringify({ userId: 1, username: "qa", isAdmin: false }));
    localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/chat/chart-plan") {
      return route.fulfill({ json: { code: 200, message: "fixture", data: { chartable: false, reason: "可信指标截图不需要图表" } } });
    }
    if (path === "/api/v1/chat/answer-insight") {
      return route.fulfill({ json: { code: 200, message: "fixture", data: { insights: [], followUps: [] } } });
    }
    if (path === "/api/agentScore/chat/completions/stream") {
      const request = route.request().postDataJSON();
      const root = { agentName: "问数智能体", sessionId: request.sessionId, globalSessionId: request.sessionId, chatId: request.chatId };
      const child = { ...root, agentName: "数据源选择", sessionId: `${request.sessionId}-child`, parentSessionId: request.sessionId, subagentId: "datasource" };
      const table = {
        datasourceId: 1000002,
        query: {
          measures: ["ContractList.contractAmount", "ContractList.paidAmount"],
          dimensions: ["ContractList.salesPerson"],
          order: [{ id: "ContractList.contractAmount", desc: true }],
          limit: 10
        },
        data: salesRows.map(([person, amount, paid]) => ({
          "ContractList.salesPerson": person,
          "ContractList.contractAmount": String(amount),
          "ContractList.paidAmount": String(paid)
        })),
        annotation: {
          measures: {
            "ContractList.contractAmount": { title: "合同金额（万元）", shortTitle: "合同金额（万元）", type: "number" },
            "ContractList.paidAmount": { title: "回款金额（万元）", shortTitle: "回款金额（万元）", type: "number" }
          },
          dimensions: { "ContractList.salesPerson": { title: "销售人员", shortTitle: "销售人员" } }
        },
        usedMeasures: snapshots[level].usedMeasures
      };
      const events = [
        { ...root, type: "agent_start", content: {}, finished: false },
        { ...child, type: "data_source_selected", content: { datasourceId: 1000002, datasourceName: "合同数据系统" }, finished: false },
        // 子智能体的完成事件不带可信指标，finished 为 false。
        { ...child, type: "done", content: {}, finished: false },
        { ...root, type: "table", content: table, finished: false },
        { ...root, type: "text", content: "合同金额最高的是张三，为 1,280.5 万元，回款 960.2 万元；四人合计合同金额 4,074.6 万元。", finished: false },
        { ...root, parentSessionId: null, type: "done", content: { dataTrust: { ...snapshots[level], semanticCommits: ["c-1"], checkedAt: "2026-10-29T18:00:00+08:00" } }, finished: true }
      ];
      return route.fulfill({
        contentType: "text/event-stream",
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n"
      });
    }
    return route.fulfill({ status: 503, json: { message: "Blocked by isolated data-trust fixture" } });
  });
}

async function ask(page: Page) {
  await page.goto("/ask-data");
  await page.getByRole("textbox", { name: "命令输入", exact: true }).fill("各销售人员的合同金额和回款金额");
  await page.getByRole("button", { name: "发送", exact: true }).click();
}

/** 截整轮回答；浮层开着时把浮层也框进来。 */
async function shoot(page: Page, name: string) {
  const boxes = [await page.locator(".analysis-turn").first().boundingBox()];
  const popover = page.locator(".xs-data-trust-popover:not(.ant-popover-hidden)");
  if (await popover.count()) {
    boxes.push(await popover.locator(".ant-popover-inner").boundingBox());
  }
  const known = boxes.filter((box): box is NonNullable<typeof box> => Boolean(box));
  const x = Math.max(0, Math.min(...known.map((box) => box.x)));
  const y = Math.max(0, Math.min(...known.map((box) => box.y)));
  const right = Math.max(...known.map((box) => box.x + box.width));
  const bottom = Math.max(...known.map((box) => box.y + box.height));
  await page.screenshot({
    path: `outputs/task-lines/S1/${name}.png`,
    clip: { x, y, width: right - x, height: bottom - y },
    animations: "disabled"
  });
}

const copy: Record<TrustLevel, string> = {
  TRUSTED: "可信指标",
  PARTIAL: "部分可信",
  NOT_TRUSTED: "数据由AI提取，注意辨别"
};

for (const level of ["TRUSTED", "PARTIAL", "NOT_TRUSTED"] as const) {
  test(`the ${level} trust state leads the answer footnote at every width`, async ({ page }) => {
    await mockDataHub(page, level);
    await ask(page);

    const answer = page.getByLabel("正式回答");
    const trust = page.locator(".analysis-answer-trust");
    const basis = page.getByRole("region", { name: "查询依据", exact: true });
    const copyButton = page.getByRole("button", { name: "复制回答", exact: true });
    await expect(trust).toHaveText(copy[level]);
    await expect(basis).toBeVisible();
    await expect(page.getByRole("region", { name: "表格回答", exact: true })).toBeVisible();

    // 正文 → 可信状态 → 查询依据 → 复制，可信状态与查询依据共用一条分隔线。
    const tops = await Promise.all([answer, trust, basis, copyButton].map(async (node) => (await node.boundingBox())!.y));
    expect([...tops].sort((left, right) => left - right)).toEqual(tops);
    await expect(page.locator(".analysis-answer-trust-footnote")).toHaveCount(1);
    await expect(basis).toHaveCSS("border-top-width", "0px");

    const help = page.getByRole("button", { name: "查看可信说明", exact: true });
    if (level === "NOT_TRUSTED") {
      await expect(help).toHaveCount(0);
    } else {
      const helpBox = (await help.boundingBox())!;
      expect(helpBox.width).toBeGreaterThanOrEqual(24);
      expect(helpBox.height).toBeGreaterThanOrEqual(24);
    }

    for (const width of [1440, 1672, 1920, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 3200 : 2400 });
      await copyButton.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      // 部分可信每个宽度都开着浮层；可信只在移动端开着看一眼。
      const openPopover = level === "PARTIAL" || (level === "TRUSTED" && width === 390);
      if (openPopover) {
        await help.click();
        await expect(help).toHaveAttribute("aria-expanded", "true");
        const popover = page.locator(".xs-data-trust-popover:not(.ant-popover-hidden)");
        await expect(popover).toBeVisible();
        await expect(popover).toContainText(level === "PARTIAL" ? "部分指标已人工确认" : "可信指标是指统计口径、数据来源已经人工确认的指标");
        if (level === "PARTIAL") {
          await expect(popover.getByRole("listitem")).toHaveCount(6);
          await expect(popover).toContainText("另有 2 项");
          await expect(popover).toContainText("另有部分结果没有指标信息，未计入。");
        }
        // 看得见的卡片不出屏，窄屏上左右至少各留 16px。
        const card = (await popover.locator(".ant-popover-inner").boundingBox())!;
        expect(card.x).toBeGreaterThanOrEqual(16);
        expect(card.x + card.width).toBeLessThanOrEqual(width - 16);
        expect(Math.round(card.width)).toBe(300);
        await shoot(page, `${level.toLowerCase()}-${width}${openPopover ? "-open" : ""}`);
        await page.keyboard.press("Escape");
        await expect(help).toHaveAttribute("aria-expanded", "false");
      } else {
        await shoot(page, `${level.toLowerCase()}-${width}`);
      }
    }
  });
}
