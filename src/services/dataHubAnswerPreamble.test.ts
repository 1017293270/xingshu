import { describe, expect, it } from "vitest";
import { buildDataHubAnswerPreamble } from "./dataHubAnswerPreamble";
import type { DataHubBusinessTrace } from "@/types/dataHub";

function trace(overrides: Partial<DataHubBusinessTrace> = {}): DataHubBusinessTrace {
  return {
    intent: "统计合同金额",
    tasks: [],
    steps: [],
    dataSources: [],
    dataTables: [],
    fields: [],
    filters: [],
    calculations: [],
    relationships: [],
    metricDefinitions: [],
    synonymMappings: [],
    time: [],
    documents: [],
    ...overrides
  };
}

describe("buildDataHubAnswerPreamble", () => {
  it("问数带数据源和表名时拼出完整来源句", () => {
    expect(
      buildDataHubAnswerPreamble(
        "ASK_DATA",
        trace({ dataSources: ["合同库"], dataTables: ["合同明细表"] }),
        "2025 年合同总额为 1.2 亿元。"
      )
    ).toBe("查询依据：根据合同库 数据源的 合同明细表。");
  });

  it("超过三项收敛为等N项", () => {
    expect(
      buildDataHubAnswerPreamble(
        "ASK_DATA",
        trace({ dataSources: ["A"], dataTables: ["表1", "表2", "表3", "表4"] }),
        "结果如下。"
      )
    ).toBe("查询依据：根据A 数据源的 表1、表2、表3 等 4 项。");
  });

  it("素材为空不出句", () => {
    expect(buildDataHubAnswerPreamble("ASK_DATA", trace(), "结果")).toBe("");
    expect(buildDataHubAnswerPreamble("ASK_DATA", undefined, "结果")).toBe("");
    expect(
      buildDataHubAnswerPreamble("ASK_DATA", trace({ dataSources: ["A"] }), "  ")
    ).toBe("");
  });

  it("合成占位表名「xx中的业务数据」不算真实表材料", () => {
    expect(
      buildDataHubAnswerPreamble(
        "ASK_DATA",
        trace({ dataSources: ["CRM"], dataTables: ["CRM中的业务数据"] }),
        "结果"
      )
    ).toBe("查询依据：根据CRM 数据源。");
  });

  it("答案已自带根据或依据开头时不重复", () => {
    expect(
      buildDataHubAnswerPreamble(
        "ASK_DATA",
        trace({ dataSources: ["合同库"] }),
        "根据合同库数据，总额为 1.2 亿元。"
      )
    ).toBe("");
    expect(
      buildDataHubAnswerPreamble(
        "ASK_DATA",
        trace({ dataSources: ["合同库"] }),
        "（依据财务口径）总额为 1.2 亿元。"
      )
    ).toBe("");
  });

  it("问知与找文档不出前言句", () => {
    const full = trace({ dataSources: ["A"], dataTables: ["表"] });
    expect(buildDataHubAnswerPreamble("ASK_KNOWLEDGE", full, "答")).toBe("");
    expect(buildDataHubAnswerPreamble("DOCUMENT_LOOKUP", full, "答")).toBe("");
  });

  it("编排结果可并入知识库材料", () => {
    expect(
      buildDataHubAnswerPreamble(
        "AGENT",
        trace({
          dataSources: ["合同库"],
          documents: [
            { kbName: "制度库", docName: "报销制度", fragments: [] },
            { kbName: "制度库", docName: "差旅制度", fragments: [] }
          ]
        }),
        "综合结论如下。"
      )
    ).toBe("查询依据：根据合同库 数据源与制度库 知识库。");
  });
});

 it("uses verified query operations even when the answer starts with 根据", () => {
    const result = buildDataHubAnswerPreamble("ASK_DATA", trace({
      dataSources: ["合同系统"], dataTables: ["合同表"],
      calculations: ["按合同数量降序排列"],
      queries: [{ table: "合同表", dimensions: ["公司"],
        measures: [{ label: "合同名称", aggregation: "去重计数" }],
        filters: ["合同金额小于“60”"], time: [] }]
    }), "根据查询结果，卓一排名第一。");
    expect(result).toContain("筛选合同金额小于“60”");
    expect(result).toContain("按公司分组");
    expect(result).toContain("对合同名称去重计数");
    expect(result).toContain("按合同数量降序排列");
 });
