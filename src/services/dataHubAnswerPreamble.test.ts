import { describe, expect, it } from "vitest";
import { buildDataHubAnswerPreamble } from "./dataHubAnswerPreamble";
import { buildDataHubBusinessTrace, createDataHubAskTurn } from "./dataHubAskDataPresenter";
import type {
  DataHubBusinessQuery,
  DataHubBusinessQueryBasis,
  DataHubBusinessTrace,
  DataHubStreamEvent
} from "@/types/dataHub";

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

function basis(overrides: Partial<DataHubBusinessQueryBasis> = {}): DataHubBusinessQueryBasis {
  return {
    tables: [{ cube: "Contract", table: "合同主数据清单" }],
    conditions: [],
    groups: [],
    measures: [],
    segments: [],
    sorts: [],
    ...overrides
  };
}

function query(overrides: Partial<DataHubBusinessQuery> = {}): DataHubBusinessQuery {
  return { dimensions: [], measures: [], filters: [], time: [], ...overrides };
}

const field = (member: string, name: string) => ({ member: `Contract.${member}`, field: name });

const rankingBasis = basis({
  conditions: [{ ...field("score", "考核分数"), operator: "lt", values: ["60"] }],
  groups: [field("salesPerson", "销售人员")],
  measures: [{ ...field("contractAmount", "合同金额"), aggregation: "求和" }],
  sorts: [{ ...field("contractAmount", "合同金额"), direction: "desc" }],
  limit: 10
});

