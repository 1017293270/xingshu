import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import type { QueryAsset, QueryExecution } from "../../src/types/analytics";
import type { DashboardRecord, DashboardSchema } from "../../src/types/dashboardStudio";

type StreamRequest = {
  message: string;
  sessionId: string;
  globalSessionId: string;
  chatId: string;
  chatMode: "ask" | "rag" | "document_lookup" | "agent";
};

type DataHubFixtureOptions = {
  buildAgentResponse?: (request: StreamRequest) => string;
  rejectScopedHistoryEnsure?: boolean;
  rejectAllHistoricalEnsure?: boolean;
  historyResponseDelayMs?: number;
};

type FixtureState = {
  streamRequests: StreamRequest[];
  ensuredArtifacts: Array<{
    sessionId: string;
    chatId: string;
    resultSessionId?: string;
  }>;
  favoriteRequests: Array<{ askRunId: string; name?: string }>;
  citationPreviewHeaders: Array<{ authorization: string | null; spaceId: string | null }>;
  favoriteAsset?: QueryAsset;
  dashboardRecord?: DashboardRecord;
};

const expectedStreamRequestKeys = [
  "chatId",
  "chatMode",
  "globalSessionId",
  "message",
  "sessionId"
];
const incompleteHistoryQueryMessage =
  "历史问数缺少完整可执行查询，请重新问数后收藏";

function envelope(data: unknown) {
  return { code: 200, message: "datahub chat flow fixture", data };
}

