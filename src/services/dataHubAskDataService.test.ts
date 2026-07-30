import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDataHubChatRequest,
  parseDataHubSseBlocks,
  streamDataHubAskData
} from "./dataHubAskDataService";
import {
  DATA_HUB_SESSION_EXPIRED_EVENT,
  readDataHubSession,
  writeDataHubAuth,
  writeDataHubSpaceId
} from "./dataHubSession";

describe("dataHubAskDataService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("builds data-hub ask-data requests with safe defaults", () => {
    const request = buildDataHubChatRequest({
      message: "统计今年事件数",
      sessionId: "session-001",
      chatId: "chat-001"
    });

    expect(request).toEqual({
      message: "统计今年事件数",
      sessionId: "session-001",
      globalSessionId: "session-001",
      chatId: "chat-001",
      chatMode: "ask"
    });
    expect(Object.keys(request).sort()).toEqual(
      ["message", "sessionId", "globalSessionId", "chatId", "chatMode"].sort()
    );
  });

  it.each(["ask", "rag", "document_lookup", "agent"] as const)(
    "keeps the strict five-field request for %s mode",
    (chatMode) => {
      const request = buildDataHubChatRequest({
        message: "执行任务",
        sessionId: "session-mode",
        globalSessionId: "global-mode",
        chatId: "chat-mode",
        chatMode
      });

      expect(request).toEqual({
        message: "执行任务",
        sessionId: "session-mode",
        globalSessionId: "global-mode",
        chatId: "chat-mode",
        chatMode
      });
      expect(request).not.toHaveProperty("userId");
      expect(request).not.toHaveProperty("spaceId");
      expect(request).not.toHaveProperty("askStrategy");
      expect(request).not.toHaveProperty("datasourceId");
    }
  );

  it("parses complete SSE data blocks and keeps incomplete rest", () => {
    const parsed = parseDataHubSseBlocks(
      [
        'data: {"type":"content","data":"你好"}',
        "",
        'data: {"type":"done","data":{"tables":1}}',
        "",
        'data: {"type":"partial"'
      ].join("\n")
    );

    expect(parsed.events).toEqual([
      expect.objectContaining({ type: "content", data: "你好" }),
      expect.objectContaining({ type: "done", data: { tables: 1 } })
    ]);
    expect(parsed.isDone).toBe(false);
    expect(parsed.rest).toBe('data: {"type":"partial"');
  });

  it("recognizes the SSE done sentinel", () => {
    const parsed = parseDataHubSseBlocks("data: [DONE]\n\n");

    expect(parsed.events).toEqual([]);
    expect(parsed.isDone).toBe(true);
    expect(parsed.rest).toBe("");
  });

  it("parses Spring-wrapped new events and finishes only on the main event", () => {
    const mainEvent = {
      agentName: "问知智能体",
      isThinking: false,
      type: "text",
      content: "正式回答",
      sessionId: "session-main",
      globalSessionId: "session-main",
      chatId: "chat-main",
      replyId: "reply-2",
      modelCallIndex: 2,
      finished: true
    };
    const parsed = parseDataHubSseBlocks(`data: ${JSON.stringify(JSON.stringify(mainEvent))}\r\n\r\n`);

    expect(parsed.events).toEqual([
      expect.objectContaining({
        type: "text",
        data: "正式回答",
        replyId: "reply-2",
        modelCallIndex: 2
      })
    ]);
    expect(parsed.isDone).toBe(true);

    const child = parseDataHubSseBlocks(
      `data: ${JSON.stringify({
        ...mainEvent,
        sessionId: "child-session",
        parentSessionId: "session-main",
        finished: true
      })}\n\n`
    );
    expect(child.events).toHaveLength(1);
    expect(child.isDone).toBe(false);
  });

  it("posts the exact five-field body to the new agentScore endpoint", () => {
    let openedMethod = "";
    let openedUrl = "";
    let sentBody = "";

    class CaptureXMLHttpRequest {
      status = 200;
      responseText = `data: ${JSON.stringify({
        agentName: "问知智能体",
        isThinking: false,
        type: "done",
        content: { mode: "rag", askKnowledge: true },
        sessionId: "session-rag",
        globalSessionId: "session-rag",
        chatId: "chat-rag",
        finished: true
      })}\n\n`;
      onprogress: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onloadend: (() => void) | null = null;

      open(method: string, url: string) {
        openedMethod = method;
        openedUrl = url;
      }
      setRequestHeader() {}
      abort() {}
      send(body: string) {
        sentBody = body;
        this.onloadend?.();
      }
    }

    vi.stubGlobal("XMLHttpRequest", CaptureXMLHttpRequest);
    const onDone = vi.fn();
    const onEvent = vi.fn();

    streamDataHubAskData(
      {
        message: "合同审批流程是什么？",
        sessionId: "session-rag",
        globalSessionId: "session-rag",
        chatId: "chat-rag",
        chatMode: "rag"
      },
      { onEvent, onDone }
    );

    expect(openedMethod).toBe("POST");
    expect(openedUrl).toBe("/api/agentScore/chat/completions/stream");
    expect(JSON.parse(sentBody)).toEqual({
      message: "合同审批流程是什么？",
      sessionId: "session-rag",
      globalSessionId: "session-rag",
      chatId: "chat-rag",
      chatMode: "rag"
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "done",
        sessionId: "session-rag",
        chatId: "chat-rag"
      })
    );
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("expires the active session when the ask-data stream returns 401", () => {
    class UnauthorizedXMLHttpRequest {
      status = 401;
      responseText = JSON.stringify({ message: "Unauthorized" });
      onprogress: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onloadend: (() => void) | null = null;

      open() {}
      setRequestHeader() {}
      abort() {}
      send() {
        this.onloadend?.();
      }
    }

    vi.stubGlobal("XMLHttpRequest", UnauthorizedXMLHttpRequest);
    writeDataHubAuth({ token: "expired-stream-token", userId: 1, username: "demo", isAdmin: false });
    writeDataHubSpaceId(5);
    const sessionExpiredListener = vi.fn();
    const onError = vi.fn();
    window.addEventListener(DATA_HUB_SESSION_EXPIRED_EVENT, sessionExpiredListener, { once: true });

    streamDataHubAskData(
      { message: "统计今年事件数", chatId: "chat-401" },
      { onEvent: vi.fn(), onError }
    );

    expect(readDataHubSession().token).toBeNull();
    expect(sessionExpiredListener).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "登录状态已过期，请重新登录" })
    );
  });

  it("does not turn an intentional abort into a stream error", () => {
    class AbortableXMLHttpRequest {
      status = 0;
      responseText = "";
      onprogress: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onloadend: (() => void) | null = null;

      open() {}
      setRequestHeader() {}
      send() {}
      abort() {
        this.onabort?.();
        this.onloadend?.();
      }
    }

    vi.stubGlobal("XMLHttpRequest", AbortableXMLHttpRequest);
    const onEvent = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const controller = streamDataHubAskData(
      {
        message: "停止这个任务",
        sessionId: "session-abort",
        globalSessionId: "session-abort",
        chatId: "chat-abort",
        chatMode: "agent"
      },
      { onEvent, onDone, onError }
    );
    controller.abort();

    expect(onEvent).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
