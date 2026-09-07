import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { AnalysisPage } from "./AnalysisPage";

function renderPage(page: ReactElement) {
  return render(
    <AppProviders>
      <MemoryRouter>{page}</MemoryRouter>
    </AppProviders>
  );
}

const ROOT_CONCLUSION = "综合两位子智能体的结论：华东区域销售额领先，占比 38%。";
const CHILD_CONCLUSION = "华东区域销售额领先，本期占比 38%，主要来自上海与杭州。";

function appendChildConclusion(runId: string, rootSessionId: string, chatId?: string) {
  const store = useUiStore.getState();
  store.appendAskDataEvent(runId, {
    type: "subagent_exposed",
    agentName: "区域分析智能体",
    sessionId: "region-child",
    globalSessionId: rootSessionId,
    parentSessionId: rootSessionId,
    chatId,
    content: {
      agentId: "ask-data",
      sessionId: "region-child",
      subagentId: "region-subagent",
      label: "区域分析智能体"
    }
  });
  store.appendAskDataEvent(runId, {
    type: "text",
    agentName: "区域分析智能体",
    sessionId: "region-child",
    globalSessionId: rootSessionId,
    parentSessionId: rootSessionId,
    chatId,
    content: CHILD_CONCLUSION
  });
  store.appendAskDataEvent(runId, {
    type: "done",
    agentName: "区域分析智能体",
    sessionId: "region-child",
    globalSessionId: rootSessionId,
    parentSessionId: rootSessionId,
    chatId,
    content: {}
  });
}

function startAgentRun() {
  const store = useUiStore.getState();
  const runId = store.startAskDataRun("对比各区域业绩", null, "agent");
  const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId)!;
  return { runId, rootSessionId: turn.sessionId!, chatId: turn.chatId };
}

describe("analysis answer deduplication", () => {
  beforeEach(() => {
    useUiStore.getState().resetUiState();
  });

  it("shows the orchestration answer once instead of pairing it with the child conclusion", async () => {
    const { runId, rootSessionId, chatId } = startAgentRun();
    renderPage(<AnalysisPage mode="agent" />);

    act(() => {
      const store = useUiStore.getState();
      appendChildConclusion(runId, rootSessionId, chatId);
      store.appendAskDataEvent(runId, {
        type: "text",
        agentName: "编排智能体",
        sessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId,
        content: ROOT_CONCLUSION
      });
      store.appendAskDataEvent(runId, {
        type: "done",
        agentName: "编排智能体",
        sessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId,
        content: { mode: "agent", adaptiveTeam: true },
        finished: true
      });
      store.completeAskDataRun(runId);
    });

    const answer = await screen.findByLabelText("正式回答");
    expect(answer.textContent).toContain("华东区域销售额领先");
    expect(within(answer).getAllByText(/华东区域销售额领先/)).toHaveLength(1);
    expect(screen.queryByText(CHILD_CONCLUSION)).not.toBeInTheDocument();
  });

  it("falls back to the child conclusion when the orchestration root answered nothing", async () => {
    const { runId, rootSessionId, chatId } = startAgentRun();
    renderPage(<AnalysisPage mode="agent" />);

    act(() => {
      const store = useUiStore.getState();
      appendChildConclusion(runId, rootSessionId, chatId);
      store.appendAskDataEvent(runId, {
        type: "done",
        agentName: "编排智能体",
        sessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId,
        content: { mode: "agent", adaptiveTeam: true },
        finished: true
      });
      store.completeAskDataRun(runId);
    });

    const answer = await screen.findByLabelText("正式回答");
    expect(answer.textContent).toContain("华东区域销售额领先");
  });

  it("renders a resent root answer only once", async () => {
    const store = useUiStore.getState();
    const runId = store.startAskDataRun("本月收入是多少", null, "ask");
    renderPage(<AnalysisPage mode="ask" />);

    act(() => {
      const events = useUiStore.getState();
      events.appendAskDataEvent(runId, {
        type: "text",
        content: "本月收入为 128 万元，同比增长 12%。",
        replyId: "reply-1",
        modelCallIndex: 1
      });
      events.appendAskDataEvent(runId, {
        type: "text",
        content: "本月收入为 128 万元，同比增长 12%。",
        replyId: "reply-2",
        modelCallIndex: 2
      });
      events.completeAskDataRun(runId);
    });

    const answer = await screen.findByLabelText("正式回答");
    expect(within(answer).getAllByText(/本月收入为 128 万元/)).toHaveLength(1);
  });
});
