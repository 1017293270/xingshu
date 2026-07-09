import { beforeEach, describe, expect, it } from "vitest";
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

  it("toggles the more navigation group", () => {
    expect(useUiStore.getState().isMoreOpen).toBe(true);

    useUiStore.getState().toggleMore();

    expect(useUiStore.getState().isMoreOpen).toBe(false);
  });

  it("keeps ask-data failures visible when the stream closes after an error", () => {
    useUiStore.getState().startAskDataRun("分析本月销售数据");
    useUiStore.getState().failAskDataRun("问数连接失败");
    useUiStore.getState().completeAskDataRun();

    expect(useUiStore.getState().askDataStatus).toBe("error");
    expect(useUiStore.getState().askDataError).toBe("问数连接失败");
  });

  it("captures the data-hub session id from stream events", () => {
    useUiStore.getState().startAskDataRun("统计咨询量", null);
    useUiStore.getState().appendAskDataEvent({
      type: "routing_intent",
      sessionId: "session-123",
      data: { intent: "ASK_DATA" }
    });

    expect(useUiStore.getState().activeAnalysisSessionId).toBe("session-123");
  });

  it("keeps the current data-hub session when asking a follow-up", () => {
    useUiStore.getState().startAskDataRun("统计咨询量", null);
    useUiStore.getState().appendAskDataEvent({
      type: "done",
      sessionId: "session-123",
      data: { summary: "完成" }
    });
    useUiStore.getState().completeAskDataRun();

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
});
