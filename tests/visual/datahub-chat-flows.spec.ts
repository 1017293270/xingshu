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
        "根据制度，**单笔差旅费超过 5000 元需复核**。\n\n<script>window.__unsafeHtmlExecuted = true</script>",
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

  await page.route("**/fixtures/source/finance-policy-v2.pdf", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "%PDF-1.4\n% Playwright source fixture\n"
    });
  });
  await page.route("**/fixtures/source/sales-policy-2026.pdf", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: "%PDF-1.4\n% Playwright sales policy source fixture\n"
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
              ? "http://127.0.0.1:4173/fixtures/source/sales-policy-2026.pdf"
              : "http://127.0.0.1:4173/fixtures/source/finance-policy-v2.pdf"
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

test.beforeEach(async ({ page }) => {
  await installAuthenticatedSession(page);
  await page.setViewportSize({ width: 1672, height: 941 });
});

test("workspace model selector changes the strict DataHub chatMode request parameter", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-data");

  await page.getByRole("textbox", { name: "命令输入" }).fill("查询最新差旅制度");
  await page.getByRole("button", { name: "选择模型，当前问数模型" }).click();
  await expect(page.getByRole("menuitem", { name: /问知模型/ })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/analysis-model-selector-open-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.getByRole("menuitem", { name: /问知模型/ }).click();

  await expect(page.getByRole("button", { name: "选择模型，当前问知模型" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "命令输入" })).toHaveValue("查询最新差旅制度");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "选择模型，当前问知模型" }).click();
  await expect(page.getByRole("menuitem", { name: /编排模型/ })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/analysis-model-selector-open-390x844.png",
    animations: "disabled",
    fullPage: true
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page).toHaveURL(/\/ask-knowledge$/);
  await expect(page.getByRole("heading", { name: "问知完成" })).toBeVisible();
  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "rag");
  expect(fixture.streamRequests[0].message).toBe("查询最新差旅制度");
});

test("ask-data sends the strict v2 request and supports table to favorite", async ({ page }) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-data");

  await page.getByRole("textbox", { name: "命令输入" }).fill("本月收入是多少？");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("本月收入为 128 万元。", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("已选择数据源")).toContainText("经营分析库");
  await expect(page.getByText("子任务已完成。")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "7月" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "128" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "月度收入趋势" })).toBeVisible();
  await expect(page.locator('[data-echarts-ready="true"]')).toBeVisible();
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
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/ask-data-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("cell", { name: "7月" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("cell", { name: "7月" })).toBeVisible();
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/ask-data-v2-flow-390x844.png",
    animations: "disabled",
    fullPage: true
  });
});

test("ask-knowledge renders safe Markdown, deduplicates citations, and opens authenticated source", async ({
  page
}) => {
  const fixture = await installDataHubFixture(page);
  await page.goto("/ask-knowledge");

  await page.getByRole("textbox", { name: "命令输入" }).fill("差旅费超过多少需要复核？");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("正在检索并复核制度原文。")).toBeVisible();
  await expect(page.getByText("单笔差旅费超过 5000 元需复核")).toBeVisible();
  await expect(page.getByRole("heading", { name: "引用文档" })).toBeVisible();
  await expect(page.locator(".knowledge-citation")).toHaveCount(1);
  await expect(page.getByText("财务报销制度（2026）")).toBeVisible();
  await expect(page.getByRole("button", { name: "收藏问数" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出结果" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI 生成图表" })).toHaveCount(0);

  expect(await page.evaluate(() => "__unsafeHtmlExecuted" in window)).toBe(false);
  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "rag");
  expect(fixture.streamRequests[0].message).toBe("差旅费超过多少需要复核？");

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "打开原文" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/fixtures\/source\/finance-policy-v2\.pdf$/);

  expect(fixture.citationPreviewHeaders).toEqual([
    {
      authorization: "Bearer playwright-datahub-chat-token",
      spaceId: "1"
    }
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "已通过 data-hub 鉴权打开原文" }).last()
  ).toHaveText("已通过 data-hub 鉴权打开原文");
  await page.screenshot({
    path: "outputs/xingshu-homepage-system/qa/react/ask-knowledge-v2-flow-1672x941.png",
    animations: "disabled",
    fullPage: true
  });
  await popup.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "打开原文" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "打开原文" })).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "找文档完成" })).toBeVisible();
  await expect(page.getByText("找文档 Agent 执行")).toBeVisible();
  await expect(page.getByText("销售管理制度（2026）")).toHaveCount(1);
  await expect(page.locator(".document-lookup-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "收藏问数" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出结果" })).toHaveCount(0);

  expect(fixture.streamRequests).toHaveLength(1);
  expectStrictStreamRequest(fixture.streamRequests[0], "document_lookup");

  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "打开原文：销售管理制度（2026）" })
    .click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/fixtures\/source\/sales-policy-2026\.pdf$/);
  expect(fixture.citationPreviewHeaders).toEqual([
    {
      authorization: "Bearer playwright-datahub-chat-token",
      spaceId: "1"
    }
  ]);
  await popup.close();

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

test("agent ask-data child automatically generates a chart from its structured table", async ({
  page
}, testInfo) => {
  await installDataHubFixture(page);
  await page.goto("/ask-agent");

  await page
    .getByRole("textbox", { name: "命令输入" })
    .fill("分析本季度销售变化");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByRole("heading", { name: "智能编排完成" })).toBeVisible();
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
  ).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "智能编排完成" })).toBeVisible();
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

  const technicalDetails = analysisActivity.getByRole("group", {
    name: "技术详情"
  });
  await expect(technicalDetails).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("subagent-model-activity-drawer-1672x941.png"),
    animations: "disabled",
    fullPage: true
  });

  await expect(technicalDetails).toContainText("模型推理");
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

  await expect(page.getByRole("heading", { name: "智能编排完成" })).toBeVisible();
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
  await expect(dataAgentSummary).toContainText("已完成");

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

  await expect(drawer.getByText("正在查询销售数据。")).toBeVisible();
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
  await expect(drawer.getByText("正在检索费用制度。")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "收藏问数" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "智能编排完成" })).toBeVisible();
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

  await expect(page.getByRole("heading", { name: "智能编排完成" })).toBeVisible();
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
  await expect(page.getByText("正在检索并复核制度原文。")).toBeVisible();
  await expect(page.getByText("单笔差旅费超过 5000 元需复核")).toBeVisible();
  await expect(page.locator(".knowledge-citation")).toHaveCount(1);
  await expect(page.getByText("财务报销制度（2026）")).toBeVisible();
  await expect(page.getByRole("button", { name: "收藏问数" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出结果" })).toHaveCount(0);
});

test("persisted agent history restores the same root and child execution graph", async ({
  page
}) => {
  await installDataHubFixture(page);
  await page.goto("/history");

  await page.getByRole("button", { name: /销售变化分析/ }).click();

  await expect(page).toHaveURL(/\/ask-agent$/);
  await expect(page.getByText("历史数据结论：销售额环比下降", { exact: false }).last()).toBeVisible();
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
  await expect(drawer.getByText("历史中的子 Agent 正在查询销售数据。")).toBeVisible();
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
  await expect(page.getByText("找文档 Agent 执行")).toBeVisible();
  await expect(page.getByText("销售管理制度（2026）")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "打开原文：销售管理制度（2026）" })
  ).toBeVisible();
  await expect(page.locator(".document-lookup-card")).toHaveCount(1);
});
