import { describe, expect, it } from "vitest";
import { projectDataHubExecutionEvents } from "./dataHubExecutionProjector";
import {
  getDataHubAskTableResults,
  getDataHubChildAnswerBlocks,
  getDataHubQueryAssetTargets
} from "./dataHubQueryAssetTargetService";

describe("dataHubQueryAssetTargetService", () => {
  it("merges a single ask child with the authoritative root artifact", () => {
    const rootSessionId = "root-consultation-session";
    const childSessionId = "child-consultation-session";
    const chatId = "chat-consultation";
    const artifact = {
      askRunId: "ask-run-consultation",
      resolvedQuestion: "咨询数前十的社区分布",
      canFavorite: true
    };
    const projection = projectDataHubExecutionEvents(
      [
        {
          type: "agent_start",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId
        },
        {
          type: "subagent_exposed",
          agentName: "问数智能体",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {
            agentId: "ask-data",
            sessionId: childSessionId,
            subagentId: "subagent-consultation",
            label: "问数智能体"
          }
        },
        {
          type: "table",
          agentName: "问数智能体",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {
            columns: ["社区", "咨询数"],
            rows: [["六角井社区", 456]],
            totalRows: 1
          }
        },
        {
          type: "done",
          agentName: "问数智能体",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: { mode: "ask" }
        },
        {
          type: "ask_artifact",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId,
          content: artifact
        },
        {
          type: "done",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId,
          content: { mode: "agent", adaptiveTeam: true },
          finished: true
        }
      ],
      {
        mainSessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId
      }
    );

    expect(
      getDataHubQueryAssetTargets(projection, "统计咨询对象排名")
    ).toEqual([
      expect.objectContaining({
        key: `ask:${artifact.askRunId}`,
        label: artifact.resolvedQuestion,
        rootSessionId,
        sessionId: childSessionId,
        chatId,
        artifact,
        tableCount: 1
      })
    ]);
  });

  it("keeps legacy ask history recoverable when it only persisted text and done", () => {
    const rootSessionId = "legacy-ask-session";
    const chatId = "legacy-ask-chat";
    const projection = projectDataHubExecutionEvents(
      [
        {
          type: "text",
          data: [
            "历史合同数量如下：",
            "",
            "| 年份 | 合同数 |",
            "| --- | ---: |",
            "| 2023 | 24 |"
          ].join("\n"),
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId
        },
        {
          type: "done",
          data: { summary: "查询完成" },
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId,
          finished: true
        }
      ],
      {
        mainSessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId,
        terminalStatus: "done"
      }
    );

    expect(
      getDataHubQueryAssetTargets(
        projection,
        "2023 年有多少合同",
        { mainSessionIsAskData: true }
      )
    ).toEqual([
      expect.objectContaining({
        key: `session:${rootSessionId}`,
        rootSessionId,
        sessionId: rootSessionId,
        chatId,
        canBackfill: true,
        tableCount: 0
      })
    ]);
  });

  it("lifts query-child tables even when the child is labeled with the sub-question", () => {
    const rootSessionId = "root-contract-session";
    const childSessionId = "child-device-list";
    const chatId = "chat-contract";
    const projection = projectDataHubExecutionEvents(
      [
        {
          type: "agent_start",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId
        },
        {
          type: "subagent_exposed",
          agentName: "查询合同设备清单",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {
            sessionId: childSessionId,
            subagentId: "subagent-device-list",
            label: "查询合同设备清单"
          }
        },
        {
          type: "table",
          agentName: "查询合同设备清单",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {
            columns: ["设备名称", "数量"],
            rows: [["远程控制终端", 6]],
            totalRows: 1
          }
        },
        {
          type: "done",
          agentName: "查询合同设备清单",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {}
        },
        {
          type: "done",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId,
          content: { mode: "agent", adaptiveTeam: true },
          finished: true
        }
      ],
      {
        mainSessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId
      }
    );

    expect(getDataHubAskTableResults(projection)).toEqual([
      expect.objectContaining({
        tableIndex: 0,
        totalRows: 1,
        rows: [expect.objectContaining({ 设备名称: "远程控制终端", 数量: 6 })]
      })
    ]);
    expect(getDataHubChildAnswerBlocks(projection)).toEqual([]);
  });

  it("lifts completed child answers when the child has no structured table", () => {
    const rootSessionId = "root-policy-session";
    const childSessionId = "child-policy";
    const chatId = "chat-policy";
    const projection = projectDataHubExecutionEvents(
      [
        {
          type: "agent_start",
          agentName: "编排智能体",
          sessionId: rootSessionId,
          globalSessionId: rootSessionId,
          chatId
        },
        {
          type: "subagent_exposed",
          agentName: "制度研究员",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {
            sessionId: childSessionId,
            label: "制度研究员"
          }
        },
        {
          type: "text",
          agentName: "制度研究员",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: "根据合同约定，设备清单以附件为准，共计 12 项。"
        },
        {
          type: "done",
          agentName: "制度研究员",
          sessionId: childSessionId,
          globalSessionId: rootSessionId,
          parentSessionId: rootSessionId,
          chatId,
          content: {}
        }
      ],
      {
        mainSessionId: rootSessionId,
        globalSessionId: rootSessionId,
        chatId
      }
    );

    expect(getDataHubChildAnswerBlocks(projection)).toEqual([
      expect.objectContaining({
        content: "根据合同约定，设备清单以附件为准，共计 12 项。"
      })
    ]);
  });
});

