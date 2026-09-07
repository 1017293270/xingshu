import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTableAgentTrace } from "./agentTrace";
import { getTableGenerationProgress } from "./tableGenerationProgress";
import { useTableGeneration } from "./useTableGeneration";
import { createDataHubAskTurn } from "@/services/dataHubAskDataPresenter";
import type { DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import type { AgentMessageInput } from "@/types/agent";
import type { DataHubStreamEvent } from "@/types/dataHub";

const streamMocks = vi.hoisted(() => ({
  streamAgentMessage: vi.fn(),
  respondToAgentInteraction: vi.fn(),
  loadDataHubHistoryReplay: vi.fn()
}));

vi.mock("@/services/agentService", () => ({
  streamAgentMessage: streamMocks.streamAgentMessage,
  respondToAgentInteraction: streamMocks.respondToAgentInteraction
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

it("projects successful child activities while keeping the root running and cancellable", () => {
  let handlers: DataHubAskDataStreamHandlers | undefined;
  const controller = new AbortController();
  streamMocks.streamAgentMessage.mockImplementation((_input, value) => { handlers = value; return controller; });
  const { result, unmount } = renderHook(() => useTableGeneration());
  act(() => { result.current.generate("按合同年度聚合"); });
  const root = result.current.sessionId!;
  act(() => {
    handlers?.onEvent({ type: "subagent_exposed", sessionId: root, content: { sessionId: "child", agentId: "datasource-selection", label: "数据源选择" } });
    for (const [activityId, label] of [["sources", "读取可用数据源"], ["metadata", "读取语义模型"], ["query", "查询数据"]]) {
      for (const status of ["running", "success"]) {
        handlers?.onEvent({ type: "activity", sessionId: "child", parentSessionId: root,
          content: { activityId, kind: "tool", label, status, summary: status === "success" ? `${label}成功` : undefined } });
      }
    }
    handlers?.onEvent({ type: "done", sessionId: "child", parentSessionId: root, finished: true });
  });
  expect(result.current.status).toBe("streaming");
  expect(getTableGenerationProgress(result.current.turn)).toContain("查询数据");
  const trace = buildTableAgentTrace(result.current.turn);
  expect(trace.steps.map((step) => step.label)).toEqual(["读取可用数据源", "读取语义模型", "查询数据"]);
  expect(trace.steps.every((step) => step.status === "done")).toBe(true);
  expect(trace.steps[0].detail).toContain("数据源选择");
  act(() => { result.current.stop(); });
  expect(controller.signal.aborted).toBe(true);
  expect(result.current.status).toBe("cancelled");
  unmount();
  streamMocks.streamAgentMessage.mockReset();
});

describe("automatic table launch", () => {
  afterEach(() => {
    streamMocks.streamAgentMessage.mockReset();
    streamMocks.loadDataHubHistoryReplay.mockReset();
    sessionStorage.clear();
  });

  it("sends exactly once under root StrictMode and still supports an explicit retry", async () => {
    const calls: Array<{ handlers: DataHubAskDataStreamHandlers; controller: AbortController }> = [];
    streamMocks.streamAgentMessage.mockImplementation((_input, handlers) => {
      const controller = new AbortController();
      calls.push({ handlers, controller });
      return controller;
    });
    const { result, unmount } = renderHook(() => useTableGeneration({
      sessionId: "ask-table-strict-regression", launchPrompt: "按合同年度聚合"
    }), { reactStrictMode: true });
    await act(async () => { await Promise.resolve(); });
    expect(calls).toHaveLength(1);
    expect(calls[0].controller.signal.aborted).toBe(false);
    act(() => {
      calls[0].handlers.onEvent({ type: "text", content: "当前公开进度" });
      calls[0].handlers.onDone?.();
    });
    expect(result.current.status).toBe("done");
    expect(result.current.turn.assistantContent).toBe("当前公开进度");
    act(() => { result.current.generate("按合同年度聚合"); });
    expect(calls).toHaveLength(2);
    expect(calls[1].controller.signal.aborted).toBe(false);
    unmount();
    expect(calls[1].controller.signal.aborted).toBe(true);
  });

  it("does not send a delayed request after unmount", async () => {
    streamMocks.streamAgentMessage.mockImplementation(() => new AbortController());
    const { unmount } = renderHook(() => useTableGeneration({
      sessionId: "ask-table-unmounted", launchPrompt: "按合同年度聚合"
    }), { reactStrictMode: true });
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(streamMocks.streamAgentMessage).not.toHaveBeenCalled();
    expect(streamMocks.loadDataHubHistoryReplay).not.toHaveBeenCalled();
  });

  it("launches only the current session when navigation changes before the microtask", async () => {
    streamMocks.streamAgentMessage.mockImplementation(() => new AbortController());
    const { rerender, unmount } = renderHook((options) => useTableGeneration(options), {
      initialProps: { sessionId: "ask-table-old", launchPrompt: "旧需求" }, reactStrictMode: true
    });
    rerender({ sessionId: "ask-table-new", launchPrompt: "新需求" });
    await act(async () => { await Promise.resolve(); });
    expect(streamMocks.streamAgentMessage).toHaveBeenCalledOnce();
    expect(streamMocks.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "ask-table-new", content: "新需求" }), expect.anything()
    );
    unmount();
  });
});
