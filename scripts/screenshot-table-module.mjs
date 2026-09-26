import { chromium } from "@playwright/test";

// 用法：先启动 npm run dev，再执行 node scripts/screenshot-table-module.mjs
// 截智能制表模块：制表台列表页与问表智能体会话页，覆盖 1440/1672/1920/390 四档，
// 外加一张宽表（12 列 46 行）用于验证横向滚动、行号槽与行数截断提示。
// 我的表格有 14 个会话：先露 10 条，另截一张展开后的样子；
// 两轮会话（先澄清再追问）用来看页头标题、会话下拉与「存为模板」弹窗里的建议值。
// 所有 /api/** 请求都被本脚本拦截，不会打到真实后端。
const dir = "outputs/ui-audit";
const base = process.env.XS_QA_BASE_URL ?? "http://127.0.0.1:5173";

// 后端会话标题 = 首条用户消息，超 50 字截断补「...」；模板发起的会话首条消息带着结构参考尾巴
const sessions = [
  { id: 20, sessionId: "ask-table-followup", title: "帮我统计一下各客户的合同金额", chatMode: "ask_table", updatedAt: "2026-08-18T09:05:00" },
  { id: 1, sessionId: "ask-table-a1", title: "华东区Q1销售排行", chatMode: "ask_table", updatedAt: "2026-08-17T10:24:00" },
  { id: 21, sessionId: "ask-table-template", title: "按年度统计合同\n\n表结构参考（按以下列生成）：合同编号、合同金额", chatMode: "ask_table", updatedAt: "2026-08-16T17:40:00" },
  { id: 2, sessionId: "ask-table-a2", title: "各部门人员通讯录", chatMode: "ask_table", updatedAt: "2026-08-16T15:02:00" },
  { id: 3, sessionId: "ask-table-a3", title: "月度费用统计报表", chatMode: "ask_table", updatedAt: "2026-08-15T09:41:00" },
  { id: 4, sessionId: "ask-table-a4", title: "仓库库存周转清单", chatMode: "ask_table", updatedAt: "2026-08-14T18:12:00" },
  { id: 5, sessionId: "ask-table-a5", title: "重点客户回款汇总", chatMode: "ask_table", updatedAt: "2026-08-13T11:30:00" },
  { id: 6, sessionId: "ask-table-a6", title: "供应商交付及时率排名", chatMode: "ask_table", updatedAt: "2026-08-12T16:20:00" },
  { id: 7, sessionId: "ask-table-a7", title: "统计各事业部2025年签约合同的金额与数量并按季度汇总到一张表里需要区分新签续签\n\n表结...", chatMode: "ask_table", updatedAt: "2026-08-11T10:08:00" },
  { id: 8, sessionId: "ask-table-a8", title: "在建项目进度清单", chatMode: "ask_table", updatedAt: "2026-08-10T14:55:00" },
  { id: 9, sessionId: "ask-table-a9", title: "差旅费用按部门同比", chatMode: "ask_table", updatedAt: "2026-08-08T09:30:00" },
  { id: 10, sessionId: "ask-table-a10", title: "新入职员工名单", chatMode: "ask_table", updatedAt: "2026-08-06T11:12:00" },
  { id: 11, sessionId: "ask-table-a11", title: "设备维保到期提醒表", chatMode: "ask_table", updatedAt: "2026-07-30T15:40:00" },
  { id: 12, sessionId: "ask-table-a12", title: "华南区渠道库存日报", chatMode: "ask_table", updatedAt: "2026-07-22T08:45:00" }
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
  },
  // 一轮出两张表：用来截对话流里的结果表工件组（组头 + 两行）
  "ask-table-multi": {
    question: "华东区Q1销售排行，另外再给我一份城市订单分布",
    datasourceName: "销售数仓 sales_dw",
    tables: [
      narrowTable,
      {
        columns: [
          { key: "city", title: "城市" },
          { key: "orders", title: "订单数" },
          { key: "avgAmount", title: "客单价(元)" },
          { key: "refund", title: "退单率" }
        ],
        rows: [
          { city: "上海", orders: 1284, avgAmount: "3752.40", refund: "1.8%" },
          { city: "杭州", orders: 963, avgAmount: "3286.10", refund: "2.4%" },
          { city: "南京", orders: 741, avgAmount: "3491.55", refund: "3.1%" },
          { city: "苏州", orders: 688, avgAmount: "3208.90", refund: "2.0%" }
        ],
        totalRows: 4,
        groupLabel: "城市订单分布",
        source: "sales_dw.fact_order"
      }
    ],
    answer: "已生成两张表：华东区 Q1 销售排行，以及同口径下的城市订单分布。",
    trace: traceFor(
      "销售数仓 sales_dw",
      "SELECT city, COUNT(*) AS orders, AVG(amount) AS avg_amount\n  FROM sales_dw.fact_order\n WHERE region = '华东' AND quarter = '2026Q1'\n GROUP BY city",
      10
    )
  },
  // 两轮会话：第一轮先澄清客户口径再出表，第二轮追问再出一张。页头要一直是第一句话，不能被追问顶掉
  "ask-table-followup": {
    question: "帮我统计一下各客户的合同金额",
    datasourceName: "合同主题 contract_dw",
    clarification: {
      interactionId: "tool-call-qa-1",
      question: "客户范围按哪个口径？",
      options: [
        { label: "全部外部客户", value: "external" },
        { label: "含关联方", value: "all" }
      ],
      answer: "external"
    },
    table: {
      columns: [
        { key: "customer", title: "客户" },
        { key: "amount", title: "合同金额(万元)" },
        { key: "count", title: "合同数" }
      ],
      rows: [
        { customer: "星海实业", amount: 1280.5, count: 6 },
        { customer: "临港贸易", amount: 960.2, count: 4 },
        { customer: "东岳重工", amount: 742.0, count: 3 }
      ],
      totalRows: 3,
      groupLabel: "各客户合同金额",
      source: "contract_dw.fact_contract"
    },
    answer: "已按全部外部客户统计合同金额，共 3 家客户。",
    trace: traceFor("合同主题 contract_dw", "SELECT customer, SUM(amount), COUNT(*)\n  FROM contract_dw.fact_contract\n GROUP BY customer", 3),
    followUps: [
      {
        question: "没有日期吗，我说的客户肯定不包含我司嘛",
        table: {
          columns: [
            { key: "customer", title: "客户" },
            { key: "signDate", title: "签约日期" },
            { key: "amount", title: "合同金额(万元)" }
          ],
          rows: [
            { customer: "星海实业", signDate: "2026-03-18", amount: 1280.5 },
            { customer: "临港贸易", signDate: "2026-02-07", amount: 960.2 }
          ],
          totalRows: 2,
          groupLabel: "各客户合同金额（含签约日期）",
          source: "contract_dw.fact_contract"
        },
        answer: "已排除我司自身主体，并补上签约日期。"
      }
    ]
  },
  // 从模板发起的会话：首轮带着结构参考尾巴，页头只该露出模板原话
  "ask-table-template": {
    question: "按年度统计合同\n\n表结构参考（按以下列生成）：合同编号、合同金额",
    datasourceName: "合同主题 contract_dw",
    table: {
      columns: [
        { key: "contractNo", title: "合同编号" },
        { key: "amount", title: "合同金额" }
      ],
      rows: [
        { contractNo: "HT-2025-0012", amount: 386000 },
        { contractNo: "HT-2025-0047", amount: 215400 }
      ],
      totalRows: 2,
      groupLabel: "年度合同",
      source: "contract_dw.fact_contract"
    },
    answer: "已按模板的列生成 2025 年度合同表。",
    trace: traceFor("合同主题 contract_dw", "SELECT contract_no, amount\n  FROM contract_dw.fact_contract\n WHERE year = 2025", 2)
  },
  // 只有回答没有表的一轮：用来截"结果台没打开"的纯对话态
  "ask-table-chat": {
    question: "本月的费用明细能不能按部门汇总一下",
    datasourceName: "费用主题 fin_dw",
    table: null,
    answer: "当前空间里没有可汇总的费用明细表。补充所属账套或时间范围之后我可以再跑一次。",
    trace: traceFor("费用主题 fin_dw", "SELECT dept, SUM(amount)\n  FROM fin_dw.fact_expense\n GROUP BY dept", 0)
  }
};