function createFavoriteAsset(name: string): QueryAsset {
  const timestamp = "2026-07-28T08:00:00.000Z";
  return {
    id: "asset-playwright-revenue",
    name,
    originalQuestion: "分析销售变化并核对费用制度",
    resolvedQuestion: "统计本月收入",
    datasourceId: 8,
    ownerUserId: 1,
    visibility: "PRIVATE",
    stableVersionId: "version-playwright-revenue",
    status: "ACTIVE",
    stableVersion: {
      id: "version-playwright-revenue",
      versionNo: 1,
      resolvedQuestion: "统计本月收入",
      engine: "CUBE",
      parameters: [],
      outputs: [
        {
          outputKey: "revenue",
          label: "月度收入",
          columns: [
            { columnId: "quarter-id", key: "quarter", label: "季度" },
            { columnId: "revenue-id", key: "revenue", label: "销售额", type: "number" }
          ]
        }
      ],
      schemaHash: "playwright-revenue-schema",
      status: "VALIDATED",
      createdAt: timestamp
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createFavoritePreview(asset: QueryAsset): QueryExecution {
  return {
    id: "execution-playwright-revenue",
    assetId: asset.id,
    versionId: asset.stableVersionId,
    status: "SUCCESS",
    triggerType: "PREVIEW",
    durationMs: 18,
    createdAt: "2026-07-28T08:01:00.000Z",
    outputs: [
      {
        outputKey: "revenue",
        columns: asset.stableVersion?.outputs[0]?.columns ?? [],
        rows: [
          { quarter: "Q1", revenue: 128 },
          { quarter: "Q2", revenue: 113 }
        ],
        totalRows: 2,
        updatedAt: "2026-07-28T08:01:00.000Z"
      }
    ]
  };
}

function sseEvent(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function buildAskStream(request: StreamRequest) {
  const resolvedQuestion =
    request.message === "本月收入是多少？" ? "统计本月收入" : request.message;
  const root = {
    agentName: "问数智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };

  return [
    sseEvent({
      ...root,
      type: "thinking",
      content: "正在读取经营指标。",
      isThinking: true,
      replyId: "ask-thinking",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "data_source_selected",
      content: { datasourceId: 8, datasourceName: "经营分析库" },
      finished: false
    }),
    // A child-agent terminal event must not terminate the user's root stream.
    sseEvent({
      ...root,
      sessionId: "child-session-should-not-become-root",
      parentSessionId: request.sessionId,
      type: "thinking",
      content: "子任务已完成。",
      finished: true
    }),
    sseEvent({
      ...root,
      type: "text",
      content: "本月收入为 **128 万元**。",
      replyId: "ask-answer",
      modelCallIndex: 2,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "table",
      content: {
        annotation: {
          measures: {
            "Revenue.revenue": {
              title: "月度收入统计，记录各月收入 收入",
              shortTitle: "收入"
            }
          }
        },
        columns: [
          { name: "month", title: "月份" },
          { name: "revenue", title: "收入", type: "number" }
        ],
        rows: [
          { month: "6月", revenue: 120 },
          { month: "7月", revenue: 128 }
        ],
        totalRows: 2,
        source: "cube"
      },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "ask_artifact",
      content: {
        askRunId: "ask-run-playwright",
        resolvedQuestion,
        canFavorite: true
      },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "done",
      content: { mode: "ask", summary: "本月收入为 128 万元。" },
      finished: true
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function buildKnowledgeStream(request: StreamRequest) {
  const root = {
    agentName: "问知智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };
  const citation = {
    docId: "doc-2026-policy",
    docKey: "finance-policy-v2.pdf",
    kbId: "kb-finance",
    docName: "财务报销制度（2026）",
    sourceAvailable: true,
    fragments: ["单笔差旅费超过 5000 元时，需要部门负责人复核。"]
  };

  return [
    sseEvent({
      ...root,
      type: "thinking",
      content: "正在检索并复核制度原文。",
      isThinking: true,
      replyId: "rag-thinking",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "text",
      content:
        "根据制度，**单笔差旅费超过 5000 元需复核**。\n\n![制度截图](/fixtures/source/contract-preview.svg)\n\n<script>window.__unsafeHtmlExecuted = true</script>",
      replyId: "rag-answer",
      modelCallIndex: 2,
      finished: false
    }),
    sseEvent({ ...root, type: "citation_document", content: citation, finished: false }),
    // The UI must deduplicate repeated citations by docId + docKey.
    sseEvent({
      ...root,
      type: "citation_document",
      content: { ...citation, fragments: ["重复引用不应生成第二张卡片。"] },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "done",
      content: { mode: "rag", askKnowledge: true },
      finished: true
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function buildDocumentLookupStream(request: StreamRequest) {
  const root = {
    agentName: "找文档智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };
  const document = {
    docId: "doc-sales-policy",
    docKey: "sales-policy-2026.pdf",
    kbId: "kb-sales",
    docName: "销售管理制度（2026）",
    contentType: "application/pdf",
    docStatus: "indexed",
    sourceAvailable: true
  };

  return [
    sseEvent({ ...root, type: "agent_start", content: {}, finished: false }),
    sseEvent({
      ...root,
      type: "thinking",
      content: "正在定位可打开的最新版制度原文。",
      isThinking: true,
      replyId: "lookup-thinking",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "text",
      content: "已找到 1 份匹配文档。",
      replyId: "lookup-answer",
      modelCallIndex: 2,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "document_url",
      content: document,
      replyId: "lookup-answer",
      modelCallIndex: 2,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "done",
      content: {
        mode: "document_lookup",
        documentLookup: true,
        documentSelectionMode: "single",
        documentResults: [document],
        summary: "已找到 1 份匹配文档。"
      },
      finished: true
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function buildFlatDocumentAgentStream(request: StreamRequest) {
  const root = {
    agentName: "找文档智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };
  const activities = [
    ["understand", "理解文档需求", 1_000],
    ["locate", "定位相关文档", 33_000],
    ["verify", "确认相关文档", 5_000],
    ["result", "确认文档结果", 2_000]
  ] as const;
  const document = {
    docId: "doc-meishan-contract",
    docKey: "meishan-contract.pdf",
    kbId: "kb-contract",
    docName: "眉山采购合同.pdf",
    sourceAvailable: true
  };

  return [
    sseEvent({ ...root, type: "agent_start", content: {}, finished: false }),
    ...activities.map(([activityId, label, durationMs], index) =>
      sseEvent({
        ...root,
        type: "activity",
        content: {
          activityId,
          kind: "model",
          label,
          status: "success",
          durationMs,
          summary: `${label}已完成`
        },
        timestamp: `2026-08-04T12:18:${47 + index}.000+08:00`,
        finished: false
      })
    ),
    sseEvent({
      ...root,
      type: "text",
      content: "已定位并确认一份直接匹配的合同文档。",
      replyId: "document-agent-answer",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "document_url",
      content: document,
      replyId: "document-agent-answer",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "done",
      content: {
        mode: "agent",
        completion: "complete",
        summary: "已定位到 1 份相关文档。"
      },
      finished: true
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function buildAgentStream(request: StreamRequest) {
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

  return [
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
        agentId: "ask-data",
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
        rows: [["Q1", 128], ["Q2", 113]],
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
    }),
    sseEvent({
      ...childKnowledge,
      type: "done",
      content: {},
      finished: false
    }),
    sseEvent({
      ...childData,
      type: "done",
      content: {},
      finished: false
    }),
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
    }),
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
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function buildModelActivityAgentStream(request: StreamRequest) {
  const root = {
    agentName: "编排智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };
  const child = {
    agentName: "问数智能体",
    sessionId: "child-model-activity",
    globalSessionId: request.globalSessionId,
    parentSessionId: request.sessionId,
    chatId: request.chatId
  };

  return [
    sseEvent({ ...root, type: "agent_start", content: {}, finished: false }),
    sseEvent({
      ...root,
      type: "routing_intent",
      content: {
        intent: "ask_data",
        status: "success",
        message: "交由问数智能体分析"
      },
      finished: false
    }),
    sseEvent({
      ...child,
      type: "subagent_exposed",
      content: {
        agentId: "ask-data",
        sessionId: child.sessionId,
        subagentId: "subagent-model-activity",
        label: child.agentName
      },
      subagentId: "subagent-model-activity",
      label: child.agentName,
      timestamp: "2026-07-31T16:00:32.000+08:00",
      finished: false
    }),
    sseEvent({
      ...child,
      type: "thinking",
      content: {
        activityId: "activity-model-analysis",
        kind: "model",
        action: "model_analysis",
        label: "理解数据问题",
        status: "running",
        summary: null,
        startedAt: "2026-07-31T16:00:32.283+08:00",
        completedAt: null,
        durationMs: null
      },
      isThinking: true,
      replyId: "activity-reply-1",
      modelCallIndex: 1,
      timestamp: "2026-07-31T16:00:32.283+08:00",
      finished: false
    }),
    sseEvent({
      ...child,
      type: "thinking",
      content: {
        activityId: "activity-model-analysis",
        kind: "model",
        action: "model_analysis",
        label: "理解数据问题",
        status: "success",
        summary: "已识别查询口径、时间范围与目标指标。",
        startedAt: "2026-07-31T16:00:32.283+08:00",
        completedAt: "2026-07-31T16:00:35.733+08:00",
        durationMs: 3450
      },
      isThinking: true,
      replyId: "activity-reply-1",
      modelCallIndex: 1,
      timestamp: "2026-07-31T16:00:35.733+08:00",
      finished: false
    }),
    sseEvent({
      ...child,
      type: "thinking",
      content: {
        activityId: "activity-query-plan",
        kind: "model",
        action: "model_plan",
        label: "生成查询方案",
        status: "running",
        summary: null,
        startedAt: "2026-07-31T16:00:35.800+08:00",
        completedAt: null,
        durationMs: null
      },
      isThinking: true,
      replyId: "activity-reply-2",
      modelCallIndex: 2,
      timestamp: "2026-07-31T16:00:35.800+08:00",
      finished: false
    }),
    sseEvent({
      ...child,
      type: "thinking",
      content: {
        activityId: "activity-query-plan",
        kind: "model",
        action: "model_plan",
        label: "生成查询方案",
        status: "success",
        summary: "查询方案已生成，准备执行数据检索。",
        startedAt: "2026-07-31T16:00:35.800+08:00",
        completedAt: "2026-07-31T16:00:38.000+08:00",
        durationMs: 2200
      },
      isThinking: true,
      replyId: "activity-reply-2",
      modelCallIndex: 2,
      timestamp: "2026-07-31T16:00:38.000+08:00",
      finished: false
    }),
    sseEvent({
      ...child,
      type: "done",
      content: { mode: "ask" },
      timestamp: "2026-07-31T16:00:38.100+08:00",
      finished: false
    }),
    sseEvent({
      ...root,
      type: "text",
      content: "问数任务已完成。",
      replyId: "root-model-activity",
      modelCallIndex: 1,
      timestamp: "2026-07-31T16:00:38.200+08:00",
      finished: false
    }),
    sseEvent({
      ...root,
      type: "done",
      content: {
        mode: "agent",
        adaptiveTeam: true,
        completion: "complete"
      },
      timestamp: "2026-07-31T16:00:38.300+08:00",
      finished: true
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function buildMarkdownOnlyAskAgentStream(request: StreamRequest) {
  const root = {
    agentName: "编排智能体",
    sessionId: request.sessionId,
    globalSessionId: request.globalSessionId,
    chatId: request.chatId
  };
  const child = {
    agentName: "问数智能体",
    sessionId: "child-consultation-ranking",
    globalSessionId: request.globalSessionId,
    parentSessionId: request.sessionId,
    chatId: request.chatId
  };
  const markdownTable = [
    "按咨询记录数据排名前十的咨询对象如下：",
    "",
    "| 排名 | 咨询对象 | 咨询量 |",
    "| --- | --- | ---: |",
    "| 1 | 小治 | 456 |"
  ].join("\n");

  return [
    sseEvent({ ...root, type: "agent_start", content: {}, finished: false }),
    sseEvent({
      ...child,
      type: "subagent_exposed",
      content: {
        agentId: "ask-data",
        sessionId: child.sessionId,
        subagentId: "subagent-consultation-ranking",
        label: "问数智能体"
      },
      subagentId: "subagent-consultation-ranking",
      label: "问数智能体",
      finished: false
    }),
    sseEvent({
      ...child,
      type: "done",
      content: {},
      finished: false
    }),
    sseEvent({
      ...root,
      type: "text",
      content: markdownTable,
      replyId: "root-final",
      modelCallIndex: 1,
      finished: false
    }),
    sseEvent({
      ...root,
      type: "ask_artifact",
      content: {
        askRunId: "ask-run-consultation-ranking",
        resolvedQuestion: "咨询数前十的社区分布",
        canFavorite: true
      },
      finished: false
    }),
    sseEvent({
      ...root,
      type: "done",
      content: {
        mode: "agent",
        adaptiveTeam: true,
        completion: "complete",
        sourceResults: [{ sourceKind: "data", status: "answered" }]
      },
      finished: true
    }),
    "data: [DONE]\n\n"
  ].join("");
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    const user = {
      token: "playwright-datahub-chat-token",
      userId: 1,
      username: "张三",
      isAdmin: true
    };
    window.localStorage.setItem("xingshu_datahub_token", user.token);
    window.localStorage.setItem("xingshu_datahub_user", JSON.stringify(user));
    window.localStorage.setItem("xingshu_datahub_space_id", "1");
  });
}

async function installDataHubFixture(
  page: Page,
  options: DataHubFixtureOptions = {}
) {
  const state: FixtureState = {
    streamRequests: [],
    ensuredArtifacts: [],
    favoriteRequests: [],
    citationPreviewHeaders: []
  };

  await page.context().route("**/fixtures/source/finance-policy-v2.pdf", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "%PDF-1.4\n% Playwright source fixture\n"
    });
  });
  await page.context().route("**/fixtures/source/sales-policy-2026.pdf", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "%PDF-1.4\n% Playwright sales policy source fixture\n"
    });
  });
  await page.context().route("**/fixtures/source/contract-preview.svg", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: [
        '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240">',
        '<rect width="720" height="240" rx="18" fill="#f3f8ff"/>',
        '<rect x="32" y="30" width="656" height="180" rx="12" fill="#fff" stroke="#b9d3f7"/>',
        '<text x="64" y="88" fill="#0d2a52" font-size="26" font-family="sans-serif">制度原文图片预览</text>',
        '<text x="64" y="135" fill="#41658f" font-size="20" font-family="sans-serif">单笔差旅费超过 5000 元需复核</text>',
        '<path d="M64 166h420" stroke="#8db7ef" stroke-width="10" stroke-linecap="round"/>',
        "</svg>"
      ].join("")
    });
  });

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      path === "/api/agentScore/chat/completions/stream" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as StreamRequest;
      state.streamRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        },
        body:
          body.chatMode === "rag"
            ? buildKnowledgeStream(body)
            : body.chatMode === "document_lookup"
              ? buildDocumentLookupStream(body)
              : body.chatMode === "agent"
                ? (options.buildAgentResponse ?? buildAgentStream)(body)
                : buildAskStream(body)
      });
      return;
    }

    if (path === "/api/v1/chat/chart-plan" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        tables?: Array<{ columns?: Array<{ key?: string }> }>;
      };
      const columnKeys = new Set(
        body.tables?.flatMap((table) => table.columns?.map((column) => column.key ?? "") ?? []) ?? []
      );
      const isMonthlyRevenue = columnKeys.has("month") && columnKeys.has("revenue");
      await route.fulfill({
        json: envelope(
          isMonthlyRevenue
            ? {
                chartable: true,
                reason: "月份维度与收入指标适合趋势图。",
                chartType: "line",
                allowedTypes: ["line", "bar"],
                title: "月度收入趋势",
                tableIndex: 0,
                dimensionKey: "month",
                metricKeys: ["revenue"]
              }
            : {
                chartable: true,
                reason: "季度维度与销售额指标适合趋势图。",
                chartType: "line",
                allowedTypes: ["line", "bar"],
                title: "本季度销售趋势",
                tableIndex: 0,
                dimensionKey: "季度",
                metricKeys: ["销售额"]
              }
        )
      });
      return;
    }

    if (path === "/api/v1/query-artifacts/ensure" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        sessionId: string;
        chatId: string;
        resultSessionId?: string;
      };
      state.ensuredArtifacts.push(body);
      const isOriginalHistoricalQuery =
        body.sessionId === "history-agent-session" &&
        body.chatId === "history-agent-chat";
      if (
        (options.rejectScopedHistoryEnsure && body.resultSessionId) ||
        (options.rejectAllHistoricalEnsure && isOriginalHistoricalQuery)
      ) {
        await route.fulfill({
          json: {
            code: 400,
            message: incompleteHistoryQueryMessage,
            data: null
          }
        });
        return;
      }
      await route.fulfill({
        json: envelope({
          askRunId: "ask-run-playwright",
          resolvedQuestion: "统计本月收入",
          canFavorite: true
        })
      });
      return;
    }

    if (path === "/api/analytics/query-assets/from-ask" && request.method() === "POST") {
      const body = request.postDataJSON() as { askRunId: string; name?: string };
      state.favoriteRequests.push(body);
      state.favoriteAsset = createFavoriteAsset(body.name || "统计本月收入");
      await route.fulfill({
        json: envelope(state.favoriteAsset)
      });
      return;
    }

    if (path === "/api/analytics/query-assets" && request.method() === "GET") {
      await route.fulfill({
        json: envelope(state.favoriteAsset ? [state.favoriteAsset] : [])
      });
      return;
    }

    if (
      state.favoriteAsset &&
      path === `/api/analytics/query-assets/${state.favoriteAsset.id}/preview` &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        json: envelope(createFavoritePreview(state.favoriteAsset))
      });
      return;
    }

    if (path === "/api/analytics/dashboards/save" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        id: string;
        schema: DashboardSchema;
        visibility?: "PRIVATE" | "SPACE";
      };
      const timestamp = new Date().toISOString();
      state.dashboardRecord = {
        id: body.id,
        status: "draft",
        revision: state.dashboardRecord ? state.dashboardRecord.revision + 1 : 1,
        visibility: body.visibility ?? state.dashboardRecord?.visibility ?? "PRIVATE",
        schema: structuredClone(body.schema),
        versions: state.dashboardRecord?.versions ?? [],
        createdAt: state.dashboardRecord?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
      await route.fulfill({ json: envelope(state.dashboardRecord) });
      return;
    }

    const dashboardEditorMatch = path.match(
      /^\/api\/analytics\/dashboards\/([^/]+)\/editor-data$/
    );
    if (
      dashboardEditorMatch &&
      request.method() === "GET" &&
      state.dashboardRecord?.id === dashboardEditorMatch[1]
    ) {
      await route.fulfill({
        json: envelope({
          record: state.dashboardRecord,
          datasets: {},
          moduleStatuses: {}
        })
      });
      return;
    }

    if (
      path === "/api/ai/rag/kb/source_document_preview" &&
      request.method() === "GET"
    ) {
      state.citationPreviewHeaders.push({
        authorization: request.headers()["authorization"] ?? null,
        spaceId: request.headers()["x-space-id"] ?? null
      });
      expect(url.searchParams.get("space_id")).toBe("1");
      const kbId = url.searchParams.get("kb_id");
      const docKey = url.searchParams.get("doc_key");
      expect([
        ["kb-finance", "finance-policy-v2.pdf"],
        ["kb-sales", "sales-policy-2026.pdf"]
      ]).toContainEqual([kbId, docKey]);
      await route.fulfill({
        json: envelope({
          mode: "direct",
          url:
            docKey === "sales-policy-2026.pdf"
              ? `${url.origin}/fixtures/source/sales-policy-2026.pdf`
              : `${url.origin}/fixtures/source/finance-policy-v2.pdf`
        })
      });
      return;
    }

    if (path === "/api/v1/chat/sessions/list" && request.method() === "POST") {
      await route.fulfill({
        json: envelope([
          {
            id: 901,
            sessionId: "history-rag-session",
            title: "差旅费复核制度",
            chatMode: "rag",
            createdAt: "2026-07-28T08:00:00.000Z",
            updatedAt: "2026-07-28T08:05:00.000Z"
          },
          {
            id: 911,
            sessionId: "history-agent-session",
            title: "销售变化分析",
            chatMode: "agent",
            createdAt: "2026-07-28T09:00:00.000Z",
            updatedAt: "2026-07-28T09:05:00.000Z"
          },
          {
            id: 921,
            sessionId: "history-document-session",
            title: "查找销售管理制度",
            chatMode: "document_lookup",
            createdAt: "2026-07-28T10:00:00.000Z",
            updatedAt: "2026-07-28T10:05:00.000Z"
          }
        ])
      });
      return;
    }

    if (path === "/api/v1/chat/messages/list" && request.method() === "POST") {
      if (options.historyResponseDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.historyResponseDelayMs));
      }
      const body = request.postDataJSON() as { sessionId: string };
      const messageBySession = {
        "history-rag-session": {
          id: 902,
          chatId: "history-rag-chat",
          content: "差旅费超过多少需要复核？",
          createdAt: "2026-07-28T08:00:00.000Z"
        },
        "history-agent-session": {
          id: 912,
          chatId: "history-agent-chat",
          content: "分析销售变化",
          createdAt: "2026-07-28T09:00:00.000Z"
        },
        "history-document-session": {
          id: 922,
          chatId: "history-document-chat",
          content: "帮我找到最新版销售管理制度",
          createdAt: "2026-07-28T10:00:00.000Z"
        }
      } as const;
      const message = messageBySession[body.sessionId as keyof typeof messageBySession];
      await route.fulfill({
        json: envelope(
          message
            ? [
                {
                  ...message,
                  sessionId: body.sessionId,
                  role: "user",
                  seqNum: 1
                }
              ]
            : []
        )
      });
      return;
    }

    if (path === "/api/v1/chat/events/list" && request.method() === "POST") {
      if (options.historyResponseDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.historyResponseDelayMs));
      }
      const body = request.postDataJSON() as { sessionId: string };
      const sessionId = body.sessionId;
      const chatId =
        sessionId === "history-agent-session"
          ? "history-agent-chat"
          : sessionId === "history-document-session"
            ? "history-document-chat"
            : "history-rag-chat";
      const nestedEvent = (
        id: number,
        seqNum: number,
        event: Record<string, unknown>
      ) => ({
        id,
        sessionId,
        globalSessionId: sessionId,
        chatId,
        seqNum,
        type: "persisted_event",
        data: JSON.stringify({
          sessionId,
          globalSessionId: sessionId,
          chatId,
          finished: false,
          ...event
        }),
        createdAt: `2026-07-28T08:0${seqNum}:00.000Z`
      });
      const citation = {
        docId: "doc-2026-policy",
        docKey: "finance-policy-v2.pdf",
        kbId: "kb-finance",
        docName: "财务报销制度（2026）",
        sourceAvailable: true,
        fragments: ["单笔差旅费超过 5000 元时，需要部门负责人复核。"]
      };
      const document = {
        docId: "doc-sales-policy",
        docKey: "sales-policy-2026.pdf",
        kbId: "kb-sales",
        docName: "销售管理制度（2026）",
        contentType: "application/pdf",
        docStatus: "indexed",
        sourceAvailable: true
      };

      const events =
        sessionId === "history-agent-session"
          ? [
              nestedEvent(913, 2, {
                agentName: "编排智能体",
                type: "agent_start",
                content: {}
              }),
              nestedEvent(914, 3, {
                agentName: "编排智能体",
                type: "routing_decompose",
                content: {
                  executionMode: "COMPLEX",
                  subQuestions: ["恢复销售数据分析"]
                }
              }),
              nestedEvent(915, 4, {
                agentName: "数据研究员",
                type: "subagent_exposed",
                content: {
                  agentId: "history-data-agent",
                  sessionId: "history-child-data",
                  subagentId: "history-subagent-data",
                  label: "数据研究员"
                },
                sessionId: "history-child-data",
                parentSessionId: "history-agent-session",
                subagentId: "history-subagent-data",
                label: "数据研究员"
              }),
              nestedEvent(916, 5, {
                agentName: "数据研究员",
                type: "thinking",
                content: "历史中的子 Agent 正在查询销售数据。",
                sessionId: "history-child-data",
                parentSessionId: "history-agent-session",
                replyId: "history-child-reply",
                modelCallIndex: 1
              }),
              nestedEvent(917, 6, {
                agentName: "数据研究员",
                type: "table",
                content: {
                  columns: ["季度", "销售额"],
                  rows: [["Q1", 128], ["Q2", 113]],
                  totalRows: 2
                },
                sessionId: "history-child-data",
                parentSessionId: "history-agent-session",
                replyId: "history-child-reply",
                modelCallIndex: 1
              }),
              nestedEvent(918, 7, {
                agentName: "数据研究员",
                type: "done",
                content: {},
                sessionId: "history-child-data",
                parentSessionId: "history-agent-session"
              }),
              nestedEvent(919, 8, {
                agentName: "编排智能体",
                type: "text",
                content: "历史数据结论：销售额环比下降。",
                replyId: "history-root-reply",
                modelCallIndex: 1
              }),
              nestedEvent(920, 9, {
                agentName: "编排智能体",
                type: "done",
                content: {
                  mode: "agent",
                  adaptiveTeam: true,
                  completion: "complete",
                  summary: "历史编排已完成。"
                },
                finished: true
              })
            ]
          : sessionId === "history-document-session"
            ? [
                nestedEvent(923, 2, {
                  agentName: "找文档智能体",
                  type: "agent_start",
                  content: {}
                }),
                nestedEvent(924, 3, {
                  agentName: "找文档智能体",
                  type: "thinking",
                  content: "正在恢复文档定位过程。",
                  replyId: "history-document-reply",
                  modelCallIndex: 1
                }),
                nestedEvent(925, 4, {
                  agentName: "找文档智能体",
                  type: "document_url",
                  content: document,
                  replyId: "history-document-reply",
                  modelCallIndex: 1
                }),
                nestedEvent(926, 5, {
                  agentName: "找文档智能体",
                  type: "done",
                  content: {
                    mode: "document_lookup",
                    documentLookup: true,
                    documentSelectionMode: "single",
                    documentResults: [document],
                    summary: "已找到 1 份匹配文档。"
                  },
                  finished: true
                })
              ]
            : [
                nestedEvent(903, 2, {
                  agentName: "问知智能体",
                  type: "thinking",
                  content: "正在检索并复核制度原文。"
                }),
                nestedEvent(904, 3, {
                  agentName: "问知智能体",
                  type: "text",
                  content: "根据制度，**单笔差旅费超过 5000 元需复核**。"
                }),
                nestedEvent(905, 4, {
                  agentName: "问知智能体",
                  type: "citation_document",
                  content: citation
                }),
                nestedEvent(906, 5, {
                  agentName: "问知智能体",
                  type: "citation_document",
                  content: citation
                }),
                nestedEvent(907, 6, {
                  agentName: "问知智能体",
                  type: "done",
                  content: { mode: "rag", askKnowledge: true },
                  finished: true
                })
              ];

      await route.fulfill({
        json: envelope(events)
      });
      return;
    }

    await route.fulfill({ status: 200, json: envelope([]) });
  });

  return state;
}

function expectStrictStreamRequest(
  request: StreamRequest,
  mode: StreamRequest["chatMode"]
) {
  expect(Object.keys(request).sort()).toEqual(expectedStreamRequestKeys);
  expect(request.chatMode).toBe(mode);
  expect(request.sessionId).toMatch(/^session-/);
  expect(request.chatId).toMatch(/^chat-/);
  expect(request.globalSessionId).toBe(request.sessionId);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  ).toBe(true);
}

async function scrollAnalysisWorkspaceToTop(page: Page) {
  await page.locator(".analysis-workspace").evaluate((workspace) => {
    workspace.scrollTo({ top: 0, behavior: "auto" });
  });
}

async function installStoppableAgentStream(page: Page) {
  await page.addInitScript(() => {
    type StreamWindow = Window & { __agentStreamAborted?: boolean };

    class StoppableStreamXhr {
      responseText = "";
      status = 200;
      onprogress: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onloadend: (() => void) | null = null;

      open() {}

      setRequestHeader() {}

      send(body?: Document | XMLHttpRequestBodyInit | null) {
        const request = JSON.parse(String(body)) as StreamRequest;
        const root = {
          agentName: "编排智能体",
          sessionId: request.sessionId,
          globalSessionId: request.globalSessionId,
          chatId: request.chatId
        };
        const child = {
          agentName: "问数智能体",
          sessionId: "child-stoppable-agent",
          globalSessionId: request.globalSessionId,
          parentSessionId: request.sessionId,
          chatId: request.chatId
        };
        const append = (value: Record<string, unknown>) => {
          this.responseText += `data: ${JSON.stringify(value)}\n\n`;
        };

        globalThis.setTimeout(() => {
          append({ ...root, type: "agent_start", content: {}, finished: false });
          append({
            ...child,
            type: "subagent_exposed",
            content: {
              agentId: "ask-data",
              sessionId: child.sessionId,
              subagentId: "subagent-stoppable-agent",
              label: child.agentName
            },
            subagentId: "subagent-stoppable-agent",
            label: child.agentName,
            finished: false
          });
          append({
            ...child,
            type: "activity",
            content: {
              activityId: "query-still-running",
              kind: "tool",
              label: "执行数据查询",
              status: "running",
              startedAt: new Date().toISOString()
            },
            finished: false
          });
          this.onprogress?.();
        }, 30);
      }

      abort() {
        (window as StreamWindow).__agentStreamAborted = true;
        this.onabort?.();
      }
    }

    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      value: StoppableStreamXhr
    });
  });
}

