import { describe, expect, it } from "vitest";
import {
  createDataHubAskTurn,
  getDataHubActionLabel,
  normalizeDataHubTableResult,
  resolveDataHubFinalAnswer
} from "./dataHubAskDataPresenter";
import type { DataHubStreamEvent } from "@/types/dataHub";

describe("dataHubAskDataPresenter", () => {
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
});
