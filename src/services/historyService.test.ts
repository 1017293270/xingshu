import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterHistorySessionList,
  listHistorySessions,
  loadDataHubHistoryReplay,
  withRememberedHistoryKinds
} from "./historyService";
import {
  readRememberedHistorySessionKinds,
  rememberHistorySessionKind,
  resolveHistorySessionKind
} from "./historySessionKind";
import { createDataHubAskTurn } from "./dataHubAskDataPresenter";
import { projectDataHubExecutionEvents } from "./dataHubExecutionProjector";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";
import type { DataHubStreamEvent } from "@/types/dataHub";
import type { HistorySession } from "@/types/history";

const HISTORY_KIND_KEY = "xingshu_history_session_kinds";

/** 与后端 /sessions/list 一致：只有 id、标题与时间，没有 chatMode。 */
function backendSession(id: number, sessionId: string, title: string) {
  return {
    id,
    sessionId,
    spaceId: 7,
    userId: 1,
    title,
    createdAt: "2026-09-20T09:00:00",
    updatedAt: "2026-09-20T10:00:00"
  };
}

function subagentEvent(agentId: string, agentName: string): DataHubStreamEvent {
  return {
    type: "subagent_exposed",
    sessionId: `child-${agentId}`,
    parentSessionId: "root",
    agentName,
    content: { sessionId: `child-${agentId}`, agentId }
  };
}

