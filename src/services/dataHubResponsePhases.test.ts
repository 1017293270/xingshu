import { describe, expect, it } from "vitest";
import { getDataHubResponsePhases } from "./dataHubResponsePhases";
import type { DataHubStreamEvent } from "@/types/dataHub";

describe("response phases", () => {
  const thinking: DataHubStreamEvent = { type: "thinking", content: "确认合同统计口径", timestamp: 1000 };
  const query: DataHubStreamEvent = { type: "tool_call", timestamp: 4000 };
  it("does not count a clarification-only suspended reply as an executed query", () => {
    expect(getDataHubResponsePhases([
      { type: "text", content: "请先明确需要查询的事项来源。" },
      { type: "clarification", content: { interactionId: "source", question: "查询哪类事项？", options: [{ label: "整改清单", value: "整改清单" }], allowFreeText: true } },
      { type: "done", content: { suspended: true }, finished: true }
    ], "done")).toMatchObject({ showQuery: false, showResult: true });
  });
  it("keeps query details available for historical answers with citations but no tool events", () => {
    expect(getDataHubResponsePhases([
      { type: "text", content: "需要完成验收", timestamp: 4000 },
      { type: "citation_document", timestamp: 5000 }
    ], "done", 1000, 6000)).toMatchObject({
      showQuery: true, showResult: true, queryStatus: "done", queryDurationMs: undefined
    });
  });
  it("advances from thinking to query to a streaming answer with independent timing", () => {
    expect(getDataHubResponsePhases([thinking], "streaming", 1000)).toMatchObject({
      thinkingStatus: "running", showQuery: false, showResult: false
    });
    expect(getDataHubResponsePhases([thinking, query, { type: "table", timestamp: 5000 }], "streaming", 1000))
      .toMatchObject({ thinkingStatus: "done", thinkingDurationMs: 3000, showQuery: true, queryStatus: "running", showResult: false });
    expect(getDataHubResponsePhases([thinking, query, { type: "text", content: "共 12 份合同", timestamp: 9000 }], "streaming", 1000))
      .toMatchObject({ showResult: true, queryStatus: "done", queryDurationMs: 5000 });
  });
  it("keeps child answers and child completion in the query stage", () => {
    expect(getDataHubResponsePhases([query, { type: "text", parentSessionId: "root", content: "子结论" },
      { type: "done", parentSessionId: "root" }], "streaming", 1000)).toMatchObject({ showResult: false, queryStatus: "running" });
  });
  it("does not treat empty answer packets or thinking content as final output", () => {
    expect(getDataHubResponsePhases([query, { type: "content", content: " ", timestamp: 5000 },
      { type: "content", content: "再查一张表", isThinking: true }], "streaming", 1000).showResult).toBe(false);
  });
  it("preserves errors, stopped runs and timestamp-free history without inventing phase durations", () => {
    for (const status of ["done", "error", "cancelled"] as const) {
      expect(getDataHubResponsePhases([{ type: "table" }], status)).toMatchObject({
        showResult: true, queryStatus: status, queryDurationMs: undefined
      });
    }
  });
});

it("keeps final answer visible when result attachments arrive afterwards", () => {
  for (const type of ["table", "chart", "citation_document", "document_url"]) {
    expect(getDataHubResponsePhases([
      { type: "tool_call", timestamp: 1000 },
      { type: "text", content: "最终答案", timestamp: 2000 },
      { type, timestamp: 3000 }
    ], "streaming", 0)).toMatchObject({ showResult: true, queryStatus: "done", queryDurationMs: 1000 });
  }
});

it.each(["thinking", "final_thinking", "content"])("returns to reasoning on a new root %s", (type) => {
  expect(getDataHubResponsePhases([
    { type: "tool_call", timestamp: 1000 }, { type: "text", content: "初步结果", timestamp: 2000 },
    { type, content: "需要复核", isThinking: true, timestamp: 3000 }
  ], "streaming", 0)).toMatchObject({ showResult: false, thinkingStatus: "running", queryStatus: "running", thinkingDurationMs: undefined });
});

it("recognizes exposed child sessions without parentSessionId and ignores child completion", () => {
  expect(getDataHubResponsePhases([
    { type: "subagent_exposed", data: { sessionId: "child" } },
    { type: "text", sessionId: "child", content: "子结论" },
    { type: "done", sessionId: "child" },
    { type: "text", subagentId: "another-child", content: "另一个子结论" }
  ], "streaming")).toMatchObject({ showResult: false, queryStatus: "running" });
});

it.each(["error", "cancelled"] as const)("preserves %s after an answer began", (status) => {
  expect(getDataHubResponsePhases([
    { type: "tool_call", timestamp: 1000 }, { type: "text", content: "部分回答", timestamp: 2000 }
  ], status, 0, 3000)).toMatchObject({ showResult: true, thinkingStatus: status, queryStatus: status });
});

it("reopens query on actual execution after preliminary text", () => {
  expect(getDataHubResponsePhases([
    { type: "text", content: "我先查一下" }, { type: "tool_call" },
    { type: "table" }, { type: "done", parentSessionId: "root" }
  ], "streaming")).toMatchObject({ showResult: false, queryStatus: "running" });
});

it("does not enter final output for an orphan or fragmented thinking envelope", () => {
  expect(getDataHubResponsePhases([{ type: "text", content: "</mm:think>" }], "streaming").showResult).toBe(false);
  const content = ["<mm:thi", "nk>推理", "</mm:", "think>"];
  const events = content.map((part) => ({ type: "text", content: part }));
  for (let length = 1; length <= events.length; length += 1) {
    expect(getDataHubResponsePhases(events.slice(0, length), "streaming").showResult).toBe(false);
  }
  expect(getDataHubResponsePhases([...events, { type: "text", content: "正式答案" }], "streaming").showResult).toBe(true);
});

it("does not use the previous model call's opening text to validate a new marker-only answer", () => {
  expect(getDataHubResponsePhases([
    { type: "text", replyId: "intro", content: "我先查一下。" },
    { type: "tool_call" },
    { type: "text", replyId: "final", content: "</mm:" },
    { type: "text", replyId: "final", content: "think>" }
  ], "streaming").showResult).toBe(false);
});