describe("buildDataHubAnswerPreamble", () => {
  it("writes one sentence per query in the requested order of source, filters, grouping, aggregation, sort and limit", () => {
    expect(
      buildDataHubAnswerPreamble(
        "ASK_DATA",
        trace({ queries: [query({ dataSource: "合同数据系统", basis: rankingBasis })] }),
        "张三签约金额最高。"
      )
    ).toEqual({
      queries: [
        "根据“合同数据系统”数据源“合同主数据清单”数据表，对“考核分数”按“小于 60”筛选，按“销售人员”分组，"
          + "对“合同金额”求和，按“合同金额”倒序排列，取前 10 条。"
      ],
      queryCount: 1
    });
  });

  it("starts from the table when the data source is unknown and never falls back to physical names", () => {
    const withoutSource = buildDataHubAnswerPreamble(
      "ASK_DATA",
      trace({ queries: [query({ basis: rankingBasis })] }),
      "结果如下。"
    );
    expect(withoutSource?.queries[0]).toMatch(/^根据“合同主数据清单”数据表，对“考核分数”/);

    const unnamed = buildDataHubAnswerPreamble(
      "ASK_DATA",
      trace({ queries: [query({ table: "contract_list", basis: basis({ ...rankingBasis, tables: [{ cube: "Contract" }] }) })] }),
      "结果如下。"
    );
    // 表也叫不出名字时直接说操作，物理表名 contract_list 不出现。
    expect(unnamed?.queries[0]).toMatch(/^对“考核分数”按“小于 60”筛选/);
    expect(unnamed?.queries[0]).not.toContain("contract_list");
  });

  it("still explains the operations when the model's own answer already starts with 根据", () => {
    // 截图里模型首句「根据当前已签合同……」说不清怎么查的，依据句照样给出。
    const result = buildDataHubAnswerPreamble(
      "ASK_DATA",
      trace({ queries: [query({ basis: rankingBasis })] }),
      "根据当前已签合同（合同签订状态为\"已签\"）的全部历史记录统计，销售人员签约合同金额排名结果如下："
    );
    expect(result?.queries[0]).toContain("对“合同金额”求和");
  });

  it("merges conditions on one field and keeps or-groups readable", () => {
    const result = buildDataHubAnswerPreamble("ASK_DATA", trace({
      queries: [query({
        basis: basis({
          conditions: [
            { ...field("amount", "合同金额"), operator: "gte", values: ["10"] },
            { ...field("amount", "合同金额"), operator: "lt", values: ["60"] },
            {
              logic: "or",
              conditions: [
                { ...field("region", "区域"), operator: "equals", values: ["华东"] },
                {
                  logic: "and",
                  conditions: [
                    { ...field("name", "合同名称"), operator: "startsWith", values: ["采购"] },
                    { ...field("remark", "备注"), operator: "notSet", values: [] }
                  ]
                }
              ]
            },
            { logic: "and", conditions: [{ ...field("status", "signStatus"), operator: "equals", values: ["已签"] }] }
          ],
          measures: [{ ...field("count", "记录数"), aggregation: "计数" }]
        })
      })]
    }), "共 12 份。");

    expect(result?.queries[0]).toBe(
      "根据“合同主数据清单”数据表，对“合同金额”按“大于等于 10 且 小于 60”筛选，"
        + "按“区域 等于 华东”或（“合同名称 以 采购 开头”且“备注 为空”）筛选，"
        + "对“signStatus”按“等于 已签”筛选，统计记录数。"
    );
  });

  it("describes time ranges, time grouping, segments, lists and uncertain aggregations without inventing them", () => {
    const timeBasis = basis({
      conditions: [{ ...field("signDate", "签订日期"), operator: "inDateRange", values: ["this month"] }],
      groups: [{ ...field("signDate", "签订日期"), granularity: "month" }, field("region", "区域")],
      measures: [
        { ...field("amount", "合同金额"), aggregation: "求和" },
        { ...field("paid", "回款金额"), aggregation: "求和" },
        { ...field("margin", "利润率"), aggregation: "" }
      ],
      segments: [field("signed", "已签合同")]
    });
    expect(buildDataHubAnswerPreamble("ASK_DATA", trace({ queries: [query({ basis: timeBasis })] }), "答")?.queries[0])
      .toBe("根据“合同主数据清单”数据表，对“签订日期”按“本月”筛选，按“已签合同”条件筛选，"
        + "按“签订日期”（按月）、“区域”分组，对“合同金额”、“回款金额”求和，统计“利润率”。");

    const listBasis = basis({
      conditions: [{ ...field("mustSign", "是否必签"), operator: "equals", values: ["是"] }],
      groups: [field("project", "项目名称"), field("owner", "负责人")],
      limit: 10,
      offset: 20
    });
    expect(buildDataHubAnswerPreamble("ASK_DATA", trace({ queries: [query({ basis: listBasis })] }), "答")?.queries[0])
      .toBe("根据“合同主数据清单”数据表，对“是否必签”按“等于 是”筛选，列出“项目名称”、“负责人”，跳过前 20 条后取 10 条。");
  });

  it("says 统计 for counts whose names are already counts", () => {
    const result = buildDataHubAnswerPreamble("ASK_DATA", trace({
      queries: [query({
        basis: basis({
          groups: [field("status", "订单状态")],
          measures: [
            { ...field("orderNum", "订单数"), aggregation: "计数" },
            { ...field("customer", "客户"), aggregation: "计数" }
          ]
        })
      })]
    }), "答");
    expect(result?.queries[0]).toBe("根据“合同主数据清单”数据表，按“订单状态”分组，统计“订单数”，对“客户”计数。");
  });

  it("counts tables it cannot name instead of pretending only one was queried", () => {
    const result = buildDataHubAnswerPreamble("ASK_DATA", trace({
      queries: [query({
        basis: basis({ ...rankingBasis, tables: [{ cube: "Contract", table: "合同主数据清单" }, { cube: "Staff" }] })
      })]
    }), "答");
    expect(result?.queries[0]).toMatch(/^根据“合同主数据清单”等 2 张数据表，/);
  });

  it("lists at most three queries and reports the total", () => {
    const queries = ["甲表", "乙表", "丙表", "丁表", "戊表"].map((table) =>
      query({ basis: basis({ ...rankingBasis, tables: [{ cube: table, table }] }) }));
    const result = buildDataHubAnswerPreamble("ASK_DATA", trace({ queries: [...queries, queries[0]] }), "答");

    expect(result?.queries).toHaveLength(3);
    expect(result?.queries[2]).toMatch(/^根据“丙表”数据表/);
    // 完全相同的重复查询只算一条。
    expect(result?.queryCount).toBe(5);
  });

  it("keeps a source-only sentence unless the answer already cites its source", () => {
    const sourceOnly = trace({ queries: [query({ dataSource: "合同库", table: "合同明细表" })] });
    expect(buildDataHubAnswerPreamble("ASK_DATA", sourceOnly, "2025 年合同总额为 1.2 亿元。")).toEqual({
      queries: ["根据“合同库”数据源“合同明细表”数据表查询。"],
      queryCount: 1
    });
    expect(buildDataHubAnswerPreamble("ASK_DATA", sourceOnly, "根据合同库数据，总额为 1.2 亿元。")).toBeNull();
    expect(buildDataHubAnswerPreamble("ASK_DATA", sourceOnly, "（依据财务口径）总额为 1.2 亿元。")).toBeNull();
  });

  it("returns nothing without verifiable material, for knowledge answers, or before an answer exists", () => {
    const full = trace({ queries: [query({ basis: rankingBasis })] });
    expect(buildDataHubAnswerPreamble("ASK_DATA", trace(), "结果")).toBeNull();
    expect(buildDataHubAnswerPreamble("ASK_DATA", undefined, "结果")).toBeNull();
    expect(buildDataHubAnswerPreamble("ASK_DATA", full, "  ")).toBeNull();
    expect(buildDataHubAnswerPreamble("ASK_KNOWLEDGE", full, "答")).toBeNull();
    expect(buildDataHubAnswerPreamble("DOCUMENT_LOOKUP", full, "答")).toBeNull();
  });

  it("adds the cited knowledge bases for orchestrated answers", () => {
    expect(
      buildDataHubAnswerPreamble(
        "AGENT",
        trace({
          queries: [query({ basis: rankingBasis })],
          documents: [
            { kbName: "制度库", docName: "报销制度", fragments: [] },
            { kbName: "制度库", docName: "差旅制度", fragments: [] }
          ]
        }),
        "综合结论如下。"
      )
    ).toMatchObject({ queryCount: 1, knowledge: "根据“制度库”知识库中的 2 份文档。" });
  });

  it("translates a real load_data event end to end", () => {
    const event = {
      type: "table",
      data: {
        datasourceId: 1000002,
        query: {
          measures: ["ContractList.contractAmount"],
          dimensions: ["ContractList.salesPerson"],
          filters: [{ member: "ContractList.signStatus", operator: "equals", values: ["已签"] }],
          order: [{ id: "ContractList.contractAmount", desc: true }],
          limit: 10000
        },
        data: [{ "ContractList.salesPerson": "张三", "ContractList.contractAmount": "1280.5" }],
        annotation: {
          measures: {
            "ContractList.contractAmount": { title: "合同主数据清单，记录合同编号、名称 合同金额", shortTitle: "合同金额", type: "number" }
          },
          dimensions: {
            "ContractList.salesPerson": { title: "合同主数据清单，记录合同编号、名称 销售人员", shortTitle: "销售人员" }
          }
        },
        sql: 'SELECT "contract_list".sales_person "contract_list__sales_person", sum("contract_list".contract_amount) "contract_list__contract_amount" FROM contract_list AS "contract_list" GROUP BY 1 ORDER BY 2 DESC'
      }
    } as DataHubStreamEvent;
    const turn = createDataHubAskTurn("销售人员签约合同金额排名", [event], "done");

    expect(buildDataHubAnswerPreamble(
      "ASK_DATA",
      buildDataHubBusinessTrace(turn, "销售人员签约合同金额排名", "ASK_DATA"),
      "根据当前已签合同的全部历史记录统计，销售人员签约合同金额排名结果如下："
    )?.queries).toEqual([
      "根据“合同主数据清单”数据表，对“signStatus”按“等于 已签”筛选，按“销售人员”分组，对“合同金额”求和，按“合同金额”倒序排列。"
    ]);
  });
});