describe("historyService data-hub replay", () => {
  beforeEach(() => {
    localStorage.clear();
    writeDataHubAuth({ token: "token-123", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(7);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("hides ask-table and writing helper sessions from history", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: "success",
      data: [
        backendSession(1, "ask-data-1", "经营分析"),
        backendSession(2, "ask-table-1", "临时制表"),
        backendSession(3, "writing-1", "智写助手"),
        backendSession(4, "session-legacy", "旧会话")
      ]
    }))));

    expect((await listHistorySessions()).map((session) => session.id)).toEqual([
      "ask-data-1",
      "session-legacy"
    ]);
  });

  it("classifies listed sessions by id prefix and local memory, never by title", async () => {
    vi.stubEnv("MODE", "development");
    localStorage.setItem(HISTORY_KIND_KEY, JSON.stringify({
      "agent-4": { chatMode: "agent", categories: ["知识快查", "数据洞察"], updatedAt: 2 },
      "session-opened": { chatMode: "rag", categories: ["知识快查"], updatedAt: 1 }
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: "success",
      data: [
        backendSession(1, "ask-data-1", "制度咨询"),
        backendSession(2, "ask-knowledge-2", "销售数据分析"),
        backendSession(3, "document-lookup-3", "经营报表"),
        backendSession(4, "agent-4", "分析数据并核对制度"),
        backendSession(5, "agent-5", "刚开始的编排"),
        backendSession(6, "session-opened", "打开过的旧会话"),
        backendSession(7, "session-legacy", "经营数据分析")
      ]
    }))));

    const sessions = await listHistorySessions();

    expect(sessions.map(({ id, chatMode, categories }) => ({ id, chatMode, categories }))).toEqual([
      { id: "ask-data-1", chatMode: "ask", categories: ["数据洞察"] },
      { id: "ask-knowledge-2", chatMode: "rag", categories: ["知识快查"] },
      { id: "document-lookup-3", chatMode: "document_lookup", categories: ["文档处理"] },
      { id: "agent-4", chatMode: "agent", categories: ["数据洞察", "知识快查"] },
      { id: "agent-5", chatMode: "agent", categories: [] },
      { id: "session-opened", chatMode: "rag", categories: ["知识快查"] },
      // 标题里有「经营数据分析」也不猜，未知就是未知。
      { id: "session-legacy", chatMode: undefined, categories: [] }
    ]);
  });

  it("loads messages and events into a restorable ask-data turn", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { sessionId?: string };

      if (String(_url).includes("/messages/list")) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              { id: 1, sessionId: body.sessionId, chatId: "chat-a", role: "user", content: "统计咨询量", seqNum: 1 },
              { id: 2, sessionId: body.sessionId, chatId: "chat-a", role: "assistant", content: "已完成", seqNum: 2 }
            ]
          })
        );
      }

      return new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: [
            {
              id: 1,
              sessionId: body.sessionId,
              chatId: "chat-a",
              type: "done",
              data: { summary: "咨询量统计完成" },
              seqNum: 3,
              createdAt: "2026-07-08T10:00:00"
            }
          ]
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const replay = await loadDataHubHistoryReplay("session-a");

    expect(replay.question).toBe("统计咨询量");
    expect(replay.events).toEqual([
      expect.objectContaining({
        type: "done",
        sessionId: "session-a",
        chatId: "chat-a"
      })
    ]);
    expect(replay.turns).toEqual([
      expect.objectContaining({
        question: "统计咨询量",
        sessionId: "session-a",
        events: [
          expect.objectContaining({
            type: "done",
            chatId: "chat-a"
          })
        ]
      })
    ]);
  });

  it("uses the first customer question when a restored session contains follow-up turns", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { sessionId?: string };

      if (String(_url).includes("/messages/list")) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              { id: 1, sessionId: body.sessionId, chatId: "chat-a", role: "user", content: "客户原始问题", seqNum: 1 },
              { id: 2, sessionId: body.sessionId, chatId: "chat-a", role: "assistant", content: "原始答案", seqNum: 3 },
              { id: 3, sessionId: body.sessionId, chatId: "chat-b", role: "user", content: "结合上下文后的追问", seqNum: 4 },
              { id: 4, sessionId: body.sessionId, chatId: "chat-b", role: "assistant", content: "追问答案", seqNum: 6 }
            ]
          })
        );
      }

      return new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: [
            {
              id: 1,
              sessionId: body.sessionId,
              chatId: "chat-a",
              type: "done",
              data: JSON.stringify({ summary: "原始答案" }),
              seqNum: 2
            },
            {
              id: 2,
              sessionId: body.sessionId,
              chatId: "chat-b",
              type: "done",
              data: JSON.stringify({ summary: "追问答案" }),
              seqNum: 5
            }
          ]
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const replay = await loadDataHubHistoryReplay("session-a");

    expect(replay.question).toBe("客户原始问题");
    expect(replay.turns.map((turn) => turn.question)).toEqual(["客户原始问题", "结合上下文后的追问"]);
    expect(replay.events[0]).toEqual(expect.objectContaining({ chatId: "chat-a" }));
  });

  it("replays nested new knowledge events through the same presenter as live events", async () => {
    const liveEvents = [
      {
        agentName: "问知智能体",
        isThinking: true,
        type: "thinking",
        content: "正在检索制度。",
        sessionId: "session-rag",
        globalSessionId: "session-rag",
        chatId: "chat-rag",
        replyId: "reply-1",
        modelCallIndex: 1,
        finished: false
      },
      {
        agentName: "问知智能体",
        isThinking: false,
        type: "text",
        content: "合同审批需经过部门审核。",
        sessionId: "session-rag",
        globalSessionId: "session-rag",
        chatId: "chat-rag",
        replyId: "reply-2",
        modelCallIndex: 2,
        finished: false
      },
      {
        agentName: "问知智能体",
        isThinking: false,
        type: "citation_document",
        content: {
          docId: "doc-1",
          docKey: "contract-policy",
          kbId: "kb-1",
          docName: "合同管理办法.pdf",
          fragments: ["合同审批需经过部门审核。"]
        },
        sessionId: "session-rag",
        globalSessionId: "session-rag",
        chatId: "chat-rag",
        finished: false
      },
      {
        agentName: "问知智能体",
        isThinking: false,
        type: "done",
        content: {
          mode: "rag",
          askKnowledge: true,
          summary: "合同审批需经过部门审核。",
          citationDocuments: []
        },
        sessionId: "session-rag",
        globalSessionId: "session-rag",
        chatId: "chat-rag",
        finished: true
      }
    ];
    const fetchMock = vi.fn(async (_url: string | URL | Request) => {
      if (String(_url).includes("/messages/list")) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              {
                id: 1,
                sessionId: "session-rag",
                chatId: "chat-rag",
                role: "user",
                content: "合同审批流程？",
                seqNum: 1
              }
            ]
          })
        );
      }

      return new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: liveEvents.map((event, index) => ({
            id: index + 1,
            sessionId: "session-rag",
            chatId: "chat-rag",
            type: event.type,
            data:
              index === liveEvents.length - 1
                ? JSON.stringify({ data: JSON.stringify(event) })
                : JSON.stringify(event),
            seqNum: index + 2
          }))
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const replay = await loadDataHubHistoryReplay("session-rag");
    const replayTurn = createDataHubAskTurn(
      replay.question,
      replay.events,
      "done",
      "",
      { sessionId: replay.sessionId, chatId: replay.turns[0]?.chatId }
    );
    const liveTurn = createDataHubAskTurn(
      "合同审批流程？",
      liveEvents.map((event) => ({ ...event, data: event.content })),
      "done",
      "",
      { sessionId: "session-rag", chatId: "chat-rag" }
    );

    expect(replay.chatMode).toBe("rag");
    expect(replay.turns[0]?.chatMode).toBe("rag");
    expect(replayTurn.assistantContent).toBe(liveTurn.assistantContent);
    expect(replayTurn.thinkingContent).toBe(liveTurn.thinkingContent);
    expect(replayTurn.citationDocuments).toEqual(liveTurn.citationDocuments);
  });

  it("uses assistant messages when a legacy done event has no summary", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => {
      if (String(_url).includes("/messages/list")) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              {
                id: 1,
                sessionId: "legacy-session",
                chatId: "legacy-chat",
                role: "user",
                content: "旧问数",
                seqNum: 1
              },
              {
                id: 2,
                sessionId: "legacy-session",
                chatId: "legacy-chat",
                role: "assistant",
                content: "旧版最终答案",
                seqNum: 3
              }
            ]
          })
        );
      }

      return new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: [
            {
              id: 1,
              sessionId: "legacy-session",
              chatId: "legacy-chat",
              type: "done",
              data: JSON.stringify({ type: "done", data: {} }),
              seqNum: 2
            }
          ]
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const replay = await loadDataHubHistoryReplay("legacy-session");
    const turn = createDataHubAskTurn(replay.question, replay.events, "done");

    expect(replay.chatMode).toBe("ask");
    expect(turn.assistantContent).toBe("旧版最终答案");
  });

  it("uses the session chat mode when a knowledge history only retained messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request) => {
        if (String(_url).includes("/messages/list")) {
          return new Response(
            JSON.stringify({
              code: 200,
              message: "success",
              data: [
                {
                  id: 1,
                  sessionId: "message-only-rag",
                  chatId: "rag-chat",
                  role: "user",
                  content: "制度怎么规定？",
                  seqNum: 1
                },
                {
                  id: 2,
                  sessionId: "message-only-rag",
                  chatId: "rag-chat",
                  role: "assistant",
                  content: "制度要求先完成审批。",
                  seqNum: 2
                }
              ]
            })
          );
        }

        return new Response(
          JSON.stringify({ code: 200, message: "success", data: [] })
        );
      })
    );

    const replay = await loadDataHubHistoryReplay("message-only-rag", "rag");

    expect(replay.chatMode).toBe("rag");
    expect(replay.turns[0]?.chatMode).toBe("rag");
    expect(
      createDataHubAskTurn(replay.question, replay.events, "done").assistantContent
    ).toBe("制度要求先完成审批。");
    // 兜底模式只决定回放页面，没有事件证据就不记进历史分类。
    expect(readRememberedHistorySessionKinds()["message-only-rag"]).toBeUndefined();
  });

  it("does not let child text suppress the persisted main assistant fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request) => {
        if (String(_url).includes("/messages/list")) {
          return new Response(
            JSON.stringify({
              code: 200,
              message: "success",
              data: [
                {
                  id: 1,
                  sessionId: "agent-history",
                  chatId: "agent-chat",
                  role: "user",
                  content: "综合分析",
                  seqNum: 1
                },
                {
                  id: 2,
                  sessionId: "agent-history",
                  chatId: "agent-chat",
                  role: "assistant",
                  content: "主智能体持久化答案",
                  seqNum: 5
                }
              ]
            })
          );
        }

        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              {
                id: 3,
                sessionId: "agent-history",
                chatId: "agent-chat",
                type: "persisted_event",
                data: JSON.stringify({
                  type: "text",
                  content: "子智能体内部答案",
                  agentName: "问知智能体",
                  sessionId: "child-rag",
                  globalSessionId: "agent-history",
                  parentSessionId: "agent-history",
                  chatId: "agent-chat",
                  finished: false
                }),
                seqNum: 2
              },
              {
                id: 4,
                sessionId: "agent-history",
                chatId: "agent-chat",
                type: "persisted_event",
                data: JSON.stringify({
                  type: "done",
                  content: { mode: "agent", adaptiveTeam: true },
                  agentName: "编排智能体",
                  sessionId: "agent-history",
                  globalSessionId: "agent-history",
                  chatId: "agent-chat",
                  finished: true
                }),
                seqNum: 3
              }
            ]
          })
        );
      })
    );

    const replay = await loadDataHubHistoryReplay("agent-history", "agent");
    const rootTurn = createDataHubAskTurn(
      replay.question,
      replay.events,
      "done",
      "",
      { sessionId: replay.sessionId, chatId: "agent-chat" }
    );

    expect(replay.chatMode).toBe("agent");
    expect(rootTurn.assistantContent).toBe("主智能体持久化答案");
    expect(rootTurn.assistantContent).not.toContain("子智能体内部答案");
  });

  it("falls back to the persisted answer when the root only kept progress text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request) => {
        if (String(_url).includes("/messages/list")) {
          return new Response(
            JSON.stringify({
              code: 200,
              message: "success",
              data: [
                { id: 1, sessionId: "ask-history", chatId: "ask-chat", role: "user", content: "合格人数", seqNum: 1 },
                { id: 2, sessionId: "ask-history", chatId: "ask-chat", role: "assistant", content: "合格 263 人。", seqNum: 4 }
              ]
            })
          );
        }

        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              {
                id: 3,
                sessionId: "ask-history",
                chatId: "ask-chat",
                type: "persisted_event",
                data: JSON.stringify({
                  type: "text",
                  content: "语义 SQL 报错，我改用标准查询。",
                  textRole: "progress",
                  agentName: "问数智能体",
                  sessionId: "ask-history",
                  globalSessionId: "ask-history",
                  chatId: "ask-chat",
                  replyId: "reply-1",
                  modelCallIndex: 1,
                  finished: false
                }),
                seqNum: 2
              },
              {
                id: 4,
                sessionId: "ask-history",
                chatId: "ask-chat",
                type: "persisted_event",
                data: JSON.stringify({
                  type: "done",
                  content: {},
                  agentName: "问数智能体",
                  sessionId: "ask-history",
                  globalSessionId: "ask-history",
                  chatId: "ask-chat",
                  finished: true
                }),
                seqNum: 3
              }
            ]
          })
        );
      })
    );

    const replay = await loadDataHubHistoryReplay("ask-history", "ask");
    const rootTurn = createDataHubAskTurn(
      replay.question,
      replay.events,
      "done",
      "",
      { sessionId: replay.sessionId, chatId: "ask-chat" }
    );

    expect(rootTurn.assistantContent).toBe("合格 263 人。");
    expect(rootTurn.assistantContent).not.toContain("语义 SQL");
  });

  it("prioritizes the root agent done mode over a child knowledge citation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request) => {
        if (String(_url).includes("/messages/list")) {
          return new Response(
            JSON.stringify({
              code: 200,
              message: "success",
              data: [
                {
                  id: 1,
                  sessionId: "agent-mode-history",
                  chatId: "agent-mode-chat",
                  role: "user",
                  content: "分析数据并核对制度",
                  seqNum: 1
                }
              ]
            })
          );
        }

        const nested = (seqNum: number, event: Record<string, unknown>) => ({
          id: seqNum,
          sessionId: "agent-mode-history",
          chatId: "agent-mode-chat",
          type: "persisted_event",
          data: JSON.stringify(event),
          seqNum
        });

        return new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: [
              nested(2, {
                type: "citation_document",
                content: {
                  docId: "doc-child",
                  docKey: "policy.pdf",
                  kbId: "kb-policy"
                },
                agentName: "问知智能体",
                sessionId: "child-knowledge",
                globalSessionId: "agent-mode-history",
                parentSessionId: "agent-mode-history",
                chatId: "agent-mode-chat",
                finished: false
              }),
              nested(3, {
                type: "done",
                content: {
                  mode: "agent",
                  adaptiveTeam: true,
                  completion: "complete"
                },
                agentName: "编排智能体",
                sessionId: "agent-mode-history",
                globalSessionId: "agent-mode-history",
                chatId: "agent-mode-chat",
                finished: true
              })
            ]
          })
        );
      })
    );

    const replay = await loadDataHubHistoryReplay("agent-mode-history");
    const projection = projectDataHubExecutionEvents(replay.events, {
      mainSessionId: replay.sessionId,
      chatId: replay.turns[0]?.chatId
    });

    expect(replay.chatMode).toBe("agent");
    expect(replay.turns[0]?.chatMode).toBe("agent");
    expect(projection.mainSession.done?.adaptiveTeam).toBe(true);
    expect(projection.mainSession.citationDocuments).toEqual([]);
    expect(projection.subagentSessions[0]?.citationDocuments).toHaveLength(1);
    // 回放页面仍按编排走，历史分类记的是编排实际调用的问知子智能体，而不是笼统的「查数据」。
    expect(resolveHistorySessionKind({ sessionId: "agent-mode-history" })).toEqual({
      chatMode: "agent",
      categories: ["知识快查"]
    });
  });
});

