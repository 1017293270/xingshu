import { describe, expect, it } from "vitest";
import {
  createDataHubAskTurn,
  getDataHubActionLabel,
  normalizeDataHubTableResult,
  resolveDataHubFinalAnswer
} from "./dataHubAskDataPresenter";
import type { DataHubStreamEvent } from "@/types/dataHub";

describe("dataHubAskDataPresenter", () => {
  it("preserves explicit totals and table provenance while allowing genuine zero-row responses", () => {
    expect(normalizeDataHubTableResult({})).toBeNull();
    expect(normalizeDataHubTableResult({ data: [] })).toMatchObject({ rows: [], totalRows: 0, totalRowsKnown: false });
    expect(normalizeDataHubTableResult({ rows: "[]", totalRows: 0 })).toMatchObject({ rows: [], totalRows: 0, totalRowsKnown: true });
    expect(normalizeDataHubTableResult({ rows: [], totalRows: 0, datasourceId: "2", title: "合同", usedAssets: [
      { assetId: "dps-table:2:contract", assetName: "contract", assetType: "TABLE" }
    ] })).toMatchObject({ totalRowsKnown: true, datasourceId: "2", title: "合同", usedAssets: [{ assetName: "contract" }] });
    expect(normalizeDataHubTableResult({ rows: [{ a: 1 }], totalRows: -1 })).toMatchObject({ totalRows: 1, totalRowsKnown: false });
    expect(normalizeDataHubTableResult({ datasourceId: 2, title: "合同", result: { data: [] }, query: { measures: ["Contract.count"] } }))
      .toMatchObject({ datasourceId: 2, title: "合同", rows: [], business: { fields: ["记录数"] } });
  });
  it("backfills a complete public thinking snapshot after an initial streamed introduction", () => {
    const turn = createDataHubAskTurn("合同排名", [
      { type: "thinking", content: "我来查询合同排名。", replyId: "planning", modelCallIndex: 1 },
      { type: "done", content: { thinkingContent: "我来查询合同排名。\n\n已确认按合同乙方分组，并保留第三名并列。", summary: "合同结果。" } }
    ], "done");
    expect(turn.thinkingContent).toContain("已确认按合同乙方分组，并保留第三名并列。");
    expect(turn.thinkingContent.match(/我来查询合同排名/g)).toHaveLength(1);
    expect(turn.assistantContent).toBe("合同结果。");
  });

  it("normalizes data-hub table payloads with object columns and rows", () => {
    const table = normalizeDataHubTableResult({
      columns: [
        { name: "WechatyProjectInfo.projectName", title: "项目名称" },
        { name: "WechatyConsulationRecord.count", title: "咨询数", type: "number" }
      ],
      rows: [
        {
          "WechatyProjectInfo.projectName": "演示账号",
          "WechatyConsulationRecord.count": 716
        }
      ],
      totalRows: 1,
      source: "cube"
    });

    expect(table).toMatchObject({
      totalRows: 1,
      source: "cube",
      columns: [
        { key: "WechatyProjectInfo.projectName", title: "项目名称" },
        { key: "WechatyConsulationRecord.count", title: "咨询数", type: "number" }
      ],
      rows: [
        {
          "WechatyProjectInfo.projectName": "演示账号",
          "WechatyConsulationRecord.count": 716
        }
      ]
    });
  });

  it("builds a renderable ask turn from the platform SSE event sequence", () => {
    const events: DataHubStreamEvent[] = [
      {
        type: "routing_intent",
        data: { step: "route_intent", message: "已完成意图路由", intent: "ASK_DATA", status: "success" }
      },
      {
        type: "react_step",
        data: { round: 1, action: "locate_datasource", status: "success", summary: "datasourceId=1" }
      },
      {
        type: "routing_decompose",
        data: { executionMode: "SIMPLE", subQuestions: ["统计各社区咨询数"] }
      },
      {
        type: "table",
        data: {
          columns: ["社区", "咨询数"],
          rows: [["演示账号", 716]],
          totalRows: 1
        }
      },
      {
        type: "ask_artifact",
        sessionId: "session-20260722",
        chatId: "chat-20260722",
        data: {
          askRunId: "ask-run-20260722",
          resolvedQuestion: "统计当前空间各社区的咨询总数",
          canFavorite: true
        }
      },
      {
        type: "done",
        data: { summary: "目前咨询数最多的社区为演示账号，累计咨询记录 716 条。", loopRounds: 6 }
      }
    ];

    const turn = createDataHubAskTurn("目前咨询数最多的社区是哪个社区", events, "done");

    expect(turn.assistantContent).toBe("目前咨询数最多的社区为演示账号，累计咨询记录 716 条。");
    expect(turn.decompose?.subQuestions).toEqual(["统计各社区咨询数"]);
    expect(turn.reactSteps).toHaveLength(1);
    expect(turn.tableResults[0].rows[0]).toEqual({ 社区: "演示账号", 咨询数: 716 });
    expect(turn.artifact).toEqual({
      askRunId: "ask-run-20260722",
      resolvedQuestion: "统计当前空间各社区的咨询总数",
      canFavorite: true
    });
    expect(turn.sessionId).toBe("session-20260722");
    expect(turn.chatId).toBe("chat-20260722");
    expect(getDataHubActionLabel(turn.reactSteps[0].action)).toBe("定位数据源");
  });

  it("restores table payloads persisted as JSON strings in history events", () => {
    const events: DataHubStreamEvent[] = [
      {
        type: "table",
        data: JSON.stringify({
          type: "table",
          data: {
            columns: [
              { name: "community", title: "社区" },
              { name: "consultCount", title: "咨询数", type: "number" }
            ],
            rows: [{ community: "六角井社区", consultCount: 128 }],
            totalRows: 1,
            source: "cube"
          }
        })
      },
      {
        type: "done",
        data: JSON.stringify({ summary: "六角井社区共有 128 条咨询记录。" })
      }
    ];

    const turn = createDataHubAskTurn("六角井社区有多少咨询?", events, "done");

    expect(turn.assistantContent).toBe("六角井社区共有 128 条咨询记录。");
    expect(turn.tableResults).toHaveLength(1);
    expect(turn.tableResults[0].columns).toEqual([
      { key: "community", title: "社区", type: undefined },
      { key: "consultCount", title: "咨询数", type: "number" }
    ]);
    expect(turn.tableResults[0].rows[0]).toEqual({ community: "六角井社区", consultCount: 128 });
  });

  it("normalizes stringified table rows and columns from persisted events", () => {
    const table = normalizeDataHubTableResult({
      columns: JSON.stringify(["社区", "咨询数"]),
      rows: JSON.stringify([["六角井社区", 128]]),
      rowCount: 1
    });

    expect(table?.totalRows).toBe(1);
    expect(table?.rows[0]).toEqual({ 社区: "六角井社区", 咨询数: 128 });
  });

  it("restores Chinese titles when persisted tables only contain physical field keys", () => {
    const table = normalizeDataHubTableResult({
      rows: [
        {
          "WechatyProjectInfo.projectName": "红星社区",
          "WechatyEventRecord.count": 1192
        }
      ],
      totalRows: 1
    });

    expect(table?.columns).toEqual([
      { key: "WechatyProjectInfo.projectName", title: "项目名称" },
      { key: "WechatyEventRecord.count", title: "事件记录数" }
    ]);
    expect(table?.rows[0]).toEqual({
      "WechatyProjectInfo.projectName": "红星社区",
      "WechatyEventRecord.count": 1192
    });
  });

  it("prefers Chinese table and column labels when the payload includes comments", () => {
    const table = normalizeDataHubTableResult({
      tableName: "RcbBankStatement",
      comment: "农商银行流水",
      columns: [
        {
          name: "RcbBankStatement.totalCreditAmount",
          title: "RcbBankStatement.totalCreditAmount",
          comment: "贷方发生额"
        }
      ],
      rows: [{ "RcbBankStatement.totalCreditAmount": 1280 }],
      totalRows: 1
    });

    expect(table?.groupLabel).toBe("农商银行流水");
    expect(table?.columns[0]).toMatchObject({
      key: "RcbBankStatement.totalCreditAmount",
      title: "贷方发生额"
    });
  });

  it("falls back to the English table name when no Chinese label exists", () => {
    const table = normalizeDataHubTableResult({
      tableName: "ContractList",
      columns: [{ name: "count", title: "count" }],
      rows: [{ count: 1 }]
    });

    expect(table?.groupLabel).toBe("ContractList");
  });

  it("uses the Cube annotation comment as the table label and short titles as column labels", () => {
    const table = normalizeDataHubTableResult({
      annotation: {
        measures: {
          "ContractList.count": {
            title: "合同主数据清单，记录合同编号、名称、年度、签约方及金额 记录数",
            shortTitle: "记录数",
            type: "number"
          }
        },
        dimensions: {
          "ContractList.contractYear": {
            title: "合同主数据清单，记录合同编号、名称、年度、签约方及金额 归属年度",
            shortTitle: "归属年度",
            type: "string"
          }
        }
      },
      data: [{ "ContractList.count": 1, "ContractList.contractYear": "2024年" }]
    });

    expect(table).toMatchObject({
      groupLabel: "合同主数据清单，记录合同编号、名称、年度、签约方及金额",
      columns: [
        { key: "ContractList.count", title: "记录数" },
        { key: "ContractList.contractYear", title: "归属年度" }
      ]
    });
  });

  it("presents new ask events with real thinking, text, table, and artifacts", () => {
    const events: DataHubStreamEvent[] = [
      {
        agentName: "问数智能体",
        type: "thinking",
        data: "正在读取经营指标。",
        isThinking: true,
        replyId: "reply-1",
        modelCallIndex: 1
      },
      {
        agentName: "问数智能体",
        type: "text",
        data: "本月收入为 **128 万元**。",
        replyId: "reply-2",
        modelCallIndex: 2
      },
      {
        type: "data_source_selected",
        data: { datasourceId: 8, datasourceName: "经营分析库" }
      },
      {
        type: "table",
        data: {
          annotation: {},
          data: [{ month: "7月", revenue: 128 }]
        }
      },
      {
        type: "ask_artifact",
        data: {
          askRunId: "ask-run-new",
          resolvedQuestion: "统计本月收入",
          canFavorite: true
        }
      },
      {
        type: "done",
        data: {},
        finished: true
      }
    ];

    const turn = createDataHubAskTurn("本月收入是多少？", events, "done", "", {
      sessionId: "session-main",
      chatId: "chat-main"
    });

    expect(turn.sessionId).toBe("session-main");
    expect(turn.chatId).toBe("chat-main");
    expect(turn.thinkingContent).toBe("正在读取经营指标。");
    expect(turn.assistantContent).toBe("本月收入为 **128 万元**。");
    expect(turn.dataSources).toEqual([{ datasourceId: 8, datasourceName: "经营分析库" }]);
    expect(turn.tableResults[0].rows).toEqual([{ month: "7月", revenue: 128 }]);
    expect(turn.artifact).toEqual({
      askRunId: "ask-run-new",
      resolvedQuestion: "统计本月收入",
      canFavorite: true
    });
    expect(turn.reactSteps).toHaveLength(0);
    expect(turn.routingEvents).toHaveLength(0);
  });

  it("deduplicates verified knowledge citations and preserves model-call boundaries", () => {
    const events: DataHubStreamEvent[] = [
      {
        type: "thinking",
        data: "检索制度",
        replyId: "reply-1",
        modelCallIndex: 1
      },
      {
        type: "thinking",
        data: "并复核证据",
        replyId: "reply-1",
        modelCallIndex: 1
      },
      {
        type: "thinking",
        data: "形成答案",
        replyId: "reply-2",
        modelCallIndex: 2
      },
      {
        type: "text",
        data: "审批需经过部门和法务审核。",
        replyId: "reply-2",
        modelCallIndex: 2
      },
      {
        type: "citation_document",
        data: {
          docId: "doc-1",
          docKey: "contract-policy",
          kbId: "kb-1",
          docName: "合同管理办法.pdf",
          fragments: ["审批需经过部门和法务审核。"]
        }
      },
      {
        type: "citation_document",
        data: {
          docId: "doc-1",
          docKey: "contract-policy",
          kbId: "kb-1",
          docName: "重复引用.pdf"
        }
      },
      {
        type: "done",
        data: {
          mode: "rag",
          askKnowledge: true,
          summary: "审批需经过部门和法务审核。",
          citationDocuments: [
            {
              docId: "doc-2",
              docKey: "authorization-policy",
              kbId: "kb-1",
              docName: "授权管理办法.pdf"
            }
          ]
        }
      }
    ];

    const turn = createDataHubAskTurn("审批流程？", events, "done");

    expect(turn.thinkingBlocks).toEqual([
      {
        content: "检索制度并复核证据",
        replyId: "reply-1",
        modelCallIndex: 1
      },
      {
        content: "形成答案",
        replyId: "reply-2",
        modelCallIndex: 2
      }
    ]);
    expect(turn.answerBlocks).toHaveLength(1);
    expect(turn.citationDocuments.map((citation) => citation.docId)).toEqual(["doc-1", "doc-2"]);
  });

  it("keeps citations without a docKey but marks their source unavailable", () => {
    const turn = createDataHubAskTurn(
      "审批流程？",
      [
        {
          type: "citation_document",
          data: {
            docId: "doc-a6",
            kbId: "kb-1",
            docName: "PRD A-6 之后的引用.pdf",
            sourceAvailable: true,
            fragments: ["docKey 缺席的引用不能被丢弃。"]
          }
        }
      ],
      "done"
    );

    expect(turn.citationDocuments).toHaveLength(1);
    expect(turn.citationDocuments[0]).toMatchObject({
      docId: "doc-a6",
      docKey: undefined,
      sourceAvailable: false,
      fragments: ["docKey 缺席的引用不能被丢弃。"]
    });
  });

  it("does not let a child-agent session replace the bound user session", () => {
    const turn = createDataHubAskTurn(
      "主问题",
      [
        {
          type: "thinking",
          data: "子智能体思考",
          sessionId: "child-session",
          globalSessionId: "main-session",
          parentSessionId: "main-session",
          chatId: "child-chat"
        },
        {
          type: "text",
          data: "不应混入主回答",
          sessionId: "child-session",
          globalSessionId: "main-session",
          parentSessionId: "main-session",
          chatId: "child-chat"
        },
        {
          type: "done",
          data: { summary: "子智能体终态" },
          sessionId: "child-session",
          globalSessionId: "main-session",
          parentSessionId: "main-session",
          chatId: "child-chat",
          finished: true
        },
        {
          type: "table",
          data: {
            columns: ["内部结果"],
            rows: [["不应进入主表格"]]
          },
          sessionId: "child-session",
          globalSessionId: "main-session",
          parentSessionId: "main-session",
          chatId: "child-chat"
        },
        {
          type: "citation_document",
          data: {
            docId: "child-doc",
            docKey: "child.pdf",
            kbId: "child-kb"
          },
          sessionId: "child-session",
          globalSessionId: "main-session",
          parentSessionId: "main-session",
          chatId: "child-chat"
        },
        {
          type: "text",
          data: "主智能体正式回答",
          sessionId: "main-session",
          globalSessionId: "main-session",
          chatId: "main-chat"
        }
      ],
      "done",
      "",
      { sessionId: "main-session", chatId: "main-chat" }
    );

    expect(turn.sessionId).toBe("main-session");
    expect(turn.chatId).toBe("main-chat");
    expect(turn.thinkingContent).toBe("");
    expect(turn.assistantContent).toBe("主智能体正式回答");
    expect(turn.tableResults).toEqual([]);
    expect(turn.citationDocuments).toEqual([]);
    expect(turn.done).toBeUndefined();
  });

  it("uses DataHub done.summary as the official answer when it differs from streamed text", () => {
    const turn = createDataHubAskTurn(
      "合同金额是多少？",
      [
        { type: "text", data: "流式草稿：金额待定" },
        {
          type: "done",
          data: { mode: "rag", askKnowledge: true, summary: "合同金额为 128 万元。" }
        }
      ],
      "done"
    );

    expect(resolveDataHubFinalAnswer("合同金额为 128 万元。", "流式草稿：金额待定", false))
      .toBe("合同金额为 128 万元。");
    expect(turn.assistantContent).toBe("合同金额为 128 万元。");
    expect(turn.answerBlocks).toEqual([{ content: "合同金额为 128 万元。" }]);
  });

  it("keeps streamed root text when DataHub done has no summary", () => {
    const turn = createDataHubAskTurn(
      "只根据销售合同回答",
      [
        { type: "text", data: "编排结论：以合同约定为准。" },
        { type: "text", data: "合同条款详见子智能体。", parentSessionId: "child-rag" },
        { type: "done", data: { mode: "agent", adaptiveTeam: true } }
      ],
      "done"
    );

    expect(turn.assistantContent).toBe("编排结论：以合同约定为准。");
  });

  it("keeps the streamed agent synthesis when done.summary is only a completion status", () => {
    const turn = createDataHubAskTurn(
      "查询合同设备清单",
      [
        { type: "text", data: "我来帮您查询相关设备清单。" },
        {
          type: "text",
          data: "该合同设备清单共 12 项，主要包括远程控制终端、照明灯具与通信模块。"
        },
        {
          type: "done",
          data: {
            mode: "agent",
            adaptiveTeam: true,
            summary: "数据与制度来源均已完成。"
          }
        }
      ],
      "done"
    );

    expect(turn.assistantContent).toContain("该合同设备清单共 12 项");
    expect(turn.assistantContent).not.toBe("数据与制度来源均已完成。");
  });

  it("uses a real agent done.summary even when the streamed intro is longer", () => {
    const turn = createDataHubAskTurn(
      "查询合同设备清单",
      [
        {
          type: "text",
          data: "我来帮您查询眉山天府新区城市照明及景观亮化集中远程控制设备采购合同的相关设备清单。"
        },
        {
          type: "done",
          data: {
            mode: "agent",
            adaptiveTeam: true,
            summary: "该合同设备清单共 12 项。"
          }
        }
      ],
      "done"
    );

    expect(turn.assistantContent).toBe("该合同设备清单共 12 项。");
  });
  it("projects a controlled clarification and the answer that resumed it", () => {
    const turn = createDataHubAskTurn(
      "帮我做一张区域销售表",
      [
        { type: "text", data: "我先请您确认统计口径。" },
        {
          type: "clarification",
          data: {
            interactionId: "tool-call-1",
            question: "区域按哪个口径？",
            options: [{ label: "客户区域" }, { label: "签约主体区域" }],
            allowFreeText: true
          }
        },
        // 挂起也会推 done：这一轮状态是 done，但真正的下一步在用户手里。
        { type: "done", data: { suspended: true } },
        { type: "clarification_response", data: { interactionId: "tool-call-1", answer: "客户区域" } },
        { type: "text", data: "好的，按客户区域统计。" }
      ],
      "done"
    );

    expect(turn.clarifications).toHaveLength(1);
    expect(turn.clarifications[0].question).toBe("区域按哪个口径？");
    expect(turn.clarifications[0].selectedAnswer).toBe("客户区域");
    expect(turn.done?.suspended).toBe(true);
    expect(turn.error).toBeUndefined();
  });

  it("ignores a clarification raised inside a subagent session", () => {
    const turn = createDataHubAskTurn(
      "帮我做一张区域销售表",
      [
        {
          type: "clarification",
          parentSessionId: "root-session",
          data: {
            question: "区域按哪个口径？",
            options: [{ label: "客户区域", reply: "按客户所属区域统计" }],
            allowFreeText: true
          }
        }
      ],
      "done"
    );

    expect(turn.clarifications).toEqual([]);
  });

  it("keeps one copy when the result event resends the streamed answer under a new replyId", () => {
    const turn = createDataHubAskTurn(
      "本月收入是多少？",
      [
        { type: "text", data: "本月收入为 128 万元，", replyId: "reply-1", modelCallIndex: 1 },
        { type: "text", data: "同比增长 12%。", replyId: "reply-1", modelCallIndex: 1 },
        {
          type: "text",
          data: "本月收入为 128 万元，同比增长 12%。",
          replyId: "reply-2",
          modelCallIndex: 1
        },
        { type: "done", data: { mode: "ask" } }
      ],
      "done"
    );

    expect(turn.answerBlocks).toEqual([
      expect.objectContaining({ content: "本月收入为 128 万元，同比增长 12%。" })
    ]);
    expect(turn.assistantContent).toBe("本月收入为 128 万元，同比增长 12%。");
  });

  it("collapses a whole-answer resend that lands inside the same model call", () => {
    const turn = createDataHubAskTurn(
      "本月收入是多少？",
      [
        { type: "text", data: "本月收入为 128 万元，", replyId: "reply-1", modelCallIndex: 1 },
        { type: "text", data: "同比增长 12%。", replyId: "reply-1", modelCallIndex: 1 },
        {
          type: "text",
          data: "本月收入为 128 万元，同比增长 12%。",
          replyId: "reply-1",
          modelCallIndex: 1
        },
        { type: "done", data: { mode: "ask" } }
      ],
      "done"
    );

    expect(turn.answerBlocks).toHaveLength(1);
    expect(turn.assistantContent).toBe("本月收入为 128 万元，同比增长 12%。");
  });

  it("keeps a single copy when an orchestration root publishes the same conclusion twice", () => {
    const turn = createDataHubAskTurn(
      "对比华东华北业绩",
      [
        {
          type: "text",
          data: "华东区域销售额领先，占比 38%。",
          replyId: "reply-1",
          modelCallIndex: 1
        },
        {
          type: "text",
          data: "**华东区域销售额领先，占比 38%。**",
          replyId: "reply-2",
          modelCallIndex: 2
        },
        { type: "done", data: { mode: "agent", adaptiveTeam: true, summary: "均已完成" } }
      ],
      "done"
    );

    expect(turn.answerBlocks).toHaveLength(1);
    expect(turn.assistantContent).toBe("华东区域销售额领先，占比 38%。");
  });

  it("shows the rag summary once when done repeats the streamed text", () => {
    const turn = createDataHubAskTurn(
      "审批流程？",
      [
        { type: "text", data: "审批需经过部门和法务审核。", replyId: "reply-1" },
        {
          type: "done",
          data: {
            mode: "rag",
            askKnowledge: true,
            summary: "审批需经过部门和法务审核。"
          }
        }
      ],
      "done"
    );

    expect(turn.answerBlocks).toEqual([
      expect.objectContaining({ content: "审批需经过部门和法务审核。" })
    ]);
  });

  it("keeps every distinct model-call block of a multi-step answer", () => {
    const turn = createDataHubAskTurn(
      "分区域说明业绩",
      [
        {
          type: "text",
          data: "华东区域销售额领先，占比 38%。",
          replyId: "reply-1",
          modelCallIndex: 1
        },
        {
          type: "text",
          data: "华北区域同比下滑 8%，需要关注。",
          replyId: "reply-2",
          modelCallIndex: 2
        },
        { type: "done", data: { mode: "agent", adaptiveTeam: true, summary: "均已完成" } }
      ],
      "done"
    );

    expect(turn.answerBlocks.map((block) => block.content)).toEqual([
      "华东区域销售额领先，占比 38%。",
      "华北区域同比下滑 8%，需要关注。"
    ]);
  });
});

