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
    writeDataHubSpaceId(5);

    const request = buildDataHubChatRequest({
      message: "统计今年事件数",
      chatId: "chat-001"
    });

    expect(request).toMatchObject({
      message: "统计今年事件数",
      chatId: "chat-001",
      chatMode: "ask",
      askStrategy: "cube_fallback",
      spaceId: 5
    });
  });

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
      { type: "content", data: "你好" },
      { type: "done", data: { tables: 1 } }
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
});