describe("resolveHistorySessionKind", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("prefers a backend chat mode once the list returns one", () => {
    expect(resolveHistorySessionKind({ sessionId: "session-1", chatMode: "rag" }, {})).toEqual({
      chatMode: "rag",
      categories: ["知识快查"]
    });
    // 写作等非问数模式不是历史分类的依据，退回前缀判断。
    expect(resolveHistorySessionKind({ sessionId: "ask-data-1", chatMode: "writing" }, {})).toEqual({
      chatMode: "ask",
      categories: ["数据洞察"]
    });
  });

  it("reads single-mode sessions from the id prefix and orchestration from local memory", () => {
    const remembered = {
      "agent-2": { chatMode: "agent" as const, categories: ["数据洞察" as const, "文档处理" as const], updatedAt: 1 }
    };

    expect(resolveHistorySessionKind({ sessionId: "document-lookup-1" }, remembered).categories).toEqual(["文档处理"]);
    expect(resolveHistorySessionKind({ sessionId: "agent-2" }, remembered).categories).toEqual(["数据洞察", "文档处理"]);
    expect(resolveHistorySessionKind({ sessionId: "agent-3" }, remembered)).toEqual({ chatMode: "agent", categories: [] });
    expect(resolveHistorySessionKind({ sessionId: "session-legacy" }, remembered)).toEqual({
      chatMode: undefined,
      categories: []
    });
  });
});

