import { describe, expect, it } from "vitest";
import { buildBusinessNarrative, scopeDetailRows } from "./businessNarrative";
import type { DataHubBusinessTrace } from "@/types/dataHub";

const emptyTrace: DataHubBusinessTrace = {
  intent: "",
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
  documents: []
};

function narrate(
  trace: Partial<DataHubBusinessTrace>,
  options: {
    kind?: "ASK_DATA" | "ASK_KNOWLEDGE" | "DOCUMENT_LOOKUP" | "AGENT";
    status?: "running" | "done" | "error" | "cancelled";
    question?: string;
  } = {}
) {
  return buildBusinessNarrative({
    trace: { ...emptyTrace, ...trace },
    kind: options.kind ?? "ASK_DATA",
    status: options.status ?? "done",
    question: options.question ?? "善治数字科技签了多少合同"
  });
}

/** 用户拿来验收的那条真实查询：甲方筛选 + 按乙方单位计数，10 家乙方。 */
const contractTrace: Partial<DataHubBusinessTrace> = {
  dataSources: ["合同数据系统"],
  dataTables: ["合同主数据清单"],
  queries: [{
    dataSource: "合同数据系统",
    table: "合同主数据清单",
    dimensions: ["合同乙方单位名称"],
    measures: [{ label: "记录数", aggregation: "计数" }],
    filters: ["合同甲方单位名称等于“善治数字科技（成都）有限公司”"],
    time: [],
    rows: 10,
    rowKind: "grouped",
    preview: [
      { label: "广州思迈特软件有限公司", value: "6 条" },
      { label: "杭州海康威视科技有限公司", value: "5 条" },
      { label: "云南蚁象网络科技有限公司", value: "3 条" }
    ]
  }]
};

