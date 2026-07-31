import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { projectDataHubExecutionEvents } from "@/services/dataHubExecutionProjector";
import type { DataHubStreamEvent } from "@/types/dataHub";
import { DataHubSubagentDag } from "./DataHubSubagentDag";

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
    type: "agent_start",
    content: { label: "SQL 分析智能体" },
    sessionId: "child-session",
    parentSessionId: "main-session",
    globalSessionId: "global-1",
    chatId: "chat-1",
    agentName: "SQL 分析智能体",
    timestamp: 2
  },
  {
    type: "thinking",
    content: "正在理解数据模型。",
    sessionId: "child-session",
    parentSessionId: "main-session",
    agentName: "SQL 分析智能体",
    replyId: "reply-child",
    modelCallIndex: 1,
    timestamp: 3
  },
  {
    type: "agent_start",
    content: { label: "制度研究员" },
    sessionId: "policy-session",
    parentSessionId: "main-session",
    globalSessionId: "global-1",
    chatId: "chat-1",
    agentName: "制度研究员",
    timestamp: 4
  },
  {
    type: "done",
    content: { summary: "制度核对完成" },
    sessionId: "policy-session",
    parentSessionId: "main-session",
    agentName: "制度研究员",
    finished: true,
    timestamp: 5
  }
];

function renderDag(onSelect = vi.fn()) {
  const projection = projectDataHubExecutionEvents(events, {
    mainSessionId: "main-session",
    fallbackAgentName: "智能编排器"
  });
  render(
    <DataHubSubagentDag
      mainSession={projection.mainSession}
      nodes={projection.subagentSessions.map((session) => ({
        session,
        level: 0,
        children: []
      }))}
      onSelect={onSelect}
    />
  );
  return onSelect;
}

describe("DataHubSubagentDag", () => {
  it("renders the root node and one node per subagent", () => {
    renderDag();

    expect(screen.getByText("智能编排器")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 SQL 分析智能体执行详情" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 制度研究员执行详情" })
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".xs-datahub-subagent-dag__edge")).toHaveLength(2);
  });

  it("maps subagent status onto edge and node state", () => {
    renderDag();

    expect(
      document.querySelector(".xs-datahub-subagent-dag__edge--running")
    ).not.toBeNull();
    expect(
      document.querySelector(".xs-datahub-subagent-dag__edge--done")
    ).not.toBeNull();
    const runningNode = screen.getByRole("button", {
      name: "打开 SQL 分析智能体执行详情"
    });
    expect(runningNode).toHaveAttribute("data-status", "running");
    expect(runningNode).toHaveAttribute("data-tone");
  });

  it("invokes onSelect with the session id when a node is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = renderDag();

    await user.click(
      screen.getByRole("button", { name: "打开 制度研究员执行详情" })
    );

    expect(onSelect).toHaveBeenCalledWith("policy-session", expect.anything());
  });

  it("shows a waiting ghost node while running without subagents", () => {
    const projection = projectDataHubExecutionEvents(
      [
        {
          type: "agent_start",
          content: { label: "智能编排器" },
          agentName: "智能编排器",
          sessionId: "main-session",
          chatId: "chat-1",
          timestamp: 1
        }
      ],
      { mainSessionId: "main-session", fallbackAgentName: "智能编排器" }
    );
    render(
      <DataHubSubagentDag
        mainSession={projection.mainSession}
        nodes={[]}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("status", { name: /编排智能体思考中/ })
    ).toBeInTheDocument();
    expect(screen.getByText("正在规划执行步骤")).toBeInTheDocument();
    expect(screen.getByText("智能编排器")).toBeInTheDocument();
    expect(
      document.querySelector(".xs-datahub-subagent-dag__canvas--ghost")
    ).not.toBeNull();
    expect(
      document.querySelector(".xs-datahub-subagent-dag__orbit")
    ).toBeNull();
  });

  it("shows the ghost canvas during the idle window before the first event", () => {
    const projection = projectDataHubExecutionEvents([], {
      mainSessionId: "main-session",
      fallbackAgentName: "智能编排器"
    });
    render(
      <DataHubSubagentDag
        mainSession={projection.mainSession}
        nodes={[]}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole("status", { name: /编排智能体思考中/ })
    ).toBeInTheDocument();
  });

  it("renders nothing when idle without subagents", () => {
    const { container } = render(
      <DataHubSubagentDag
        mainSession={{
          status: "done",
          finished: true,
          cards: [],
          orchestration: {
            routingEvents: [],
            reactSteps: [],
            toolCalls: [],
            toolResults: []
          },
          events: [],
          dataSources: [],
          tableResults: [],
          citationDocuments: [],
          documentResults: []
        }}
        nodes={[]}
        onSelect={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