describe("rememberHistorySessionKind", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("collects the subagents an orchestration actually used across runs", () => {
    rememberHistorySessionKind("agent-1", [{ chatMode: "agent", events: [
      subagentEvent("datasource-selection", "数据源选择智能体"),
      subagentEvent("ask-knowledge", "问知智能体")
    ] }]);
    rememberHistorySessionKind("agent-1", [{ chatMode: "agent", events: [subagentEvent("ask-data", "问数智能体")] }]);

    expect(readRememberedHistorySessionKinds()["agent-1"]).toMatchObject({
      chatMode: "agent",
      categories: ["数据洞察", "知识快查"]
    });
  });

  it("only records sessions whose kind the list cannot tell by itself", () => {
    const askEvents = [{ type: "table", sessionId: "x", data: {} }];
    rememberHistorySessionKind("ask-data-1", [{ events: askEvents }]);
    rememberHistorySessionKind("ask-table-1", [{ events: askEvents }]);
    rememberHistorySessionKind("writing-1", [{ events: askEvents }]);
    rememberHistorySessionKind("agent-empty", [{ chatMode: "agent", events: [] }]);
    rememberHistorySessionKind("session-legacy", [{ events: askEvents }]);

    expect(Object.keys(readRememberedHistorySessionKinds()).sort()).toEqual(["agent-empty", "session-legacy"]);
    expect(readRememberedHistorySessionKinds()["session-legacy"]).toMatchObject({
      chatMode: "ask",
      categories: ["数据洞察"]
    });
  });

  it("keeps only the most recent sessions", () => {
    localStorage.setItem(HISTORY_KIND_KEY, JSON.stringify(Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => [
        `agent-old-${index}`,
        { chatMode: "agent", categories: ["数据洞察"], updatedAt: index + 1 }
      ])
    )));

    rememberHistorySessionKind("agent-new", [{ chatMode: "agent", events: [subagentEvent("ask-data", "问数智能体")] }]);
    const remembered = readRememberedHistorySessionKinds();

    expect(Object.keys(remembered)).toHaveLength(300);
    expect(remembered["agent-new"]).toBeDefined();
    expect(remembered["agent-old-0"]).toBeUndefined();
    expect(remembered["agent-old-1"]).toBeDefined();
  });

  it("treats broken or unavailable storage as unknown instead of failing", () => {
    localStorage.setItem(HISTORY_KIND_KEY, "{not json");
    expect(readRememberedHistorySessionKinds()).toEqual({});

    localStorage.setItem(HISTORY_KIND_KEY, JSON.stringify({
      "agent-1": { chatMode: "agent", categories: ["未知类别", "知识快查"], updatedAt: 1 },
      "agent-2": { categories: ["编造"] }
    }));
    expect(readRememberedHistorySessionKinds()).toEqual({
      "agent-1": { chatMode: "agent", categories: ["知识快查"], updatedAt: 1 }
    });

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => rememberHistorySessionKind("agent-3", [{
      chatMode: "agent",
      events: [subagentEvent("ask-data", "问数智能体")]
    }])).not.toThrow();
    expect(readRememberedHistorySessionKinds()).toEqual({});
  });
});