describe("buildBusinessNarrative", () => {
  it("writes the contract count query as two plain-Chinese sentences", () => {
    const { how, found } = narrate(contractTrace);

    expect(how).toEqual([
      "搜索数据源“合同数据系统”，查找合同相关的数据表；找到后只看甲方单位为“善治数字科技（成都）有限公司”的合同，按乙方单位统计合同数量。"
    ]);
    expect(found.map((item) => item.text)).toEqual([
      "在数据源“合同数据系统”找到数据表“合同主数据清单”，筛出合同甲方单位名称为“善治数字科技（成都）有限公司”的合同记录，按“合同乙方单位名称”计数，共 10 家乙方单位；最多的是广州思迈特软件有限公司（6 条）、杭州海康威视科技有限公司（5 条）、云南蚁象网络科技有限公司（3 条）。"
    ]);
  });

  it("keeps SQL vocabulary and log punctuation out of both paragraphs", () => {
    const { how, found } = narrate(contractTrace);
    const text = [...how, ...found.map((item) => item.text)].join("");

    expect(text).not.toMatch(/分组|记录数|核对结果后作答/);
    expect(text).not.toMatch(/[「」]/);
  });

  it("names the top rows instead of only counting them", () => {
    const { found } = narrate({
      dataSources: ["生产销售数据"],
      queries: [{
        dataSource: "生产销售数据",
        table: "销售明细表",
        dimensions: ["区域"],
        measures: [{ label: "销售额（万元）", aggregation: "求和" }],
        filters: [],
        time: [],
        rows: 4,
        rowKind: "grouped",
        preview: [
          { label: "华东", value: "486.2 万元" },
          { label: "华南", value: "331.7 万元" }
        ]
      }]
    }, { question: "本月各区域销售额" });

    expect(found[0].text).toBe(
      "在数据源“生产销售数据”找到数据表“销售明细表”，按“区域”对“销售额（万元）”求和，共 4 个区域；最高的是华东（486.2 万元）、华南（331.7 万元）。"
    );
  });

  it("reads a single-value result as one number, not as one row", () => {
    const { how, found } = narrate({
      queries: [{
        dataSource: "合同数据系统",
        table: "合同主数据清单",
        dimensions: [],
        measures: [{ label: "合同金额（万元）", aggregation: "求和" }],
        filters: [],
        time: ["签订日期：2026-01-01 至 2026-06-30"],
        rows: 1,
        rowKind: "single",
        preview: [{ label: "合同金额（万元）", value: "1,242.2 万元" }]
      }]
    }, { question: "上半年合同金额" });

    expect(how[0]).toBe(
      "搜索数据源“合同数据系统”，查找合同相关的数据表；找到后汇总合同金额（万元），时间范围签订日期：2026-01-01 至 2026-06-30。"
    );
    expect(found[0].text).toBe(
      "在数据源“合同数据系统”找到数据表“合同主数据清单”，对“合同金额（万元）”求和，结果为 1,242.2 万元。"
    );
  });

  it("still says what happened when the backend only returned a row count", () => {
    const { how, found } = narrate({
      fields: ["区域", "季度销售额（万元）", "完成率"],
      queries: [{ dimensions: [], measures: [], filters: [], time: [], rows: 3 }]
    }, { question: "各区域经营表现" });

    expect(how[0]).toBe("搜索数据源，查找与“各区域经营表现”相关的数据。");
    expect(found[0].text).toBe("查到 3 行结果，包含“区域、季度销售额（万元）、完成率”。");
  });

  it("falls back to the plain strings, turning 计算 entries into a real verb", () => {
    const { how, found } = narrate({
      dataSources: ["经营分析库"],
      dataTables: ["经营分析库中的业务数据"],
      filters: [
        "合同主数据清单，记录合同编号、名称。合同乙方单位名称包含“永安镇”",
        "合同主数据清单，记录合同编号、名称。合同甲方单位名称包含“善治”"
      ],
      calculations: ["记录数：计数"],
      time: ["签订日期：2026-01-01 至 2026-06-30（按月）"]
    }, { question: "查询永安镇合同" });

    expect(how).toEqual([
      "搜索数据源“经营分析库”，查找相关的数据表；找到后只看合同乙方单位含有“永安镇”、合同甲方单位含有“善治”的记录，统计记录数量，时间范围签订日期：2026-01-01 至 2026-06-30（按月）。"
    ]);
    // 没有行数就没有可复核的结果，宁可不写「查到了什么」。
    expect(found).toEqual([]);
  });

  it("strips the table comment glued in front of a field name", () => {
    const { how, found } = narrate({
      queries: [{
        dataSource: "生产销售数据",
        table: "销售明细表",
        dimensions: ["销售明细表，记录各区域月度销售额。区域"],
        measures: [{ label: "销售额（万元）", aggregation: "求和" }],
        filters: ["销售明细表，记录各区域月度销售额。统计月份等于“2026-08”"],
        time: [],
        rows: 4
      }]
    }, { question: "本月销售额" });

    expect(how[0]).toBe(
      "搜索数据源“生产销售数据”，查找销售相关的数据表；找到后只看统计月份为“2026-08”的销售，按区域汇总销售额（万元）。"
    );
    expect(found[0].text).toBe(
      "在数据源“生产销售数据”找到数据表“销售明细表”，筛出统计月份为“2026-08”的销售记录，按“区域”对“销售额（万元）”求和，得到 4 行结果。"
    );
  });

  it("shows what is already known while the query is still running", () => {
    const { how, found } = narrate(
      { dataSources: ["合同数据系统"] },
      { status: "running" }
    );

    expect(how).toEqual(["正在搜索数据源“合同数据系统”，查找相关的数据表……"]);
    expect(found.map((item) => item.text)).toEqual(["正在等待结果……"]);
  });

  it("admits a failed run has nothing to check", () => {
    const { how, found } = narrate({ dataSources: ["合同数据系统"] }, { status: "error" });

    expect(how[0]).toBe("搜索数据源“合同数据系统”，查找相关的数据表。");
    expect(found.map((item) => item.text)).toEqual(["本次未拿到可核对的结果。"]);
  });

  it("describes a knowledge lookup by knowledge base and source document", () => {
    const document = {
      kbName: "制度知识库",
      docName: "合同管理办法（2026 版）",
      chapter: "第三章 审批流程",
      pageNumber: "12",
      fragments: ["合同经办部门起草后，须依次经过部门负责人初审。"]
    };
    const { how, found } = narrate(
      { documents: [document] },
      { kind: "ASK_KNOWLEDGE", question: "公司合同审批需要经过哪些环节？" }
    );

    // 问号留在引号里会把句子读断，引用时去掉。
    expect(how).toEqual([
      "在知识库“制度知识库”中检索与“公司合同审批需要经过哪些环节”相关的文档，并核对来源。"
    ]);
    expect(found[0].text).toBe(
      "在知识库“制度知识库”找到文档《合同管理办法（2026 版）》（第三章 审批流程 · 第 12 页），引用了 1 段原文。"
    );
    // 整条要能点开原文片段。
    expect(found[0].document).toBe(document);
  });

  it("says which knowledge is searched even before any document came back", () => {
    const { how, found } = narrate({}, {
      kind: "DOCUMENT_LOOKUP",
      question: "帮我找到最新版员工手册"
    });

    expect(how).toEqual([
      "在可访问的企业知识库中检索与“帮我找到最新版员工手册”相关的文档，并核对来源。"
    ]);
    expect(found).toEqual([]);
  });

  it("chains the sub-agents of an orchestration into one sentence", () => {
    const { how, found } = narrate({
      tasks: [
        { id: "task-1", agentName: "区域业绩问数", question: "统计各区域本季度销售额" },
        { id: "task-2", agentName: "考核制度问知", question: "查找区域业绩考核制度原文" }
      ],
      dataSources: ["经营分析库"],
      queries: [{
        dataSource: "经营分析库",
        table: "合同主数据清单",
        dimensions: ["区域"],
        measures: [{ label: "合同金额", aggregation: "求和" }],
        filters: [],
        time: [],
        rows: 3
      }],
      documents: [{
        kbName: "制度库",
        docName: "区域考核办法.pdf",
        fragments: ["完成率低于 85% 需提交改进方案。"]
      }]
    }, { kind: "AGENT", question: "各区域经营表现如何" });

    expect(how).toEqual([
      "先由区域业绩问数搜索数据源“经营分析库”，查找合同相关的数据表；找到后按区域汇总合同金额，"
        + "再由考核制度问知在知识库“制度库”中检索与“各区域经营表现如何”相关的文档，并核对来源。"
    ]);
    expect(found.map((item) => item.text)).toEqual([
      "在数据源“经营分析库”找到数据表“合同主数据清单”，按“区域”对“合同金额”求和，得到 3 行结果。",
      "在知识库“制度库”找到文档《区域考核办法.pdf》，引用了 1 段原文。"
    ]);
  });

  it("says plainly that nothing was queried instead of inventing a step", () => {
    const { how, found } = narrate({}, { kind: "AGENT", question: "今天怎么样" });

    expect(how).toEqual(["理解问题后直接作答，本次没有查询数据或文档。"]);
    expect(found).toEqual([]);
  });

  it("keeps only the definitions the backend really returned", () => {
    expect(scopeDetailRows({
      ...emptyTrace,
      metricDefinitions: [
        "合同金额：已签署合同的含税总额，单位万元",
        "记录数：采用企业语义模型中已发布的指标口径"
      ],
      synonymMappings: ["本次未返回可复核的同义词映射"],
      relationships: ["单一业务主题，本次没有跨主题关联"]
    })).toEqual([
      { label: "指标定义", values: ["合同金额：已签署合同的含税总额，单位万元"] }
    ]);
  });
});
