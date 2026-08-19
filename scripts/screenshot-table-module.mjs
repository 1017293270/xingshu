import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-table-module.mjs
// 截智能制表模块：制表台列表页与问表智能体会话页，覆盖 1440/1672/1920/390 四档，
// 外加一张宽表（12 列 46 行）用于验证横向滚动、行号槽与行数截断提示。
// 所有 /api/** 请求都被本脚本拦截，不会打到真实后端。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

const sessions = [
  { id: 1, sessionId: "ask-table-a1", title: "华东区Q1销售排行", chatMode: "ask_table", updatedAt: "2026-08-17T10:24:00" },
  { id: 2, sessionId: "ask-table-a2", title: "各部门人员通讯录", chatMode: "ask_table", updatedAt: "2026-08-16T15:02:00" },
  { id: 3, sessionId: "ask-table-a3", title: "月度费用统计报表", chatMode: "ask_table", updatedAt: "2026-08-15T09:41:00" },
  { id: 4, sessionId: "ask-table-a4", title: "仓库库存周转清单", chatMode: "ask_table", updatedAt: "2026-08-14T18:12:00" },
  { id: 5, sessionId: "ask-table-a5", title: "重点客户回款汇总", chatMode: "ask_table", updatedAt: "2026-08-13T11:30:00" }
];

const narrowTable = {
  columns: [
    { key: "rank", title: "排名" },
    { key: "city", title: "城市" },
    { key: "owner", title: "负责人" },
    { key: "amount", title: "销售额(万元)" },
    { key: "yoy", title: "同比" },
    { key: "share", title: "区域占比" }
  ],
  rows: [
    { rank: 1, city: "上海", owner: "李颂", amount: 4820.5, yoy: "+18.4%", share: "31.2%" },
    { rank: 2, city: "杭州", owner: "周允", amount: 3164.2, yoy: "+12.1%", share: "20.5%" },
    { rank: 3, city: "南京", owner: "陈砚", amount: 2588.0, yoy: "-3.6%", share: "16.8%" },
    { rank: 4, city: "苏州", owner: "顾行", amount: 2210.8, yoy: "+7.9%", share: "14.3%" },
    { rank: 5, city: "宁波", owner: "谢临", amount: 1502.3, yoy: "+22.7%", share: "9.7%" },
    { rank: 6, city: "合肥", owner: "邵川", amount: 1150.6, yoy: "+4.2%", share: "7.5%" }
  ],
  totalRows: 6,
  groupLabel: "华东区 Q1 销售排行",
  source: "sales_dw.fact_order"
};

const wideColumns = [
  "订单号", "客户名称", "所属大区", "负责人", "下单日期", "品类",
  "数量", "单价(元)", "金额(元)", "折扣率", "回款状态", "账期(天)"
].map((title, index) => ({ key: `c${index}`, title }));