describe("buildDataHubBusinessTrace 查询过程", () => {
  // 顶部 import 另有 agent 在动，这里只在文件末尾追加，符号按需动态取。
  async function presenter() {
    return import("./dataHubAskDataPresenter");
  }

  const cubeTableEvent: DataHubStreamEvent = {
    type: "table",
    data: {
      columns: [
        { name: "Contract.partyB", title: "合同主数据清单，记录合同编号、名称。合同乙方单位名称" },
        { name: "Contract.count", title: "合同主数据清单，记录合同编号、名称。记录数", type: "number" }
      ],
      rows: [
        { "Contract.partyB": "永安镇人民政府", "Contract.count": 2 },
        { "Contract.partyB": "双流区水务局", "Contract.count": 1 }
      ],
      totalRows: 3,
      tableComment: "合同主数据清单，记录合同编号、名称、年度、签约双方及合同金额（万元）",
      annotation: {
        measures: {
          "Contract.count": {
            title: "合同主数据清单，记录合同编号、名称。记录数",
            shortTitle: "记录数",
            type: "number"
          }
        },
        dimensions: {
          "Contract.partyB": {
            title: "合同主数据清单，记录合同编号、名称。合同乙方单位名称",
            shortTitle: "合同乙方单位名称"
          },
          "Contract.partyA": {
            title: "合同主数据清单，记录合同编号、名称。合同甲方单位名称"
          }
        }
      },
      query: {
        measures: ["Contract.count"],
        dimensions: ["Contract.partyB"],
        filters: [
          {
            member: "Contract.partyA",
            operator: "contains",
            values: ["善治数字科技（成都）有限公司"]
          },
          { member: "Contract.unnamedColumn", operator: "contains", values: ["永安镇"] }
        ]
      }
    }
  } as DataHubStreamEvent;

  it("carries the query structure a readable narrative needs", async () => {
    const { buildDataHubBusinessTrace, createDataHubAskTurn } = await presenter();
    const turn = createDataHubAskTurn(
      "善治数字科技签了多少合同",
      [
        {
          type: "data_source_selected",
          data: { datasourceId: 1000002, datasourceName: "合同数据系统" }
        } as DataHubStreamEvent,
        cubeTableEvent,
        { type: "done", data: { mode: "ask", summary: "共 3 份合同。" } } as DataHubStreamEvent
      ],
      "done"
    );

    const trace = buildDataHubBusinessTrace(turn, "善治数字科技签了多少合同", "ASK_DATA");

    expect(trace.queries).toEqual([
      {
        dataSource: "合同数据系统",
        // groupLabel 是整段表注释，取第一个逗号前的部分当表名。
        table: "合同主数据清单",
        dimensions: ["合同乙方单位名称"],
        measures: [{ label: "记录数", aggregation: "计数" }],
        filters: ["合同甲方单位名称包含“善治数字科技（成都）有限公司”"],
        time: [],
        rows: 3,
        // 「得到 3 行结果」等于什么都没说，叙事要的是哪几家、各多少。
        rowKind: "grouped",
        preview: [
          { label: "永安镇人民政府", value: "2 条" },
          { label: "双流区水务局", value: "1 条" }
        ]
      }
    ]);
  });

  it("drops a filter it cannot name instead of writing 业务字段 1", async () => {
    const { buildDataHubBusinessTrace, createDataHubAskTurn } = await presenter();
    const turn = createDataHubAskTurn("善治数字科技签了多少合同", [cubeTableEvent], "done");

    const trace = buildDataHubBusinessTrace(turn, "善治数字科技签了多少合同", "ASK_DATA");

    expect(trace.filters).toEqual(["合同甲方单位名称包含“善治数字科技（成都）有限公司”"]);
    expect(JSON.stringify(trace)).not.toContain("业务字段");
  });

  it("still reports the data source and row count without a cube query", async () => {
    const { buildDataHubBusinessTrace, createDataHubAskTurn } = await presenter();
    const turn = createDataHubAskTurn(
      "本月销售额",
      [
        {
          type: "data_source_selected",
          data: { datasourceId: 7, datasourceName: "生产销售数据" }
        } as DataHubStreamEvent,
        {
          type: "table",
          data: {
            columns: [
              { name: "region", title: "区域" },
              { name: "revenue", title: "销售额（万元）", type: "number" }
            ],
            rows: [{ region: "华东", revenue: 486.2 }],
            totalRows: 4
          }
        } as DataHubStreamEvent
      ],
      "done"
    );

    const trace = buildDataHubBusinessTrace(turn, "本月销售额", "ASK_DATA");

    expect(trace.queries).toEqual([
      {
        dataSource: "生产销售数据",
        table: undefined,
        dimensions: [],
        measures: [],
        filters: [],
        time: [],
        rows: 4
      }
    ]);
  });

  it("previews the top rows with the unit taken from the measure name", async () => {
    const { buildDataHubBusinessTrace, createDataHubAskTurn } = await presenter();
    const turn = createDataHubAskTurn(
      "各区域销售额",
      [
        {
          type: "data_source_selected",
          data: { datasourceId: 3, datasourceName: "生产销售数据" }
        } as DataHubStreamEvent,
        {
          type: "table",
          data: {
            columns: [
              { name: "Sales.region", title: "销售明细表，记录各区域销售额。区域" },
              {
                name: "Sales.revenue",
                title: "销售明细表，记录各区域销售额。销售额（万元）",
                type: "number"
              }
            ],
            rows: [
              { "Sales.region": "华南", "Sales.revenue": 331.7 },
              { "Sales.region": "华东", "Sales.revenue": 486.2 }
            ],
            totalRows: 2,
            annotation: {
              measures: {
                "Sales.revenue": {
                  title: "销售明细表，记录各区域销售额。销售额（万元）",
                  shortTitle: "销售额（万元）",
                  type: "sum"
                }
              },
              dimensions: {
                "Sales.region": {
                  title: "销售明细表，记录各区域销售额。区域",
                  shortTitle: "区域"
                }
              }
            },
            query: { measures: ["Sales.revenue"], dimensions: ["Sales.region"] }
          }
        } as DataHubStreamEvent
      ],
      "done"
    );

    const trace = buildDataHubBusinessTrace(turn, "各区域销售额", "ASK_DATA");

    // 降序，销售额最高的排在最前面。
    expect(trace.queries?.[0].preview).toEqual([
      { label: "华东", value: "486.2 万元" },
      { label: "华南", value: "331.7 万元" }
    ]);
    expect(trace.queries?.[0].rowKind).toBe("grouped");
  });

  it("reads a one-row one-value result as a single number", async () => {
    const { buildDataHubBusinessTrace, createDataHubAskTurn } = await presenter();
    const turn = createDataHubAskTurn(
      "上半年合同金额",
      [
        {
          type: "table",
          data: {
            columns: [
              {
                name: "Contract.amount",
                title: "合同主数据清单，记录合同金额。合同金额（万元）",
                type: "number"
              }
            ],
            rows: [{ "Contract.amount": 1242.2 }],
            totalRows: 1,
            annotation: {
              measures: {
                "Contract.amount": {
                  title: "合同主数据清单，记录合同金额。合同金额（万元）",
                  shortTitle: "合同金额（万元）",
                  type: "sum"
                }
              }
            },
            query: { measures: ["Contract.amount"], dimensions: [] }
          }
        } as DataHubStreamEvent
      ],
      "done"
    );

    const trace = buildDataHubBusinessTrace(turn, "上半年合同金额", "ASK_DATA");

    expect(trace.queries?.[0].rowKind).toBe("single");
    expect(trace.queries?.[0].preview).toEqual([
      { label: "合同金额（万元）", value: "1,242.2 万元" }
    ]);
  });
});

 it("keeps unknown source associations and query metadata unasserted", async () => {
    const { buildDataHubBusinessTrace } = await import("./dataHubAskDataPresenter");
    const turn = createDataHubAskTurn("合同数", [
      { type: "data_source_selected", data: { datasourceId: 1, datasourceName: "甲库" } },
      { type: "data_source_selected", data: { datasourceId: 2, datasourceName: "乙库" } },
      { type: "table", data: { columns: [{ name: "count", title: "数量" }], rows: [{ count: 4 }] } }
    ], "done");
    const trace = buildDataHubBusinessTrace(turn, "合同数", "ASK_DATA");
    expect(trace.queries?.[0].dataSource).toBeUndefined();
    expect(trace.filters).toEqual(["本次未返回可复核的筛选条件"]);
    expect(trace.relationships).toEqual(["本次未返回可复核的关联关系"]);
 });
 it.each([{ "Contract.count": "desc" }, [["Contract.count", "desc"]]])("translates Cube sort order %j", (order) => {
    const result = normalizeDataHubTableResult({
      columns: [{ name: "Contract.count", title: "合同数量" }], rows: [{ "Contract.count": 4 }],
      query: { measures: ["Contract.count"], order }
    });
    expect(result?.business?.calculations).toContain("按合同数量降序排列");
 });

 it("opens numeric document identities without docKey and keeps different libraries distinct", async () => {
    const { buildDataHubBusinessTrace } = await import("./dataHubAskDataPresenter");
    const turn = createDataHubAskTurn("文档", [
      { type: "citation_document", data: { docId: "123", kbId: "1" } },
      { type: "citation_document", data: { docId: "123", kbId: "2", sourceAvailable: false } }
    ], "done");
    expect(turn.citationDocuments.map((doc) => doc.sourceAvailable)).toEqual([true, false]);
    expect(buildDataHubBusinessTrace(turn, "文档", "ASK_KNOWLEDGE").documents[0]?.kbName).toBe("");
 });

