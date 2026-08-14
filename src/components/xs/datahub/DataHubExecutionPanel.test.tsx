import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { projectDataHubExecutionEvents } from "@/services/dataHubExecutionProjector";
import type { DataHubStreamEvent } from "@/types/dataHub";
import { formatExecutionTime } from "./display";
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
    type: "agent_start",
    content: { label: "制度研究员" },
    sessionId: "policy-session",
    parentSessionId: "main-session",
    globalSessionId: "global-1",
    chatId: "chat-1",
    agentName: "制度研究员",
    timestamp: 10
  },
  {
    type: "thinking",
    content: "正在核对相关管理制度。",
    sessionId: "policy-session",
    parentSessionId: "main-session",
    agentName: "制度研究员",
    replyId: "reply-policy",
    modelCallIndex: 1,
    timestamp: 11
  },
  {
    type: "done",
    content: { summary: "制度核对完成" },
    sessionId: "policy-session",
    parentSessionId: "main-session",
    agentName: "制度研究员",
    finished: true,
    timestamp: 12
  },
  {
    type: "done",
    content: { summary: "编排完成", totalDurationMs: 1200 },
    sessionId: "main-session",
    agentName: "智能编排器",
    finished: true,
    timestamp: 13
  }
];

describe("DataHubExecutionPanel", () => {
  it("shows subagents inline and opens the selected subagent details", async () => {
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
    expect(screen.getByText("调度问数智能体")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "智能体执行卡" })).not.toBeInTheDocument();
    const sqlAgent = screen.getByRole("button", {
      name: "打开 SQL 分析智能体执行详情"
    });
    const policyAgent = screen.getByRole("button", {
      name: "打开 制度研究员执行详情"
    });
    expect(sqlAgent).toBeInTheDocument();
    expect(policyAgent).toBeInTheDocument();
    const sqlAvatar = within(sqlAgent).getByRole("img", {
      name: "SQL 分析智能体头像，数据分析"
    });
    const policyAvatar = within(policyAgent).getByRole("img", {
      name: "制度研究员头像，制度知识"
    });
    expect(sqlAvatar).toHaveClass("xs-datahub-agent-avatar--data");
    expect(policyAvatar).toHaveClass("xs-datahub-agent-avatar--policy");
    expect(sqlAvatar).toHaveAttribute("data-avatar-persona");
    expect(sqlAvatar).toHaveAttribute("data-avatar-tone");
    expect(policyAvatar).toHaveAttribute("data-avatar-persona");
    expect(policyAvatar).toHaveAttribute("data-avatar-tone");
    expect(
      `${sqlAvatar.dataset.avatarPersona}:${sqlAvatar.dataset.avatarTone}`
    ).not.toBe(
      `${policyAvatar.dataset.avatarPersona}:${policyAvatar.dataset.avatarTone}`
    );
    expect(sqlAvatar.querySelector(".xs-datahub-agent-avatar__role svg")).not.toBeNull();
    expect(policyAvatar.querySelector(".xs-datahub-agent-avatar__role svg")).not.toBeNull();

    await user.click(sqlAgent);
    expect(screen.getByRole("dialog", { name: "子智能体执行详情" })).toBeInTheDocument();
    const repeatedSqlAvatars = screen.getAllByRole("img", {
      name: "SQL 分析智能体头像，数据分析"
    });
    expect(repeatedSqlAvatars).toHaveLength(2);
    expect(
      screen.getByRole("navigation", { name: "子智能体列表" })
    ).toBeVisible();
    expect(
      new Set(
        repeatedSqlAvatars.map(
          (avatar) =>
            `${avatar.dataset.avatarPersona}:${avatar.dataset.avatarTone}`
        )
      )
    ).toEqual(
      new Set([
        `${sqlAvatar.dataset.avatarPersona}:${sqlAvatar.dataset.avatarTone}`
      ])
    );
    expect(screen.queryByText("第 1 次模型调用")).not.toBeInTheDocument();
    expect(screen.getByText("学生指标口径")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开原文：学生指标口径" }));
    expect(onCitationOpen).toHaveBeenCalledTimes(1);
  });

  it("summarizes repeated model activity updates in the right detail drawer", async () => {
    const user = userEvent.setup();
    const activityEvents: DataHubStreamEvent[] = [
      {
        type: "agent_start",
        agentName: "编排智能体",
        sessionId: "activity-main",
        chatId: "activity-chat",
        timestamp: "2026-07-31T16:00:31.000+08:00"
      },
      {
        type: "subagent_exposed",
        agentName: "问数智能体",
        sessionId: "activity-child",
        globalSessionId: "activity-main",
        parentSessionId: "activity-main",
        chatId: "activity-chat",
        content: {
          agentId: "ask-data",
          sessionId: "activity-child",
          subagentId: "activity-subagent",
          label: "问数智能体"
        },
        timestamp: "2026-07-31T16:00:32.000+08:00"
      },
      {
        type: "thinking",
        agentName: "问数智能体",
        sessionId: "activity-child",
        globalSessionId: "activity-main",
        parentSessionId: "activity-main",
        chatId: "activity-chat",
        replyId: "activity-reply",
        modelCallIndex: 1,
        content: {
          activityId: "activity-model-1",
          kind: "model",
          action: "model_analysis",
          label: "理解数据问题",
          status: "running",
          summary: null,
          startedAt: "2026-07-31T16:00:32.283+08:00",
          completedAt: null,
          durationMs: null
        },
        timestamp: "2026-07-31T16:00:32.283+08:00"
      },
      {
        type: "thinking",
        agentName: "问数智能体",
        sessionId: "activity-child",
        globalSessionId: "activity-main",
        parentSessionId: "activity-main",
        chatId: "activity-chat",
        replyId: "activity-reply",
        modelCallIndex: 1,
        content: {
          activityId: "activity-model-1",
          kind: "model",
          action: "model_analysis",
          label: "理解数据问题",
          status: "success",
          summary: "问题分析完成",
          startedAt: "2026-07-31T16:00:32.283+08:00",
          completedAt: "2026-07-31T16:00:35.733+08:00",
          durationMs: 3450
        },
        timestamp: "2026-07-31T16:00:35.733+08:00"
      },
      {
        type: "thinking",
        agentName: "问数智能体",
        sessionId: "activity-child",
        globalSessionId: "activity-main",
        parentSessionId: "activity-main",
        chatId: "activity-chat",
        replyId: "activity-reply-2",
        modelCallIndex: 2,
        content: {
          activityId: "activity-model-2",
          kind: "model",
          action: "model_plan",
          label: "生成查询方案",
          status: "running",
          summary: null,
          startedAt: "2026-07-31T16:00:35.800+08:00",
          completedAt: null,
          durationMs: null
        },
        timestamp: "2026-07-31T16:00:35.800+08:00"
      },
      {
        type: "thinking",
        agentName: "问数智能体",
        sessionId: "activity-child",
        globalSessionId: "activity-main",
        parentSessionId: "activity-main",
        chatId: "activity-chat",
        replyId: "activity-reply-2",
        modelCallIndex: 2,
        content: {
          activityId: "activity-model-2",
          kind: "model",
          action: "model_plan",
          label: "生成查询方案",
          status: "success",
          summary: "查询方案已生成",
          startedAt: "2026-07-31T16:00:35.800+08:00",
          completedAt: "2026-07-31T16:00:38.000+08:00",
          durationMs: 2200
        },
        timestamp: "2026-07-31T16:00:38.000+08:00"
      },
      {
        type: "done",
        agentName: "问数智能体",
        sessionId: "activity-child",
        globalSessionId: "activity-main",
        parentSessionId: "activity-main",
        chatId: "activity-chat",
        content: { mode: "ask" },
        timestamp: "2026-07-31T16:00:36.000+08:00"
      },
      {
        type: "done",
        agentName: "编排智能体",
        sessionId: "activity-main",
        globalSessionId: "activity-main",
        chatId: "activity-chat",
        content: { mode: "agent" },
        finished: true,
        timestamp: "2026-07-31T16:00:36.100+08:00"
      }
    ];
    const projection = projectDataHubExecutionEvents(activityEvents, {
      mainSessionId: "activity-main",
      fallbackAgentName: "编排智能体"
    });

    render(<DataHubExecutionPanel projection={projection} />);
    await user.click(
      screen.getByRole("button", { name: "打开 问数智能体执行详情" })
    );

    const drawer = screen.getByRole("dialog", { name: "子智能体执行详情" });
    expect(
      within(drawer).getByRole("button", { name: "返回列表" })
    ).toBeVisible();
    const timeline = within(drawer).getByRole("list", {
      name: "问数智能体执行时间轴"
    });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);

    const activity = screen.getByRole("region", {
      name: "模型活动：理解数据问题"
    });
    expect(within(activity).getByText("问题分析完成")).not.toBeVisible();
    expect(within(activity).getByText(/已完成\s*·\s*3\.5s/)).toBeVisible();
    await user.click(
      within(activity).getByText("理解数据问题", {
        selector: ":scope > summary > strong"
      })
    );
    expect(within(activity).getByText("问题分析完成")).toBeVisible();

    const technicalDetails = within(activity).getByRole("group", {
      name: "技术详情"
    });
    expect(technicalDetails).toBeVisible();
    expect(within(activity).getByText("技术详情")).toBeVisible();
    expect(within(technicalDetails).getByText("模型推理")).toBeVisible();
    expect(within(technicalDetails).getByText("理解数据问题")).toBeVisible();
    expect(within(technicalDetails).getByText("已完成")).toBeVisible();
    expect(within(technicalDetails).getByText(formatExecutionTime("2026-07-31T16:00:32.283+08:00"))).toBeVisible();
    expect(within(technicalDetails).getByText(formatExecutionTime("2026-07-31T16:00:35.733+08:00"))).toBeVisible();
    expect(within(technicalDetails).getByText("3.5s")).toBeVisible();
    expect(within(activity).queryByText(/activity-model-1/)).not.toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "返回列表" }));
    expect(
      within(drawer).getByRole("navigation", { name: "子智能体列表" })
    ).toBeVisible();
    expect(
      within(drawer).queryByRole("list", { name: "问数智能体执行时间轴" })
    ).not.toBeInTheDocument();
  });

  it("renders a flat root document agent as execution stages instead of an empty orchestration summary", async () => {
    const user = userEvent.setup();
    const onCitationOpen = vi.fn();
    const documentEvents: DataHubStreamEvent[] = [
      {
        type: "agent_start",
        agentName: "找文档智能体",
        sessionId: "document-main",
        chatId: "document-chat",
        timestamp: "2026-08-04T12:18:46.000+08:00"
      },
      ...[
        ["understand", "理解文档需求", 1_000],
        ["locate", "定位相关文档", 33_000],
        ["verify", "确认相关文档", 5_000],
        ["result", "确认文档结果", 2_000]
      ].map(([activityId, label, durationMs], index) => ({
        type: "activity" as const,
        agentName: "找文档智能体",
        sessionId: "document-main",
        chatId: "document-chat",
        timestamp: `2026-08-04T12:18:${47 + index}.000+08:00`,
        content: {
          activityId,
          kind: "model",
          label,
          status: "success",
          durationMs,
          summary: `${label}已完成`
        }
      })),
      {
        type: "document_url",
        agentName: "找文档智能体",
        sessionId: "document-main",
        chatId: "document-chat",
        timestamp: "2026-08-04T12:19:27.000+08:00",
        content: {
          docId: "doc-meishan-contract",
          docKey: "meishan-contract.pdf",
          kbId: "kb-contract",
          docName: "眉山采购合同.pdf",
          sourceAvailable: true
        }
      },
      {
        type: "done",
        agentName: "找文档智能体",
        sessionId: "document-main",
        chatId: "document-chat",
        timestamp: "2026-08-04T12:19:28.000+08:00",
        content: {
          mode: "agent",
          summary: "已定位到 1 份相关文档。"
        },
        finished: true
      }
    ];
    const projection = projectDataHubExecutionEvents(documentEvents, {
      mainSessionId: "document-main",
      fallbackAgentName: "智能编排器"
    });

    render(
      <DataHubExecutionPanel
        projection={projection}
        onCitationOpen={onCitationOpen}
      />
    );

    expect(
      screen.getByRole("list", { name: "找文档智能体执行时间轴" })
    ).toBeVisible();
    const understandActivity = screen.getByRole("region", {
      name: "模型活动：理解文档需求"
    });
    expect(
      within(understandActivity).getByText("理解文档需求", {
        selector: ":scope > summary > strong"
      })
    ).toBeVisible();
    expect(understandActivity).not.toHaveAttribute("open");
    const locateActivity = screen.getByRole("region", {
      name: "模型活动：定位相关文档"
    });
    expect(
      within(locateActivity).getByText("定位相关文档", {
        selector: ":scope > summary > strong"
      })
    ).toBeVisible();
    expect(
      screen.queryByText("本次响应未返回独立的路由或任务拆解事件。")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "打开原文：眉山采购合同.pdf" })
    );
    expect(onCitationOpen).toHaveBeenCalledWith(
      expect.objectContaining({ docKey: "meishan-contract.pdf" }),
      expect.objectContaining({ type: "document_url" })
    );
  });
});
