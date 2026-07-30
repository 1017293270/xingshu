import { describe, expect, it } from "vitest";
import { adaptDataHubStreamEvent } from "./dataHubEventAdapter";

describe("dataHubEventAdapter", () => {
  it("normalizes the new type/content envelope without parsing text as business JSON", () => {
    const event = adaptDataHubStreamEvent({
      agentName: "问知智能体",
      isThinking: false,
      timestamp: "2026-07-28T10:00:00+08:00",
      type: "text",
      content: '{"approved": true}',
      sessionId: "session-main",
      globalSessionId: "session-main",
      chatId: "chat-1",
      replyId: "reply-2",
      modelCallIndex: 2,
      finished: false
    });

    expect(event).toEqual({
      agentName: "问知智能体",
      isThinking: false,
      timestamp: "2026-07-28T10:00:00+08:00",
      type: "text",
      data: '{"approved": true}',
      content: '{"approved": true}',
      sessionId: "session-main",
      globalSessionId: "session-main",
      chatId: "chat-1",
      replyId: "reply-2",
      modelCallIndex: 2,
      finished: false
    });
  });

  it("normalizes legacy type/data payloads", () => {
    const event = adaptDataHubStreamEvent({
      type: "table",
      data: JSON.stringify({
        columns: ["部门", "人数"],
        rows: [["研发", 12]]
      }),
      sessionId: "legacy-session",
      chatId: "legacy-chat"
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "table",
        sessionId: "legacy-session",
        chatId: "legacy-chat",
        data: {
          columns: ["部门", "人数"],
          rows: [["研发", 12]]
        }
      })
    );
  });

  it("does not mistake a legacy business payload containing data for an event wrapper", () => {
    const event = adaptDataHubStreamEvent({
      type: "table",
      data: {
        columns: ["部门", "人数"],
        data: [["研发", 12]],
        total: 1
      }
    });

    expect(event?.data).toEqual({
      columns: ["部门", "人数"],
      data: [["研发", 12]],
      total: 1
    });
  });

  it("keeps a legacy chart descriptor as the chart payload", () => {
    const event = adaptDataHubStreamEvent({
      type: "chart",
      data: JSON.stringify({
        type: "bar",
        data: [{ label: "华东", value: 12 }]
      })
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "chart",
        data: {
          type: "bar",
          data: [{ label: "华东", value: 12 }]
        }
      })
    );
  });

  it("preserves JSON-looking legacy text as model-authored text", () => {
    const event = adaptDataHubStreamEvent({
      type: "text",
      data: '{"approved": true}'
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "text",
        data: '{"approved": true}',
        content: '{"approved": true}'
      })
    );
  });

  it("unwraps a minimal same-type legacy text event persisted as JSON", () => {
    const event = adaptDataHubStreamEvent({
      type: "content",
      sessionId: "legacy-session",
      chatId: "legacy-chat",
      data: JSON.stringify({
        type: "content",
        data: "你好"
      })
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "content",
        data: "你好",
        content: "你好",
        sessionId: "legacy-session",
        chatId: "legacy-chat"
      })
    );
  });

  it("unwraps a minimal legacy text event behind an anonymous persisted wrapper", () => {
    const event = adaptDataHubStreamEvent({
      type: "content",
      sessionId: "legacy-session",
      chatId: "legacy-chat",
      data: JSON.stringify({
        data: JSON.stringify({
          type: "content",
          data: "你好"
        })
      })
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "content",
        data: "你好",
        content: "你好"
      })
    );
  });

  it("recursively unwraps persisted JSON while allowing the inner event to provide metadata", () => {
    const persisted = {
      type: "text",
      sessionId: "history-main",
      chatId: "history-chat",
      data: JSON.stringify({
        data: JSON.stringify({
          agentName: "问知智能体",
          isThinking: false,
          type: "citation_document",
          content: {
            docId: "doc-1",
            docKey: "policy",
            kbId: "kb-1"
          },
          sessionId: "history-main",
          globalSessionId: "history-main",
          chatId: "history-chat",
          finished: false
        })
      })
    };

    expect(adaptDataHubStreamEvent(persisted)).toEqual(
      expect.objectContaining({
        type: "citation_document",
        sessionId: "history-main",
        globalSessionId: "history-main",
        chatId: "history-chat",
        data: {
          docId: "doc-1",
          docKey: "policy",
          kbId: "kb-1"
        }
      })
    );
  });

  it("preserves child-agent scope fields for main-session isolation", () => {
    const event = adaptDataHubStreamEvent({
      agentName: "内部智能体",
      type: "thinking",
      content: "内部处理中",
      sessionId: "child-session",
      globalSessionId: "main-session",
      parentSessionId: "main-session",
      chatId: "chat-1",
      finished: true
    });

    expect(event).toEqual(
      expect.objectContaining({
        sessionId: "child-session",
        globalSessionId: "main-session",
        parentSessionId: "main-session",
        finished: true
      })
    );
  });

  it("unwraps legacy non-text events that only contain type/data", () => {
    const event = adaptDataHubStreamEvent({
      type: "persisted_event",
      sessionId: "history-main",
      data: JSON.stringify({
        type: "routing_intent",
        data: {
          intent: "adaptive_team",
          status: "success"
        }
      })
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "routing_intent",
        sessionId: "history-main",
        data: {
          intent: "adaptive_team",
          status: "success"
        }
      })
    );
  });

  it("preserves the full agent and orchestration scope metadata", () => {
    const event = adaptDataHubStreamEvent({
      type: "thinking",
      content: "正在处理",
      agentName: "制度研究员",
      agentId: "agent-policy",
      sessionId: "child-policy",
      globalSessionId: "main-session",
      parentSessionId: "main-session",
      subagentId: "subagent-policy",
      label: "制度研究员",
      eventId: "event-7",
      eventSequence: 7,
      toolCallId: "tool-3",
      requestFinished: false,
      finished: false
    });

    expect(event).toEqual(
      expect.objectContaining({
        agentId: "agent-policy",
        subagentId: "subagent-policy",
        label: "制度研究员",
        eventId: "event-7",
        sequence: 7,
        toolCallId: "tool-3",
        requestFinished: false
      })
    );
  });
});
