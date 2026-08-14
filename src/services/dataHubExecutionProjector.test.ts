import { describe, expect, it } from "vitest";
import { adaptDataHubStreamEvent } from "./dataHubEventAdapter";
import {
  buildDataHubSubagentTree,
  createDataHubExecutionProjection,
  flattenDataHubSubagentTree,
  projectDataHubExecutionEvents,
  reduceDataHubExecutionEvent
} from "./dataHubExecutionProjector";
import type { DataHubStreamEvent } from "@/types/dataHub";

function event(
  type: string,
  overrides: Omit<Partial<DataHubStreamEvent>, "type"> = {}
): DataHubStreamEvent {
  return {
    type,
    sessionId: "main-session",
    globalSessionId: "main-session",
    chatId: "chat-1",
    agentName: "编排智能体",
    timestamp: "2026-07-28T10:00:00+08:00",
    finished: false,
    ...overrides
  };
}

function adapted(values: unknown[]): DataHubStreamEvent[] {
  return values
    .map((value) => adaptDataHubStreamEvent(value))
    .filter((value): value is DataHubStreamEvent => value !== null);
}

describe("dataHubExecutionProjector", () => {
  it("accumulates main orchestration in one continuous agent card with model-call blocks", () => {
    const projection = projectDataHubExecutionEvents([
      event("agent_start"),
      event("routing_intent", {
        content: {
          intent: "adaptive_team",
          status: "success"
        }
      }),
      event("routing_decompose", {
        content: {
          executionMode: "COMPLEX",
          subQuestions: ["查询销售额", "查找制度依据"]
        }
      }),
      event("react_step", {
        content: {
          round: 1,
          agentName: "编排智能体",
          action: "dispatch",
          status: "success"
        }
      }),
      event("tool_call", {
        content: {
          toolName: "delegate",
          args: {
            target: "问数智能体"
          }
        },
        toolCallId: "tool-1"
      }),
      event("tool_result", {
        content: {
          toolName: "delegate",
          status: "success"
        },
        toolCallId: "tool-1"
      }),
      event("thinking", {
        content: "正在分析",
        isThinking: true,
        replyId: "reply-1",
        modelCallIndex: 1
      }),
      event("thinking", {
        content: "数据范围",
        isThinking: true,
        replyId: "reply-1",
        modelCallIndex: 1
      }),
      event("text", {
        content: "第一轮结论",
        replyId: "reply-1",
        modelCallIndex: 1
      }),
      event("text", {
        content: "最终结论",
        replyId: "reply-2",
        modelCallIndex: 2
      }),
      event("table", {
        content: {
          columns: ["部门", "金额"],
          rows: [["研发", 120]]
        },
        replyId: "reply-2",
        modelCallIndex: 2
      }),
      event("done", {
        content: {
          adaptiveTeam: true,
          completion: "complete",
          summary: "所有来源均已完成。"
        },
        finished: true
      })
    ]);

    expect(projection.eventCount).toBe(12);
    expect(projection.mainSession).toMatchObject({
      sessionId: "main-session",
      globalSessionId: "main-session",
      chatId: "chat-1",
      status: "done",
      finished: true,
      done: {
        adaptiveTeam: true,
        completion: "complete",
        summary: "所有来源均已完成。"
      }
    });
    expect(projection.mainSession.orchestration.routingEvents).toHaveLength(2);
    expect(projection.mainSession.orchestration.decompose).toEqual({
      executionMode: "COMPLEX",
      subQuestions: ["查询销售额", "查找制度依据"]
    });
    expect(projection.mainSession.orchestration.reactSteps).toHaveLength(1);
    expect(projection.mainSession.orchestration.toolCalls).toHaveLength(1);
    expect(projection.mainSession.orchestration.toolResults).toHaveLength(1);

    expect(projection.mainSession.cards).toHaveLength(1);
    expect(projection.mainSession.cards[0].blocks).toHaveLength(4);
    expect(projection.mainSession.cards[0].blocks).toMatchObject([
      {
        type: "thinking",
        content: "正在分析数据范围",
        isThinking: true
      },
      {
        type: "text",
        content: "第一轮结论",
        isThinking: false
      },
      {
        type: "text",
        content: "最终结论",
        modelCallIndex: 2,
        isThinking: false
      },
      {
        type: "table",
        modelCallIndex: 2
      }
    ]);
    expect(projection.mainSession.cards[0].blocks.map((block) => block.type)).not.toEqual(
      expect.arrayContaining([
        "routing_intent",
        "routing_decompose",
        "react_step",
        "tool_call",
        "tool_result"
      ])
    );
    expect(projection.mainSession.cards.every((card) => card.status === "done")).toBe(true);
  });

  it("updates model and tool activities in place by activityId", () => {
    const projection = projectDataHubExecutionEvents([
      event("activity", {
        content: {
          activityId: "model:reply-1",
          kind: "model",
          action: "model_analysis",
          label: "理解数据问题",
          status: "running",
          startedAt: "2026-07-31T16:00:32.283+08:00"
        },
        replyId: "reply-1",
        modelCallIndex: 1
      }),
      event("activity", {
        content: {
          activityId: "tool:query-1",
          kind: "tool",
          action: "execute_query",
          label: "执行数据查询",
          status: "running",
          startedAt: "2026-07-31T16:00:33.000+08:00"
        },
        replyId: "reply-1",
        modelCallIndex: 1
      }),
      event("activity", {
        content: {
          activityId: "model:reply-1",
          kind: "model",
          action: "model_analysis",
          label: "理解数据问题",
          status: "success",
          summary: "问题分析完成",
          startedAt: "2026-07-31T16:00:32.283+08:00",
          completedAt: "2026-07-31T16:00:35.733+08:00",
          durationMs: 3450
        },
        replyId: "reply-1",
        modelCallIndex: 1
      })
    ]);

    const blocks = projection.mainSession.cards[0]?.blocks ?? [];
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.content)).toMatchObject([
      {
        activityId: "model:reply-1",
        kind: "model",
        status: "success",
        summary: "问题分析完成"
      },
      {
        activityId: "tool:query-1",
        kind: "tool",
        status: "running"
      }
    ]);
  });

  it("starts a new card only when the continuous agent changes", () => {
    const projection = projectDataHubExecutionEvents([
      event("text", {
        agentName: "编排智能体",
        content: "分派任务"
      }),
      event("text", {
        agentName: "问数智能体",
        content: "查询完成"
      }),
      event("text", {
        agentName: "编排智能体",
        content: "汇总结论"
      })
    ]);

    expect(projection.mainSession.cards.map((card) => card.agentName)).toEqual([
      "编排智能体",
      "问数智能体",
      "编排智能体"
    ]);
  });

  it("never concatenates text when modelCallIndex is absent", () => {
    const projection = projectDataHubExecutionEvents([
      event("text", {
        content: "第一段",
        replyId: "reply-without-index"
      }),
      event("text", {
        content: "第二段",
        replyId: "reply-without-index"
      })
    ]);

    expect(projection.mainSession.cards).toHaveLength(1);
    expect(projection.mainSession.cards[0].blocks.map((block) => block.content)).toEqual([
      "第一段",
      "第二段"
    ]);
  });

  it("keeps child sessions isolated and builds their nested parent tree", () => {
    let projection = reduceDataHubExecutionEvent(
      createDataHubExecutionProjection(),
      event("agent_start")
    );

    projection = reduceDataHubExecutionEvent(
      projection,
      event("subagent_exposed", {
        agentName: "制度研究员",
        agentId: "research-agent",
        sessionId: "child-research",
        parentSessionId: "main-session",
        subagentId: "subagent-research",
        label: "制度研究员",
        content: {
          agentId: "research-agent",
          sessionId: "child-research",
          subagentId: "subagent-research",
          label: "制度研究员"
        }
      })
    );
    projection = reduceDataHubExecutionEvent(
      projection,
      event("thinking", {
        agentName: "制度研究员",
        sessionId: "child-research",
        parentSessionId: "main-session",
        content: "检索制度文档",
        replyId: "child-reply",
        modelCallIndex: 1,
        isThinking: true
      })
    );
    projection = reduceDataHubExecutionEvent(
      projection,
      event("table", {
        agentName: "制度研究员",
        sessionId: "child-research",
        parentSessionId: "main-session",
        content: {
          columns: ["制度", "状态"],
          rows: [["合同管理办法", "有效"]]
        },
        replyId: "child-reply",
        modelCallIndex: 1
      })
    );
    projection = reduceDataHubExecutionEvent(
      projection,
      event("done", {
        agentName: "制度研究员",
        sessionId: "child-research",
        parentSessionId: "main-session",
        content: {},
        finished: false
      })
    );

    expect(projection.mainSession.status).toBe("running");
    expect(projection.mainSession.events).toHaveLength(1);
    expect(projection.mainSession.cards.flatMap((card) => card.blocks)).toEqual([]);
    expect(projection.mainSession.tableResults).toEqual([]);
    expect(projection.subagentSessions[0]).toMatchObject({
      sessionId: "child-research",
      parentSessionId: "main-session",
      agentId: "research-agent",
      subagentId: "subagent-research",
      label: "制度研究员",
      status: "done",
      finished: true
    });
    expect(projection.subagentSessions[0].cards[0].blocks[0]).toMatchObject({
      type: "thinking",
      content: "检索制度文档"
    });
    expect(projection.subagentSessions[0].tableResults).toHaveLength(1);

    projection = reduceDataHubExecutionEvent(
      projection,
      event("subagent_exposed", {
        agentName: "法规核验员",
        sessionId: "child-verifier",
        parentSessionId: "child-research",
        subagentId: "subagent-verifier",
        content: {
          agentId: "verification-agent",
          sessionId: "child-verifier",
          subagentId: "subagent-verifier",
          label: "法规核验员"
        }
      })
    );
    projection = reduceDataHubExecutionEvent(
      projection,
      event("text", {
        agentName: "法规核验员",
        sessionId: "child-verifier",
        parentSessionId: "child-research",
        content: "已确认条款有效",
        replyId: "verify-reply",
        modelCallIndex: 1
      })
    );
    projection = reduceDataHubExecutionEvent(
      projection,
      event("done", {
        content: {
          adaptiveTeam: true,
          completion: "complete"
        },
        finished: true
      })
    );

    expect(projection.mainSession.sessionId).toBe("main-session");
    expect(projection.mainSession.status).toBe("done");
    expect(projection.mainSession.cards.flatMap((card) => card.blocks)).toEqual([]);

    const tree = buildDataHubSubagentTree(projection);
    expect(tree).toHaveLength(1);
    expect(tree[0].session.sessionId).toBe("child-research");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({
      level: 1,
      session: {
        sessionId: "child-verifier",
        parentSessionId: "child-research"
      }
    });
    expect(flattenDataHubSubagentTree(tree).map(({ session, level }) => [session.sessionId, level])).toEqual([
      ["child-research", 0],
      ["child-verifier", 1]
    ]);
  });

  it("keeps unidentifiable child events out of the main execution", () => {
    const projection = projectDataHubExecutionEvents(
      [
        event("agent_start"),
        event("thinking", {
          sessionId: undefined,
          globalSessionId: "main-session",
          parentSessionId: "main-session",
          content: "没有子会话标识的内部内容",
          isThinking: true
        })
      ],
      {
        mainSessionId: "main-session"
      }
    );

    expect(projection.orphanedSubagentEvents).toHaveLength(1);
    expect(projection.mainSession.events).toHaveLength(1);
    expect(projection.mainSession.cards.flatMap((card) => card.blocks)).toEqual([]);
  });

  it("projects adapted live and nested-history events to the same result", () => {
    const livePayloads = [
      {
        agentName: "问知智能体",
        isThinking: false,
        timestamp: "2026-07-28T11:00:00+08:00",
        type: "agent_start",
        content: {},
        sessionId: "history-main",
        globalSessionId: "history-main",
        chatId: "history-chat",
        finished: false
      },
      {
        agentName: "问知智能体",
        isThinking: true,
        timestamp: "2026-07-28T11:00:01+08:00",
        type: "thinking",
        content: "核验引用",
        sessionId: "history-main",
        globalSessionId: "history-main",
        chatId: "history-chat",
        replyId: "reply-history",
        modelCallIndex: 1,
        finished: false
      },
      {
        agentName: "问知智能体",
        isThinking: false,
        timestamp: "2026-07-28T11:00:02+08:00",
        type: "citation_document",
        content: {
          docId: "doc-1",
          docKey: "policy",
          kbId: "kb-1"
        },
        sessionId: "history-main",
        globalSessionId: "history-main",
        chatId: "history-chat",
        replyId: "reply-history",
        modelCallIndex: 1,
        finished: false
      },
      {
        agentName: "问知智能体",
        isThinking: false,
        timestamp: "2026-07-28T11:00:03+08:00",
        type: "done",
        content: {
          askKnowledge: true,
          summary: "回答完成"
        },
        sessionId: "history-main",
        globalSessionId: "history-main",
        chatId: "history-chat",
        finished: true
      }
    ];
    const historyPayloads = livePayloads.map((payload) => ({
      type: payload.type,
      sessionId: payload.sessionId,
      chatId: payload.chatId,
      data: JSON.stringify({
        data: JSON.stringify(payload)
      })
    }));

    const liveProjection = projectDataHubExecutionEvents(adapted(livePayloads));
    const historyProjection = projectDataHubExecutionEvents(adapted(historyPayloads));

    expect(historyProjection).toEqual(liveProjection);
  });

  it("honors the inner child identity in persisted event wrappers", () => {
    const childHistoryEvent = adaptDataHubStreamEvent({
      type: "thinking",
      sessionId: "main-session",
      chatId: "chat-1",
      data: JSON.stringify({
        agentName: "历史子智能体",
        isThinking: true,
        type: "thinking",
        content: "历史内部过程",
        sessionId: "history-child",
        globalSessionId: "main-session",
        parentSessionId: "main-session",
        chatId: "chat-1",
        replyId: "history-child-reply",
        modelCallIndex: 1,
        finished: false
      })
    });

    expect(childHistoryEvent).not.toBeNull();
    const projection = projectDataHubExecutionEvents(
      childHistoryEvent ? [childHistoryEvent] : [],
      {
        mainSessionId: "main-session",
        chatId: "chat-1"
      }
    );

    expect(projection.mainSession.sessionId).toBe("main-session");
    expect(projection.mainSession.events).toEqual([]);
    expect(projection.subagentSessions).toHaveLength(1);
    expect(projection.subagentSessions[0]).toMatchObject({
      sessionId: "history-child",
      parentSessionId: "main-session",
      cards: [
        {
          agentName: "历史子智能体",
          blocks: [
            {
              type: "thinking",
              content: "历史内部过程",
              replyId: "history-child-reply",
              modelCallIndex: 1
            }
          ]
        }
      ]
    });
  });

  it("retains authenticated document results and document-lookup completion metadata", () => {
    const projection = projectDataHubExecutionEvents([
      event("agent_start", {
        agentName: "找文档智能体"
      }),
      event("document_url", {
        agentName: "找文档智能体",
        replyId: "document-reply",
        modelCallIndex: 1,
        content: {
          docId: "doc-200001",
          docKey: "contract-guide",
          kbId: "kb-5",
          docName: "合同管理说明.pdf",
          sourceAvailable: true
        }
      }),
      event("done", {
        agentName: "找文档智能体",
        content: {
          documentLookup: true,
          documentSelectionMode: "single",
          summary: "已定位到 1 份相关文档。",
          documentResults: [
            {
              docId: "doc-200001",
              docKey: "contract-guide",
              kbId: "kb-5",
              title: "合同管理说明.pdf",
              sourceAvailable: true
            }
          ]
        },
        finished: true
      })
    ]);

    expect(projection.mainSession.documentResults).toEqual([
      expect.objectContaining({
        docId: "doc-200001",
        docKey: "contract-guide",
        sourceAvailable: true
      })
    ]);
    expect(projection.mainSession.done).toMatchObject({
      documentLookup: true,
      documentSelectionMode: "single",
      documentResults: [
        {
          docId: "doc-200001",
          docKey: "contract-guide",
          kbId: "kb-5",
          title: "合同管理说明.pdf",
          sourceAvailable: true
        }
      ]
    });
    expect(projection.mainSession.cards[0]).toMatchObject({
      agentName: "找文档智能体",
      blocks: [
        {
          type: "document_url",
          replyId: "document-reply",
          modelCallIndex: 1
        }
      ]
    });
  });

  it("marks failed done payloads as a terminal error without inventing another event", () => {
    const projection = projectDataHubExecutionEvents([
      event("agent_start"),
      event("done", {
        content: {
          failed: true,
          summary: "没有权限访问目标来源"
        },
        finished: true
      })
    ]);

    expect(projection.mainSession).toMatchObject({
      status: "error",
      finished: true,
      error: {
        message: "没有权限访问目标来源"
      }
    });
    expect(projection.mainSession.events.map(({ type }) => type)).toEqual(["agent_start", "done"]);
  });

  it("settles a completed transport when the stream omits the root done event", () => {
    const projection = projectDataHubExecutionEvents(
      [
        event("agent_start"),
        event("subagent_exposed", {
          agentName: "问知智能体",
          sessionId: "child-knowledge",
          parentSessionId: "main-session",
          subagentId: "subagent-knowledge",
          label: "问知智能体",
          content: {
            sessionId: "child-knowledge",
            subagentId: "subagent-knowledge",
            label: "问知智能体"
          }
        }),
        event("done", {
          agentName: "问知智能体",
          sessionId: "child-knowledge",
          parentSessionId: "main-session",
          content: { summary: "制度检索完成" },
          finished: true
        }),
        event("text", {
          content: "已检索相关制度，以下为综合结论。"
        })
      ],
      { terminalStatus: "done" }
    );

    expect(projection.mainSession).toMatchObject({
      status: "done",
      finished: true
    });
    expect(projection.subagentSessions[0]).toMatchObject({
      sessionId: "child-knowledge",
      status: "done",
      finished: true
    });
    expect(projection.mainSession.events.map(({ type }) => type)).toEqual([
      "agent_start",
      "text"
    ]);
    expect(projection.mainSession.cards.every((card) => card.status === "done")).toBe(true);
  });

  it("settles cancelled root, child, cards, and running activities at the stop time", () => {
    const cancelledAt = "2026-08-04T10:01:15.000+08:00";
    const projection = projectDataHubExecutionEvents(
      [
        event("agent_start", {
          timestamp: "2026-08-04T10:00:00.000+08:00"
        }),
        event("subagent_exposed", {
          agentName: "问数智能体",
          sessionId: "child-running",
          parentSessionId: "main-session",
          subagentId: "subagent-running",
          label: "问数智能体",
          content: {
            sessionId: "child-running",
            subagentId: "subagent-running",
            label: "问数智能体"
          },
          timestamp: "2026-08-04T10:00:05.000+08:00"
        }),
        event("activity", {
          agentName: "问数智能体",
          sessionId: "child-running",
          parentSessionId: "main-session",
          content: {
            activityId: "query-running",
            kind: "tool",
            label: "执行数据查询",
            status: "running",
            startedAt: "2026-08-04T10:00:10.000+08:00"
          },
          timestamp: "2026-08-04T10:00:10.000+08:00"
        })
      ],
      {
        terminalStatus: "cancelled",
        terminalTimestamp: cancelledAt
      }
    );

    expect(projection.mainSession).toMatchObject({
      status: "cancelled",
      finished: true,
      updatedAt: cancelledAt
    });
    expect(projection.mainSession.cards[0]).toMatchObject({
      status: "cancelled",
      updatedAt: cancelledAt
    });
    expect(projection.subagentSessions[0]).toMatchObject({
      status: "cancelled",
      finished: true,
      updatedAt: cancelledAt
    });
    expect(projection.subagentSessions[0].cards[0]).toMatchObject({
      status: "cancelled",
      updatedAt: cancelledAt,
      blocks: [
        {
          timestamp: cancelledAt,
          content: {
            activityId: "query-running",
            status: "cancelled",
            completedAt: cancelledAt
          }
        }
      ]
    });
  });

  it("settles a late child event after the root session has already completed", () => {
    const projection = projectDataHubExecutionEvents(
      [
        event("agent_start"),
        event("done", {
          content: { summary: "编排完成" },
          finished: true
        }),
        event("subagent_exposed", {
          agentName: "延迟回传智能体",
          sessionId: "late-child",
          parentSessionId: "main-session",
          subagentId: "subagent-late",
          label: "延迟回传智能体",
          content: {
            sessionId: "late-child",
            subagentId: "subagent-late",
            label: "延迟回传智能体"
          }
        })
      ],
      { terminalStatus: "done" }
    );

    expect(projection.mainSession.status).toBe("done");
    expect(projection.subagentSessions[0]).toMatchObject({
      sessionId: "late-child",
      status: "done",
      finished: true
    });
  });

  it("normalizes explicit error events to a finished terminal session", () => {
    const projection = projectDataHubExecutionEvents([
      event("agent_start"),
      event("error", {
        content: { message: "编排失败" }
      })
    ]);

    expect(projection.mainSession).toMatchObject({
      status: "error",
      finished: true
    });
  });

  it("cascades unfinished child sessions when the main session completes", () => {
    const projection = projectDataHubExecutionEvents([
      event("agent_start"),
      event("subagent_exposed", {
        agentName: "问数智能体",
        sessionId: "child-ask",
        parentSessionId: "main-session",
        subagentId: "subagent-ask",
        label: "问数智能体",
        content: {
          sessionId: "child-ask",
          subagentId: "subagent-ask",
          label: "问数智能体"
        }
      }),
      event("table", {
        agentName: "问数智能体",
        sessionId: "child-ask",
        parentSessionId: "main-session",
        content: {
          columns: ["年份", "合同数"],
          rows: [[2023, 24]],
          totalRows: 1
        }
      }),
      event("done", {
        content: { mode: "agent", adaptiveTeam: true },
        finished: true
      })
    ]);

    expect(projection.mainSession.status).toBe("done");
    expect(projection.subagentSessions[0]).toMatchObject({
      sessionId: "child-ask",
      status: "done",
      finished: true
    });
    expect(
      projection.subagentSessions[0].cards.every((card) => card.status === "done")
    ).toBe(true);
  });

  it("cascades unfinished child sessions as errors when the main session fails", () => {
    const projection = projectDataHubExecutionEvents([
      event("agent_start"),
      event("subagent_exposed", {
        agentName: "问数智能体",
        sessionId: "child-ask",
        parentSessionId: "main-session",
        subagentId: "subagent-ask",
        label: "问数智能体",
        content: {
          sessionId: "child-ask",
          subagentId: "subagent-ask",
          label: "问数智能体"
        }
      }),
      event("done", {
        content: { failed: true, summary: "编排失败" },
        finished: true
      })
    ]);

    expect(projection.mainSession.status).toBe("error");
    expect(projection.subagentSessions[0]).toMatchObject({
      status: "error",
      finished: true
    });
  });
});