async function expandQueryProcess(page: Page) {
  const query = page.getByRole("region", { name: "查询过程" });
  const toggle = query.getByRole("button", { name: /查询过程/ });
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  return query;
}

async function expandQueryTables(page: Page) {
  const query = await expandQueryProcess(page);
  const results = query.getByRole("region", { name: "查询结果", exact: true });
  const more = results.getByRole("button", { name: /^查看其余/ });
  if (await more.count()) await more.click();
  for (const button of await results.getByRole("button", { name: /^查看全部 \d+ 行$/ }).all()) await button.click();
  return results;
}

async function expandExecution(page: Page, title = "智能编排执行") {
  const query = await expandQueryProcess(page);
  const panel = query.getByRole("region", { name: title, exact: true });
  const toggle = panel.locator(".xs-datahub-execution__heading");
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  await expect(panel).toBeVisible();
  return panel;
}

test.beforeEach(async ({ page }) => {
  await installAuthenticatedSession(page);
  await page.setViewportSize({ width: 1672, height: 941 });
});

test("returned query tables preview inside query process while the summary stays visible", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async (text: string) => { (window as Window & { __copiedAnswer?: string }).__copiedAnswer = text; } }
    });
  });
  await installDataHubFixture(page, {
    buildAgentResponse: (request) => {
      const root = { sessionId: request.sessionId, globalSessionId: request.sessionId,
        chatId: request.chatId, agentName: "编排智能体" };
      const events: Record<string, unknown>[] = [{ ...root, type: "agent_start" },
        { ...root, type: "thinking", isThinking: true, content: "分别查询采购合同和服务合同明细。" }];
      for (const [index, label] of ["采购合同", "服务合同"].entries()) {
        const child = { ...root, sessionId: `${request.sessionId}-query-${index}`,
          parentSessionId: request.sessionId, agentName: "问数智能体" };
        events.push(
          { ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, label } },
          { ...child, type: "data_source_selected", content: { datasourceId: 8, datasourceName: "合同系统" } },
          { ...child, type: "table", content: { tableComment: label, source: "cube", totalRows: 2,
            columns: [{ name: "name", title: "合同名称" }, { name: "supplier", title: "供应商" },
              { name: "amount", title: "合同金额（元）", type: "number" }],
            rows: [{ name: `${label} A`, supplier: "供应商 A", amount: 128000 },
              { name: `${label} B`, supplier: "供应商 B", amount: 96000 }] } },
          { ...child, type: "done", content: { mode: "ask" } }
        );
      }
      events.push({ ...root, type: "done", finished: true, content: { mode: "agent", adaptiveTeam: true } });
      return events.map(sseEvent).join("") + "data: [DONE]\n\n";
    }
  });
  await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({
    json: envelope({ chartable: false, reason: "合同明细以表格展示" })
  }));
  await page.goto("/ask-agent");
  await page.getByRole("textbox", { name: "命令输入" }).fill("查询采购合同和服务合同明细");
  await page.getByRole("button", { name: "发送" }).click();
  const answer = page.getByLabel("正式回答", { exact: true });
  await expect(answer).toBeVisible();
  const result = page.getByRole("region", { name: "分析结果", exact: true });
  await expect(result.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^查询过程/ })).toHaveAttribute("aria-expanded", "true");
  const query = await expandQueryProcess(page);
  const tables = query.getByRole("region", { name: "查询结果", exact: true });
  await expect(tables.locator('[data-result-kind="table"]')).toHaveCount(2);
  await expect(tables.getByRole("table")).toHaveCount(2);
  await expect(tables.getByRole("cell", { name: "服务合同 B", exact: true })).toBeVisible();
  await expect(tables.getByRole("button", { name: "下载表格" })).toHaveCount(2);
  await tables.getByRole("button", { name: "复制表格" }).nth(1).click();
  const copied = await page.evaluate(() => (window as Window & { __copiedAnswer?: string }).__copiedAnswer ?? "");
  expect(copied).toContain("服务合同 B");
  expect(copied).toContain("96000");
  const downloadPromise = page.waitForEvent("download");
  await tables.getByRole("button", { name: "下载表格" }).nth(1).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  expect(await download.failure()).toBeNull();
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("合同名称");
  expect(csv).toContain("服务合同 B");
  expect(csv).toContain("96000");
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 1400 : 1200 });
    await expectNoHorizontalOverflow(page);
    await query.scrollIntoViewIfNeeded();
    await expect(answer).toBeVisible();
    await page.screenshot({ path: `outputs/query-process/expanded-${width}.png`, animations: "disabled", fullPage: true });
    if (width === 1672) {
      await page.locator(".analysis-card").screenshot({ path: "outputs/query-process/expanded-card-1672.png", animations: "disabled" });
      await tables.screenshot({ path: "outputs/query-process/dropdown-expanded-1672.png", animations: "disabled" });
    }
  }
  await query.getByRole("button", { name: /^查询过程/ }).click();
  await expect(tables).toBeHidden();
  await expect(answer).toBeVisible();
  await query.getByRole("button", { name: /^查询过程/ }).click();
  await expect(tables.getByRole("table")).toHaveCount(2);

});

test("streaming child query results preview mixed evidence before root completion", async ({ page }) => {
  await installDataHubFixture(page);
  await page.addInitScript(() => {
    type FixtureWindow = Window & { __finishQueryFixture?: () => void; __advanceQueryFixture?: () => void; __returnQueryFixture?: () => void };
    class QueryResultStreamXhr {
      responseText = "";
      status = 200;
      onprogress: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onloadend: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      abort() { this.onabort?.(); }
      send(body?: Document | XMLHttpRequestBodyInit | null) {
        const request = JSON.parse(String(body)) as StreamRequest;
        const root = { sessionId: request.sessionId, globalSessionId: request.globalSessionId,
          chatId: request.chatId, agentName: "编排智能体" };
        const child = { ...root, sessionId: "live-results-child", parentSessionId: request.sessionId,
          agentName: "问数智能体" };
        const append = (event: Record<string, unknown>) => {
          this.responseText += `data: ${JSON.stringify(event)}\n\n`;
        };
        (window as FixtureWindow).__finishQueryFixture = () => {
          append({ ...root, type: "text", content: "本轮查询已完成。" });
          append({ ...root, type: "done", finished: true, content: { mode: "agent", completion: "complete" } });
          this.responseText += "data: [DONE]\n\n";
          this.onprogress?.();
          this.onloadend?.();
        };
        let step = 0;
        (window as FixtureWindow).__advanceQueryFixture = () => {
          if (step === 0) {
          append({ ...root, type: "agent_start", content: {} });
          append({ ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, label: "合同数据查询" } });
          }
          const status = step % 2 === 0 ? "running" : "success";
          append({ ...child, type: "activity", content: { activityId: `load-${Math.floor(step / 2)}`,
            action: "load_data", kind: "tool", status, label: "执行数据查询",
            summary: status === "success" ? "查询成功，结果见下方" : undefined, startedAt: "2026-09-08T00:00:00Z" } });
          step += 1;
          this.onprogress?.();
        };
        (window as FixtureWindow).__returnQueryFixture = () => {
          append({ ...child, type: "data_source_selected", content: { datasourceId: 8, datasourceName: "合同业务库" } });
          append({ ...child, type: "table", eventId: "live-table", toolCallId: "detail-query", content: {
            title: "已返回合同明细", tableIndex: 0, source: "cube", datasourceId: 8, totalRows: 100,
            usedAssets: [{ assetId: "contracts", assetName: "采购合同台账", assetType: "TABLE" }],
            query: { dimensions: ["Contracts.name"], measures: ["Contracts.amount"],
              filters: [{ member: "Contracts.status", operator: "equals", values: ["已签约"] }] },
            annotation: { dimensions: { "Contracts.name": { shortTitle: "合同名称" }, "Contracts.status": { shortTitle: "履约状态" } },
              measures: { "Contracts.amount": { shortTitle: "金额", type: "sum" } } },
            columns: [{ name: "contract", title: "合同名称" }, { name: "amount", title: "金额" }],
            rows: Array.from({ length: 25 }, (_, index) => ({ contract: `合同第${index + 1}条`, amount: index + 1 }))
          } });
          append({ ...child, type: "citation_document", eventId: "live-citation", content: {
            kbId: "policy-kb", docId: "policy-doc", docKey: "policy.pdf", docName: "合同复核制度", kbName: "制度库",
            sourceAvailable: true, fragments: ["确认命中的原文：合同金额超过五万元应复核。", "第二条已确认的补充片段。"]
          } });
          append({ ...child, type: "document_url", eventId: "live-document", content: {
            kbId: "archive-kb", docId: "archive-doc", docKey: "archive.pdf", title: "确认归档合同", kbName: "合同档案库", sourceAvailable: true
          } });
          append({ ...child, type: "table", eventId: "live-scalar", toolCallId: "count-query", content: {
            title: "合同统计数", tableIndex: 1, columns: [{ name: "count", title: "合同数量" }], rows: [{ count: 37 }], totalRows: 1
          } });
          append({ ...child, type: "table", eventId: "live-empty", toolCallId: "empty-query", content: {
            title: "未匹配合同", tableIndex: 2, columns: [{ name: "contract", title: "合同名称" }], rows: [], totalRows: 0
          } });
          append({ ...child, type: "done", content: { mode: "ask" } });
          this.onprogress?.();
        };
        globalThis.setTimeout(() => (window as FixtureWindow).__advanceQueryFixture?.(), 30);
      }
    }
    Object.defineProperty(window, "XMLHttpRequest", { configurable: true, value: QueryResultStreamXhr });
  });
  await page.goto("/ask-agent");
  await page.getByRole("textbox", { name: "命令输入" }).fill("查询合同明细、数量和相关资料");
  await page.getByRole("button", { name: "发送" }).click();
  const query = page.getByRole("region", { name: "查询过程", exact: true });
  const results = query.getByRole("region", { name: "查询结果", exact: true });
  const progress = results.getByRole("status");
  const searching = "正在查询相关数据和资料，查到后会展示在这里。";
  await expect(progress).toHaveText(searching);
  for (let step = 0; step < 3; step += 1) {
    await page.evaluate(() => (window as Window & { __advanceQueryFixture?: () => void }).__advanceQueryFixture?.());
    await expect(progress).toHaveText(searching);
    await expect(progress).not.toContainText("已完成");
  }
  await query.screenshot({ path: "outputs/query-process/stable-searching-1672.png", animations: "disabled" });
  await page.evaluate(() => (window as Window & { __returnQueryFixture?: () => void }).__returnQueryFixture?.());
  await expect(progress).toContainText("查到了 1 张结果表、1 项数值结果、1 份引用资料、1 份文档，下面是查询结果。");
  await expect(page.locator('.analysis-turn[data-status="streaming"]')).toHaveCount(1);
  await expect(query.getByRole("button", { name: /^查询过程/ })).toHaveAttribute("aria-expanded", "true");
  await expect(results.locator(".datahub-query-result")).toHaveCount(3);
  await expect(results.locator('[data-result-kind="table"]')).toHaveCount(1);
  await expect(results.locator('[data-result-kind="citation"]')).toHaveCount(1);
  await expect(results.locator('[data-result-kind="document"]')).toHaveCount(1);
  await expect(results.getByRole("row")).toHaveCount(6);
  await expect(results.locator(".datahub-table-card__toolbar-summary")).toHaveCSS("font-weight", "400");
  await expect(results.locator(".datahub-table-card__toolbar-summary")).toHaveCSS("font-size", "12px");
  await expect(results.getByRole("cell", { name: "合同第5条", exact: true })).toBeVisible();
  await expect(results.getByRole("cell", { name: "合同第6条", exact: true })).toHaveCount(0);
  await expect(results).toContainText("确认命中的原文：合同金额超过五万元应复核。");
  await expect(results).not.toContainText("等待查询结果");
  await expect(query.locator(".xs-datahub-execution__heading")).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 1672, height: 1600 });
  await query.screenshot({ path: "outputs/query-process/streaming-preview-1672.png", animations: "disabled" });
  const a11y = await new AxeBuilder({ page }).include(".datahub-business-explanation--compact").analyze();
  expect(a11y.violations).toEqual([]);
  await results.locator(".datahub-query-result__conditions summary").focus();
  await page.keyboard.press("Enter");
  await expect(results.locator(".datahub-query-result__conditions")).toHaveAttribute("open", "");
  await results.getByRole("button", { name: "查看全部 25 行", exact: true }).click();
  await expect(results.getByRole("row")).toHaveCount(21);
  await results.locator('.ant-pagination-item[title="2"]').click();
  await expect(results.getByRole("row")).toHaveCount(6);
  await expect(results.getByRole("cell", { name: "合同第25条", exact: true })).toBeVisible();
  await expect(results).toContainText("不含尚未返回的数据");
  await results.getByRole("button", { name: "收起结果表", exact: true }).click();
  await results.getByRole("button", { name: "查看其余 2 项结果", exact: true }).click();
  await expect(results.locator(".datahub-query-result")).toHaveCount(5);
  await expect(results.locator(".datahub-query-result__scalar")).toContainText("37");
  await expect(results).toContainText("本次返回 0 行数据。");
  await results.getByRole("button", { name: "查看来源片段：合同复核制度", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("region", { name: "来源片段" })).toContainText("第二条已确认的补充片段。");
  await expect(modal.getByText("第二条已确认的补充片段。", { exact: true })).toBeVisible();
  await modal.screenshot({ path: "outputs/query-process/citation-preview-1672.png", animations: "disabled" });
  await modal.getByRole("button", { name: "Close" }).click();
  await page.evaluate(() => (window as Window & { __finishQueryFixture?: () => void }).__finishQueryFixture?.());
  await expect(page.locator('.analysis-turn[data-status="done"]')).toHaveCount(1);
  await expect(query.getByRole("button", { name: /^查询过程/ })).toHaveAttribute("aria-expanded", "true");
  await expect(results.getByRole("cell", { name: "合同第1条", exact: true })).toBeVisible();
  await expect(page.getByLabel("正式回答", { exact: true })).not.toContainText("确认命中的原文");
  await page.screenshot({ path: "outputs/query-process/mixed-child-results-1672.png", animations: "disabled", fullPage: true });
});

