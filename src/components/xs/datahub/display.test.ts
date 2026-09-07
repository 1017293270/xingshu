import { describe, expect, it } from "vitest";
import type { DataHubExecutionSession } from "@/types/dataHub";
import { sessionActivitySummary } from "./display";

const completed: DataHubExecutionSession = {
  status: "done", finished: true, cards: [], events: [], dataSources: [], tableResults: [],
  citationDocuments: [], documentResults: [],
  orchestration: { routingEvents: [], reactSteps: [], toolCalls: [], toolResults: [] }
};

describe("sessionActivitySummary", () => {
  it("replaces mechanical completion with the actual knowledge source", () => {
    expect(sessionActivitySummary({ ...completed, done: { summary: "子任务已完成" },
      citationDocuments: [{ kbName: "采购合同" }, { kbName: "采购合同" }] })).toBe("已查询采购合同知识库");
    expect(sessionActivitySummary(completed)).toBe("已完成查询");
  });
  it("preserves a substantive completion summary", () => {
    expect(sessionActivitySummary({ ...completed, done: { summary: "已查到 3 份有效合同" } })).toBe("已查到 3 份有效合同");
  });
});
