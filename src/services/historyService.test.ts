import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterHistorySessionList, loadDataHubHistoryReplay } from "./historyService";
import { createDataHubAskTurn } from "./dataHubAskDataPresenter";
import { projectDataHubExecutionEvents } from "./dataHubExecutionProjector";
import { writeDataHubAuth, writeDataHubSpaceId } from "./dataHubSession";

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
  });
});

describe("filterHistorySessionList", () => {
  it("filters an already-loaded session list without issuing another request", () => {
    const sessions = [
      {
        id: "knowledge",
        title: "制度查询",
        summary: "查询企业制度",
        category: "知识快查" as const,
        updatedAt: "2026-07-24 10:00"
      },
      {
        id: "insight",
        title: "经营分析",
        summary: "查看经营趋势",
        category: "数据洞察" as const,
        updatedAt: "2026-07-24 09:00"
      }
    ];

    expect(
      filterHistorySessionList(sessions, {
        keyword: "经营",
        category: "数据洞察"
      }).map((session) => session.id)
    ).toEqual(["insight"]);
  });
});