describe("completed data child answers", () => {
  function childResult(summary?: string) {
    return projectDataHubExecutionEvents([
      { type: "agent_start", sessionId: "root" },
      { type: "subagent_exposed", sessionId: "child", parentSessionId: "root", content: { sessionId: "child", agentId: "ask-data" } },
      { type: "table", sessionId: "child", parentSessionId: "root", content: { columns: ["数量"], rows: [[12]] } },
      { type: "text", sessionId: "child", parentSessionId: "root", content: "共12份" },
      { type: "done", sessionId: "child", parentSessionId: "root", content: summary ? { summary } : {} }
    ], { mainSessionId: "root" });
  }

  it("retains short nonempty text alongside a returned table", () => {
    expect(getDataHubChildAnswerBlocks(childResult()).map((block) => block.content)).toEqual(["共12份"]);
  });

  it("prefers terminal summary over a streamed draft even when the child has a table", () => {
    expect(getDataHubChildAnswerBlocks(childResult("复核后共13份")).map((block) => block.content)).toEqual(["复核后共13份"]);
  });

  it.each(["error", "cancelled", "running"] as const)("does not lift %s child text or summary", (status) => {
    const projection = childResult("共13份");
    projection.subagentSessions[0].status = status;
    projection.subagentSessions[0].finished = status !== "running";
    expect(getDataHubChildAnswerBlocks(projection)).toEqual([]);
  });

  it("does not lift a failed done payload", () => {
    const projection = childResult("部分草稿");
    projection.subagentSessions[0].done = { failed: true, summary: "部分草稿" };
    expect(getDataHubChildAnswerBlocks(projection)).toEqual([]);
  });
});

it("strips child summary protocol markers and drops marker-only child answers", () => {
  const projection = projectDataHubExecutionEvents([
    { type: "subagent_exposed", sessionId: "child", parentSessionId: "root", content: { sessionId: "child" } },
    { type: "text", sessionId: "child", parentSessionId: "root", content: "</mm:think>" },
    { type: "done", sessionId: "child", parentSessionId: "root", content: { summary: "</mm:think>" } }
  ], { mainSessionId: "root" });
  expect(getDataHubChildAnswerBlocks(projection)).toEqual([]);
  projection.subagentSessions[0].done = { summary: "<mm:think>内部推理</mm:think>正式结果" };
  expect(getDataHubChildAnswerBlocks(projection)).toEqual([{ content: "正式结果" }]);
});

it("cleans fragmented child thinking before returning streamed blocks", () => {
  const projection = projectDataHubExecutionEvents([
    { type: "subagent_exposed", sessionId: "child", parentSessionId: "root", content: { sessionId: "child" } },
    ...["<mm:thi", "nk>内部推理</mm:", "think>合同共12份"].map((content) => ({ type: "text", sessionId: "child", parentSessionId: "root", replyId: "reply", content })),
    { type: "done", sessionId: "child", parentSessionId: "root", content: {} }
  ], { mainSessionId: "root" });
  expect(getDataHubChildAnswerBlocks(projection)).toEqual([expect.objectContaining({ content: "合同共12份", replyId: "reply" })]);
});

it("cleans separate child model-call envelopes without retaining the raw block", () => {
  const projection = projectDataHubExecutionEvents([
    { type: "subagent_exposed", sessionId: "child", parentSessionId: "root", content: { sessionId: "child" } },
    { type: "text", sessionId: "child", parentSessionId: "root", replyId: "first", content: "先查询。" },
    { type: "text", sessionId: "child", parentSessionId: "root", replyId: "second", content: "</mm:think>正式答案" },
    { type: "done", sessionId: "child", parentSessionId: "root", content: {} }
  ], { mainSessionId: "root" });
  expect(getDataHubChildAnswerBlocks(projection).map((block) => block.content).join("")).toBe("先查询。正式答案");
});