test("query results explain a returned table and show readable date conditions", async ({ page }) => {
  await installDataHubFixture(page, { buildAgentResponse: (request) => {
    const identity = { sessionId: request.sessionId, globalSessionId: request.sessionId, chatId: request.chatId };
    return [
      { ...identity, type: "agent_start" },
      { ...identity, type: "table", content: {
        title: "微信机器人事件记录表", totalRows: 5,
        columns: [{ name: "Events.count", title: "记录数", type: "number" }, { name: "Events.category", title: "事件类别" }],
        rows: [[998, "设施维修"], [383, "秩序安保（矛盾纠纷）"], [351, "环境保洁"], [6, "安全隐患类"], [1, null]],
        query: { dimensions: ["Events.category"], measures: ["Events.count"], timeDimensions: [{ dimension: "Events.createdAt",
          dateRange: ["2026-08-08T00:00:00.000", "2026-09-08T23:59:59.999"] }] },
        annotation: { timeDimensions: { "Events.createdAt": { shortTitle: "创建时间" } } }
      } },
      { ...identity, type: "text", content: "已按事件类别完成统计，具体数值见上方查询结果。" },
      { ...identity, type: "done", finished: true, content: { mode: "agent" } }
    ].map(sseEvent).join("") + "data: [DONE]\n\n";
  } });
  await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({ json: envelope({ chartable: false, reason: "本次核验结果表" }) }));
  await page.goto("/ask-agent");
  await page.getByRole("textbox", { name: "命令输入" }).fill("按事件类别统计8月8日至9月8日的记录数");
  await page.getByRole("button", { name: "发送" }).click();
  const query = page.getByRole("region", { name: "查询过程", exact: true });
  const results = query.getByRole("region", { name: "查询结果", exact: true });
  await expect(results.getByRole("status")).toHaveText("查到了 1 张结果表，下面是查询结果。");
  await expect(results.locator(".datahub-query-result__conditions summary")).toContainText("创建时间：2026-08-08 至 2026-09-08");
  await expect(results.getByRole("cell", { name: "998", exact: true })).toBeVisible();
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: 1200 });
    await expectNoHorizontalOverflow(page);
    await query.screenshot({ path: `outputs/query-process/result-introduction-${width}.png`, animations: "disabled" });
  }
});

test("assistant mark preserves its intrinsic aspect ratio beside an agent response", async ({
  page
}, testInfo) => {
  await installDataHubFixture(page);
  await page.goto("/ask-agent");

  await page.getByRole("textbox", { name: "命令输入" }).fill("检查助手标记比例");
  await page.getByRole("button", { name: "发送" }).click();
  const mark = page.locator(".analysis-response__mark");
  await expect(mark).toBeVisible();

  const ratios = await mark.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    const element = image as HTMLImageElement;
    return {
      width: rect.width,
      height: rect.height,
      rendered: rect.width / rect.height,
      intrinsic: element.naturalWidth / element.naturalHeight
    };
  });
  expect(ratios.width).toBeCloseTo(34, 2);
  expect(ratios.height).toBeCloseTo(34, 2);
  expect(ratios.rendered).toBeCloseTo(ratios.intrinsic, 2);
  await page.locator(".analysis-response").screenshot({
    path: testInfo.outputPath("assistant-mark-aspect-1672x941.png"),
    animations: "disabled"
  });
});

test("workspace model selector changes the strict DataHub chatMode request parameter", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-data");

  await page.getByRole("textbox", { name: "命令输入" }).fill("查询最新差旅制度");
  await expect(page.getByRole("button", { name: "切换到问知模型" })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/analysis-model-selector-open-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.getByRole("button", { name: "切换到问知模型" }).click();

  await expect(page.getByRole("button", { name: "选择模型，当前问知模型" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "命令输入" })).toHaveValue("查询最新差旅制度");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("button", { name: "切换到问数模型" })).toBeVisible();
  await expect(page.getByRole("button", { name: "切换到编排模型" })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/analysis-model-selector-open-390x844.png",
    animations: "disabled",
    fullPage: true
  });
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page).toHaveURL(/\/ask-knowledge$/);
  await expect(page.getByText("问知已完成")).toBeVisible();
  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "rag");
  expect(fixture.streamRequests[0].message).toBe("查询最新差旅制度");
});

test("ask-data sends the strict v2 request and supports table to favorite", async ({ page }, testInfo) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-data");

  await page.getByRole("textbox", { name: "命令输入" }).fill("本月收入是多少？");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("本月收入为 128 万元。", { exact: false }).first()).toBeVisible();
  const queryProcess = await expandQueryProcess(page);
  await expect(queryProcess.getByRole("region", { name: "查询结果" })).toContainText("经营分析库");
  await expect(page.getByText("子任务已完成。", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("正式回答", { exact: true })).not.toContainText("子任务已完成。");
  const chartCard = page.getByRole("region", { name: "智能图表建议" });
  await expect(chartCard.getByRole("heading", { name: "月度收入趋势" })).toBeVisible();
  await expect(chartCard.locator('[data-echarts-ready="true"]')).toBeVisible();
  await chartCard.getByText("表格", { exact: true }).click();
  await expect(chartCard.getByRole("cell", { name: "7月" })).toBeVisible();
  await expect(chartCard.getByRole("cell", { name: "128" })).toBeVisible();
  await expect(chartCard.getByRole("heading", { name: /月度收入趋势数据/ })).toBeVisible();
  const originalTables = queryProcess.getByRole("region", { name: "查询结果", exact: true });
  await expect(originalTables.getByRole("cell", { name: "7月", exact: true })).toBeVisible();
  await expect(chartCard.getByRole("cell", { name: "7月", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "收藏问数" })).toBeVisible();

  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "ask");
  expect(fixture.streamRequests[0].message).toBe("本月收入是多少？");

  await page.getByRole("button", { name: "收藏问数" }).click();
  await expect(page.getByRole("button", { name: "已收藏问数" })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入看板" })).toBeVisible();

  expect(fixture.ensuredArtifacts).toEqual([]);
  expect(fixture.favoriteRequests).toEqual([
    { askRunId: "ask-run-playwright", name: "统计本月收入" }
  ]);
  await expandQueryProcess(page);
  const queryRules = queryProcess.getByRole("region", { name: "查询结果" });
  await queryRules.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await queryRules.screenshot({
    path: testInfo.outputPath("query-rules-1672x941.png"),
    animations: "disabled"
  });
  await page.screenshot({
    path: "outputs/query-process/chart-data-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await queryRules.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("query-rules-390x844.png"),
    animations: "disabled"
  });
  await originalTables.getByRole("cell", { name: "7月" }).scrollIntoViewIfNeeded();
  await expect(originalTables.getByRole("cell", { name: "7月" })).toBeVisible();
  await page.screenshot({
    path: "outputs/query-process/chart-data-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
});

test("ask-knowledge renders safe Markdown, deduplicates citations, and opens authenticated source", async ({
  page
}, testInfo) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-knowledge");

  await page.getByRole("textbox", { name: "命令输入" }).fill("差旅费超过多少需要复核？");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("单笔差旅费超过 5000 元需复核")).toBeVisible();
  const answerImage = page.getByRole("img", { name: "制度截图" });
  await expect(answerImage).toBeVisible();
  await expect(answerImage.locator("xpath=..")).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("region", { name: "引用文档" })).toBeVisible();
  await page.getByRole("button", { name: "引用 1 篇文档" }).click();
  await expect(page.locator(".knowledge-citation-chip")).toHaveCount(1);
  await expect(page.locator(".knowledge-citation-chip")).toContainText("财务报销制度（2026）");
  await expect(page.getByRole("button", { name: "收藏问数" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出结果" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI 生成图表" })).toHaveCount(0);

  const queryProcessButton = page.getByRole("button", { name: /查询过程/ });
  if (await queryProcessButton.getAttribute("aria-expanded") === "false") {
    await queryProcessButton.click();
  }
  const sourceFragmentButton = page.getByRole("button", {
    name: "查看来源片段：财务报销制度（2026）"
  });
  await expect(sourceFragmentButton).toBeVisible();
  await expect(page.locator('.datahub-query-result[data-result-kind="citation"]')).toContainText(
    "单笔差旅费超过 5000 元时"
  );
  await sourceFragmentButton.click();
  const sourceDialog = page.getByRole("dialog");
  await expect(sourceDialog).toContainText("单笔差旅费超过 5000 元时");
  await expect(sourceDialog).not.toHaveClass(/ant-zoom/);
  await page.screenshot({
    path: testInfo.outputPath("knowledge-source-modal-1672x941.png")
  });
  await sourceDialog.getByRole("button", { name: "Close" }).click();
  await expect(sourceDialog).toBeHidden();

  expect(await page.evaluate(() => "__unsafeHtmlExecuted" in window)).toBe(false);
  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "rag");
  expect(fixture.streamRequests[0].message).toBe("差旅费超过多少需要复核？");

  const imagePopupPromise = page.waitForEvent("popup");
  await answerImage.click();
  const imagePopup = await imagePopupPromise;
  await expect(imagePopup).toHaveURL(/\/fixtures\/source\/contract-preview\.svg$/);
  await imagePopup.close();

  await page.getByRole("button", { name: "打开原文：财务报销制度（2026）" }).click();
  const preview = page.getByRole("dialog");
  await expect(page.locator(".cloud-preview")).toHaveCSS("position", "fixed");
  await expect(preview.getByTitle("财务报销制度（2026） 原文预览")).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  // Headless Chromium downloads PDFs instead of navigating its new tab to a PDF viewer.
  const downloadPromise = popupPromise.then((popup) => popup.waitForEvent("download"));
  await preview.getByRole("button", { name: "新标签打开" }).click();
  const popup = await popupPromise;
  const download = await downloadPromise;
  expect(download.url()).toMatch(/\/fixtures\/source\/finance-policy-v2\.pdf$/);
  expect(download.suggestedFilename()).toBe("finance-policy-v2.pdf");
  expect(await download.failure()).toBeNull();

  expect(fixture.citationPreviewHeaders.length).toBeGreaterThanOrEqual(1);
  for (const headers of fixture.citationPreviewHeaders) {
    expect(headers).toEqual({ authorization: "Bearer playwright-datahub-chat-token", spaceId: "1" });
  }
  await expect(
    page.getByRole("status").filter({ hasText: "已打开原文" }).last()
  ).toContainText("已打开原文");
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/ask-knowledge-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await popup.close();
  await preview.getByRole("button", { name: "关闭原文预览" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await sourceFragmentButton.scrollIntoViewIfNeeded();
  await sourceFragmentButton.click();
  await expect(sourceDialog).toBeVisible();
  await expect(sourceDialog).not.toHaveClass(/ant-zoom/);
  await page.screenshot({
    path: testInfo.outputPath("knowledge-source-modal-390x844.png")
  });
  await sourceDialog.getByRole("button", { name: "Close" }).click();
  await expect(sourceDialog).toBeHidden();
  await page.getByRole("button", { name: "打开原文：财务报销制度（2026）" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "打开原文：财务报销制度（2026）" })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/ask-knowledge-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
});