const wideTable = {
  columns: wideColumns,
  rows: Array.from({ length: 46 }, (_, index) => ({
    c0: `SO-2026-${10428 + index}`,
    c1: `华东制造${index % 7}号客户`,
    c2: "华东区",
    c3: ["李颂", "周允", "陈砚"][index % 3],
    c4: `2026-0${(index % 3) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
    c5: ["工控机", "传感器", "伺服驱动"][index % 3],
    c6: (index % 9) + 1,
    c7: (1280.5 + index * 37.25).toFixed(2),
    c8: (9640.75 + index * 812.4).toFixed(2),
    c9: `${5 + (index % 12)}.0%`,
    c10: index % 4 === 0 ? "未回款" : "已回款",
    c11: 30 + (index % 5) * 15
  })),
  totalRows: 46,
  groupLabel: "华东区订单明细",
  source: "erp_dw.fact_order"
};

const traceFor = (datasourceName, sql, rows) => ({
  decompose: { executionMode: "SIMPLE", subQuestions: [] },
  reactSteps: [
    { round: 1, stepNum: 1, action: "route_intent", stepType: "think", status: "success", summary: "识别为区域维度的排行统计", durationMs: 240 },
    { round: 1, stepNum: 2, action: "locate_datasource", stepType: "act", status: "success", summary: datasourceName, durationMs: 480 },
    { round: 1, stepNum: 3, action: "load_cube_meta", stepType: "act", status: "success", summary: "加载销售域语义模型 12 个字段", durationMs: 310 },
    { round: 1, stepNum: 4, action: "generate_query", stepType: "act", status: "success", summary: "按城市聚合并计算同比", durationMs: 860 },
    { round: 1, stepNum: 5, action: "execute_query", stepType: "observe", status: "success", summary: `返回 ${rows} 行`, durationMs: 520 }
  ],
  toolCalls: [{ toolName: "execute_query", step: "5" }],
  toolResults: [{ toolName: "execute_query", status: "success", sql, rows, durationMs: 520 }],
  done: { totalDurationMs: 2410, loopRounds: 1, tables: 1, completion: "complete" }
});

const replays = {
  "ask-table-a1": {
    question: "华东区Q1销售排行，按销售额降序，含同比",
    datasourceName: "销售数仓 sales_dw",
    table: narrowTable,
    answer: "已按华东区 Q1 销售额生成排行表，共 6 个城市，同比口径为 2025 年同期。",
    trace: traceFor(
      "销售数仓 sales_dw",
      "SELECT city,\n       SUM(amount) AS amount,\n       SUM(amount) / NULLIF(LAG(SUM(amount)) OVER (ORDER BY quarter), 0) - 1 AS yoy\n  FROM sales_dw.fact_order\n WHERE region = '华东' AND quarter = '2026Q1'\n GROUP BY city\n ORDER BY amount DESC",
      6
    )
  },
  "ask-table-wide": {
    question: "导出华东区全部订单明细，含账期与回款状态",
    datasourceName: "经营分析库 erp_dw",
    table: wideTable,
    answer: "已导出华东区订单明细，共 46 行，账期按合同约定天数计算。",
    trace: traceFor(
      "经营分析库 erp_dw",
      "SELECT order_no, customer_name, region, owner, order_date, category,\n       qty, unit_price, amount, discount_rate, settle_status, credit_days\n  FROM erp_dw.fact_order\n WHERE region = '华东'\n ORDER BY order_date DESC",
      46
    )
  }
};

const envelope = (data) => ({ code: 200, message: "visual qa fixture", data });

function replayFor(sessionId) {
  return replays[sessionId] ?? replays["ask-table-a1"];
}

const browser = await chromium.launch();

async function newPage(width, height, replayDelayMs = 0) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const holdReplay = async () => {
    if (replayDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, replayDelayMs));
    }
  };
  // Playwright 按注册的倒序匹配路由，通配兜底必须先注册。
  await page.route("**/api/**", (route) => route.fulfill({ json: envelope([]) }));
  await page.route("**/api/v1/chat/sessions/list", (route) => route.fulfill({ json: envelope(sessions) }));
  await page.route("**/api/v1/chat/messages/list", async (route) => {
    await holdReplay();
    const sessionId = JSON.parse(route.request().postData() ?? "{}").sessionId ?? "";
    const replay = replayFor(sessionId);
    return route.fulfill({
      json: envelope([
        { id: 1, sessionId, chatId: "c1", role: "user", content: replay.question, seqNum: 1 },
        { id: 2, sessionId, chatId: "c1", role: "assistant", content: replay.answer, seqNum: 5 }
      ])
    });
  });
  await page.route("**/api/v1/chat/events/list", async (route) => {
    await holdReplay();
    const sessionId = JSON.parse(route.request().postData() ?? "{}").sessionId ?? "";
    const replay = replayFor(sessionId);
    return route.fulfill({
      json: envelope([
        { id: 2, sessionId, chatId: "c1", type: "routing_decompose", seqNum: 2, data: replay.trace.decompose },
        { id: 3, sessionId, chatId: "c1", type: "data_source_selected", seqNum: 3, data: { datasourceId: 8, datasourceName: replay.datasourceName } },
        ...replay.trace.reactSteps.map((step, index) => ({
          id: 10 + index, sessionId, chatId: "c1", type: "react_step", seqNum: 4 + index, data: step
        })),
        ...replay.trace.toolCalls.map((call, index) => ({
          id: 30 + index, sessionId, chatId: "c1", type: "tool_call", seqNum: 20 + index, data: call
        })),
        ...replay.trace.toolResults.map((result, index) => ({
          id: 40 + index, sessionId, chatId: "c1", type: "tool_result", seqNum: 30 + index, data: result
        })),
        { id: 50, sessionId, chatId: "c1", type: "table", seqNum: 40, data: replay.table },
        { id: 51, sessionId, chatId: "c1", type: "content", seqNum: 41, data: replay.answer },
        { id: 52, sessionId, chatId: "c1", type: "done", seqNum: 42, data: replay.trace.done }
      ])
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("xingshu_datahub_token", "visual-qa-token");
    window.localStorage.setItem(
      "xingshu_datahub_user",
      JSON.stringify({ token: "visual-qa-token", userId: 1, username: "visual-qa", isAdmin: true })
    );
    window.localStorage.setItem("xingshu_datahub_space_id", "7");
    window.localStorage.setItem("xingshu_onboarding_v1", "done");
  });
  return page;
}

async function shot(name, width, height, path, readySelector, replayDelayMs = 0) {
  const page = await newPage(width, height, replayDelayMs);
  await page.goto(`${base}${path}`, { waitUntil: replayDelayMs ? "domcontentloaded" : "networkidle" });
  await page.waitForSelector(readySelector, { timeout: 15000 });
  await page.waitForTimeout(700);
  // 滚动容器是 .xs-shell__main 而非文档，fullPage 无效，靠高视口覆盖整屏内容
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

const listReady = ".sheet-list .sheet-row";
const sessionReady = ".datahub-table-scroll";

await shot("table-list-1440", 1440, 1000, "/table", listReady);
await shot("table-list-1672", 1672, 1000, "/table", listReady);
await shot("table-list-1920", 1920, 1080, "/table", listReady);
await shot("table-list-390", 390, 844, "/table", listReady);
await shot("table-session-1440", 1440, 1480, "/table/ask-table-a1", sessionReady);
await shot("table-session-1920", 1920, 1320, "/table/ask-table-a1", sessionReady);
await shot("table-session-390", 390, 844, "/table/ask-table-a1", sessionReady);
await shot("table-session-wide-1440", 1440, 1600, "/table/ask-table-wide", sessionReady);
// 空态与还原加载态：结果表位常驻，加载动画发生在空表框里
await shot("table-session-idle-1440", 1440, 1000, "/table/ask-table-empty", ".table-placeholder");
await shot(
  "table-session-loading-1440",
  1440,
  1000,
  "/table/ask-table-a1",
  '.table-placeholder[data-state="loading"]',
  6000
);

await browser.close();
console.log("done");
