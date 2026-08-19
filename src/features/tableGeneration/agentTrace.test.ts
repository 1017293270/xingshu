import { describe, expect, it } from "vitest";
import {
  buildTableAgentTrace,
  formatTraceDuration,
  summarizeTableAgentTrace
} from "@/features/tableGeneration/agentTrace";
import type { DataHubAskTurn } from "@/types/dataHub";

function createTurn(overrides: Partial<DataHubAskTurn> = {}): DataHubAskTurn {
  return {
    question: "华东区Q1销售排行",
    status: "done",
    assistantContent: "",
    answerBlocks: [],
    thinkingContent: "",
    thinkingBlocks: [],
    infoMessages: [],
    dataSources: [],
    citationDocuments: [],
    routingEvents: [],
    reactSteps: [],
    toolCalls: [],
    toolResults: [],
    tableResults: [],
    chartResults: [],
    ...overrides
  };
}

describe("buildTableAgentTrace", () => {
  it("turns react steps into a readable, labelled sequence", () => {
    const trace = buildTableAgentTrace(
      createTurn({
        dataSources: [{ datasourceId: 8, datasourceName: "销售数仓 sales_dw" }],
        reactSteps: [
          { action: "route_intent", status: "success", summary: "识别为排行统计", durationMs: 240 },
          { action: "locate_datasource", status: "success", durationMs: 480 },
          { action: "execute_query", status: "success", summary: "返回 6 行", durationMs: 520 }
        ]
      })
    );

    expect(trace.steps.map((step) => step.label)).toEqual(["意图路由", "定位数据源", "执行查询"]);
    // 步骤自身没写 summary 时，用命中的数据源名兜底，而不是留空
    expect(trace.steps[1].detail).toBe("销售数仓 sales_dw");
    expect(trace.datasourceName).toBe("销售数仓 sales_dw");
    expect(trace.totalDurationMs).toBe(1240);
  });

  it("attaches the query statement to only the first query step", () => {
    const trace = buildTableAgentTrace(
      createTurn({
        reactSteps: [
          { action: "generate_query", status: "success" },
          { action: "execute_query", status: "success" }
        ],
        toolResults: [{ toolName: "execute_query", sql: "SELECT 1" }]
      })
    );

    expect(trace.steps.filter((step) => step.sql)).toHaveLength(1);
    expect(trace.steps[0].sql).toBe("SELECT 1");
  });

  it("keeps the query statement visible when no step can carry it", () => {
    const trace = buildTableAgentTrace(
      createTurn({ toolResults: [{ toolName: "execute_query", sql: "SELECT 2" }] })
    );

    expect(trace.steps.at(-1)).toMatchObject({ label: "生成查询", sql: "SELECT 2" });
  });

  it("falls back to tool calls when the agent reports no react steps", () => {
    const trace = buildTableAgentTrace(
      createTurn({
        toolCalls: [{ toolName: "locate_datasource" }, { toolName: "execute_query" }],
        toolResults: [{ toolName: "execute_query", status: "success", summary: "返回 3 行", durationMs: 90 }]
      })
    );

    expect(trace.steps.map((step) => step.label)).toEqual(["定位数据源", "执行查询"]);
    expect(trace.steps[1].detail).toBe("返回 3 行");
  });

  it("marks only the last step as running while the turn streams", () => {
    const trace = buildTableAgentTrace(
      createTurn({
        status: "streaming",
        reactSteps: [{ action: "route_intent" }, { action: "execute_query" }]
      })
    );

    expect(trace.steps.map((step) => step.status)).toEqual(["done", "running"]);
  });

  it("adds the datasource as its own step when no react step mentions it", () => {
    const trace = buildTableAgentTrace(
      createTurn({ dataSources: [{ datasourceId: 3, datasourceName: "经营分析库" }] })
    );

    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]).toMatchObject({ label: "定位数据源", detail: "经营分析库" });
  });

  it("skips the decompose step when the agent reported no sub-questions", () => {
    const trace = buildTableAgentTrace(
      createTurn({ decompose: { executionMode: "SIMPLE", subQuestions: [] } })
    );

    expect(trace.steps).toHaveLength(0);
  });

  it("keeps the decompose step when sub-questions carry real information", () => {
    const trace = buildTableAgentTrace(
      createTurn({ decompose: { executionMode: "COMPLEX", subQuestions: ["区域销售额", "同比"] } })
    );

    expect(trace.steps[0]).toMatchObject({ label: "问题拆解", detail: "区域销售额 · 同比" });
  });

  it("prefers the reported total duration over the summed step durations", () => {
    const trace = buildTableAgentTrace(
      createTurn({
        reactSteps: [{ action: "route_intent", durationMs: 100 }],
        done: { totalDurationMs: 2410 }
      })
    );

    expect(trace.totalDurationMs).toBe(2410);
  });
});

describe("summarizeTableAgentTrace", () => {
  it("states how many steps ran, which source was hit, and how long it took", () => {
    const trace = buildTableAgentTrace(
      createTurn({
        dataSources: [{ datasourceId: 8, datasourceName: "sales_dw" }],
        reactSteps: [{ action: "route_intent" }, { action: "locate_datasource" }],
        done: { totalDurationMs: 2410 }
      })
    );

    expect(summarizeTableAgentTrace(trace)).toBe("2 步 · sales_dw · 用时 2.4s");
  });
});

describe("formatTraceDuration", () => {
  it("keeps sub-second timings in milliseconds and rounds longer ones to seconds", () => {
    expect(formatTraceDuration(240)).toBe("240ms");
    expect(formatTraceDuration(2410)).toBe("2.4s");
    expect(formatTraceDuration(0)).toBe("");
    expect(formatTraceDuration(undefined)).toBe("");
  });
});
