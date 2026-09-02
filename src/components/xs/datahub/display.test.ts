import { describe, expect, it } from "vitest";
import { projectDataHubExecutionEvents } from "@/services/dataHubExecutionProjector";
import { latestExecutionActionLabel, orchestrationEventsForSession } from "./display";

describe("datahub execution display", () => {
  it("merges running and terminal ReAct updates by toolCallId and honors eventSequence", () => {
    const projection = projectDataHubExecutionEvents([
      {
        type: "routing_intent",
        content: { intent: "adaptive_team" },
        sessionId: "main",
        sequence: 3
      },
      {
        type: "react_step",
        content: {
          toolCallId: "tool-1",
          eventSequence: 1,
          action: "dispatch",
          status: "running"
        },
        sessionId: "main"
      },
      {
        type: "react_step",
        content: {
          toolCallId: "tool-1",
          eventSequence: 2,
          action: "dispatch",
          actionLabel: "分派并行任务",
          status: "success",
          resultSummary: "已启动 2 个任务"
        },
        sessionId: "main"
      }
    ]);

    const events = orchestrationEventsForSession(projection.mainSession);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "react_step",
      title: "执行任务步骤",
      summary: "分派并行任务",
      status: "done"
    });
    expect(events[1]).toMatchObject({
      type: "routing_intent",
      summary: "adaptive_team"
    });
  });

  describe("latestExecutionActionLabel", () => {
    it("returns nothing before any execution block arrives", () => {
      const projection = projectDataHubExecutionEvents(
        [{ type: "react_step", content: { action: "locate_datasource" }, sessionId: "main" }],
        { mainSessionId: "main" }
      );

      expect(latestExecutionActionLabel(projection.mainSession)).toBeUndefined();
    });

    it("takes the label of the newest model activity", () => {
      const projection = projectDataHubExecutionEvents(
        [
          { type: "thinking", content: "先看数据源", isThinking: true, sessionId: "main" },
          {
            type: "activity",
            content: {
              activityId: "tool:execute",
              kind: "tool",
              action: "execute_query",
              label: "执行数据查询",
              status: "running"
            },
            sessionId: "main"
          }
        ],
        { mainSessionId: "main" }
      );

      expect(latestExecutionActionLabel(projection.mainSession)).toBe("执行数据查询");
    });

    it("falls back to the block label for non-activity blocks", () => {
      const projection = projectDataHubExecutionEvents(
        [
          { type: "thinking", content: "整理证据", isThinking: true, sessionId: "main" },
          {
            type: "citation_document",
            content: { docId: "doc-1", docName: "报销制度" },
            sessionId: "main"
          }
        ],
        { mainSessionId: "main" }
      );

      expect(latestExecutionActionLabel(projection.mainSession)).toBe("引用文档");
    });

    it("skips blocks that have no Chinese action name", () => {
      const projection = projectDataHubExecutionEvents(
        [
          { type: "text", content: "已给出结论。", sessionId: "main" },
          { type: "activity", content: { activityId: "raw", kind: "model" }, sessionId: "main" }
        ],
        { mainSessionId: "main" }
      );

      // activity 记录缺 label/action，退回上一个可命名的块，而不是摆出事件类型
      expect(latestExecutionActionLabel(projection.mainSession)).toBe("正式回答");
    });
  });
});