test("document lookup renders the validated document once and opens it through DataHub auth", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/document-lookup");

  await page.getByRole("textbox", { name: "命令输入" }).fill("帮我找到最新版销售管理制度");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("找文档已完成")).toBeVisible();
  await expect(page.getByText("找文档 Agent 执行")).toHaveCount(0);
  await expect(page.getByText("销售管理制度（2026）")).toHaveCount(1);
  await expect(page.locator(".document-lookup-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "收藏问数" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出结果" })).toHaveCount(0);

  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "document_lookup");

  await page.getByRole("button", { name: "打开原文：销售管理制度（2026）" }).click();
  const preview = page.getByRole("dialog");
  await expect(page.locator(".cloud-preview")).toHaveCSS("position", "fixed");
  await expect(preview.getByTitle("销售管理制度（2026） 原文预览")).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  // Headless Chromium downloads PDFs instead of navigating its new tab to a PDF viewer.
  const downloadPromise = popupPromise.then((popup) => popup.waitForEvent("download"));
  await preview.getByRole("button", { name: "新标签打开" }).click();
  const popup = await popupPromise;
  const download = await downloadPromise;
  expect(download.url()).toMatch(/\/fixtures\/source\/sales-policy-2026\.pdf$/);
  expect(download.suggestedFilename()).toBe("sales-policy-2026.pdf");
  expect(await download.failure()).toBeNull();
  expect(fixture.citationPreviewHeaders.length).toBeGreaterThanOrEqual(1);
  for (const headers of fixture.citationPreviewHeaders) {
    expect(headers).toEqual({ authorization: "Bearer playwright-datahub-chat-token", spaceId: "1" });
  }
  await popup.close();
  await preview.getByRole("button", { name: "关闭原文预览" }).click();

  await scrollAnalysisWorkspaceToTop(page);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/document-lookup-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await scrollAnalysisWorkspaceToTop(page);
  await expect(
    page.getByRole("button", { name: "打开原文：销售管理制度（2026）" })
  ).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/document-lookup-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
});

test("flat document agent renders its root stages and document link without a generic orchestration card", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page, {
    buildAgentResponse: buildFlatDocumentAgentStream
  });
  await page.goto("/ask-agent");

  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("帮我找下给眉山天府新区的合同");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("智能编排已完成")).toBeVisible();
  await expandExecution(page);
  await expect(
    page.getByRole("list", { name: "找文档智能体执行时间轴" })
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "模型活动：理解文档需求" })
  ).toBeAttached();
  await expect(
    page.getByRole("region", { name: "模型活动：定位相关文档" })
  ).toBeAttached();
  await expect(
    page.getByText("本次响应未返回独立的路由或任务拆解事件。")
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开原文：眉山采购合同.pdf" })
  ).toBeVisible();
  await expect(page.getByText("已定位并确认一份直接匹配的合同文档。")).toBeVisible();

  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "agent");

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-document-flat-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole("button", { name: "打开原文：眉山采购合同.pdf" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-document-flat-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
});

test("agent ask-data child automatically generates a chart from its structured table", async ({
  page
}, testInfo) => {
  await installDataHubFixture(page);
  await page.goto("/ask-agent");

  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析本季度销售变化");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("智能编排已完成")).toBeVisible();
  const chartCard = page.getByRole("region", { name: "智能图表建议" });
  await expect(chartCard).toBeVisible();
  await expect(
    chartCard.getByRole("heading", { name: "本季度销售趋势" })
  ).toBeVisible();
  await expect(
    chartCard.locator('[data-echarts-ready="true"]')
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: testInfo.outputPath("agent-ask-chart-action-1672x941.png"),
    animations: "disabled",
    fullPage: true
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(
    page.getByRole("button", { name: "AI 生成图表" })
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("agent-ask-chart-action-390x844.png"),
    animations: "disabled",
    fullPage: true
  });
});

test("right subagent drawer summarizes model activity lifecycle updates", async ({
  page
}, testInfo) => {
  await installDataHubFixture(page, {
    buildAgentResponse: buildModelActivityAgentStream
  });
  await page.goto("/ask-agent");

  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析本季度销售变化");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("智能编排已完成")).toBeVisible();
  await expandExecution(page);
  await page
    .getByRole("button", { name: "打开 问数智能体执行详情" })
    .click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAccessibleName("子智能体执行详情");
  const drawerWidth = await drawer.evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(drawerWidth).toBeGreaterThanOrEqual(390);
  expect(drawerWidth).toBeLessThanOrEqual(410);
  await expect(
    drawer.getByRole("button", { name: "返回列表" })
  ).toBeVisible();
  const timeline = drawer.getByRole("list", {
    name: "问数智能体执行时间轴"
  });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByRole("listitem")).toHaveCount(2);

  const analysisActivity = drawer.getByRole("region", {
    name: "模型活动：理解数据问题"
  });
  await expect(analysisActivity).toHaveCount(1);
  const analysisNode = analysisActivity.locator(
    ".xs-datahub-agent-card__activity-node"
  );
  await expect(analysisNode).toHaveCount(1);
  const nodeBox = await analysisNode.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(nodeBox.width).toBeLessThanOrEqual(11);
  expect(nodeBox.height).toBeLessThanOrEqual(11);
  await expect(
    drawer.locator(".xs-datahub-agent-card__model-call")
  ).toHaveCount(0);
  await expect(
    analysisActivity.getByText("已识别查询口径、时间范围与目标指标。", {
      exact: true
    })
  ).toBeHidden();
  await expect(analysisActivity.getByText(/已完成\s*·\s*3\.5s/)).toBeVisible();

  const planActivity = drawer.getByRole("region", {
    name: "模型活动：生成查询方案"
  });
  await expect(planActivity).toHaveCount(1);
  await planActivity.locator(":scope > summary").click();
  await expect(
    planActivity.getByText("查询方案已生成，准备执行数据检索。", {
      exact: true
    })
  ).toBeVisible();

  await analysisActivity
    .locator(":scope > summary")
    .getByText("理解数据问题", { exact: true })
    .click();
  await expect(
    analysisActivity.getByText("已识别查询口径、时间范围与目标指标。", {
      exact: true
    })
  ).toBeVisible();
  await expect(
    planActivity.getByText("查询方案已生成，准备执行数据检索。", {
      exact: true
    })
  ).toBeHidden();

  const technicalDetails = analysisActivity;
  await expect(technicalDetails).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("subagent-model-activity-drawer-1672x941.png"),
    animations: "disabled",
    fullPage: true
  });

  await expect(technicalDetails).toContainText("任务分析");
  await expect(technicalDetails).toContainText("理解数据问题");
  await expect(technicalDetails).toContainText("已完成");
  await expect(technicalDetails).toContainText("16:00:32");
  await expect(technicalDetails).toContainText("16:00:35");
  await expect(technicalDetails).toContainText("3.5s");
  await expect(analysisActivity).not.toContainText("activity-model-analysis");

  await drawer.getByRole("button", { name: "返回列表" }).click();
  await expect(drawer).toHaveAccessibleName("子智能体");
  await expect(
    drawer.getByRole("navigation", { name: "子智能体列表" })
  ).toBeVisible();
  await expect(
    drawer.getByRole("list", { name: "问数智能体执行时间轴" })
  ).toHaveCount(0);
  await drawer.getByRole("treeitem", { name: /问数智能体/ }).click();
  await expect(drawer).toHaveAccessibleName("子智能体执行详情");
  await expect(timeline).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(analysisActivity).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("subagent-model-activity-drawer-390x844.png"),
    animations: "disabled",
    fullPage: true
  });
});

test("agent mode shows real orchestration events and nested child-agent sessions", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-agent");

  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析销售变化并核对费用制度");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("智能编排已完成")).toBeVisible();
  await expect(page.getByRole("heading", { name: "综合结果" })).toHaveCount(0);
  await expandExecution(page);
  await expect(page.getByText("智能编排执行")).toBeVisible();
  await expect(page.getByRole("heading", { name: "任务拆解" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "编排执行轨迹" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "编排流程" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "智能体执行卡" })).toHaveCount(0);
  await expect(page.getByText("Agent 思考完成")).toHaveCount(0);
  await expect(page.getByText("销售额环比下降", { exact: false }).last()).toBeVisible();
  const dataAgentSummary = page.getByRole("button", {
    name: "打开 数据研究员执行详情"
  });
  await expect(dataAgentSummary).toHaveAttribute("data-status", "done");

  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "agent");

  await scrollAnalysisWorkspaceToTop(page);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-main-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await dataAgentSummary.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAccessibleName("子智能体执行详情");
  await expect(
    drawer.getByRole("list", { name: "数据研究员执行时间轴" })
  ).toBeVisible();

  await expect(drawer.locator(".xs-datahub-agent-card__thinking-preview").filter({ hasText: "正在查询销售数据。" })).toBeVisible();
  await expect(drawer.getByRole("table")).toBeVisible();
  await expect(drawer.getByRole("cell", { name: "Q2" })).toBeVisible();
  await expect(drawer.getByRole("cell", { name: "113" })).toBeVisible();

  await drawer.getByRole("button", { name: "返回列表" }).click();
  await expect(drawer).toHaveAccessibleName("子智能体");
  const dataAgent = drawer.getByRole("treeitem", { name: /数据研究员/ });
  const policyAgent = drawer.getByRole("treeitem", { name: /制度研究员/ });
  await expect(dataAgent).toHaveAttribute("aria-level", "1");
  await expect(policyAgent).toHaveAttribute("aria-level", "2");
  await policyAgent.click();
  await expect(drawer.locator(".xs-datahub-agent-card__thinking-preview").filter({ hasText: "正在检索费用制度。" })).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "打开原文：财务报销制度（2026）" })
  ).toBeVisible();

  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.getByRole("button", { name: "关闭子智能体详情" }).click();
  await expect(drawer).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await scrollAnalysisWorkspaceToTop(page);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-main-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
  await page.getByRole("button", { name: "打开 数据研究员执行详情" }).click();
  await expect(page.getByRole("dialog", { name: "子智能体执行详情" })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
  await page.getByRole("button", { name: "关闭子智能体详情" }).click();

  await page.getByRole("button", { name: "收藏问数" }).click();
  await expect(page.getByRole("button", { name: "已收藏问数" })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入看板" })).toBeVisible();
  expect(fixture.ensuredArtifacts).toEqual([
    {
      sessionId: fixture.streamRequests[0].sessionId,
      chatId: fixture.streamRequests[0].chatId,
      resultSessionId: "child-data-session"
    }
  ]);
  expect(fixture.favoriteRequests).toEqual([
    {
      askRunId: "ask-run-playwright",
      name: "统计本月收入"
    }
  ]);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-favorite-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-favorite-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });

  await page.getByRole("button", { name: "加入看板" }).click();
  await expect(page).toHaveURL(/\/dashboard-editor\?/);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("draft"))
    .not.toBeNull();
  const editorUrl = new URL(page.url());
  expect(editorUrl.searchParams.get("source")).toBe("favorites");
  expect(editorUrl.searchParams.get("asset")).toBe("asset-playwright-revenue");
  expect(editorUrl.searchParams.get("returnTo")).toBe("/ask-agent");
  expect(editorUrl.searchParams.get("draft")).toBeTruthy();
  await expect(page.getByRole("complementary", { name: "组件库" }).getByRole("button", { name: "收藏问数", exact: true })).toBeVisible();
  await expect(page.locator(".query-asset-panel__list > button.is-active")).toContainText(
    "统计本月收入"
  );
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/agent-orchestration-dashboard-favorite-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });

  await page.getByRole("button", { name: "返回上一页" }).click();
  await expect(page).toHaveURL(/\/ask-agent$/);
  await expect(page.getByText("智能编排已完成")).toBeVisible();
});

test("a single ask child and root artifact share one favorite action", async ({ page }) => {
  const fixture = await installDataHubFixture(page, {
    buildAgentResponse: buildMarkdownOnlyAskAgentStream
  });
  await page.goto("/ask-agent");

  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("统计咨询对象排名");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("智能编排已完成")).toBeVisible();
  const query = await expandQueryProcess(page);
  // 该夹具只返回模型Markdown，不能冒充已执行查询；答复表与收藏仍必须可用。
  await expect(query.locator('.datahub-query-result[data-result-kind="table"]')).toHaveCount(0);
  await expect(page.getByLabel("正式回答", { exact: true }).getByRole("table")).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "小治" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "456" })).toBeVisible();
  await expect(page.getByRole("button", { name: "收藏问数" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "收藏数据结果（2）" })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "收藏问数" }).click();
  await expect(page.getByRole("button", { name: "已收藏问数" })).toBeVisible();

  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "agent");
  expect(fixture.ensuredArtifacts).toEqual([]);
  expect(fixture.favoriteRequests).toEqual([
    {
      askRunId: "ask-run-consultation-ranking",
      name: "咨询数前十的社区分布"
    }
  ]);
});

