import { beforeEach, describe, expect, it } from "vitest";
import { buildDataHubChatRequest, parseDataHubSseBlocks } from "./dataHubAskDataService";
import { writeDataHubSpaceId } from "./dataHubSession";

describe("dataHubAskDataService", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