it("uses annotation short titles even when explicit columns have long titles", () => {
  const rows = [{ "Sales.region": "华东", "Sales.total": 120 }];
  const result = normalizeDataHubTableResult({
    columns: [
      { name: "Sales.region", title: "销售明细表，记录各区域月度销售额。区域" },
      { name: "Sales.total", title: "销售明细表，记录各区域月度销售额。销售额" }
    ], rows,
    annotation: {
      dimensions: { "Sales.region": { title: "销售明细表，记录各区域月度销售额。区域", shortTitle: "区域" } },
      measures: { "Sales.total": { title: "销售明细表，记录各区域月度销售额。销售额", shortTitle: "销售额" } }
    }
  });
  expect(result?.columns.map(({ key, title }) => ({ key, title }))).toEqual([
    { key: "Sales.region", title: "区域" }, { key: "Sales.total", title: "销售额" }
  ]);
  expect(result?.rows).toEqual(rows);
  expect(result?.groupLabel).toBe("销售明细表，记录各区域月度销售额。");
});

it("honors supplied field comments and leaves metadata-free labels intact", () => {
  const result = normalizeDataHubTableResult({
    columns: [
      { name: "amount", title: "合同表。金额", fieldComment: "合同金额（元）" },
      { name: "note", title: "说明，备注。原始内容" },
      "Contracts.count"
    ], rows: [{ amount: 1, note: "备注", "Contracts.count": 2 }],
    annotation: { measures: { "Contracts.count": { shortTitle: "合同数量" } } }
  });
  expect(result?.columns.map((column) => column.title)).toEqual(["合同金额（元）", "说明，备注。原始内容", "合同数量"]);
});

