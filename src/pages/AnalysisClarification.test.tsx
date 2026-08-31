import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";
import type { DataHubAskDataStreamHandlers } from "@/services/dataHubAskDataService";
import type { DataHubChatMode, DataHubStreamEvent } from "@/types/dataHub";

const serviceMocks = vi.hoisted(() => ({
  streamAgentMessage: vi.fn(),
  respondToAgentInteraction: vi.fn(),
  sendAgentMessage: vi.fn(),
  createConversation: vi.fn()
}));

vi.mock("@/services/agentService", () => serviceMocks);

vi.mock("@/services/tableService", () => ({
  listRecentTables: vi.fn().mockResolvedValue([])
}));

/** 挂在 ask_user 上的一轮：clarification 之后照常推 done，状态是 done 但其实在等人。 */
const suspendedEvents: DataHubStreamEvent[] = [
  { type: "text", data: "我先请您选择交付报告的类型。" },
  {
    type: "clarification",
    data: {
      interactionId: "tool-call-1",
      question: "请选择本次要编写的项目交付报告类型：",
      options: [
        { label: "信息化系统交付" },
        { label: "咨询服务交付" },
        { label: "工程实施交付" }
      ],
      allowFreeText: false
    }
  },
  { type: "done", data: { suspended: true } }
];

function restoreSuspendedTurn(chatMode: DataHubChatMode) {
  useUiStore.getState().restoreAskDataHistory({
    sessionId: "session-1",
    question: "帮我写一份项目交付报告",
    chatMode,
    events: suspendedEvents,
    turns: [
      {
        id: "run-1",
        question: "帮我写一份项目交付报告",
        sessionId: "session-1",
        chatId: "chat-1",
        chatMode,
        status: "done",
        events: suspendedEvents,
        error: ""
      }
    ]
  });
}

function renderAnalysis(mode: DataHubChatMode) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[mode === "agent" ? "/ask-agent" : "/ask-data"]}>
        <AnalysisPage mode={mode} />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("AnalysisPage controlled clarification", () => {
  beforeEach(() => {
    serviceMocks.streamAgentMessage.mockReset();
    serviceMocks.respondToAgentInteraction.mockReset();
    useUiStore.getState().resetUiState();
  });

  it("asks in the orchestration turn instead of calling it an empty result", async () => {
    restoreSuspendedTurn("agent");
    renderAnalysis("agent");

    const card = await screen.findByRole("region", { name: "需要你确认" });
    expect(within(card).getByText("请选择本次要编写的项目交付报告类型：")).toBeInTheDocument();
    expect(screen.queryByText("本次编排未返回可展示的最终结果")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("选择上面的选项，或直接说明你的情况…")).toBeInTheDocument();
  });

  it("resumes the same turn through the interaction endpoint when an option is picked", async () => {
    const user = userEvent.setup();
    let streamHandlers: DataHubAskDataStreamHandlers | undefined;
    serviceMocks.respondToAgentInteraction.mockImplementation((
      _input: unknown,
      handlers: DataHubAskDataStreamHandlers
    ) => {
      streamHandlers = handlers;
      return new AbortController();
    });

    restoreSuspendedTurn("agent");
    renderAnalysis("agent");

    const card = await screen.findByRole("region", { name: "需要你确认" });
    await user.click(within(card).getByRole("button", { name: "信息化系统交付" }));

    expect(serviceMocks.respondToAgentInteraction).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        chatId: "chat-1",
        chatMode: "agent",
        interactionId: "tool-call-1",
        answer: "信息化系统交付"
      },
      expect.any(Object)
    );
    // 选择是过程事件，不是第二条用户消息：不能再起一次提问
    expect(serviceMocks.streamAgentMessage).not.toHaveBeenCalled();
    expect(useUiStore.getState().analysisTurns).toHaveLength(1);
    expect(useUiStore.getState().analysisTurns[0].status).toBe("streaming");

    streamHandlers?.onEvent({
      type: "clarification_response",
      data: { interactionId: "tool-call-1", answer: "信息化系统交付" }
    });
    streamHandlers?.onDone?.();

    await waitFor(() => {
      expect(screen.getByText("已选择")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "咨询服务交付" })).not.toBeInTheDocument();
    expect(useUiStore.getState().analysisTurns).toHaveLength(1);
  });

  it("beta0.3 起问数也受理澄清，续跑按 ask 模式提交", async () => {
    const user = userEvent.setup();
    serviceMocks.respondToAgentInteraction.mockImplementation(() => new AbortController());
    restoreSuspendedTurn("ask");
    renderAnalysis("ask");

    const card = await screen.findByRole("region", { name: "需要你确认" });
    await user.click(within(card).getByRole("button", { name: "信息化系统交付" }));

    expect(serviceMocks.respondToAgentInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        chatId: "chat-1",
        chatMode: "ask",
        interactionId: "tool-call-1",
        answer: "信息化系统交付"
      }),
      expect.any(Object)
    );
    expect(serviceMocks.streamAgentMessage).not.toHaveBeenCalled();
  });
});
