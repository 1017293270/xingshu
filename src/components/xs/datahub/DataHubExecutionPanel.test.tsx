import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { projectDataHubExecutionEvents } from "@/services/dataHubExecutionProjector";
import type { DataHubStreamEvent } from "@/types/dataHub";
import { DataHubExecutionPanel } from "./DataHubExecutionPanel";

const events: DataHubStreamEvent[] = [
  {
    type: "agent_start",
    content: { label: "智能编排器" },
    agentName: "智能编排器",
    sessionId: "main-session",
    chatId: "chat-1",
    timestamp: 1
  },
  {
    type: "routing_intent",
    content: { intent: "ASK_DATA" },
    sessionId: "main-session",
    agentName: "智能编排器",
    timestamp: 2
  },
  {
    type: "routing_decompose",
    content: {
      executionMode: "COMPLEX",
      subQuestions: ["确认统计口径", "查询学生总数"]
    },
    sessionId: "main-session",
    agentName: "智能编排器",
    timestamp: 3
  },
  {
    type: "thinking",
    content: "正在选择最合适的执行路径。",
    sessionId: "main-session",
    agentName: "智能编排器",
    replyId: "reply-main",
    modelCallIndex: 1,
    timestamp: 4
  },
  {
    type: "react_step",
    content: { round: 1, action: "调度问数智能体", status: "success" },
    sessionId: "main-session",
    agentName: "智能编排器",
    timestamp: 5
  },
  {
    type: "agent_start",
    content: { label: "SQL 分析智能体" },
    sessionId: "child-session",
    parentSessionId: "main-session",
    globalSessionId: "global-1",
    chatId: "chat-1",
    agentName: "SQL 分析智能体",
    timestamp: 6
  },
  {
    type: "thinking",
    content: "正在理解数据模型。",
    sessionId: "child-session",
    parentSessionId: "main-session",
    agentName: "SQL 分析智能体",
    replyId: "reply-child",
    modelCallIndex: 1,
    timestamp: 7
  },
  {
    type: "citation_document",
    content: {
      docId: "doc-1",
      docKey: "student-dictionary",
      kbId: "kb-1",
      docName: "学生指标口径",
      sourceAvailable: true,
      fragments: ["**学生总数**按有效学籍统计。"]
    },
    sessionId: "child-session",
    parentSessionId: "main-session",
    agentName: "SQL 分析智能体",
    replyId: "reply-child",
    modelCallIndex: 1,
    timestamp: 8
  },
  {
    type: "done",
    content: { summary: "子任务完成" },
    sessionId: "child-session",
    parentSessionId: "main-session",
    agentName: "SQL 分析智能体",
    finished: true,
    timestamp: 9
  },
  {
    type: "done",
    content: { summary: "编排完成", totalDurationMs: 1200 },
    sessionId: "main-session",
    agentName: "智能编排器",
    finished: true,
    timestamp: 10
  }
];

describe("DataHubExecutionPanel", () => {
  it("renders the shared projection and exposes nested subagent details", async () => {
    const user = userEvent.setup();
    const onCitationOpen = vi.fn();
    const projection = projectDataHubExecutionEvents(events, {
      mainSessionId: "main-session",
      fallbackAgentName: "智能编排器"
    });

    render(
      <DataHubExecutionPanel
        projection={projection}
        onCitationOpen={onCitationOpen}
      />
    );

    expect(screen.getAllByText("ASK_DATA")).toHaveLength(2);
    expect(screen.getByText("确认统计口径")).toBeInTheDocument();
    expect(screen.getByText("第 1 次模型调用")).toBeInTheDocument();
    expect(screen.getByText("调度问数智能体")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /子智能体/ }));
    expect(screen.getByRole("dialog", { name: "子智能体执行详情" })).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: /SQL 分析智能体/ }));
    expect(screen.getByText("学生指标口径")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开原文：学生指标口径" }));
    expect(onCitationOpen).toHaveBeenCalledTimes(1);
  });
});
