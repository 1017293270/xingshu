import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

/**
 * 四种分析模式（查数据 / 查知识 / 找文档 / 智能编排）的过程区骨架比对图。
 * 会话与图表使用本地夹具，SSE 按阶段由本地服务推送，不依赖业务后端。
 */
const base = process.env.ANALYSIS_QA_URL || "http://127.0.0.1:4175";
const dir = process.env.ANALYSIS_QA_DIR || "outputs/beta03";
const backendPort = Number(process.env.ANALYSIS_QA_BACKEND_PORT || 65534);
const streamPath = "**/api/agentScore/chat/completions/stream";

const mockSessions = [
  {
    id: 1,
    sessionId: "shot-session-1",
    title: "本月经营数据速览",
    chatMode: "ask",
    createdAt: "2026-08-30T09:32:00",
    updatedAt: "2026-08-30T09:32:00"
  }
];

const askEvents = (sessionId, chatId) => {
  // 数据源选择在真实后端是子智能体，事件带 parentSessionId；
  // 放在根会话就试不出「怎么查」能不能写出数据源名。
  const pickerSessionId = "shot-ask-datasource";
  return [
    { type: "agent_start", agentName: "问数智能体", sessionId, chatId },
    {
      type: "thinking",
      agentName: "问数智能体",
      sessionId,
      chatId,
      isThinking: true,
      replyId: "ask-think",
      modelCallIndex: 1,
      content: "先确认口径：本月按自然月统计，需要区域维度的收入与目标完成率。"
    },
    {
      type: "activity",
      agentName: "问数智能体",
      sessionId,
      chatId,
      content: {
        activityId: "tool:locate",
        kind: "tool",
        action: "locate_datasource",
        label: "匹配可用数据源",
        status: "success",
        summary: "命中「生产销售数据」"
      }
    },
    {
      type: "subagent_exposed",
      agentName: "数据源选择智能体",
      sessionId: pickerSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: {
        agentId: "data-source-select",
        sessionId: pickerSessionId,
        subagentId: "shot-subagent-datasource",
        label: "数据源选择"
      }
    },
    {
      type: "data_source_selected",
      agentName: "数据源选择智能体",
      sessionId: pickerSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: { datasourceId: 1000002, datasourceName: "生产销售数据" }
    },
    {
      type: "done",
      agentName: "数据源选择智能体",
      sessionId: pickerSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: { mode: "ask", summary: "已选定「生产销售数据」。" }
    },
    {
      type: "react_step",
      agentName: "问数智能体",
      sessionId,
      chatId,
      content: { round: 1, action: "generate_query", status: "success", summary: "已生成 Cube Query" }
    },
    {
      type: "activity",
      agentName: "问数智能体",
      sessionId,
      chatId,
      content: {
        activityId: "tool:execute",
        kind: "tool",
        action: "execute_query",
        label: "执行数据查询",
        status: "success",
        summary: "返回 4 行数据"
      }
    },
    {
      type: "table",
      agentName: "问数智能体",
      sessionId,
      chatId,
      content: {
        columns: [
          { name: "SalesOrder.region", title: "销售明细表，记录各区域月度销售额。区域" },
          { name: "SalesOrder.revenue", title: "销售明细表，记录各区域月度销售额。销售额（万元）", type: "number" },
          { name: "SalesOrder.rate", title: "销售明细表，记录各区域月度销售额。目标完成率", type: "number" }
        ],
        rows: [
          { "SalesOrder.region": "华东", "SalesOrder.revenue": 486.2, "SalesOrder.rate": 1.04 },
          { "SalesOrder.region": "华南", "SalesOrder.revenue": 331.7, "SalesOrder.rate": 0.92 },
          { "SalesOrder.region": "华北", "SalesOrder.revenue": 268.4, "SalesOrder.rate": 0.87 },
          { "SalesOrder.region": "西南", "SalesOrder.revenue": 155.9, "SalesOrder.rate": 0.78 }
        ],
        totalRows: 4,
        source: "cube",
        tableComment: "销售明细表，记录各区域月度销售额与目标完成率",
        annotation: {
          measures: {
            "SalesOrder.revenue": {
              title: "销售明细表，记录各区域月度销售额。销售额（万元）",
              shortTitle: "销售额（万元）",
              type: "sum",
              businessDefinition: "已确认收入的销售额合计，单位万元",
              businessTerms: ["营收", "销售收入"]
            }
          },
          dimensions: {
            "SalesOrder.region": {
              title: "销售明细表，记录各区域月度销售额。区域",
              shortTitle: "区域"
            },
            "SalesOrder.month": {
              title: "销售明细表，记录各区域月度销售额。统计月份"
            }
          }
        },
        query: {
          measures: ["SalesOrder.revenue"],
          dimensions: ["SalesOrder.region"],
          filters: [
            { member: "SalesOrder.month", operator: "equals", values: ["2026-08"] }
          ]
        }
      }
    },
    {
      type: "text",
      agentName: "问数智能体",
      sessionId,
      chatId,
      replyId: "ask-answer",
      modelCallIndex: 2,
      content:
        "本月总销售额 1242.2 万元，整体目标完成率 92%。华东区已超额完成（104%），西南区完成率最低（78%），是本月主要缺口。"
    },
    {
      type: "done",
      agentName: "问数智能体",
      sessionId,
      chatId,
      finished: true,
      content: { mode: "ask", summary: "本月销售额 1242.2 万元，整体完成率 92%。", totalDurationMs: 18400 }
    }
  ];
};