test("persisted nested v2 events restore the same knowledge result", async ({ page }) => {
  await installDataHubFixture(page);
  await page.goto("/history");

  await expect(page.getByRole("heading", { name: "历史对话" })).toBeVisible();
  await page.getByRole("button", { name: /差旅费复核制度/ }).click();

  await expect(page).toHaveURL(/\/ask-knowledge$/);
  await expect(page.getByText("差旅费超过多少需要复核？")).toBeVisible();
  await page.getByRole("button", { name: /思考过程/ }).click();
  await expect(page.getByLabel("模型思考")).toContainText("正在检索并复核制度原文。");
  await expect(page.getByText("单笔差旅费超过 5000 元需复核")).toBeVisible();
  await page.getByRole("button", { name: "引用 1 篇文档" }).click();
  await expect(page.locator(".knowledge-citation-chip")).toHaveCount(1);
  await expect(page.locator(".knowledge-citation-chip")).toContainText("财务报销制度（2026）");
  await expect(page.getByRole("button", { name: "收藏问数" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出结果" })).toHaveCount(0);
});

test("slow persisted history opens the workspace before replay completes", async ({
  page
}, testInfo) => {
  await installDataHubFixture(page, { historyResponseDelayMs: 1_500 });
  await page.goto("/history");

  await page.getByRole("button", { name: /差旅费复核制度/ }).click();

  await expect(page).toHaveURL(/\/ask-knowledge$/);
  await expect(page.getByRole("status", { name: "正在加载历史对话" })).toBeVisible();
  await expect(page.getByRole("button", { name: "发送" })).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("slow-history-loading.png"),
    fullPage: true
  });
  await expect(page.getByText("单笔差旅费超过 5000 元需复核")).toBeVisible();
});

test("stopping orchestration settles every running status and freezes total duration", async ({
  page
}, testInfo) => {
  await installDataHubFixture(page);
  await installStoppableAgentStream(page);
  await page.goto("/ask-agent");

  await page.getByRole("textbox", { name: "命令输入" }).fill("停止状态回归检查");
  await page.getByRole("button", { name: "发送" }).click();
  await expandExecution(page);
  await expect(
    page.getByRole("button", { name: "打开 问数智能体执行详情" })
  ).toBeVisible();
  await page.waitForTimeout(1_100);
  await page.getByRole("button", { name: "停止生成" }).click();

  await expect(page.getByRole("region", { name: "思考过程", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "查询过程", exact: true })).toHaveAttribute("data-status", "cancelled");
  await expandExecution(page);
  const panel = page.locator(".xs-datahub-execution");
  await expect(panel).toHaveAttribute("data-status", "cancelled");
  await expect(panel.getByLabel("运行中")).toHaveCount(0);
  await expect(panel.getByLabel("已停止").first()).toBeVisible();
  const totalDuration = panel.locator(".xs-datahub-overview__metrics dd").last();
  await expect(totalDuration).not.toHaveText("—");
  const stoppedDuration = await totalDuration.textContent();
  await page.waitForTimeout(1_100);
  await expect(totalDuration).toHaveText(stoppedDuration!);
  expect(
    await page.evaluate(() =>
      Boolean((window as Window & { __agentStreamAborted?: boolean }).__agentStreamAborted)
    )
  ).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("agent-orchestration-cancelled-1672x941.png"),
    animations: "disabled",
    fullPage: true
  });
});

test("persisted agent history restores the same root and child execution graph", async ({
  page
}) => {
  await installDataHubFixture(page);
  await page.goto("/history");

  await page.getByRole("button", { name: /销售变化分析/ }).click();

  await expect(page).toHaveURL(/\/ask-agent$/);
  await expect(page.getByText("历史数据结论：销售额环比下降", { exact: false }).last()).toBeVisible();
  await expandExecution(page);
  await expect(page.getByText("智能编排执行")).toBeVisible();
  await expect(page.getByRole("heading", { name: "任务拆解" })).toBeVisible();
  await expect(page.getByText("历史中的子 Agent 正在查询销售数据。")).toHaveCount(0);

  await page
    .getByRole("button", { name: "打开 数据研究员执行详情" })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toHaveAccessibleName("子智能体执行详情");
  await expect(
    drawer.getByRole("list", { name: "数据研究员执行时间轴" })
  ).toBeVisible();
  await expect(drawer.locator(".xs-datahub-agent-card__thinking-preview").filter({ hasText: "历史中的子 Agent 正在查询销售数据。" })).toBeVisible();
  await expect(drawer.getByRole("table")).toBeVisible();
  await expect(drawer.getByRole("cell", { name: "Q2" })).toBeVisible();
  await expect(drawer.getByRole("cell", { name: "113" })).toBeVisible();
});

test("persisted agent history can be favorited when child-scoped query is incomplete", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page, {
    rejectScopedHistoryEnsure: true
  });
  await page.goto("/history");

  await page.getByRole("button", { name: /销售变化分析/ }).click();

  await expect(page).toHaveURL(/\/ask-agent$/);
  await expect(page.getByRole("button", { name: "收藏问数" })).toBeVisible();
  await page.getByRole("button", { name: "收藏问数" }).click();
  await expect(page.getByRole("button", { name: "已收藏问数" })).toBeVisible();

  expect(fixture.ensuredArtifacts).toEqual([
    {
      sessionId: "history-agent-session",
      chatId: "history-agent-chat",
      resultSessionId: "history-child-data"
    },
    {
      sessionId: "history-agent-session",
      chatId: "history-agent-chat"
    }
  ]);
  expect(fixture.favoriteRequests).toEqual([
    {
      askRunId: "ask-run-playwright",
      name: "统计本月收入"
    }
  ]);
  await expect(page.getByText(incompleteHistoryQueryMessage)).toHaveCount(0);
});

test("persisted agent history reruns ask mode before favoriting when no executable query remains", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page, {
    rejectAllHistoricalEnsure: true
  });
  await page.goto("/history");

  await page.getByRole("button", { name: /销售变化分析/ }).click();

  await expect(page).toHaveURL(/\/ask-agent$/);
  await page.getByRole("button", { name: "收藏问数" }).click();
  await expect(page.getByRole("button", { name: "已收藏问数" })).toBeVisible();

  expect(fixture.ensuredArtifacts).toEqual([
    {
      sessionId: "history-agent-session",
      chatId: "history-agent-chat",
      resultSessionId: "history-child-data"
    },
    {
      sessionId: "history-agent-session",
      chatId: "history-agent-chat"
    }
  ]);
  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "ask");
  expect(fixture.streamRequests[0]).toEqual({
    message: "恢复销售数据分析",
    sessionId: expect.stringMatching(/^session-/),
    globalSessionId: expect.stringMatching(/^session-/),
    chatId: expect.stringMatching(/^chat-/),
    chatMode: "ask"
  });
  expect(fixture.streamRequests[0].globalSessionId).toBe(
    fixture.streamRequests[0].sessionId
  );
  expect(fixture.streamRequests[0].sessionId).not.toBe(
    "history-agent-session"
  );
  expect(fixture.streamRequests[0].chatId).not.toBe("history-agent-chat");
  expect(fixture.favoriteRequests).toEqual([
    {
      askRunId: "ask-run-playwright",
      name: "恢复销售数据分析"
    }
  ]);
  await expect(page.getByText(incompleteHistoryQueryMessage)).toHaveCount(0);
});

test("persisted document lookup history restores the validated document without duplication", async ({
  page
}) => {
  await installDataHubFixture(page);
  await page.goto("/history");

  await page.getByRole("button", { name: /查找销售管理制度/ }).click();

  await expect(page).toHaveURL(/\/document-lookup$/);
  await expect(page.getByText("找文档 Agent 执行")).toHaveCount(0);
  await expect(page.getByText("销售管理制度（2026）")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "打开原文：销售管理制度（2026）" })
  ).toBeVisible();
  await expect(page.locator(".document-lookup-card")).toHaveCount(1);
});

test("knowledge source Markdown remains readable when the original PDF is unavailable", async ({ page }, testInfo) => {
  await installDataHubFixture(page);
  const sourceRequests: string[] = [];
  await page.route("**/api/ai/rag/kb/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split("/").at(-1)!;
    if (!["source_document_preview", "source_document", "file_content"].includes(endpoint)) {
      await route.fallback();
      return;
    }
    sourceRequests.push(endpoint);
    expect(request.method()).toBe("GET");
    expect(request.headers()["authorization"]).toBe("Bearer playwright-datahub-chat-token");
    expect(request.headers()["x-space-id"]).toBe("1");
    expect(url.searchParams.get("space_id")).toBe("1");
    expect(url.searchParams.get("kb_id")).toBe("kb-finance");
    expect(url.searchParams.get("doc_key")).toBe("finance-policy-v2.pdf");
    if (endpoint === "source_document_preview") {
      await route.fulfill({ json: envelope({ mode: "proxy" }) });
    } else if (endpoint === "source_document") {
      await route.fulfill({ status: 503, json: { message: "原始 PDF 暂时不可读取" } });
    } else {
      await route.fulfill({ json: envelope({ markdown: "# 财务报销制度（2026）\n\n## 审核与归档\n\n法务审核完成后归档保存\n\n- 经办人提交完整凭证。\n- 部门负责人核对费用。" }) });
    }
  });
  await page.goto("/ask-knowledge");
  await page.getByRole("textbox", { name: "命令输入" }).fill("差旅费超过多少需要复核？");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByRole("button", { name: "引用 1 篇文档" }).click();
  await page.getByRole("button", { name: "打开原文：财务报销制度（2026）" }).click();

  const preview = page.getByRole("dialog");
  await expect(page.locator(".cloud-preview")).toHaveCSS("position", "fixed");
  const markdown = preview.getByRole("article", { name: "财务报销制度（2026） Markdown 预览" });
  await expect(markdown.getByRole("heading", { name: "审核与归档" })).toBeVisible();
  await expect(markdown.getByText("法务审核完成后归档保存", { exact: true })).toBeVisible();
  await expect(markdown.getByRole("listitem")).toHaveCount(2);
  await expect.poll(() => sourceRequests).toEqual(expect.arrayContaining([
    "source_document_preview", "source_document", "file_content"
  ]));
  await expect(preview.locator("iframe")).toHaveCount(0);
  await expect(preview.getByText("正在载入原文")).toHaveCount(0);
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("knowledge-markdown-fallback-1672x941.png"), animations: "disabled", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(markdown.getByText("法务审核完成后归档保存", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("knowledge-markdown-fallback-390x844.png"), animations: "disabled", fullPage: true });
});

test("production query process separates long knowledge sources and same-name documents", async ({ page }) => {
  await installDataHubFixture(page);
  const question = "请帮我核对采购合同约定的主要职责，并说明各份原文所在的知识库";
  const sharedTitle = "丽江市古城区城市运行管理服务平台系统建设项目采购合同及履约职责分工说明（正式签署归档版）.pdf";
  const sources = [
    { kbId: "kb-long-contract", kbName: "城市运行管理服务平台合同与履约资料知识库（丽江市古城区·2026年度项目归档）", docId: "contract-current", docKey: "contract-current.pdf", docName: sharedTitle, chapter: "第五章 项目实施与双方职责", pageNumber: "15", fragments: ["本项目我方负责平台部署、业务系统联调及验收材料准备。"] },
    { kbId: "kb-long-purchase", kbName: "数字城市建设项目采购与供应商协作知识库（跨部门联合归档及历史合同版本）", docId: "contract-archive", docKey: "contract-archive.pdf", docName: sharedTitle, chapter: "第六章 采购方配合事项", pageNumber: "28", fragments: ["采购方应按约定提供基础资料，并组织相关业务部门配合联合验收。", "档案版本保留双方盖章确认的职责清单。"] },
    { kbId: "kb-long-policy", kbName: "企业制度与项目职责分工知识库（法务审查、实施交付与验收管理专题）", docId: "policy-long", docKey: "delivery-policy.pdf", docName: "城市运行管理服务平台建设项目实施交付、联合验收与后续运维职责管理办法（2026年修订）.pdf", chapter: "第三章 项目归档", pageNumber: "7", fragments: ["法务审核完成后归档保存，项目负责人负责确认移交清单。"] }
  ];
  await page.route("**/api/agentScore/chat/completions/stream", async (route) => {
    const request = route.request().postDataJSON() as StreamRequest;
    expectStrictStreamRequest(request, "rag");
    const root = { agentName: "问知智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
    await route.fulfill({
      status: 200, contentType: "text/event-stream; charset=utf-8",
      body: [
        sseEvent({ ...root, type: "thinking", content: "核对合同中的职责条款。", isThinking: true }),
        sseEvent({ ...root, type: "tool_call", toolCallId: "long-source-search", content: { toolName: "search_knowledge", args: { query: "合同职责" } } }),
        ...sources.map((source) => sseEvent({ ...root, type: "citation_document", content: { ...source, sourceAvailable: true } })),
        sseEvent({ ...root, type: "text", content: "我方主要负责平台部署、系统联调与验收材料准备；采购方负责提供资料并组织联合验收。" }),
        sseEvent({ ...root, type: "done", content: { mode: "rag", askKnowledge: true }, finished: true }),
        "data: [DONE]\n\n"
      ].join("")
    });
  });
  await page.goto("/ask-knowledge");
  await page.getByRole("textbox", { name: "命令输入" }).fill(question);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("我方主要负责平台部署、系统联调与验收材料准备；采购方负责提供资料并组织联合验收。", { exact: true })).toBeVisible();
  const query = await expandQueryProcess(page);
  const results = query.getByRole("region", { name: "查询结果" });
  const resultRows = results.locator('.datahub-query-result[data-result-kind="citation"]');
  await expect(resultRows).toHaveCount(3);
  await expect(results.getByRole("button", { name: `查看来源片段：${sharedTitle}`, exact: true })).toHaveCount(2);
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const row = resultRows.nth(index);
    await expect(row.locator(".datahub-query-result__head h3")).toHaveText(source.docName);
    await expect(row.locator(".datahub-query-result__head h3")).toHaveAttribute("title", source.docName);
    await expect(row.locator(".datahub-query-result__source")).toContainText(source.kbName);
    await expect(row.locator(".datahub-query-result__source")).toContainText(`第${source.pageNumber}页`);
    await expect(row.locator(".datahub-query-result__source")).toContainText(source.chapter);
    await expect(row.getByRole("button", { name: `查看来源片段：${source.docName}`, exact: true })).toContainText(`${source.fragments.length} 个片段`);
    await expect(row.locator(".datahub-query-result__excerpt")).toContainText(source.fragments[0]);
  }
  await expect(query.getByText("怎么查", { exact: true })).toHaveCount(0);
  await expect(query.getByText("查到了什么", { exact: true })).toHaveCount(0);
  await expect(query).not.toContainText(question);
  await expect(query.getByRole("button", { name: /^查询过程/ })).toHaveCount(1);
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 1100 : 1050 });
    await expectNoHorizontalOverflow(page);
    await query.scrollIntoViewIfNeeded();
    for (let index = 0; index < sources.length; index += 1) {
      await expect(resultRows.nth(index).locator(".datahub-query-result__head h3")).toBeVisible();
    }
    await page.screenshot({ path: `outputs/process-motion/qa/knowledge-production-${width}.png`, animations: "disabled", fullPage: true });
    await query.screenshot({ path: `outputs/process-motion/qa/knowledge-query-details-${width}.png`, animations: "disabled" });
  }
  await resultRows.nth(1).getByRole("button", { name: `查看来源片段：${sharedTitle}`, exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("region", { name: "来源片段" })).toContainText(sources[1].fragments[0]);
  await expect(modal).toContainText(sources[1].kbName);
  await expect(modal).not.toContainText(sources[0].fragments[0]);
  await page.screenshot({ path: "outputs/process-motion/qa/knowledge-production-fragment-390.png", animations: "disabled", fullPage: true });
});

