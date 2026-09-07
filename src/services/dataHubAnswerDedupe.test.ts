import { describe, expect, it } from "vitest";
import {
  dataHubAnswerCovers,
  dataHubRootAnsweredAfterChildren,
  dedupeDataHubAnswerBlocks,
  mergeRepeatedAnswerChunk,
  normalizeDataHubAnswerText
} from "./dataHubAnswerDedupe";
import type { DataHubStreamEvent } from "@/types/dataHub";

describe("normalizeDataHubAnswerText", () => {
  it("strips citation anchors, emphasis markers and folds whitespace", () => {
    expect(
      normalizeDataHubAnswerText("  **本月收入**为 128 万元[[1]]。\n\n  同比增长 12%。 ")
    ).toBe("本月收入为 128 万元. 同比增长 12%.");
  });

  it("unifies full-width and half-width punctuation", () => {
    expect(normalizeDataHubAnswerText("合同金额为 128 万元（含税）。")).toBe(
      normalizeDataHubAnswerText("合同金额为 128 万元(含税).")
    );
  });
});

describe("dataHubAnswerCovers", () => {
  it("matches a paragraph the answer already contains despite layout differences", () => {
    expect(
      dataHubAnswerCovers(
        "结论：华东区域销售额领先。\n\n其中上海贡献最高。",
        "**结论**：华东区域销售额领先。"
      )
    ).toBe(true);
  });

  it("keeps short lines out of the comparison", () => {
    expect(dataHubAnswerCovers("已完成本次统计任务。", "已完成")).toBe(false);
  });

  it("does not match text the answer never said", () => {
    expect(
      dataHubAnswerCovers("华东区域销售额领先。", "华北区域销售额同比下滑 8%。")
    ).toBe(false);
  });
});

describe("mergeRepeatedAnswerChunk", () => {
  it("keeps a single copy when the chunk restates the whole streamed block", () => {
    expect(
      mergeRepeatedAnswerChunk("本月收入为 128 万元。", "本月收入为 128 万元。")
    ).toBe("本月收入为 128 万元。");
  });

  it("replaces the streamed block when the chunk resends it with a tail", () => {
    expect(
      mergeRepeatedAnswerChunk(
        "本月收入为 128 万元。",
        "本月收入为 128 万元。同比增长 12%。"
      )
    ).toBe("本月收入为 128 万元。同比增长 12%。");
  });

  it("appends genuinely new increments", () => {
    expect(
      mergeRepeatedAnswerChunk("本月收入为 128 万元。", "同比增长 12%。")
    ).toBeUndefined();
  });

  it("leaves short increments alone", () => {
    expect(mergeRepeatedAnswerChunk("本月收入", "本月收入")).toBeUndefined();
  });
});

describe("dataHubRootAnsweredAfterChildren", () => {
  const childText: DataHubStreamEvent = {
    type: "text",
    parentSessionId: "root-session",
    sessionId: "child-session",
    content: "根据合同约定，设备清单以附件为准，共计 12 项。"
  };

  it("treats a root answer that follows the child conclusions as the synthesis", () => {
    expect(
      dataHubRootAnsweredAfterChildren([
        { type: "text", sessionId: "root-session", content: "我来帮您核对设备清单口径。" },
        childText,
        {
          type: "text",
          sessionId: "root-session",
          content: "设备清单以合同附件为准，共 12 项，已与制度口径核对一致。"
        }
      ])
    ).toBe(true);
  });

  it("does not count an opening line the root said before dispatching", () => {
    expect(
      dataHubRootAnsweredAfterChildren([
        { type: "text", sessionId: "root-session", content: "我来帮您核对设备清单口径。" },
        childText
      ])
    ).toBe(false);
  });

  it("reports no root answer when only the children spoke", () => {
    expect(dataHubRootAnsweredAfterChildren([childText])).toBe(false);
  });
});

describe("dedupeDataHubAnswerBlocks", () => {
  it("drops a full resend that arrives under a different replyId", () => {
    const blocks = [
      { content: "本月收入为 128 万元，同比增长 12%。", replyId: "reply-1", modelCallIndex: 1 },
      { content: "本月收入为 128 万元，同比增长 12%。", replyId: "reply-2", modelCallIndex: 2 }
    ];

    expect(dedupeDataHubAnswerBlocks(blocks)).toEqual([
      { content: "本月收入为 128 万元，同比增长 12%。", replyId: "reply-1", modelCallIndex: 1 }
    ]);
  });

  it("replaces streamed increments with the block that restates all of them", () => {
    const blocks = [
      { content: "本月收入为 128 万元，", replyId: "reply-1", modelCallIndex: 1 },
      { content: "同比增长 12%。", replyId: "reply-1", modelCallIndex: 2 },
      {
        content: "本月收入为 128 万元，同比增长 12%。\n\n增长主要来自华东区域。",
        replyId: "reply-2",
        modelCallIndex: 3
      }
    ];

    expect(dedupeDataHubAnswerBlocks(blocks)).toEqual([
      {
        content: "本月收入为 128 万元，同比增长 12%。\n\n增长主要来自华东区域。",
        replyId: "reply-2",
        modelCallIndex: 3
      }
    ]);
  });

  it("keeps the position of a block that is superseded mid-answer", () => {
    const blocks = [
      { content: "第一步：核对销售口径。", replyId: "reply-1" },
      { content: "第一步：核对销售口径。第二步：汇总区域数据。", replyId: "reply-2" },
      { content: "以上为完整执行说明，供复核使用。", replyId: "reply-3" }
    ];

    expect(dedupeDataHubAnswerBlocks(blocks)).toEqual([
      { content: "第一步：核对销售口径。第二步：汇总区域数据。", replyId: "reply-2" },
      { content: "以上为完整执行说明，供复核使用。", replyId: "reply-3" }
    ]);
  });

  it("preserves distinct model-call blocks and their identity", () => {
    const blocks = [
      { content: "华东区域销售额领先，占比 38%。", replyId: "reply-1", modelCallIndex: 1 },
      { content: "华北区域同比下滑 8%，需要关注。", replyId: "reply-2", modelCallIndex: 2 }
    ];

    expect(dedupeDataHubAnswerBlocks(blocks)).toBe(blocks);
  });

  it("leaves short blocks untouched", () => {
    const blocks = [{ content: "已完成" }, { content: "已完成" }];

    expect(dedupeDataHubAnswerBlocks(blocks)).toEqual([
      { content: "已完成" },
      { content: "已完成" }
    ]);
  });
});
