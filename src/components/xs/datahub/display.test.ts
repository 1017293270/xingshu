import { describe, expect, it } from "vitest";
import { projectDataHubExecutionEvents } from "@/services/dataHubExecutionProjector";
import { orchestrationEventsForSession } from "./display";

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
      title: "执行推理步骤",
      summary: "分派并行任务",
      status: "done"
    });
    expect(events[1]).toMatchObject({
      type: "routing_intent",
      summary: "adaptive_team"
    });
  });
});
