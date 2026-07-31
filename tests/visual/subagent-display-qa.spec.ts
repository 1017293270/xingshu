import { expect, type Page, test } from "@playwright/test";

/**
 * 临时 QA 截图脚本：捕捉问数子智能体展示的现状（running / done / drawer）。
 * 截图输出到 outputs/subagent-display-qa/after-*.png。
 */

type StreamRequest = {
  message: string;
  sessionId: string;
  globalSessionId: string;
  chatId: string;
  chatMode: "ask" | "rag" | "document_lookup" | "agent";
};

function envelope(data: unknown) {
  return { code: 200, message: "subagent display qa fixture", data };
}

function sseEvent(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function buildAgentStream(
  request: StreamRequest,
  options: { done: boolean; omitRootDone?: boolean }
) {
  const root = {
    agentName: "编排智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };
  const childData = {
    agentName: "数据研究员",
    sessionId: "child-data-session",
    globalSessionId: request.globalSessionId,
    parentSessionId: request.sessionId,
    chatId: request.chatId
  };
  const childKnowledge = {
    agentName: "制度研究员",
    sessionId: "child-policy-session",
    globalSessionId: request.globalSessionId,
    parentSessionId: "child-data-session",
    chatId: request.chatId
  };
  const citation = {
    docId: "doc-2026-policy",
    docKey: "finance-policy-v2.pdf",
    kbId: "kb-finance",
    docName: "财务报销制度（2026）",
    sourceAvailable: true,
    fragments: ["跨部门费用需完成负责人复核。"]
  };

  const events = [
    sseEvent({ ...root, type: "agent_start", content: {}, finished: false }),
    sseEvent({
      ...root,
      type: "routing_intent",
      content: {
        intent: "adaptive_team",
        status: "success",
        message: "需要联合数据与制度能力"
      },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "routing_decompose",
      content: {
        executionMode: "COMPLEX",
        subQuestions: ["分析本季度销售变化", "核对相关费用制度"]
      },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "react_step",
      content: {
        round: 1,
        action: "dispatch",
        actionLabel: "分派并行研究任务",
        status: "success",
        resultSummary: "已启动 2 个研究任务"
      },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "tool_call",
      content: { toolName: "invoke_parallel", args: { tasks: 2 } },
      toolCallId: "tool-parallel",
      finished: false
    }),
    sseEvent({
      ...root,
      type: "tool_result",
      content: {
        toolName: "invoke_parallel",
        status: "success",
        result: { accepted: 2 },
        durationMs: 42
      },
      toolCallId: "tool-parallel",
      finished: false
    }),
    sseEvent({
      ...childData,
      type: "subagent_exposed",
      content: {
        agentId: "agent-data",
        sessionId: "child-data-session",
        subagentId: "subagent-data",
        label: "数据研究员"
      },
      subagentId: "subagent-data",
      label: "数据研究员",
      finished: false
    }),
    sseEvent({ ...childData, type: "agent_start", content: {}, finished: false }),
    sseEvent({
      ...childData,
      type: "thinking",
      content: "正在查询销售数据。",
      isThinking: true,
      replyId: "child-data-reply",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...childData,
      type: "table",
      content: {
        columns: ["季度", "销售额"],
        rows: [
          ["Q1", 128],
          ["Q2", 113]
        ],
        totalRows: 2
      },
      replyId: "child-data-reply",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...childKnowledge,
      type: "subagent_exposed",
      content: {
        agentId: "agent-policy",
        sessionId: "child-policy-session",
        subagentId: "subagent-policy",
        label: "制度研究员"
      },
      subagentId: "subagent-policy",
      label: "制度研究员",
      finished: false
    }),
    sseEvent({
      ...childKnowledge,
      type: "thinking",
      content: "正在检索费用制度。",
      isThinking: true,
      replyId: "child-policy-reply",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...childKnowledge,
      type: "citation_document",
      content: citation,
      replyId: "child-policy-reply",
      modelCallIndex: 1,
      finished: false
    })
  ];

  if (options.done) {
    events.push(
      sseEvent({ ...childKnowledge, type: "done", content: {}, finished: false }),
      sseEvent({ ...childData, type: "done", content: {}, finished: false }),
      sseEvent({
        ...root,
        type: "thinking",
        content: "正在汇总跨来源结论。",
        isThinking: true,
        replyId: "root-final",
        modelCallIndex: 1,
        finished: false
      }),
      sseEvent({
        ...root,
        type: "text",
        content: "销售额环比下降，建议结合费用复核制度调整重点客户行动。",
        replyId: "root-final",
        modelCallIndex: 1,
        finished: false
      })
    );
    if (!options.omitRootDone) {
      events.push(
        sseEvent({
          ...root,
          type: "done",
          content: {
            mode: "agent",
            adaptiveTeam: true,
            completion: "complete",
            summary: "数据与制度来源均已完成。",
            sourceResults: [
              {
                sourceKind: "data",
                status: "answered",
                datasourceId: 8,
                datasourceName: "经营分析库"
              },
              {
                sourceKind: "knowledge",
                status: "answered",
                knowledgeNames: ["财务制度库"]
              }
            ]
          },
          finished: true
        })
      );
    }
    events.push("data: [DONE]\n\n");
  }

  return events.join("");
}

async function installFixture(
  page: Page,
  options: { done: boolean; omitRootDone?: boolean; responseDelayMs?: number }
) {
  await page.addInitScript(() => {
    const user = {
      token: "playwright-subagent-qa-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      path === "/api/agentScore/chat/completions/stream" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as StreamRequest;
      if (options.responseDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.responseDelayMs)
        );
      }
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: { "Cache-Control": "no-cache", Connection: "keep-alive" },
        body: buildAgentStream(body, options)
      });
      return;
    }
    await route.fulfill({ status: 200, json: envelope([]) });
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
});

