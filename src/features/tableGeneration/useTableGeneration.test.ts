import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTableGenerationProgress } from "./tableGenerationProgress";
import { useTableGeneration } from "./useTableGeneration";
import { createDataHubAskTurn } from "@/services/dataHubAskDataPresenter";
import type { DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import type { AgentMessageInput } from "@/types/agent";
import type { DataHubStreamEvent } from "@/types/dataHub";

const streamMocks = vi.hoisted(() => ({
  streamAgentMessage: vi.fn(),
  loadDataHubHistoryReplay: vi.fn()
}));

vi.mock("@/services/agentService", () => ({
  streamAgentMessage: streamMocks.streamAgentMessage
}));

vi.mock("@/services/historyService", () => ({
  loadDataHubHistoryReplay: streamMocks.loadDataHubHistoryReplay
}));

function mockStream(run: (handlers: DataHubAskDataStreamHandlers, controller: AbortController) => void) {
  streamMocks.streamAgentMessage.mockImplementation((
    _input: AgentMessageInput,
    handlers: DataHubAskDataStreamHandlers
  ) => {
    const controller = new AbortController();
    run(handlers, controller);
    return controller;
  });
}

describe("useTableGeneration", () => {
  afterEach(() => {
    streamMocks.streamAgentMessage.mockReset();
    streamMocks.loadDataHubHistoryReplay.mockReset();
  });

  it("describes the latest ask-data progress without requiring a finished table", () => {
    const turn = createDataHubAskTurn(
      "华东区 Q1 销售排行",
      [
        { type: "routing_intent", data: { intent: "ask" } },
        { type: "data_source_selected", data: { datasourceId: 8, datasourceName: "经营分析库" } },
        { type: "react_step", data: { action: "generate_query", status: "running" } }
      ],
      "streaming"
    );

    expect(getTableGenerationProgress(turn)).toBe("当前步骤：生成查询");
  });

  it("streams ask-table locally and ignores events after stop", async () => {
    let streamHandlers: DataHubAskDataStreamHandlers | undefined;
    mockStream((handlers) => {
      streamHandlers = handlers;
    });

    const { result } = renderHook(() => useTableGeneration());
    act(() => {
      expect(result.current.generate("华东区 Q1 销售排行")).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.status).toBe("streaming");
    });
    expect(streamMocks.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "华东区 Q1 销售排行",
        chatMode: "ask_table"
      }),
      expect.any(Object)
    );
    expect(streamMocks.streamAgentMessage.mock.calls[0]?.[0]?.sessionId).toMatch(/^ask-table-/);

    act(() => {
      streamHandlers?.onEvent({
        type: "table",
        data: {
          columns: [{ name: "region", title: "区域" }],
          rows: [{ region: "华东" }],
          totalRows: 1,
          source: "cube"
        }
      } satisfies DataHubStreamEvent);
    });

    await waitFor(() => {
      expect(result.current.turn.tableResults).toHaveLength(1);
    });

    act(() => {
      result.current.stop();
    });
    expect(result.current.status).toBe("cancelled");

    act(() => {
      streamHandlers?.onDone?.();
    });
    expect(result.current.status).toBe("cancelled");
  });

  it("records stream failures without leaving the hook in a loading state", async () => {
    mockStream((handlers) => {
      queueMicrotask(() => handlers.onError?.(new Error("DataHub 流式连接失败")));
    });

    const { result } = renderHook(() => useTableGeneration());
    act(() => {
      result.current.generate("月度费用统计报表");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.turn.error?.message).toBe("DataHub 流式连接失败");
  });

  it("restores the original table events from a persisted ask-table session", async () => {
    streamMocks.loadDataHubHistoryReplay.mockResolvedValue({
      sessionId: "ask-table-sales",
      chatMode: "ask",
      question: "客户销售排行榜表",
      events: [
        {
          type: "table",
          data: {
            columns: [{ name: "customer", title: "客户" }],
            rows: [{ customer: "星海实业" }],
            totalRows: 1,
            source: "cube"
          }
        }
      ],
      turns: [
        {
          id: "ask-table-sales-chat-1",
          question: "客户销售排行榜表",
          sessionId: "ask-table-sales",
          chatId: "chat-1",
          chatMode: "ask",
          status: "done",
          events: [
            {
              type: "table",
              data: {
                columns: [{ name: "customer", title: "客户" }],
                rows: [{ customer: "星海实业" }],
                totalRows: 1,
                source: "cube"
              }
            }
          ],
          error: ""
        }
      ]
    });

    const { result } = renderHook(() => useTableGeneration({ sessionId: "ask-table-sales" }));

    await waitFor(() => {
      expect(result.current.turns[0]?.tableResults).toHaveLength(1);
    });
    expect(result.current.turn.question).toBe("客户销售排行榜表");
    expect(result.current.turn.tableResults[0]?.rows[0]).toEqual({ customer: "星海实业" });
    expect(result.current.didRestore).toBe(true);
    expect(streamMocks.streamAgentMessage).not.toHaveBeenCalled();
  });

  it("boots a launch prompt into ask_table instead of restoring", async () => {
    mockStream((handlers) => {
      queueMicrotask(() => {
        handlers.onEvent({
          type: "table",
          data: {
            columns: [{ name: "region", title: "区域" }],
            rows: [{ region: "华东" }],
            totalRows: 1,
            source: "cube"
          }
        } satisfies DataHubStreamEvent);
        handlers.onDone?.();
      });
    });

    const { result } = renderHook(() => useTableGeneration({
      sessionId: "ask-table-launch",
      launchPrompt: "华东区 Q1 销售排行"
    }));

    await waitFor(() => {
      expect(result.current.turn.tableResults).toHaveLength(1);
    });
    expect(streamMocks.loadDataHubHistoryReplay).not.toHaveBeenCalled();
    expect(streamMocks.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "华东区 Q1 销售排行",
        chatMode: "ask_table",
        sessionId: "ask-table-launch"
      }),
      expect.any(Object)
    );
    expect(result.current.didRestore).toBe(false);
  });
});