const ragEvents = (sessionId, chatId) => [
  { type: "agent_start", agentName: "问知智能体", sessionId, chatId },
  {
    type: "thinking",
    agentName: "问知智能体",
    sessionId,
    chatId,
    isThinking: true,
    replyId: "rag-think",
    modelCallIndex: 1,
    content: "先检索合同审批相关制度，再按环节顺序整理，并保留可追溯的原文出处。"
  },
  {
    type: "activity",
    agentName: "问知智能体",
    sessionId,
    chatId,
    content: {
      activityId: "tool:retrieve",
      kind: "tool",
      action: "retrieve_knowledge",
      label: "检索知识证据",
      status: "success",
      summary: "检索到 3 条候选证据"
    }
  },
  {
    type: "citation_document",
    agentName: "问知智能体",
    sessionId,
    chatId,
    content: {
      docId: "doc-contract-policy",
      docKey: "contract-policy-2026.pdf",
      kbId: "kb-legal",
      kbName: "制度知识库",
      docName: "合同管理办法（2026 版）",
      chapter: "第三章 审批流程",
      sourceAvailable: true,
      fragments: [
        "合同经办部门起草后，须依次经过部门负责人初审、法务合规审查、财务预算复核，金额超过 50 万元的另需总经理办公会审议。"
      ]
    }
  },
  {
    type: "activity",
    agentName: "问知智能体",
    sessionId,
    chatId,
    content: {
      activityId: "tool:confirm",
      kind: "tool",
      action: "confirm_answer",
      label: "校验并整理回答",
      status: "success"
    }
  },
  {
    type: "text",
    agentName: "问知智能体",
    sessionId,
    chatId,
    replyId: "rag-answer",
    modelCallIndex: 2,
    content:
      "合同审批依次经过四个环节：**部门负责人初审 → 法务合规审查 → 财务预算复核 → 总经理办公会审议**（仅金额超过 50 万元时触发）。审批通过后由经办部门归档留存。"
  },
  {
    type: "done",
    agentName: "问知智能体",
    sessionId,
    chatId,
    finished: true,
    content: {
      mode: "rag",
      askKnowledge: true,
      summary: "合同审批依次经过部门初审、法务审查、财务复核，大额合同另需办公会审议。",
      totalDurationMs: 12600
    }
  }
];

