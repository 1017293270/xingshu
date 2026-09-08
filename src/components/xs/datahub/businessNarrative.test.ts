import { describe, expect, it } from "vitest";
import { buildBusinessNarrative, scopeDetailRows } from "./businessNarrative";
import type { DataHubBusinessTrace } from "@/types/dataHub";

const emptyTrace: DataHubBusinessTrace = {
  intent: "", tasks: [], steps: [], dataSources: [], dataTables: [], fields: [],
  filters: [], calculations: [], relationships: [], metricDefinitions: [], synonymMappings: [], time: [], documents: []
};
function narrate(trace: Partial<DataHubBusinessTrace>, options: Partial<Parameters<typeof buildBusinessNarrative>[0]> = {}) {
  return buildBusinessNarrative({ trace: { ...emptyTrace, ...trace }, kind: "ASK_DATA", status: "done", question: "用户原始问题不应复述", ...options });
}

describe("structured business facts", () => {
  it("keeps each query's source, table, conditions, aggregation and returned values separate", () => {
    const preview = [{ label: "广州思迈特软件有限公司", value: "6 条" }];
    const result = narrate({ queries: [{
      dataSource: "合同数据系统", table: "合同主数据清单", dimensions: ["合同乙方单位名称"],
      measures: [{ label: "记录数", aggregation: "计数" }],
      filters: ["合同甲方单位名称等于“善治数字科技（成都）有限公司”"],
      time: ["签订日期：2026-01-01 至 2026-06-30"], rows: 10, preview
    }] });
    expect(result.process.map(({ steps: _steps, ...group }) => group)).toEqual([{ key: "query-0", title: "按合同乙方单位名称统计记录数", rows: [
      { label: "数据源", values: ["合同数据系统"] },
      { label: "数据表", values: ["合同主数据清单"] },
      { label: "筛选", values: ["合同甲方单位名称等于“善治数字科技（成都）有限公司”"] },
      { label: "分组", values: ["合同乙方单位名称"] },
      { label: "统计", values: ["记录数：计数"] },
      { label: "时间", values: ["签订日期：2026-01-01 至 2026-06-30"] }
    ] }]);
    expect(result.found).toEqual([{ key: "query-0", title: "合同主数据清单", metadata: ["合同数据系统", "10 行"], preview }]);
    expect(result.statusMessage).toBeUndefined();
  });

  it("does not assign global sources to queries or invent counts from previews", () => {
    const result = narrate({ dataSources: ["甲库", "乙库"], queries: [
      { table: "第一张表", dimensions: [], measures: [], filters: [], time: [], rows: 0 },
      { table: "第二张表", dimensions: [], measures: [], filters: [], time: [], preview: [{ label: "金额", value: "12 元" }] }
    ] });
    expect(result.process.slice(0, 2).every((group) => !group.rows.some((row) => row.label === "数据源"))).toBe(true);
    expect(result.process[2].rows).toEqual([{ label: "数据源", values: ["甲库", "乙库"] }]);
    expect(result.found.map((item) => item.metadata)).toEqual([["0 行"], []]);
  });

  it("keeps full knowledge names as individual values and document identities separate", () => {
    const docs = [
      { kbName: "采购管理知识库完整名称", docName: "采购合同审批制度（2026 修订完整版）.pdf", chapter: "第五章 审批细则", pageNumber: "15", fragments: ["实际片段"] },
      { kbName: "归档库", docName: "采购合同审批制度（2026 修订完整版）.pdf", fragments: [] },
      { kbName: "", docName: "附录.pdf", fragments: [] }
    ];
    const result = narrate({ documents: docs, dataSources: ["不相关数据源"] }, { kind: "DOCUMENT_LOOKUP" });
    expect(result.process).toEqual([{ key: "knowledge", rows: [{ label: "知识库", values: ["采购管理知识库完整名称", "归档库"] }] }]);
    expect(result.found[0]).toMatchObject({ title: docs[0].docName, metadata: ["采购管理知识库完整名称", "第五章 审批细则", "第 15 页", "1 个片段"] });
    expect(result.found[0].document).toBe(docs[0]);
    expect(result.found[0].key).not.toBe(result.found[1].key);
    expect(result.found[2].metadata).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/用户原始问题|全文检索|混合检索|核对来源|企业知识库/);
  });

  it("retains explicit fallback facts without shortening names or synthesizing query actions", () => {
    const condition = "销售明细表，记录各区域月度销售额。统计月份等于“2026-08”";
    const result = narrate({ dataSources: ["经营分析库"], dataTables: ["经营分析库中的业务数据"], filters: [condition], calculations: ["金额：求和"] });
    expect(result.process[0].rows).toEqual([
      { label: "数据源", values: ["经营分析库"] }, { label: "筛选", values: [condition] }, { label: "计算", values: ["金额：求和"] }
    ]);
    expect(result.found).toEqual([]);
  });

  it("supports data and document facts together in orchestration", () => {
    const result = narrate({ queries: [{ table: "合同表", dimensions: [], measures: [], filters: [], time: [], rows: 3 }],
      documents: [{ kbName: "制度库", docName: "制度.pdf", fragments: [] }] }, { kind: "AGENT" });
    expect(result.process.map((group) => group.key)).toEqual(["query-0", "knowledge"]);
    expect(result.found.map((entry) => entry.title)).toEqual(["合同表", "制度.pdf"]);
  });

  it.each(["running", "done", "error", "cancelled"] as const)("states missing results honestly in %s", (status) => {
    const result = narrate({}, { kind: "ASK_KNOWLEDGE", status });
    expect(result.process).toEqual([]);
    expect(result.found).toEqual([]);
    expect(result.statusMessage).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/理解问题|直接作答|可访问|相关文档|核验/);
  });

  it("excludes invented metric rules but preserves real definitions intact", () => {
    expect(scopeDetailRows({ ...emptyTrace,
      metricDefinitions: ["合同金额：已签署合同的含税总额，单位万元", "记录数：采用企业语义模型中已发布的指标口径"],
      synonymMappings: ["本次未返回可复核的同义词映射"], relationships: ["单一业务主题，本次没有跨主题关联"]
    })).toEqual([{ label: "指标定义", values: ["合同金额：已签署合同的含税总额，单位万元"] }]);
  });
});