describe("mm thinking protocol envelopes", () => {
  it("does not treat an isolated closing marker as an answer", () => {
    const turn = createDataHubAskTurn("问题", [{ type: "text", content: "</mm:think>" }], "done");
    expect(turn.answerBlocks).toEqual([]);
    expect(turn.assistantContent).toBe("");
  });
  it("separates paired thinking received across deltas from the final answer", () => {
    const turn = createDataHubAskTurn("问题", ["<mm:thi", "nk>内部推理", "</mm:", "think>正式结论"].map((content) => ({ type: "text", content })), "done");
    expect(turn.assistantContent).toBe("正式结论");
    expect(turn.thinkingContent).toContain("内部推理");
    expect(turn.thinkingContent).not.toContain("mm:think");
  });
  it("cleans summary and explicit thinking wrappers without erasing literal code", () => {
    const turn = createDataHubAskTurn("问题", [
      { type: "thinking", content: "<mm:think>公开思考</mm:think>" },
      { type: "done", content: { summary: "</mm:think>正式结论" } }
    ], "done");
    expect(turn.assistantContent).toBe("正式结论");
    expect(turn.thinkingContent).toBe("公开思考");
    const code = "示例：`<mm:think>内容</mm:think>`";
    expect(createDataHubAskTurn("问题", [{ type: "text", content: code }], "done").assistantContent).toBe(code);
  });
});

