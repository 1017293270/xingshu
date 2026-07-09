import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDataHubHistoryReplay } from "./historyService";
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
});
