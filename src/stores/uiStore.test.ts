import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAttachmentQueue } from "@/services/attachmentService";
import { useUiStore } from "./uiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
  });

  it("selects a recommended app and writes its prompt", () => {
    useUiStore.getState().selectApp("data-chat", "帮我分析本月经营数据，并生成趋势图表");

    expect(useUiStore.getState().selectedAppId).toBe("data-chat");
    expect(useUiStore.getState().homeDraft).toBe("帮我分析本月经营数据，并生成趋势图表");
  });

  it("clears home conversation state for a new chat", () => {
    useUiStore.getState().selectApp("writing", "写一份汇报");
    useUiStore.getState().setSentStatus("已发送：写一份汇报");
    useUiStore.getState().clearHomeConversation();

    expect(useUiStore.getState().selectedAppId).toBeNull();
    expect(useUiStore.getState().homeDraft).toBe("");
    expect(useUiStore.getState().sentStatus).toBe("");
  });

  it("toggles the sidebar collapsed state", () => {
    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);

    useUiStore.getState().toggleSidebarCollapsed();

    expect(useUiStore.getState().isSidebarCollapsed).toBe(true);
  });

  it("keeps a removable local attachment queue across the home and analysis command boxes", () => {
    const attachments = createAttachmentQueue([
      new File(["region,revenue"], "sales.csv", { type: "text/csv" }),
      new File(["notes"], "notes.txt", { type: "text/plain" })
    ]);

    useUiStore.getState().queuePendingAttachments(attachments);
    useUiStore.getState().removePendingAttachment(attachments[0]!.id);

    expect(useUiStore.getState().pendingAttachments.map((item) => item.name)).toEqual(["notes.txt"]);
  });

  it("keeps ask-data failures visible when the stream closes after an error", () => {
    const runId = useUiStore.getState().startAskDataRun("分析本月销售数据");
    useUiStore.getState().failAskDataRun(runId, "问数连接失败");
    useUiStore.getState().completeAskDataRun(runId);

    expect(useUiStore.getState().askDataStatus).toBe("error");
    expect(useUiStore.getState().askDataError).toBe("问数连接失败");
  });

  it("captures the data-hub session id from stream events", () => {
    const runId = useUiStore.getState().startAskDataRun("统计咨询量", null);
    useUiStore.getState().appendAskDataEvent(runId, {
      type: "routing_intent",
      sessionId: "session-123",
      data: { intent: "ASK_DATA" }
    });

    expect(useUiStore.getState().activeAnalysisSessionId).toBe("session-123");
  });

  it("keeps the current data-hub session when asking a follow-up", () => {
    const firstRunId = useUiStore.getState().startAskDataRun("统计咨询量", null);
    useUiStore.getState().appendAskDataEvent(firstRunId, {
      type: "done",
      sessionId: "session-123",
      data: { summary: "完成" }
    });
    useUiStore.getState().completeAskDataRun(firstRunId);

    useUiStore.getState().startAskDataRun("按社区拆分");

    expect(useUiStore.getState().activeAnalysisSessionId).toBe("session-123");
    expect(useUiStore.getState().activeAnalysisQuestion).toBe("按社区拆分");
    expect(useUiStore.getState().analysisTurns.map((turn) => turn.question)).toEqual(["统计咨询量", "按社区拆分"]);
  });

  it("restores a history turn and appends the next follow-up in the same thread", () => {
    useUiStore.getState().restoreAskDataHistory({
      sessionId: "history-session-1",
      question: "历史问题",
      events: [{ type: "done", data: { summary: "历史答案" } }]
    });

    useUiStore.getState().startAskDataRun("继续追问");

    expect(useUiStore.getState().activeAnalysisSessionId).toBe("history-session-1");
    expect(useUiStore.getState().analysisTurns.map((turn) => turn.question)).toEqual(["历史问题", "继续追问"]);
  });

  it("ignores late events from a cancelled run", () => {
    const staleEvent = { type: "text", data: "旧回答", timestamp: 1 };
    const currentEvent = { type: "text", data: "新回答", timestamp: 2 };
    const first = useUiStore.getState().startAskDataRun("问题一", null);
    useUiStore.getState().cancelAskDataRun(first);
    const second = useUiStore.getState().startAskDataRun("问题二", null);

    useUiStore.getState().appendAskDataEvent(first, staleEvent);
    useUiStore.getState().appendAskDataEvent(second, currentEvent);

    expect(useUiStore.getState().analysisTurns.at(-1)?.events).toEqual([currentEvent]);
    expect(useUiStore.getState().activeAskDataRunId).toBe(second);
  });

  it("aborts a bound controller after invalidating its run", () => {
    const runId = useUiStore.getState().startAskDataRun("停止测试", null);
    const abort = vi.fn();
    useUiStore.getState().bindAskDataController(runId, { abort } as unknown as AbortController);

    useUiStore.getState().cancelAskDataRun(runId);

    expect(abort).toHaveBeenCalledOnce();
    expect(useUiStore.getState().activeAskDataRunId).toBeNull();
    expect(useUiStore.getState().analysisTurns.at(-1)?.status).toBe("cancelled");
  });

  it("invalidates and aborts the previous stream when a new run starts", () => {
    const first = useUiStore.getState().startAskDataRun("问题一", null);
    const abort = vi.fn();
    useUiStore.getState().bindAskDataController(first, { abort } as unknown as AbortController);

    const second = useUiStore.getState().startAskDataRun("问题二");

    expect(abort).toHaveBeenCalledOnce();
    expect(useUiStore.getState().activeAskDataRunId).toBe(second);
    expect(useUiStore.getState().analysisTurns.find((turn) => turn.id === first)?.status).toBe("cancelled");
  });
});