it("cleans protocol wrappers at each model-call boundary and the thinking-stream tail", () => {
  const turn = createDataHubAskTurn("问题", [
    { type: "text", replyId: "first", modelCallIndex: 1, content: "我先查询。" },
    { type: "thinking", content: "公开思考</mm:think>" },
    { type: "text", replyId: "second", modelCallIndex: 2, content: "<mm:thi" },
    { type: "text", replyId: "second", modelCallIndex: 2, content: "nk>第二轮推理</mm:think>" },
    { type: "text", replyId: "second", modelCallIndex: 2, content: "最终答案" }
  ], "done");
  expect(turn.assistantContent).toBe("我先查询。最终答案");
  expect(turn.thinkingContent).toContain("公开思考");
  expect(turn.thinkingContent).toContain("第二轮推理");
  expect(turn.thinkingContent).not.toContain("mm:think");
});

it("preserves different SQL identifiers across answer blocks", () => {
  const turn = createDataHubAskTurn("给出两个查询示例", [
    { type: "text", content: "```sql\nSELECT customer_id FROM orders;\n```", replyId: "first" },
    { type: "text", content: "```sql\nSELECT customerid FROM orders;\n```", replyId: "second" }
  ], "done");
  expect(turn.answerBlocks).toHaveLength(2);
  expect(turn.assistantContent).toContain("SELECT customer_id FROM orders;");
  expect(turn.assistantContent).toContain("SELECT customerid FROM orders;");
});