describe("withRememberedHistoryKinds", () => {
  afterEach(() => localStorage.clear());

  it("fills in kinds remembered after the list was cached, leaving known and mock sessions alone", () => {
    const sessions: HistorySession[] = [
      { id: "agent-1", sessionId: "agent-1", title: "编排", summary: "", categories: [], chatMode: "agent", updatedAt: "-", source: "data-hub" },
      { id: "ask-data-2", sessionId: "ask-data-2", title: "问数", summary: "", categories: ["数据洞察"], chatMode: "ask", updatedAt: "-", source: "data-hub" },
      { id: "session-3", sessionId: "session-3", title: "旧会话", summary: "", categories: [], updatedAt: "-", source: "data-hub" },
      { id: "mock", title: "演示", summary: "", categories: [], updatedAt: "-", source: "mock" }
    ];
    rememberHistorySessionKind("agent-1", [{ chatMode: "agent", events: [subagentEvent("document-lookup", "找文档智能体")] }]);

    const result = withRememberedHistoryKinds(sessions);

    expect(result[0]).toMatchObject({ chatMode: "agent", categories: ["文档处理"] });
    expect(result[1]).toBe(sessions[1]);
    expect(result[2]).toBe(sessions[2]);
    expect(result[3]).toBe(sessions[3]);
  });
});

describe("filterHistorySessionList", () => {
  const session = (id: string, title: string, categories: HistorySession["categories"]): HistorySession => ({
    id,
    title,
    summary: "",
    categories,
    updatedAt: "2026-07-24 10:00"
  });
  const sessions = [
    session("knowledge", "制度查询", ["知识快查"]),
    session("insight", "经营分析", ["数据洞察"]),
    session("mixed", "经营数据与制度核对", ["数据洞察", "知识快查"]),
    session("unknown", "经营旧会话", [])
  ];
  const ids = (filter: Parameters<typeof filterHistorySessionList>[1]) =>
    filterHistorySessionList(sessions, filter).map((item) => item.id);

  it("filters an already-loaded session list without issuing another request", () => {
    expect(ids({ keyword: "经营", category: "数据洞察" })).toEqual(["insight", "mixed"]);
  });

  it("matches multi-capability sessions under every tab they used and keeps unknown sessions in 全部 only", () => {
    expect(ids({ category: "知识快查" })).toEqual(["knowledge", "mixed"]);
    expect(ids({ category: "文档处理" })).toEqual([]);
    expect(ids({ category: "全部" })).toEqual(["knowledge", "insight", "mixed", "unknown"]);
  });
});