it("explains the screenshot's actual filter and grouped count as short actions", () => {
  const result = narrate({ queries: [{ table: "合同主数据清单", dimensions: ["合同乙方单位名称"],
    measures: [{ label: "记录数", aggregation: "计数" }], filters: ["合同甲方单位等于“善治数字科技（成都）有限公司”"], time: [], rows: 10 }] }, { question: "合同Top3" });
  expect(result.process[0].steps).toEqual([
    { title: "限定查询范围", description: "在“合同主数据清单”中，只保留合同甲方单位等于“善治数字科技（成都）有限公司”的记录。" },
    { title: "汇总统计", description: "将“合同乙方单位名称”相同的记录归为一组，统计每组有多少条记录。" },
    { title: "返回结果", description: "本次返回 10 行数据。" }
  ]);
  expect(JSON.stringify(result.process[0].steps)).not.toMatch(/Top|前三|降序|从高到低/);
});

it.each([
  ["SUM", "将每组的“采购重量”相加"], ["AVG", "计算每组的“采购重量”的平均值"],
  ["MAX", "找出每组的“采购重量”的最大值"], ["MIN", "找出每组的“采购重量”的最小值"],
  ["去重计数", "对每组的“采购重量”去重后计数"]
])("explains %s without changing the metric's meaning", (aggregation, expected) => {
  const result = narrate({ queries: [{ dimensions: ["地区"], measures: [{ label: "采购重量", aggregation }], filters: [], time: [] }] });
  expect(result.process[0].steps?.[0].description).toContain(expected);
  expect(JSON.stringify(result.process[0].steps)).not.toContain("合同金额");
});