it("retains explicit evidence ids from completion after an earlier document event", () => {
  const citation = { kbId: "7", docId: "101", fragments: ["第一片段"], sourceAvailable: true };
  const turn = createDataHubAskTurn("验收要求", [
    { type: "citation_document", content: citation },
    { type: "done", content: { citationDocuments: [{ ...citation, fragments: ["验收片段"],
      evidenceFragments: [{ evidenceId: "e4", text: "验收片段", secret: "not retained" },
        { evidenceId: "wrong", text: "bad" }, { evidenceId: "e1", text: "" }] }] } }
  ], "done");
  expect(turn.citationDocuments).toHaveLength(1);
  expect(turn.citationDocuments[0].evidenceFragments).toEqual([{ evidenceId: "e4", text: "验收片段" }]);
  expect(turn.citationDocuments[0].fragments).toEqual(["第一片段", "验收片段"]);
});

it("keeps only received public text when a failed terminal summary is present", () => {
  const turn = createDataHubAskTurn("统计收入", [
    { type: "text", content: "本年度总收入为" },
    { type: "done", content: { failed: true, summary: "这个失败摘要不能成为正式结论" } }
  ], "error", "回答未完成，连接已结束，请重试");
  expect(turn.assistantContent).toBe("本年度总收入为");
  expect(turn.answerBlocks).toEqual([{ content: "本年度总收入为" }]);
  expect(turn.status).toBe("error");
  expect(resolveDataHubFinalAnswer("失败摘要", "", true)).toBe("");
});
