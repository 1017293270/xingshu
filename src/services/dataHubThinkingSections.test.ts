import { describe, expect, it } from "vitest";
import { createDataHubAskTurn } from "./dataHubAskDataPresenter";
import { projectDataHubExecutionEvents } from "./dataHubExecutionProjector";
import { getDataHubThinkingSections } from "./dataHubThinkingSections";
import type { DataHubStreamEvent } from "@/types/dataHub";

function sectionsFor(events: DataHubStreamEvent[]) {
  const projection = projectDataHubExecutionEvents(events, { mainSessionId: "root", fallbackAgentName: "智能体" });
  return getDataHubThinkingSections(projection, createDataHubAskTurn("统计两个合格数量", events, "done"));
}

describe("getDataHubThinkingSections", () => {
  it("lists analysis and process notes per agent in arrival order without the formal answer", () => {
    const root = { agentName: "编排智能体", sessionId: "root", replyId: "root-reply" };
    const child = { agentName: "问数智能体", sessionId: "ask-child", parentSessionId: "root", subagentId: "ask-1", agentId: "ask-data", label: "问数智能体", replyId: "child-reply" };
    const answer = "学生心理测试合格数量：263；学生综合测试合格数量：424。";
    const sections = sectionsFor([
      { ...root, type: "thinking", content: "我将把这两个指标作为同一事项委派给问数智能体。", isThinking: true, modelCallIndex: 1 },
      { ...child, type: "subagent_exposed", content: { sessionId: "ask-child", agentId: "ask-data", label: "问数智能体" } },
      { ...child, type: "thinking", content: "先看查询技能。", isThinking: true, modelCallIndex: 1 },
      { ...child, type: "text", content: "我需要先了解查询技能的规范，然后确定数据源和模型。", modelCallIndex: 1, textRole: "progress" },
      { ...child, type: "text", content: "语义 SQL 报错（列数不匹配），我改用标准查询分别统计两个分项。", modelCallIndex: 2, textRole: "progress" },
      { ...child, type: "text", content: "学生心理测试合格数量：263", modelCallIndex: 3, textRole: "progress" },
      { ...child, type: "text_replace", content: answer, modelCallIndex: 3, textRole: "answer" },
      { ...child, type: "done", content: {} },
      { ...root, type: "text", content: answer, modelCallIndex: 2 },
      { ...root, type: "done", content: {}, finished: true }
    ]);

    expect(sections.map((section) => [section.label, section.main])).toEqual([["主任务", true], ["问数智能体", false]]);
    expect(sections[0].notes).toEqual([{ kind: "analysis", content: "我将把这两个指标作为同一事项委派给问数智能体。" }]);
    // 相邻的两条过程说明并成一条，正式回答不出现在思考过程里。
    expect(sections[1].notes).toEqual([
      { kind: "analysis", content: "先看查询技能。" },
      {
        kind: "progress",
        content: "我需要先了解查询技能的规范，然后确定数据源和模型。\n\n语义 SQL 报错（列数不匹配），我改用标准查询分别统计两个分项。"
      }
    ]);
  });

  it("keeps a legacy session's thinking as one analysis note", () => {
    const sections = sectionsFor([
      { type: "thinking", sessionId: "root", content: "先确认口径。", isThinking: true, replyId: "a", modelCallIndex: 1 },
      { type: "thinking", sessionId: "root", content: "再按月份汇总。", isThinking: true, replyId: "b", modelCallIndex: 2 },
      { type: "text", sessionId: "root", content: "我来帮您查询。", replyId: "a", modelCallIndex: 1 },
      { type: "text", sessionId: "root", content: "本月收入为 128 万元。", replyId: "b", modelCallIndex: 2 }
    ]);
    expect(sections).toEqual([{
      key: "root",
      label: "主任务",
      main: true,
      notes: [{ kind: "analysis", content: "先确认口径。\n\n再按月份汇总。" }]
    }]);
  });
});
