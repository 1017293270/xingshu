import { describe, expect, it } from "vitest";
import type { DataHubExecutionBlock } from "@/types/dataHub";
import { groupDataHubModelActivities } from "./DataHubModelActivity";

function block(
  type: string,
  content: Record<string, unknown>,
  modelCall?: { replyId: string; modelCallIndex: number }
): DataHubExecutionBlock {
  return {
    type,
    sourceType: type,
    content,
    isThinking: type === "thinking",
    ...modelCall
  };
}

function textBlock(
  content: string,
  modelCall?: { replyId: string; modelCallIndex: number }
): DataHubExecutionBlock {
  return {
    type: "text",
    sourceType: "text",
    content,
    isThinking: false,
    ...modelCall
  };
}

describe("groupDataHubModelActivities", () => {
  it("groups model and tool lifecycles in place without collapsing warning or cancelled", () => {
    const items = groupDataHubModelActivities([
      block("activity", {
        activityId: "model:reply-1",
        kind: "model",
        action: "model_analysis",
        label: "理解数据问题",
        status: "running",
        startedAt: "2026-07-31T16:00:32.283+08:00"
      }),
      block("activity", {
        activityId: "tool:confirm-1",
        kind: "tool",
        action: "confirm_answer",
        label: "核对回答",
        status: "warning",
        summary: "回答校验未通过，正在修正",
        startedAt: "2026-07-31T16:00:33.000+08:00"
      }),
      block("activity", {
        activityId: "tool:query-1",
        kind: "tool",
        action: "execute_query",
        label: "执行数据查询",
        status: "cancelled",
        summary: "步骤未完成",
        startedAt: "2026-07-31T16:00:34.000+08:00"
      }),
      block("activity", {
        activityId: "model:reply-1",
        kind: "model",
        action: "model_analysis",
        label: "理解数据问题",
        status: "success",
        summary: "问题分析完成",
        startedAt: "2026-07-31T16:00:32.283+08:00",
        completedAt: "2026-07-31T16:00:35.733+08:00",
        durationMs: 3450
      })
    ]);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.kind)).toEqual([
      "model-activity",
      "model-activity",
      "model-activity"
    ]);
    expect(
      items.map((item) =>
        item.kind === "model-activity"
          ? [item.activity.id, item.activity.status, item.activity.blocks.length]
          : []
      )
    ).toEqual([
      ["model:reply-1", "success", 2],
      ["tool:confirm-1", "warning", 1],
      ["tool:query-1", "cancelled", 1]
    ]);
  });

  it("still recognizes structured activities replayed through legacy thinking blocks", () => {
    const items = groupDataHubModelActivities([
      block("thinking", {
        activityId: "model:history-reply",
        kind: "model",
        action: "model_analysis",
        label: "理解历史问题",
        status: "success",
        startedAt: "2026-07-30T10:00:00+08:00"
      })
    ]);

    expect(items[0]).toMatchObject({
      kind: "model-activity",
      activity: {
        id: "model:history-reply",
        status: "success"
      }
    });
  });

  it("folds same-model-call narrative into the activity and leaves the closing answer standalone", () => {
    const modelCall = { replyId: "reply-1", modelCallIndex: 1 };
    const items = groupDataHubModelActivities([
      block(
        "activity",
        {
          activityId: "model:reply-1",
          kind: "model",
          label: "规划查询",
          status: "success",
          summary: "查询方案已生成"
        },
        modelCall
      ),
      textBlock("先按区域拆分，再对齐目标值。", modelCall),
      block("activity", {
        activityId: "tool:execute",
        kind: "tool",
        label: "执行数据查询",
        status: "success"
      }),
      textBlock("本月总销售额 1242.2 万元。", {
        replyId: "reply-2",
        modelCallIndex: 2
      })
    ]);

    expect(items.map((item) => item.kind)).toEqual([
      "model-activity",
      "model-activity",
      "block"
    ]);
    expect(
      items[0].kind === "model-activity"
        ? items[0].activity.narrative.map((entry) => entry.content)
        : []
    ).toEqual(["先按区域拆分，再对齐目标值。"]);
  });

  it("keeps a trailing narrative block standalone even when it shares the model call", () => {
    const modelCall = { replyId: "reply-1", modelCallIndex: 1 };
    const items = groupDataHubModelActivities([
      block(
        "activity",
        {
          activityId: "model:reply-1",
          kind: "model",
          label: "组织回答",
          status: "success"
        },
        modelCall
      ),
      textBlock("结论：西南区完成率最低。", modelCall)
    ]);

    expect(items.map((item) => item.kind)).toEqual(["model-activity", "block"]);
    expect(
      items[0].kind === "model-activity" ? items[0].activity.narrative : []
    ).toEqual([]);
  });
});
