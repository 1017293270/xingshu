import { afterEach, describe, expect, it, vi } from "vitest";
import {
  streamDataHubAskData,
  type DataHubAskDataInput,
  type DataHubAskDataStreamHandlers
} from "@/services/dataHubAskDataService";
import { ensureAskArtifact } from "@/services/queryAssetService";
import { materializeAskArtifact } from "./dataHubQueryAssetMaterializationService";

vi.mock("@/services/dataHubAskDataService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/dataHubAskDataService")>();
  return {
    ...actual,
    streamDataHubAskData: vi.fn()
  };
});

vi.mock("@/services/queryAssetService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/queryAssetService")>();
  return {
    ...actual,
    ensureAskArtifact: vi.fn()
  };
});

const streamMock = vi.mocked(streamDataHubAskData);
const ensureMock = vi.mocked(ensureAskArtifact);

function completeStream(
  events: Parameters<DataHubAskDataStreamHandlers["onEvent"]>[0][]
) {
  return (
    _input: DataHubAskDataInput,
    handlers: DataHubAskDataStreamHandlers
  ) => {
    const controller = new AbortController();
    queueMicrotask(() => {
      events.forEach(handlers.onEvent);
      handlers.onDone?.();
    });
    return controller;
  };
}

describe("dataHubQueryAssetMaterializationService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reruns the original question through a strict ask stream and returns its artifact", async () => {
    streamMock.mockImplementation(
      completeStream([
        {
          type: "ask_artifact",
          content: {
            askRunId: "materialized-run",
            resolvedQuestion: "统计历史咨询对象排名",
            canFavorite: true
          },
          sessionId: "history-root",
          globalSessionId: "history-root",
          chatId: "stream-chat"
        },
        {
          type: "done",
          content: { mode: "ask" },
          sessionId: "history-root",
          globalSessionId: "history-root",
          chatId: "stream-chat",
          finished: true
        }
      ])
    );

    const artifact = await materializeAskArtifact({
      question: " 统计历史咨询对象排名 "
    });

    expect(artifact).toEqual({
      askRunId: "materialized-run",
      resolvedQuestion: "统计历史咨询对象排名",
      canFavorite: true
    });
    expect(streamMock).toHaveBeenCalledOnce();
    const request = streamMock.mock.calls[0][0];
    expect(request).toEqual({
      message: "统计历史咨询对象排名",
      sessionId: expect.stringMatching(/^session-/),
      globalSessionId: expect.stringMatching(/^session-/),
      chatId: expect.stringMatching(/^chat-/),
      chatMode: "ask"
    });
    expect(request.globalSessionId).toBe(request.sessionId);
    expect(Object.keys(request).sort()).toEqual([
      "chatId",
      "chatMode",
      "globalSessionId",
      "message",
      "sessionId"
    ]);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("uses the authoritative ensure endpoint when the rerun finishes without an artifact event", async () => {
    const ensuredArtifact = {
      askRunId: "ensured-materialized-run",
      resolvedQuestion: "统计历史合同数量",
      canFavorite: true
    };
    streamMock.mockImplementation(
      completeStream([
        {
          type: "done",
          content: { mode: "ask" },
          finished: true
        }
      ])
    );
    ensureMock.mockResolvedValue(ensuredArtifact);

    await expect(
      materializeAskArtifact({ question: "统计历史合同数量" })
    ).resolves.toEqual(ensuredArtifact);

    const request = streamMock.mock.calls[0][0];
    expect(request.sessionId).toMatch(/^session-/);
    expect(request.chatId).toMatch(/^chat-/);
    expect(ensureMock).toHaveBeenCalledWith(request.sessionId, request.chatId);
  });

  it("rejects and aborts when DataHub returns a failed done event", async () => {
    let controller: AbortController | undefined;
    streamMock.mockImplementation((_input, handlers) => {
      controller = new AbortController();
      queueMicrotask(() => {
        handlers.onEvent({
          type: "done",
          content: {
            mode: "ask",
            failed: true,
            summary: "数据查询执行失败"
          },
          finished: true
        });
        handlers.onDone?.();
      });
      return controller;
    });

    await expect(
      materializeAskArtifact({ question: "统计失败的历史查询" })
    ).rejects.toThrow("数据查询执行失败");

    expect(controller?.signal.aborted).toBe(true);
    expect(ensureMock).not.toHaveBeenCalled();
  });
});
