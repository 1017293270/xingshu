import { describe, expect, it } from "vitest";
import { projectDataHubExecutionEvents } from "./dataHubExecutionProjector";
import { getDataHubQueryAssetTargets } from "./dataHubQueryAssetTargetService";

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
});