for (const answerSource of ["text", "summary", "none"] as const) {
  test(`agent Top3 answer precedes its table when child answer source is ${answerSource}`, async ({ page }) => {
    const question = "和善治签合同的公司签合同数量top3";
    const companies = [
      ["成都卓一科技有限公司", 9], ["广州思迈特软件有限公司", 6], ["杭州海康威视科技有限公司", 5],
      ["云南蚁象网络科技有限公司", 3], ["成都甲公司", 2], ["成都乙公司", 2], ["成都丙公司", 1],
      ["成都丁公司", 1], ["成都戊公司", 1], ["成都己公司", 1]
    ];
    const conclusion = "与善治签订合同的公司中，合同数量 Top3 为：成都卓一科技有限公司 9 份、广州思迈特软件有限公司 6 份、杭州海康威视科技有限公司 5 份。";
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text: string) => { (window as Window & { __copiedAnswer?: string }).__copiedAnswer = text; } }
      });
    });
    const fixture = await installDataHubFixture(page, { buildAgentResponse: (request) => {
      const root = { agentName: "编排智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
      const child = { agentName: "问数智能体", sessionId: "top3-child", parentSessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
      return [
        sseEvent({ ...root, type: "agent_start", content: {} }),
        sseEvent({ ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, subagentId: "top3-child-agent", label: "问数智能体" } }),
        sseEvent({ ...child, type: "table", content: { columns: ["公司", "合同数量"], rows: companies, totalRows: 10, source: "cube" } }),
        ...(answerSource === "text" ? [sseEvent({ ...child, type: "text", content: conclusion, replyId: "top3-child-answer" })] : []),
        sseEvent({ ...child, type: "done", content: { mode: "ask", ...(answerSource === "summary" ? { summary: conclusion } : {}) } }),
        sseEvent({ ...root, type: "done", content: { mode: "agent", adaptiveTeam: true, completion: "complete" }, finished: true }),
        "data: [DONE]\n\n"
      ].join("");
    } });
    await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({ json: envelope({ chartable: false, reason: "本回归直接展示完整数据表。" }) }));
    await page.goto("/ask-agent");
    await page.getByRole("textbox", { name: "命令输入" }).fill(question);
    await page.getByRole("button", { name: "发送" }).click();
    const answer = page.getByLabel("正式回答", { exact: true });
    await expect(answer).toBeVisible();
    if (answerSource !== "none") {
      await expect(answer).toContainText(conclusion);
    } else {
      await expect(answer).toContainText(/数据|记录|结果|公司/);
      await expect(answer).toContainText(/10|十/);
      await expect(answer).toContainText("9");
    }
    const output = page.getByRole("region", { name: "分析结果", exact: true });
    await expect(output.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^查询过程/ })).toHaveAttribute("aria-expanded", "true");
    const tables = await expandQueryTables(page);
    const table = tables.getByRole("table");
    await expect(table).toHaveCount(1);
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(table.getByRole("cell", { name: "成都卓一科技有限公司", exact: true })).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: "成都卓一科技有限公司" }).getByRole("cell", { name: "9", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^查询过程/ }).click();
    await expect(answer).toBeVisible();
    await expect(page.getByRole("region", { name: "智能图表建议" })).toHaveCount(0);
    await page.getByRole("button", { name: "复制回答", exact: true }).click();
    const copied = await page.evaluate(() => (window as Window & { __copiedAnswer?: string }).__copiedAnswer ?? "");
    expect(copied).toContain(answerSource === "none" ? "9" : conclusion);
    expect(fixture.streamRequests).toHaveLength(1);
    expectStrictStreamRequest(fixture.streamRequests[0], "agent");
    for (const width of [1440, 1672, 1920, 2200, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 1100 : 1050 });
      await expectNoHorizontalOverflow(page);
      await answer.scrollIntoViewIfNeeded();
      await expect(answer).toBeVisible();
      if ([1672, 390].includes(width)) await page.screenshot({ path: `outputs/query-process/summary-${answerSource}-${width}.png`, animations: "disabled", fullPage: true });
    }
    await expandExecution(page);
    await expect(page.getByRole("button", { name: "打开 问数智能体执行详情" })).toBeVisible();
  });
}

for (const markerMode of ["ask", "agent"] as const) {
  test(`thinking envelope stays out of the formal answer in ${markerMode} mode`, async ({ page }) => {
    await installDataHubFixture(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text: string) => { (window as Window & { __copiedAnswer?: string }).__copiedAnswer = text; } }
      });
    });
    const thought = "先核对本月收入字段与统计口径。";
    await page.route("**/api/agentScore/chat/completions/stream", async (route) => {
      const request = route.request().postDataJSON() as StreamRequest;
      expectStrictStreamRequest(request, markerMode);
      const root = { agentName: markerMode === "ask" ? "问数智能体" : "编排智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
      const child = { agentName: "问数智能体", sessionId: "marker-child", parentSessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
      const events = markerMode === "ask" ? [
        ...["<mm:thi", `nk>${thought}`, "</mm:thi", "nk>"].map((content) => ({ ...root, type: "text", content, replyId: "fragmented-thinking" })),
        { ...root, type: "data_source_selected", content: { datasourceId: 8, datasourceName: "经营分析库" } },
        { ...root, type: "table", content: { columns: [{ name: "revenue", title: "收入（万元）", type: "number" }], rows: [{ revenue: 128 }], totalRows: 1, source: "cube" } },
        { ...root, type: "text", content: "本月收入为 **128 万元**。", replyId: "clean-final-answer" },
        { ...root, type: "done", content: { mode: "ask" }, finished: true }
      ] : [
        ...["<mm:", "think></mm:think>"].map((content) => ({ ...root, type: "text", content, replyId: "root-marker-only" })),
        { ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, subagentId: "marker-child-agent", label: "问数智能体" } },
        ...["</mm:", "think>"].map((content) => ({ ...child, type: "text", content, replyId: "child-marker-only" })),
        { ...child, type: "table", content: { columns: ["公司", "合同数量"], rows: [["成都卓一科技有限公司", 9], ["广州思迈特软件有限公司", 6], ["杭州海康威视科技有限公司", 5]], totalRows: 3, source: "cube" } },
        { ...child, type: "done", content: { mode: "ask", summary: "</mm:think>" } },
        { ...root, type: "done", content: { mode: "agent", adaptiveTeam: true, summary: "</mm:think>" }, finished: true }
      ];
      await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", body: [...events.map(sseEvent), "data: [DONE]\n\n"].join("") });
    });
    await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({ json: envelope({ chartable: false, reason: "本回归保留原表核对结果。" }) }));
    await page.goto(markerMode === "ask" ? "/ask-data" : "/ask-agent");
    await page.getByRole("textbox", { name: "命令输入" }).fill(markerMode === "ask" ? "本月收入是多少？" : "和善治签合同的公司签合同数量top3");
    await page.getByRole("button", { name: "发送" }).click();
    const answer = page.getByLabel("正式回答", { exact: true });
    await expect(answer).toBeVisible();
    if (markerMode === "ask") {
      await expect(answer).toContainText("本月收入为 128 万元。");
      await page.getByRole("button", { name: /^思考过程/ }).click();
      await expect(page.getByLabel("模型思考")).toContainText(thought);
      await expect(page.getByLabel("模型思考")).not.toContainText(/mm:|<\/|<mm/);
      await page.getByRole("button", { name: /^思考过程/ }).click();
    } else {
      await expect(answer).toContainText(/数据|结果|记录/);
      await expect(answer).toContainText("成都卓一科技有限公司");
      await expect(answer).toContainText("9");
      await expect(page.getByRole("region", { name: "分析结果", exact: true }).getByRole("table")).toHaveCount(0);
      const tables = await expandQueryTables(page);
      await expect(tables.getByRole("table")).toHaveCount(1);
      await page.getByRole("button", { name: /^查询过程/ }).click();
    }
    await expect(page.getByRole("region", { name: "分析结果", exact: true })).not.toContainText(/mm:|<\/|<mm/);
    await expect(answer).not.toContainText(thought);
    await page.getByRole("button", { name: "复制回答", exact: true }).click();
    const copied = await page.evaluate(() => (window as Window & { __copiedAnswer?: string }).__copiedAnswer ?? "");
    expect(copied).not.toMatch(/mm:|<\/|<mm/);
    expect(copied).not.toContain(thought);
    expect(copied).toContain(markerMode === "ask" ? "128" : "9");
    if (markerMode === "ask") {
      await expect(page.getByRole("button", { name: /^思考过程/ })).toHaveAttribute("aria-expanded", "false");
    } else {
      // Agent夹具只有空协议壳，无公开思考；不应凭空创建完成阶段。
      await expect(page.getByRole("region", { name: "思考过程", exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: /^查询过程/ })).toHaveAttribute("aria-expanded", "true");
    for (const width of [1440, 1672, 1920, 2200, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 1100 : 1050 });
      await expectNoHorizontalOverflow(page);
      await answer.scrollIntoViewIfNeeded();
      await expect(answer).toBeVisible();
      if ([1672, 390].includes(width)) await page.screenshot({ path: `outputs/query-process/clean-thinking-${markerMode}-${width}.png`, animations: "disabled", fullPage: true });
      if (width === 1672) {
        await page.locator(".analysis-card").screenshot({ path: `outputs/query-process/clean-thinking-card-${markerMode}-1672.png`, animations: "disabled" });
      }
    }
    if (markerMode === "agent") {
      await expandExecution(page);
      await expect(page.getByRole("button", { name: "打开 问数智能体执行详情" })).toBeVisible();
    }
  });
}