test("capture preparing state", async ({ page }) => {
  await installFixture(page, { done: false, responseDelayMs: 5_000 });
  await page.goto("/ask-agent");
  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析销售变化并核对费用制度");
  await page.getByRole("button", { name: "发送" }).click();

  const preparing = page.getByRole("status", {
    name: /编排智能体思考中/
  });
  await expect(preparing).toBeVisible();
  await expect(
    page.locator(".xs-datahub-subagent-dag__canvas--ghost")
  ).toBeVisible();
  await expect(
    page.locator(".xs-datahub-subagent-dag__node--thinking")
  ).toContainText("正在规划执行步骤");
  await preparing.scrollIntoViewIfNeeded();
  await page.locator(".xs-datahub-subagent-dag").screenshot({
    path: "outputs/subagent-display-qa/after-thinking-focused.png",
    animations: "allow"
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await preparing.scrollIntoViewIfNeeded();
  await expect(
    page.locator(".xs-datahub-subagent-dag__node--thinking")
  ).toBeInViewport();
  await page.screenshot({
    path: "outputs/subagent-display-qa/after-thinking-390x844.png",
    animations: "allow",
    fullPage: true
  });

  await expect(
    page.getByRole("heading", { name: "编排执行轨迹" })
  ).toBeVisible();
});

test("capture running state", async ({ page }) => {
  await installFixture(page, { done: false });
  await page.goto("/ask-agent");
  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析销售变化并核对费用制度");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByRole("heading", { name: "编排执行轨迹" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "编排流程" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "智能体执行卡" })).toHaveCount(0);
  await expect(page.getByText("Agent 正在思考")).toHaveCount(0);
  await page.waitForTimeout(1200);

  await page.getByRole("heading", { name: "编排流程" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "outputs/subagent-display-qa/after-running-main.png",
    animations: "allow",
    fullPage: true
  });

  await page.getByRole("button", { name: "打开 数据研究员执行详情" }).click();
  const drawer = page.getByRole("dialog", { name: "子智能体执行详情" });
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: "outputs/subagent-display-qa/after-running-drawer-detail.png",
    animations: "allow"
  });
});

test("capture done state", async ({ page }) => {
  await installFixture(page, { done: true, omitRootDone: true });
  await page.goto("/ask-agent");
  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析销售变化并核对费用制度");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByRole("heading", { name: "智能编排完成" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "编排流程" })).toBeVisible();
  await expect(page.locator(".xs-datahub-execution")).toHaveAttribute(
    "data-status",
    "done"
  );
  await expect(
    page.locator(".xs-datahub-execution [aria-label='运行中']")
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "智能体执行卡" })).toHaveCount(0);
  await expect(page.getByText("Agent 思考完成")).toHaveCount(0);
  await page.waitForTimeout(800);

  await page.getByRole("heading", { name: "编排流程" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "outputs/subagent-display-qa/after-done-main.png",
    animations: "allow",
    fullPage: true
  });

  await page.getByRole("button", { name: "打开 数据研究员执行详情" }).click();
  const drawer = page.getByRole("dialog", { name: "子智能体执行详情" });
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: "outputs/subagent-display-qa/after-done-drawer-detail.png",
    animations: "allow"
  });
});