/** 这些会话没有任何历史，用来截空态；接口直接回空数组。 */
const emptySessions = new Set(["ask-table-empty"]);

const envelope = (data) => ({ code: 200, message: "visual qa fixture", data });

function replayFor(sessionId) {
  return replays[sessionId] ?? replays["ask-table-a1"];
}

/** 一个会话的各轮：主轮 + followUps。追问轮沿用主轮的数据源与执行过程。 */
function turnsOf(replay) {
  return [
    replay,
    ...(replay.followUps ?? []).map((turn) => ({
      datasourceName: replay.datasourceName,
      trace: replay.trace,
      ...turn
    }))
  ];
}

// 每轮占一段 id / seqNum（第 k 轮从 k*100 起），多轮之间不会撞号，还原时按 seqNum 排回对话顺序
function messagesFor(sessionId, replay) {
  return turnsOf(replay).flatMap((turn, k) => [
    { id: k * 100 + 1, sessionId, chatId: `c${k + 1}`, role: "user", content: turn.question, seqNum: k * 100 + 1 },
    { id: k * 100 + 2, sessionId, chatId: `c${k + 1}`, role: "assistant", content: turn.answer, seqNum: k * 100 + 5 }
  ]);
}

function eventsFor(sessionId, replay) {
  return turnsOf(replay).flatMap((turn, k) => {
    const chatId = `c${k + 1}`;
    const at = (offset) => k * 100 + offset;
    return [
      { id: at(2), sessionId, chatId, type: "routing_decompose", seqNum: at(2), data: turn.trace.decompose },
      { id: at(3), sessionId, chatId, type: "data_source_selected", seqNum: at(3), data: { datasourceId: 8, datasourceName: turn.datasourceName } },
      ...turn.trace.reactSteps.map((step, index) => ({
        id: at(10 + index), sessionId, chatId, type: "react_step", seqNum: at(4 + index), data: step
      })),
      ...turn.trace.toolCalls.map((call, index) => ({
        id: at(30 + index), sessionId, chatId, type: "tool_call", seqNum: at(20 + index), data: call
      })),
      ...turn.trace.toolResults.map((result, index) => ({
        id: at(40 + index), sessionId, chatId, type: "tool_result", seqNum: at(30 + index), data: result
      })),
      // 已经答过的澄清：卡片 + 回执，还原后是一行「已选择」
      ...(turn.clarification
        ? [
          {
            id: at(46), sessionId, chatId, type: "clarification", seqNum: at(36),
            data: {
              interactionId: turn.clarification.interactionId,
              question: turn.clarification.question,
              options: turn.clarification.options,
              allowFreeText: false
            }
          },
          {
            id: at(47), sessionId, chatId, type: "clarification_response", seqNum: at(37),
            data: { interactionId: turn.clarification.interactionId, answer: turn.clarification.answer }
          }
        ]
        : []),
      // 一轮可以出多张表：table 是单张的简写，tables 是完整写法
      ...(turn.tables ?? (turn.table ? [turn.table] : [])).map((table, index) => ({
        id: at(50 + index), sessionId, chatId, type: "table", seqNum: at(40 + index), data: table
      })),
      // 留出多张表占掉的 id / seqNum，别跟正文和 done 撞上
      { id: at(70), sessionId, chatId, type: "content", seqNum: at(60), data: turn.answer },
      { id: at(71), sessionId, chatId, type: "done", seqNum: at(61), data: turn.trace.done }
    ];
  });
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
    if (emptySessions.has(sessionId)) {
      return route.fulfill({ json: envelope([]) });
    }
    return route.fulfill({ json: envelope(messagesFor(sessionId, replayFor(sessionId))) });
  });
  await page.route("**/api/v1/chat/events/list", async (route) => {
    await holdReplay();
    const sessionId = JSON.parse(route.request().postData() ?? "{}").sessionId ?? "";
    if (emptySessions.has(sessionId)) {
      return route.fulfill({ json: envelope([]) });
    }
    return route.fulfill({ json: envelope(eventsFor(sessionId, replayFor(sessionId))) });
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

// XS_QA_ONLY=table-list,table-followup 只截名字以这些前缀开头的几张，改一处时不用整套重跑
const only = process.env.XS_QA_ONLY?.split(",").map((prefix) => prefix.trim()).filter(Boolean);

async function shot(name, width, height, path, readySelector, replayDelayMs = 0, interact) {
  if (only && !only.some((prefix) => name.startsWith(prefix))) {
    return;
  }
  const page = await newPage(width, height, replayDelayMs);
  await page.goto(`${base}${path}`, { waitUntil: replayDelayMs ? "domcontentloaded" : "networkidle" });
  await page.waitForSelector(readySelector, { timeout: 15000 });
  await page.waitForTimeout(700);
  if (interact) {
    await interact(page);
    await page.waitForTimeout(500);
  }
  // 滚动容器是 .xs-shell__main 而非文档，fullPage 无效，靠高视口覆盖整屏内容
  await page.screenshot({ path: `${dir}/${name}.png` });
  await page.close();
  console.log(`shot ${name}`);
}

const expandAllTables = (page) => page.getByRole("button", { name: /^展开全部 \d+ 条$/ }).click();
const openSessionMenu = async (page) => {
  await page.getByRole("button", { name: "切换制表会话" }).click();
  // 侧栏导航也是 role=menu，这里只等顶栏下拉那一个
  await page.locator(".ant-dropdown-menu").waitFor();
};
const openSaveTemplate = async (page) => {
  await page.getByRole("button", { name: "把当前结果表存为模板" }).click();
  await page.getByRole("dialog", { name: "存为模板" }).waitFor();
};

const listReady = ".sheet-list .sheet-row";
// 出表的会话会自动把结果台开到第一张表，所以表体出现即代表分栏工作区已就位
const dockReady = ".tgs__dock .datahub-table-scroll";
// 没有结果表的一轮：只有对话列，结果台不开
const chatReady = ".tgs__turns .tgs-trace";

await shot("table-list-1440", 1440, 1000, "/table", listReady);
await shot("table-list-1672", 1672, 1000, "/table", listReady);
await shot("table-list-1920", 1920, 1080, "/table", listReady);
await shot("table-list-390", 390, 844, "/table", listReady);
// 14 个会话先露 10 条；展开后在列表卡里接着滚，展开链接留在卡下方
await shot("table-list-expanded-1440", 1440, 900, "/table", listReady, 0, expandAllTables);
await shot("table-list-expanded-390", 390, 844, "/table", listReady, 0, expandAllTables);
// 两轮会话：页头是第一句话；下拉里当前行与页头同一句；存为模板弹窗带着合成好的名称与提示词
await shot("table-followup-1440", 1440, 900, "/table/ask-table-followup", dockReady);
await shot("table-followup-menu-1440", 1440, 900, "/table/ask-table-followup", dockReady, 0, openSessionMenu);
await shot("table-followup-template-1440", 1440, 900, "/table/ask-table-followup", dockReady, 0, openSaveTemplate);
await shot("table-followup-template-390", 390, 844, "/table/ask-table-followup", dockReady, 0, openSaveTemplate);
// 模板发起的会话：页头不带「表结构参考」尾巴
await shot("table-template-session-1440", 1440, 900, "/table/ask-table-template", dockReady);
// 结果台打开态：左对话列 40%，右侧结果台通高
await shot("table-session-1440", 1440, 900, "/table/ask-table-a1", dockReady);
await shot("table-session-1920", 1920, 1080, "/table/ask-table-a1", dockReady);
// 1200 是分栏能站住的最窄一档；1024 已经跨过 1100 断点，结果台该变成全宽覆盖抽屉
await shot("table-session-1200", 1200, 900, "/table/ask-table-a1", dockReady);
await shot("table-session-1024", 1024, 800, "/table/ask-table-a1", dockReady);
await shot("table-session-390", 390, 844, "/table/ask-table-a1", dockReady);
await shot("table-session-wide-1440", 1440, 900, "/table/ask-table-wide", dockReady);
// 一轮两张表：验对话流里的工件组（组头「结果表 · 2 张」+ 两行 + 激活行高亮）
await shot("table-session-group-1440", 1440, 900, "/table/ask-table-multi", dockReady);
await shot("table-session-group-1200", 1200, 900, "/table/ask-table-multi", dockReady);
// 纯对话态：没有结果表时对话列独占整幅宽度
await shot("table-session-chat-1440", 1440, 900, "/table/ask-table-chat", chatReady);
await shot("table-session-chat-390", 390, 844, "/table/ask-table-chat", chatReady);
// 空态与还原加载态：结果表位常驻，加载动画发生在空表框里
await shot("table-session-idle-1440", 1440, 900, "/table/ask-table-empty", ".tgs-placeholder");
await shot("table-session-idle-390", 390, 844, "/table/ask-table-empty", ".tgs-placeholder");
await shot(
  "table-session-loading-1440",
  1440,
  900,
  "/table/ask-table-a1",
  '.tgs-placeholder[data-state="loading"]',
  6000
);

await browser.close();
console.log("done");
