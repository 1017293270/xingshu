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
});