const documentLookupEvents = (sessionId, chatId) => [
  { type: "agent_start", agentName: "找文档智能体", sessionId, chatId },
  {
    type: "thinking",
    agentName: "找文档智能体",
    sessionId,
    chatId,
    isThinking: true,
    replyId: "lookup-think",
    modelCallIndex: 1,
    content: "关键词是「员工手册」「最新版」，优先取人事知识库里版本号最高且状态为已发布的文档。"
  },
  {
    type: "activity",
    agentName: "找文档智能体",
    sessionId,
    chatId,
    content: {
      activityId: "tool:find",
      kind: "tool",
      action: "find_documents",
      label: "定位相关文档",
      status: "success",
      summary: "命中 2 份候选文档"
    }
  },
  {
    type: "activity",
    agentName: "找文档智能体",
    sessionId,
    chatId,
    content: {
      activityId: "tool:confirm-doc",
      kind: "tool",
      action: "confirm_document_selection",
      label: "复核文档结果",
      status: "success"
    }
  },
  {
    type: "done",
    agentName: "找文档智能体",
    sessionId,
    chatId,
    finished: true,
    content: {
      mode: "document_lookup",
      documentLookup: true,
      documentSelectionMode: "single",
      summary: "已找到员工手册最新版。",
      totalDurationMs: 9800,
      documentResults: [
        {
          docId: "doc-handbook-2026",
          docKey: "handbook-2026.pdf",
          kbId: "kb-hr",
          kbName: "人事知识库",
          docName: "员工手册（2026 版）",
          matchReason: "标题与版本完全匹配，状态为已发布",
          snippet: "本手册适用于全体在职员工，自 2026 年 1 月 1 日起施行，替代 2023 版员工手册。",
          score: 0.94,
          sourceAvailable: true
        },
        {
          docId: "doc-handbook-2023",
          docKey: "handbook-2023.pdf",
          kbId: "kb-hr",
          kbName: "人事知识库",
          docName: "员工手册（2023 版）",
          matchReason: "同名历史版本，已被替代",
          score: 0.61,
          sourceAvailable: true
        }
      ]
    }
  }
];

const agentEvents = (sessionId, chatId) => {
  const childSessionId = "shot-agent-child";
  return [
    { type: "agent_start", agentName: "编排智能体", sessionId, chatId },
    {
      type: "thinking",
      agentName: "编排智能体",
      sessionId,
      chatId,
      isThinking: true,
      replyId: "agent-think",
      modelCallIndex: 1,
      content: "这个问题要同时看经营数据和考核制度，拆成一个问数子任务和一个问知子任务并行跑。"
    },
    {
      type: "routing_decompose",
      agentName: "编排智能体",
      sessionId,
      chatId,
      content: {
        executionMode: "ADAPTIVE_TEAM",
        subQuestions: ["统计各区域本季度销售额与完成率", "查找区域业绩考核制度原文"]
      }
    },
    {
      type: "subagent_exposed",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: {
        agentId: "ask-data",
        sessionId: childSessionId,
        subagentId: "shot-subagent-ask",
        label: "区域业绩问数"
      }
    },
    {
      type: "data_source_selected",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: { datasourceId: 1000007, datasourceName: "经营分析数据" }
    },
    {
      type: "thinking",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      isThinking: true,
      replyId: "child-plan",
      modelCallIndex: 1,
      content:
        "先确认「完成率」在语义模型里的口径是「实际销售额 / 季度目标」，再按区域分组取本季度，避免把退货冲销的部分算进来。"
    },
    {
      type: "activity",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      replyId: "child-plan",
      modelCallIndex: 1,
      content: {
        activityId: "model:child-plan",
        kind: "model",
        action: "model_analysis",
        label: "规划查询",
        status: "success",
        summary: "查询方案已生成",
        startedAt: "2026-08-30T09:32:04.000+08:00",
        completedAt: "2026-08-30T09:32:07.400+08:00",
        durationMs: 3400
      }
    },
    {
      type: "text",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      replyId: "child-plan",
      modelCallIndex: 1,
      content:
        "按区域分组取本季度销售额与完成率三行，完成率沿用语义模型口径，不再单独换算。"
    },
    {
      type: "activity",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: {
        activityId: "tool:child-execute",
        kind: "tool",
        action: "execute_query",
        label: "执行数据查询",
        status: "success",
        summary: "返回 3 行数据",
        startedAt: "2026-08-30T09:32:07.600+08:00",
        completedAt: "2026-08-30T09:32:09.100+08:00",
        durationMs: 1500
      }
    },
    {
      type: "table",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: {
        columns: [
          { name: "region", title: "区域" },
          { name: "revenue", title: "季度销售额（万元）", type: "number" },
          { name: "rate", title: "完成率", type: "number" }
        ],
        rows: [
          { region: "华东", revenue: 1420.5, rate: 1.02 },
          { region: "华南", revenue: 980.3, rate: 0.89 },
          { region: "西南", revenue: 465.1, rate: 0.71 }
        ],
        totalRows: 3,
        source: "cube",
        tableComment: "区域业绩表，记录各区域季度销售额与目标完成率",
        annotation: {
          measures: {
            revenue: { title: "季度销售额（万元）", shortTitle: "季度销售额（万元）", type: "sum" }
          },
          dimensions: {
            region: { title: "区域", shortTitle: "区域" }
          }
        },
        query: { measures: ["revenue"], dimensions: ["region"] }
      }
    },
    {
      type: "done",
      agentName: "问数智能体",
      sessionId: childSessionId,
      globalSessionId: sessionId,
      parentSessionId: sessionId,
      chatId,
      content: { mode: "ask", summary: "西南区完成率最低。" }
    },
    {
      type: "text",
      agentName: "编排智能体",
      sessionId,
      chatId,
      replyId: "agent-answer",
      modelCallIndex: 2,
      content:
        "本季度西南区完成率 71%，低于考核制度要求的 85% 红线，需要在下季度提交专项改进方案；华东区 102% 达标，华南区 89% 处于观察区间。"
    },
    {
      type: "done",
      agentName: "编排智能体",
      sessionId,
      chatId,
      finished: true,
      content: {
        mode: "agent",
        adaptiveTeam: true,
        summary: "西南区未达考核红线，需提交改进方案。",
        totalDurationMs: 41200
      }
    }
  ];
};