test("production heading and introduction preserve Top3 answer and the complete authoritative query", async ({ page }) => {
  const title = "善治数字科技（成都）有限公司合同对手方数量排名（Top 3，并列全部列出）";
  const introduction = "按合同乙方聚合统计，对甲方=善治数字科技（成都）有限公司合同记录进行计数并降序排序：";
  const ranked = [
    { rank: 1, company: "广州思迈特软件有限公司", count: 6 },
    { rank: 2, company: "杭州海康威视科技有限公司", count: 5 },
    { rank: 3, company: "云南蚁象网络科技有限公司", count: 3 },
    { rank: 3, company: "成都并列公司", count: 3 }
  ];
  const fourth = { rank: 4, company: "第四名公司", count: 2 };
  const markdown = `## ${title}\n\n${introduction}\n\n| 排名 | 对手方 | 合同数量 |\n| --- | --- | ---: |\n${ranked.map(({ rank, company, count }) => `| ${rank} | ${company} | ${count} |`).join("\n")}`;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { (window as Window & { __copiedAnswer?: string }).__copiedAnswer = text; } }
    });
  });
  const fixture = await installDataHubFixture(page, { buildAgentResponse: (request) => {
    const root = { agentName: "编排智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
    const child = { agentName: "问数智能体", sessionId: "production-ranked-contracts", parentSessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
    return [
      sseEvent({ ...root, type: "agent_start", content: {} }),
      sseEvent({ ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, subagentId: "ranked-contracts-agent", label: "合同对手方数量统计" } }),
      sseEvent({ ...child, type: "table", content: {
        columns: [{ name: "rank", title: "排名", type: "number" }, { name: "company", title: "对手方" }, { name: "count", title: "合同数量", type: "number" }],
        rows: [...ranked, fourth], totalRows: 5, source: "cube"
      } }),
      sseEvent({ ...child, type: "done", content: { mode: "ask" } }),
      sseEvent({ ...root, type: "text", content: markdown, replyId: "production-heading-introduction-table" }),
      sseEvent({ ...root, type: "done", content: { mode: "agent", adaptiveTeam: true, completion: "complete" }, finished: true }),
      "data: [DONE]\n\n"
    ].join("");
  } });
  await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({ json: envelope({ chartable: false, reason: "本回归验证移表后正文保留并列排名事实。" }) }));
  await page.goto("/ask-agent");
  await page.getByRole("textbox", { name: "命令输入" }).fill("和善治签合同的公司签合同数量top3，并列全部列出");
  await page.getByRole("button", { name: "发送" }).click();
  const output = page.getByRole("region", { name: "分析结果", exact: true });
  const answer = output.getByLabel("正式回答", { exact: true });
  await expect(answer.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(answer).toContainText(introduction);
  for (const { company, count } of ranked) {
    await expect(answer).toContainText(new RegExp(`${company}[^。；\\n]*${count}`));
  }
  await expect(answer).not.toContainText(fourth.company);
  await expect(answer).not.toContainText(/mm:think|<think|\|/);
  await expect(output.getByRole("table")).toHaveCount(1);
  await expect(answer.getByRole("row")).toHaveCount(ranked.length + 1);
  await expect(page.getByRole("button", { name: /^查询过程/ })).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "复制回答", exact: true }).click();
  const copied = await page.evaluate(() => (window as Window & { __copiedAnswer?: string }).__copiedAnswer ?? "");
  for (const { company, count } of ranked) expect(copied).toMatch(new RegExp(`${company}[^。；\\n]*${count}`));
  expect(copied).not.toContain(fourth.company);
  expect(copied).not.toMatch(/mm:think|<\/?think/);

  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 1100 : 1050 });
    await expectNoHorizontalOverflow(page);
    await answer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/result-summary-content/production-${width}.png`, animations: "disabled", fullPage: true });
    // Capture the answer itself, not an ancestor clipped by the conversation scroll container.
    await answer.screenshot({ path: `outputs/result-summary-content/answer-${width}.png`, animations: "disabled" });
  }
  await page.setViewportSize({ width: 1672, height: 1050 });
  const tables = await expandQueryTables(page);
  await expect(tables.locator('.datahub-query-result[data-result-kind="table"]')).toHaveCount(1);
  await expect(tables.getByRole("table")).toHaveCount(1);
  const rawTable = tables.getByRole("table").filter({ has: page.getByRole("cell", { name: fourth.company, exact: true }) });
  await expect(rawTable).toHaveCount(1);
  await expect(rawTable.getByRole("row")).toHaveCount(6);
  for (const { rank, company, count } of [...ranked, fourth]) {
    const row = rawTable.getByRole("row").filter({ has: page.getByRole("cell", { name: company, exact: true }) });
    // Read the complete row to retain rank and metric independently when both happen to be 3.
    await expect(row).toContainText(company);
    const cells = await row.getByRole("cell").allTextContents();
    expect(cells.slice(-3)).toEqual([String(rank), company, String(count)]);
  }
  await tables.screenshot({ path: "outputs/result-summary-content/query-table-1672.png", animations: "disabled" });
  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "agent");
});

for (const completeSnapshot of [true, false]) {
  test(`thinking completeness preserves ${completeSnapshot ? "the full child snapshot" : "only the returned public summary"}`, async ({ page }) => {
    const opening = "我会先核对合同范围，再汇总对手方数量。";
    const paragraphs = [
      "已确认本次任务关注合同对手方的合同数量，统计范围按照用户指定的签约主体执行。",
      "正在核对合同主体字段与对手方名称，确保使用相同的单位口径进行归集。",
      "已查看可用数据的合同编号与对手方字段，后续仅采用本次实际返回的合同记录。",
      "正在核对名称是否存在重复展示，名称相近但主体不同的记录应继续分别保留。",
      "已确认统计指标为合同记录数量，不能将合同金额或其他数值列作为合同数量。",
      "正在核对分组后的统计结果，缺少对手方名称的记录不会被猜测为任意已知公司。",
      "已将返回的对手方数量结果按同一规则整理，原始查询表仍保留用于查看和核对。",
      "正在检查结果中是否存在并列数量，展示排名时应保留用户要求的全部并列主体。",
      "已核对输出字段的中文名称与数量单位，正式回答将与实际返回的表格保持一致。",
      "公开进度核对结束，接下来交付已验证的统计结果，并保留完整原表供用户查看。"
    ];
    const finalAnswer = "合同统计完成：广州思迈特软件有限公司 6 份，杭州海康威视科技有限公司 5 份。";
    const sourceNote = "本轮仅返回以上公开思考摘要，详细执行步骤可在查询过程查看。";
    await installDataHubFixture(page, { buildAgentResponse: (request) => {
      const root = { agentName: "编排智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
      const child = { agentName: "问数智能体", sessionId: "thinking-contract-child", parentSessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
      return [
        sseEvent({ ...root, type: "thinking", content: opening, isThinking: true, replyId: "root-public-summary", modelCallIndex: 1 }),
        sseEvent({ ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, subagentId: "thinking-contract-agent", label: "合同统计" } }),
        ...(completeSnapshot ? [
          sseEvent({ ...child, type: "thinking", content: paragraphs[0], isThinking: true, replyId: "child-public-summary-1", modelCallIndex: 1 }),
          sseEvent({ ...child, type: "thinking", content: paragraphs[1], isThinking: true, replyId: "child-public-summary-2", modelCallIndex: 2 })
        ] : []),
        sseEvent({ ...child, type: "tool_call", content: { name: "execute_query", arguments: { sql: "SELECT contract_counterparty FROM internal_contract_fixture", private_parameter: "tool-arguments-must-not-be-thoughts" } } }),
        sseEvent({ ...child, type: "table", content: { columns: ["对手方", "合同数量"], rows: [["广州思迈特软件有限公司", 6], ["杭州海康威视科技有限公司", 5]], totalRows: 2, source: "cube" } }),
        sseEvent({ ...child, type: "text", content: finalAnswer, replyId: "child-formal-answer" }),
        sseEvent({ ...child, type: "done", content: { mode: "ask", ...(completeSnapshot ? { thinkingContent: paragraphs.join("\n\n") } : {}) } }),
        sseEvent({ ...root, type: "text", content: finalAnswer, replyId: "root-formal-answer" }),
        sseEvent({ ...root, type: "done", content: { mode: "agent", adaptiveTeam: true }, finished: true }),
        "data: [DONE]\n\n"
      ].join("");
    } });
    await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({ json: envelope({ chartable: false, reason: "本回归只核对公开思考与结果数据的独立性。" }) }));
    await page.goto("/ask-agent");
    await page.getByRole("textbox", { name: "命令输入" }).fill("核对合同对手方的合同数量");
    await page.getByRole("button", { name: "发送" }).click();
    const answer = page.getByLabel("正式回答", { exact: true });
    await expect(answer).toContainText(finalAnswer);
    await expect(page.getByRole("button", { name: /^思考过程/ })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: /^思考过程/ }).click();
    const dock = page.getByRole("region", { name: "思考过程", exact: true });
    const thoughts = dock.getByLabel("模型思考", { exact: true });
    await expect(thoughts.getByText(opening, { exact: true })).toHaveCount(1);
    await expect(thoughts).not.toContainText(finalAnswer);
    await expect(thoughts).not.toContainText(/SELECT|internal_contract_fixture|private_parameter|tool-arguments-must-not-be-thoughts/);
    if (completeSnapshot) {
      await expect(thoughts.getByRole("heading", { name: "主任务", exact: true })).toBeVisible();
      await expect(thoughts.getByRole("heading", { name: "合同统计", exact: true })).toBeVisible();
      for (const paragraph of paragraphs) await expect(thoughts.getByText(paragraph, { exact: true })).toHaveCount(1);
      await expect(dock).not.toContainText(sourceNote);
    } else {
      await expect(thoughts.locator("p")).toHaveCount(1);
      await expect(dock).toContainText(sourceNote);
      for (const paragraph of paragraphs) await expect(thoughts).not.toContainText(paragraph);
    }
    for (const width of [1440, 1672, 1920, 2200, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 1100 : 1050 });
      await expectNoHorizontalOverflow(page);
      await expect.poll(() => thoughts.evaluate((node) => ({
        maxHeight: getComputedStyle(node).maxHeight,
        clipped: node.scrollHeight > node.clientHeight + 1
      }))).toEqual({ maxHeight: "none", clipped: false });
      if (completeSnapshot) expect(await thoughts.evaluate((node) => node.clientHeight)).toBeGreaterThan(260);
      await page.screenshot({ path: `outputs/thinking-completeness/${completeSnapshot ? "full-snapshot" : "single-summary"}-${width}.png`, animations: "disabled", fullPage: true });
      if (width === 1672 || width === 390) {
        const height = Math.ceil((await dock.boundingBox())!.height) + 400;
        await page.setViewportSize({ width, height: Math.max(height, 1100) });
        await dock.scrollIntoViewIfNeeded();
        await dock.screenshot({ path: `outputs/thinking-completeness/${completeSnapshot ? "complete-thinking" : "single-thinking"}-${width}.png`, animations: "disabled" });
      }
    }
    await page.setViewportSize({ width: 1672, height: 1050 });
    await page.getByRole("button", { name: /^思考过程/ }).click();
    const tables = await expandQueryTables(page);
    await expect(tables.getByRole("table")).toHaveCount(1);
    await expect(tables.getByRole("cell", { name: "广州思迈特软件有限公司", exact: true })).toBeVisible();
    await expect(tables.getByRole("cell", { name: "6", exact: true })).toBeVisible();
    await expect(answer).toContainText(finalAnswer);
    await expandExecution(page);
    await expect(page.getByRole("button", { name: "打开 合同统计执行详情", exact: true })).toBeVisible();
  });
}

test("production query explains scope grouping count and actual sorting as readable steps", async ({ page }) => {
  const company = "善治数字科技（成都）有限公司";
  const finalAnswer = "广州思迈特软件有限公司签约 6 份，杭州海康威视科技有限公司签约 5 份。";
  await installDataHubFixture(page, { buildAgentResponse: (request) => {
    const root = { agentName: "编排智能体", sessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
    const child = { agentName: "问数智能体", sessionId: "readable-contracts", parentSessionId: request.sessionId, globalSessionId: request.globalSessionId, chatId: request.chatId };
    return [
      sseEvent({ ...root, type: "thinking", content: "先确认合同主体，再核对各对手方签约数量。", isThinking: true }),
      sseEvent({ ...child, type: "subagent_exposed", content: { agentId: "ask-data", sessionId: child.sessionId, subagentId: "readable-contracts-agent", label: "合同统计" } }),
      sseEvent({ ...child, type: "data_source_selected", content: { datasourceId: 8, datasourceName: "合同数据系统" } }),
      sseEvent({ ...child, type: "table", content: {
        columns: [{ name: "Contract.partyB", title: "合同乙方单位名称" }, { name: "Contract.count", title: "记录数", type: "number" }],
        rows: [{ "Contract.partyB": "广州思迈特软件有限公司", "Contract.count": 6 }, { "Contract.partyB": "杭州海康威视科技有限公司", "Contract.count": 5 }],
        totalRows: 2, source: "cube", tableComment: "合同主数据清单，记录合同编号、签约双方及合同金额",
        annotation: {
          dimensions: { "Contract.partyA": { title: "合同甲方单位名称" }, "Contract.partyB": { title: "合同乙方单位名称" } },
          measures: { "Contract.count": { title: "记录数", type: "number" } }
        },
        query: { dimensions: ["Contract.partyB"], measures: ["Contract.count"], filters: [{ member: "Contract.partyA", operator: "equals", values: [company] }], order: { "Contract.count": "desc" } }
      } }),
      sseEvent({ ...child, type: "done", content: { mode: "ask" } }),
      sseEvent({ ...root, type: "text", content: finalAnswer }),
      sseEvent({ ...root, type: "done", content: { mode: "agent", adaptiveTeam: true }, finished: true }),
      "data: [DONE]\n\n"
    ].join("");
  } });
  await page.route("**/api/v1/chat/chart-plan", (route) => route.fulfill({ json: envelope({ chartable: false, reason: "核对真实查询字段和自然步骤。" }) }));
  await page.goto("/ask-agent");
  await page.getByRole("textbox", { name: "命令输入" }).fill(`甲方为${company}的合同，按乙方分组统计合同数量并降序排列`);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByLabel("正式回答", { exact: true })).toContainText(finalAnswer);
  const query = await expandQueryProcess(page);
  const steps = query.getByRole("list", { name: "查询步骤", exact: true });
  await expect(steps.getByRole("listitem")).toHaveCount(4);
  await expect(steps).toContainText("限定查询范围");
  await expect(steps).toContainText("合同数据系统");
  await expect(steps).toContainText("合同主数据清单");
  await expect(steps).toContainText(company);
  await expect(steps).toContainText("将“合同乙方单位名称”相同的记录归为一组，统计每组有多少条记录");
  await expect(steps).toContainText("按“记录数”从高到低排列");
  await expect(steps).toContainText("本次返回 2 行数据");
  await expect(steps).not.toContainText(/Contract\.|SELECT|GROUP BY|ORDER BY/);
  const detail = query.locator("details").filter({ has: page.getByText("查看查询细节", { exact: true }) });
  await expect(detail).not.toHaveAttribute("open", "");
  await detail.locator("summary").click();
  await expect(detail).toHaveAttribute("open", "");
  await expect(detail).toContainText("合同乙方单位名称");
  await expect(detail).toContainText("记录数");
  await detail.locator("summary").click();
  for (const width of [1440, 1672, 1920, 2200, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 1100 : 1050 });
    await expectNoHorizontalOverflow(page);
    await query.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/process-motion/qa/query-steps-${width}.png`, animations: "disabled", fullPage: true });
    await steps.screenshot({ path: `outputs/process-motion/qa/readable-steps-${width}.png`, animations: "disabled" });
  }
  await page.setViewportSize({ width: 1672, height: 1050 });
  const tables = await expandQueryTables(page);
  await expect(tables.getByRole("table")).toHaveCount(1);
  await expect(tables.getByRole("row")).toHaveCount(3);
  await expect(tables.getByRole("cell", { name: "广州思迈特软件有限公司", exact: true })).toBeVisible();
  await expect(tables.getByRole("cell", { name: "6", exact: true })).toBeVisible();
  await expandExecution(page);
  await expect(page.getByRole("button", { name: "打开 合同统计执行详情", exact: true })).toBeVisible();
});