it("only associates verified sorting with a single query", () => {
  const query = { table: "甲表", dimensions: [], measures: [], filters: [], time: [] };
  const single = narrate({ queries: [query], calculations: ["按数量降序排列", "按日期升序排列"] });
  expect(single.process[0].steps?.find((step) => step.title === "排列结果")?.description)
    .toBe("按“数量”从高到低排列；按“日期”从低到高排列。");
  expect(single.process).toHaveLength(1);
  expect(single.process[0].rows).toContainEqual({ label: "排序", values: ["按数量降序排列", "按日期升序排列"] });
  const multi = narrate({ dataSources: ["甲库", "乙库"], queries: [query, { ...query, table: "乙表" }], calculations: ["按数量降序排列"] });
  expect(JSON.stringify(multi.process.slice(0, 2).map((group) => group.steps))).not.toMatch(/降序|从高到低|甲库|乙库/);
  expect(multi.process[2].rows).toContainEqual({ label: "排序", values: ["按数量降序排列"] });
});

it("does not invent completed work or steps when query metadata is absent", () => {
  const result = narrate({ queries: [{ dimensions: [], measures: [], filters: [], time: [] }] }, { status: "running" });
  expect(result.process).toEqual([]);
  const known = narrate({ queries: [{ table: "甲表", dimensions: [], measures: [], filters: [], time: [] }] }, { status: "running" });
  expect(JSON.stringify(known.process[0].steps)).not.toMatch(/已完成|已返回|返回结果|筛选|排序/);
});

it("names detail and different aggregations from their actual operations on the same table", () => {
  const base = { table: "发票开具明细", filters: ["销方等于甲公司", "购方等于乙公司"], time: [], rows: 3 };
  const result = narrate({ queries: [
    { ...base, dimensions: ["销方名称", "购方名称", "开票日期", "金额"], measures: [], rowKind: "list" },
    { ...base, dimensions: ["购方单位名称"], measures: [{ label: "记录数", aggregation: "计数" }], rowKind: "grouped" },
    { ...base, dimensions: ["购方单位名称"], measures: [{ label: "开票金额", aggregation: "求和" }], rowKind: "grouped" }
  ] });
  expect(result.process.map((item) => item.title)).toEqual([
    "查询发票开具明细", "按购方单位名称统计记录数", "按购方单位名称汇总开票金额"
  ]);
  expect(result.found.map((item) => item.title)).toEqual(["发票开具明细", "发票开具明细", "发票开具明细"]);
  expect(result.process[0].rows.find((row) => row.label === "筛选")?.values).toEqual(base.filters);
});

it("uses neutral names when business identity is unavailable instead of numbered queries or guessed intent", () => {
  const result = narrate({ queries: [{ dimensions: [], measures: [], filters: [], time: [], rows: 0 }] },
    { question: "重试并扩大范围核验公司情况" });
  expect(result.process[0].title).toBe("查询数据");
  expect(result.found[0].title).toBe("查询结果");
  expect(JSON.stringify(result)).not.toMatch(/重试|扩大范围|核验|查询 1/);
});

it("keeps complex fields in the facts instead of piling them into a query title", () => {
  const dimensions = ["购方单位完整名称及归属业务部门说明".repeat(3), "销方名称", "所属年度"];
  const result = narrate({ queries: [{ table: "发票开具明细", dimensions,
    measures: [{ label: "开票金额", aggregation: "求和" }, { label: "记录数", aggregation: "计数" }],
    filters: [], time: [], rows: 3, rowKind: "grouped" }] });
  expect(result.process[0].title).toBe("发票开具明细汇总统计");
  expect(result.process[0].rows.find((row) => row.label === "分组")?.values).toEqual(dimensions);
});