const modes = [
  {
    name: "ask",
    route: "/ask-data",
    question: "本月销售额与目标完成率怎么样？",
    events: askEvents
  },
  {
    name: "knowledge",
    route: "/ask-knowledge",
    question: "公司合同审批需要经过哪些环节？",
    events: ragEvents
  },
  {
    name: "document-lookup",
    route: "/document-lookup",
    question: "帮我找到最新版员工手册",
    events: documentLookupEvents
  },
  {
    name: "agent",
    route: "/ask-agent",
    question: "分析各区域经营表现，并查找相关考核制度作为依据",
    events: agentEvents
  }
];

await mkdir(dir, { recursive: true });

// 与隔离 Vite 的 65534 本地代理配合，真实分批推送 SSE，验证阶段先后。
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  const mode = modes.find((item) => item.question === payload.message) || modes[0];
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  let pausedQuery = false;
  for (const event of mode.events(payload.sessionId, payload.chatId)) {
    response.write(`data: ${JSON.stringify({ ...event, timestamp: Date.now() })}\n\n`);
    if (event.type === "thinking" && !event.parentSessionId) await delay(1600);
    else if (!pausedQuery && ["activity", "subagent_exposed", "tool_call", "citation_document"].includes(event.type)) {
      pausedQuery = true;
      await delay(1600);
    } else await delay(40);
  }
  response.end("data: [DONE]\n\n");
});
await new Promise((resolve, reject) => server.listen(backendPort, "127.0.0.1", resolve).once("error", reject));
const browser = await chromium.launch();
try {


for (const mode of modes) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    const user = { token: "playwright-visual-token", userId: 1, username: "张三", isAdmin: true };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
  // 兜底：其余后端调用一律给空成功响应，避免 401 把登录态踢掉跳回登录页。
  // Playwright 后注册的路由优先，所以兜底必须先注册。
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, message: "ok", data: null })
    })
  );
  await page.route("**/api/v1/chat/sessions/list", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, message: "ok", data: mockSessions })
    })
  );
  await page.route("**/api/v1/chat/chart-plan", (route) => {
    const { tables } = route.request().postDataJSON();
    const table = tables.find((item) => item.title.includes("回答")) || tables[0];
    const metric = table?.columns.find((column) => column.type === "number");
    const dimension = table?.columns.find((column) => column !== metric && column.type !== "number");
    return route.fulfill({ json: { code: 200, message: "fixture", data: {
      chartable: Boolean(metric && dimension), title: "区域经营表现", reason: "按本次最终结果展示",
      chartType: "bar", allowedTypes: ["bar", "pie"], tableIndex: table?.tableIndex,
      dimensionKey: dimension?.key, metricKeys: metric ? [metric.key] : []
    } } });
  });
  await page.route(streamPath, (route) => route.continue());

  await page.goto(`${base}${mode.route}`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "命令输入" }).fill(mode.question);
  await page.getByRole("button", { name: "发送" }).click();

  await page.locator('.datahub-process-dock[data-status="running"]').waitFor();
  assert.equal(await page.locator(".analysis-output").count(), 0, "思考阶段不提前展示结果");
  await page.screenshot({ path: `${dir}/analysis-${mode.name}-thinking-live.png` });
  await page.locator('.datahub-business-explanation[data-status="running"]').waitFor();
  assert.equal(await page.locator(".analysis-output").count(), 0, "检索阶段不提前展示结果");
  await page.screenshot({ path: `${dir}/analysis-${mode.name}-query-live.png` });
  await page.locator('.analysis-turn[data-status="done"]').waitFor();
  assert.equal(await page.getByLabel("任务动态").count(), 0);
  // 结果区可能继续追加 AI 图表，等它落定再把轮次顶部（过程区）滚回视野
  await page.waitForTimeout(2500);
  await page.locator(".analysis-question").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/analysis-${mode.name}-collapsed.png` });

  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.locator(".analysis-question").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const metrics = await page.evaluate(() => {
      const question = document.querySelector(".analysis-question > div");
      const card = document.querySelector(".analysis-card");
      const answer = document.querySelector(".datahub-answer .xs-safe-markdown");
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        alignment: Math.abs(question.getBoundingClientRect().right - card.getBoundingClientRect().right),
        sameFontSize: !answer || getComputedStyle(answer).fontSize === getComputedStyle(question.querySelector("strong")).fontSize
      };
    });
    assert(metrics.overflow <= 1, `${mode.name} ${width}: 页面横向溢出`);
    assert(metrics.alignment <= 2, `${mode.name} ${width}: 问题与回答右侧不对齐 ${metrics.alignment}px`);
    assert(metrics.sameFontSize, "问题与回答字号一致");
    await page.screenshot({ path: `${dir}/analysis-${mode.name}-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const tableSwitch = page.getByRole("radio", { name: "表格", exact: true });
  if (await tableSwitch.count()) {
    await tableSwitch.locator("..").click();
    await page.getByRole("region", { name: "智能图表建议" }).scrollIntoViewIfNeeded();
    assert(await page.getByRole("region", { name: "智能图表建议" }).getByRole("table").count());
    await page.screenshot({ path: `${dir}/analysis-${mode.name}-chart-table.png` });
    await page.getByRole("radio", { name: "柱状", exact: true }).locator("..").click();
  }

  // 查询过程结束后会自动收成一行，展开它才能看到「怎么查 / 查到了什么」。
  const businessToggle = page.getByRole("button", { name: /查询过程/ }).first();
  if (await businessToggle.count()) {
    if ((await businessToggle.getAttribute("aria-expanded")) === "false") {
      await businessToggle.click();
    }
    await page.waitForTimeout(600);
    await businessToggle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/analysis-${mode.name}-business.png` });
  }

  const panelToggle = page.locator(".xs-datahub-execution__heading").first();
  await panelToggle.click();
  await page.waitForTimeout(900);
  await page.locator(".analysis-question").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/analysis-${mode.name}-expanded.png` });

  // 主卡里的第一处思考展开后是不是能读到模型原话
  const thinking = page.locator(".xs-datahub-agent-card__thinking > summary").first();
  if (await thinking.count()) {
    await thinking.click();
    await page.waitForTimeout(500);
    await thinking.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/analysis-${mode.name}-thinking.png` });
  }

  // 子智能体抽屉：编排模式下从 DAG 节点进去看子 agent 的执行叙事
  const subagentNode = page
    .getByRole("button", { name: /打开 .*执行详情/ })
    .first();
  if (await subagentNode.count()) {
    await subagentNode.click();
    await page.getByRole("dialog", { name: "子智能体执行详情" }).waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/analysis-${mode.name}-subagent.png` });

    const drawerThinking = page
      .locator(".xs-datahub-subagent-drawer .xs-datahub-agent-card__thinking > summary")
      .first();
    if (await drawerThinking.count()) {
      await drawerThinking.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${dir}/analysis-${mode.name}-subagent-thinking.png`
      });
    }

    const drawerActivity = page
      .locator(
        ".xs-datahub-subagent-drawer .xs-datahub-agent-card__activity-header"
      )
      .first();
    if (await drawerActivity.count()) {
      await drawerActivity.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${dir}/analysis-${mode.name}-subagent-activity.png`
      });
    }
  }

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  console.log(`done ${mode.name} · 横向溢出 ${horizontalOverflow}px`);
  await page.close();
}

} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
