import { expect, it } from "vitest";
import { cleanDataHubThinkingText, splitDataHubThinkingEnvelope } from "./dataHubThinkingEnvelope";

it("only removes a leading model protocol envelope", () => {
  expect(splitDataHubThinkingEnvelope("</mm:think>").answer).toBe("");
  expect(splitDataHubThinkingEnvelope("<mm:think>推理</mm:think>答案")).toEqual({ thinking: "推理", answer: "答案" });
  expect(splitDataHubThinkingEnvelope("<mm:think>推理</mm:thi")).toEqual({ thinking: "推理", answer: "" });
  for (const literal of ["```xml\n<mm:think>代码</mm:think>\n```", "`</mm:think>`", "文档示例 <mm:think>内容</mm:think>"]) {
    expect(splitDataHubThinkingEnvelope(literal)).toEqual({ thinking: "", answer: literal });
  }
});


it("drops only whole status-only thinking blocks while preserving substantive content", () => {
  for (const status of ["子任务已完成。", "任务完成", "<mm:think>子任务已完成。</mm:think>"]) {
    expect(cleanDataHubThinkingText(status)).toBe("");
  }
  for (const content of ["子任务已完成。已查到3份合同。", "已完成2024年合同数量核验。", "`子任务已完成。`",
    "```text\n子任务已完成。\n```", "状态为‘子任务已完成’，但还需核对金额。"])
    expect(cleanDataHubThinkingText(content)).toBe(content);
});
