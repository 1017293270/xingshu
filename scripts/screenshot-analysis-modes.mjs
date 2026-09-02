import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

/**
 * 四种分析模式（查数据 / 查知识 / 找文档 / 智能编排）的过程区骨架比对图。
 * 会话列表与流式接口都用 route.fulfill 造出完成态，不依赖后端。
 */
const base = "http://127.0.0.1:5173";
const dir = "outputs/ui-audit";
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

function sse(events) {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

const askEvents = (sessionId, chatId) => [
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
    type: "data_source_selected",
    agentName: "问数智能体",
    sessionId,
    chatId,
    content: { datasourceId: 1000002, datasourceName: "生产销售数据" }
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
        { name: "region", title: "区域" },
        { name: "revenue", title: "销售额（万元）", type: "number" },
        { name: "rate", title: "目标完成率", type: "number" }
      ],
      rows: [
        { region: "华东", revenue: 486.2, rate: 1.04 },
        { region: "华南", revenue: 331.7, rate: 0.92 },
        { region: "华北", revenue: 268.4, rate: 0.87 },
        { region: "西南", revenue: 155.9, rate: 0.78 }
      ],
      totalRows: 4,
      source: "cube"
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
        summary: "返回 3 行数据"
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
        source: "cube"
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

const browser = await chromium.launch();

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
  await page.route(streamPath, (route) => {
    const sessionId = `shot-${mode.name}-session`;
    const chatId = `shot-${mode.name}-chat`;
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse(mode.events(sessionId, chatId))
    });
  });

  await page.goto(`${base}${mode.route}`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "命令输入" }).fill(mode.question);
  await page.getByRole("button", { name: "发送" }).click();

  await page.getByLabel("任务动态").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelector(".analysis-live") === null,
    undefined,
    { timeout: 20000 }
  );
  // 结果区可能继续追加 AI 图表，等它落定再把轮次顶部（过程区）滚回视野
  await page.waitForTimeout(2500);
  await page.locator(".analysis-question").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/analysis-${mode.name}-collapsed.png` });

  const panelToggle = page.locator(".xs-datahub-execution__heading").first();
  await panelToggle.click();
  await page.waitForTimeout(900);
  await page.locator(".analysis-question").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/analysis-${mode.name}-expanded.png` });

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  console.log(`done ${mode.name} · 横向溢出 ${horizontalOverflow}px`);
  await page.close();
}

await browser.close();
