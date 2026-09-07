import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataHubBusinessExplanation } from "./DataHubBusinessExplanation";
import type { DataHubBusinessTrace } from "@/types/dataHub";

const emptyTrace: DataHubBusinessTrace = {
  intent: "查询合同付款情况",
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

/** 「怎么查」是散文段落，逐段取文本用于断言。 */
function howLines() {
  const region = screen.getByRole("region", { name: "怎么查" });
  return Array.from(region.querySelectorAll("p")).map((node) => node.textContent ?? "");
}

function foundLines() {
  return within(screen.getByRole("region", { name: "查到了什么" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("DataHubBusinessExplanation", () => {
  it("keeps a running query open and grows 怎么查 as facts arrive", () => {
    const { rerender } = render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询合同付款情况"
        status="running"
        trace={{ ...emptyTrace, steps: ["正在理解问题"] }}
      />
    );

    expect(screen.getByRole("button", { name: /查询过程/ })).toHaveAttribute("aria-expanded", "true");
    expect(howLines()).toEqual(["正在搜索数据源，查找与“查询合同付款情况”相关的数据……"]);

    rerender(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询合同付款情况"
        status="running"
        trace={{ ...emptyTrace, dataSources: ["合同数据系统"] }}
      />
    );

    expect(howLines()).toEqual(["正在搜索数据源“合同数据系统”，查找相关的数据表……"]);
    expect(foundLines()).toEqual(["正在等待结果……"]);
    expect(screen.queryByText(/核对结果后作答/)).not.toBeInTheDocument();
  });

  it("tells how the numbers were produced and which rows came back", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="善治数字科技签了多少合同"
        status="done"
        durationMs={7400}
        trace={{
          ...emptyTrace,
          dataSources: ["合同数据系统"],
          dataTables: ["合同主数据清单"],
          filters: ["合同甲方单位名称等于“善治数字科技（成都）有限公司”"],
          calculations: ["记录数：计数"],
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
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(howLines()).toEqual([
      "搜索数据源“合同数据系统”，查找合同相关的数据表；找到后只看甲方单位为“善治数字科技（成都）有限公司”的合同，按乙方单位统计合同数量。"
    ]);
    expect(foundLines()).toEqual([
      "在数据源“合同数据系统”找到数据表“合同主数据清单”，筛出合同甲方单位名称为“善治数字科技（成都）有限公司”的合同记录，按“合同乙方单位名称”计数，共 10 家乙方单位；最多的是广州思迈特软件有限公司（6 条）、杭州海康威视科技有限公司（5 条）、云南蚁象网络科技有限公司（3 条）。"
    ]);
    // 两段是散文，不再有编号圆圈和方头括号。
    expect(screen.getByRole("region", { name: "怎么查" }).querySelector("ol")).toBeNull();
    expect(screen.getByRole("region", { name: "怎么查" }).textContent).not.toMatch(/[「」]/);
  });

  it("drops the boilerplate the backend fills in when it has nothing to report", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="有多少份合同"
        status="done"
        durationMs={7400}
        trace={{
          ...emptyTrace,
          steps: ["已理解问题", "已获得 1 份结构化结果，共 13 行", "已汇总并复核最终结果"],
          dataSources: ["合同数据系统"],
          filters: ["本次未设置额外筛选条件"],
          calculations: ["本次结果采用企业语义模型已发布的计算规则"],
          relationships: ["单一业务主题，本次没有跨主题关联"],
          metricDefinitions: ["记录数：采用企业语义模型中已发布的指标口径"],
          synonymMappings: ["本次未返回可复核的同义词映射"],
          queries: [{
            dataSource: "合同数据系统",
            dimensions: [],
            measures: [{ label: "记录数", aggregation: "计数" }],
            filters: [],
            time: [],
            rows: 13
          }]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(howLines()).toEqual([
      "搜索数据源“合同数据系统”，查找相关的数据表；找到后统计记录数量。"
    ]);
    expect(foundLines()).toEqual([
      "在数据源“合同数据系统”里对记录计数，得到 13 行结果。"
    ]);
    expect(screen.queryByText("口径细则")).not.toBeInTheDocument();
    expect(screen.queryByText(/已汇总并复核最终结果/)).not.toBeInTheDocument();
    expect(screen.queryByText(/本次未/)).not.toBeInTheDocument();
    expect(screen.queryByText(/单一业务主题/)).not.toBeInTheDocument();
    // 折叠头只留状态和用时，不再数步数。
    expect(screen.getByRole("button", { name: /查询过程/ })).toHaveTextContent("已完成 · 用时 7 秒");
    expect(screen.queryByText(/3 步/)).not.toBeInTheDocument();
  });

  it("keeps 口径细则 collapsed for the definitions the backend really returned", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="合同金额口径"
        status="done"
        trace={{
          ...emptyTrace,
          dataSources: ["合同数据系统"],
          metricDefinitions: ["合同金额：已签署合同的含税总额，单位万元"],
          synonymMappings: ["合同金额：合同额、签约额"],
          relationships: ["多个业务主题按已发布语义模型关系关联"]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    const detail = screen.getByText("口径细则").closest("details");
    expect(detail).not.toBeNull();
    expect(detail).not.toHaveAttribute("open");
    expect(within(detail as HTMLElement).getByText("指标定义", { selector: "dt" })).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("合同金额：合同额、签约额")).toBeInTheDocument();
  });

  it("gives every source document its own line and opens the fragment dialog", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_KNOWLEDGE"
        intent="差旅费超过多少需要复核"
        status="done"
        trace={{
          ...emptyTrace,
          documents: [{
            kbName: "制度库",
            docName: "财务报销制度.pdf",
            pageNumber: "12",
            fragments: ["单笔超过 5000 元需复核。", "复核由财务共享中心执行。"]
          }]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(howLines()).toEqual([
      "在知识库“制度库”中检索与“差旅费超过多少需要复核”相关的文档，并核对来源。"
    ]);
    expect(foundLines()).toEqual([
      "在知识库“制度库”找到文档《财务报销制度.pdf》（第 12 页），引用了 2 段原文。查看片段"
    ]);
    // 片段原文留在弹窗里，列表上只给一句结论。
    expect(screen.queryByText(/单笔超过 5000 元需复核/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看来源片段：财务报销制度.pdf" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/单笔超过 5000 元需复核/)).toBeInTheDocument();
  });

  it("renders every sub-agent task and both material kinds for an orchestration", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="AGENT"
        intent="分析合同并核对制度"
        status="done"
        trace={{
          ...emptyTrace,
          tasks: [
            { id: "task-1", agentName: "问数智能体", question: "统计各区域合同金额" },
            { id: "task-2", agentName: "问知智能体", question: "查找区域考核制度" }
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
            chapter: "第三章 审批流程",
            fragments: ["完成率低于 85% 需提交改进方案。"]
          }]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(howLines()).toEqual([
      "先由问数智能体搜索数据源“经营分析库”，查找合同相关的数据表；找到后按区域汇总合同金额，"
        + "再由问知智能体在知识库“制度库”中检索与“分析合同并核对制度”相关的文档，并核对来源。"
    ]);
    expect(foundLines()).toEqual([
      "在数据源“经营分析库”找到数据表“合同主数据清单”，按“区域”对“合同金额”求和，得到 3 行结果。",
      "在知识库“制度库”找到文档《区域考核办法.pdf》（第三章 审批流程），引用了 1 段原文。查看片段"
    ]);
  });

  it("falls back to the plain strings when the backend returned no query structure", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询永安镇合同"
        status="done"
        trace={{
          ...emptyTrace,
          dataSources: ["经营分析库"],
          dataTables: ["经营分析库中的业务数据"],
          filters: [
            "合同主数据清单，记录合同编号、名称。合同乙方单位名称包含“永安镇”",
            "合同主数据清单，记录合同编号、名称。合同甲方单位名称包含“善治”"
          ],
          calculations: ["记录数：计数"],
          time: ["签订日期：2026-01-01 至 2026-06-30（按月）"]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    // 「xx中的业务数据」是占位表名，不当真实表名写进句子；重复的表注释前缀也剥掉。
    expect(howLines()).toEqual([
      "搜索数据源“经营分析库”，查找相关的数据表；找到后只看合同乙方单位含有“永安镇”、合同甲方单位含有“善治”的记录，统计记录数量，时间范围签订日期：2026-01-01 至 2026-06-30（按月）。"
    ]);
    expect(screen.queryByRole("region", { name: "查到了什么" })).not.toBeInTheDocument();
  });

  it("names the returned columns when the row count is all the backend gave", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="AGENT"
        intent="各区域经营表现"
        status="done"
        trace={{
          ...emptyTrace,
          fields: ["区域", "季度销售额（万元）", "完成率"],
          queries: [{ dimensions: [], measures: [], filters: [], time: [], rows: 3 }]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(foundLines()).toEqual([
      "查到 3 行结果，包含“区域、季度销售额（万元）、完成率”。"
    ]);
  });

  it("says plainly that nothing was queried instead of inventing steps", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation kind="AGENT" intent="今天怎么样" status="done" trace={emptyTrace} />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(howLines()).toEqual(["理解问题后直接作答，本次没有查询数据或文档。"]);
    expect(screen.queryByRole("region", { name: "查到了什么" })).not.toBeInTheDocument();
    expect(screen.queryByText("口径细则")).not.toBeInTheDocument();
  });

  it("shows only the source file name until its Markdown detail dialog is opened", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="AGENT"
        intent="合同货物有哪些"
        status="done"
        trace={{
          ...emptyTrace,
          intent: "查找合同货物条款",
          documents: [{
            kbName: "合同库",
            docName: "采购合同.pdf",
            fragments: [
              "下条款： ## 一、合同货物 &lt;table&gt;&lt;tr&gt;&lt;td&gt;货物品名&lt;/td&gt;&lt;td&gt;规格型号&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;水位监测前端产品&lt;/td&gt;&lt;td&gt;DS-2DF3C4CDYC-D/WL15&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;",
              "甲方：成都市双流区永安镇 [图片制品暂不可用] <details><summary>seal</summary>都武侯区永安镇人民政府</details> [图片制品暂不可用] <drawing id=\"im-0001\" format=\"jpg\" path=\"/api/ai/rag/kb/document-artifact?kb_id=1&amp;doc_id=2&amp;artifact_path=seal/92\" />",
              "**付款方式**：合同签订后支付 40%。"
            ]
          }]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(screen.getByText(/采购合同\.pdf/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看来源片段：采购合同.pdf" }));
    const dialog = await screen.findByRole("dialog");
    const fragmentRegion = within(dialog).getByRole("region", { name: "来源片段" });

    expect(within(fragmentRegion).getByRole("columnheader", { name: "货物品名" })).toBeInTheDocument();
    expect(within(fragmentRegion).getByRole("columnheader", { name: "规格型号" })).toBeInTheDocument();
    expect(within(fragmentRegion).getByRole("cell", { name: "水位监测前端产品" })).toBeInTheDocument();
    expect(within(fragmentRegion).getByText(/都武侯区永安镇人民政府/)).toBeInTheDocument();
    expect(within(fragmentRegion).getByText("付款方式").tagName).toBe("STRONG");
    expect(fragmentRegion.querySelector("hr")).not.toBeInTheDocument();
    expect(within(fragmentRegion).queryByText(/<table>|<td>/)).not.toBeInTheDocument();
    expect(within(fragmentRegion).queryByText(/<details>|<summary>|<drawing/)).not.toBeInTheDocument();
    expect(within(fragmentRegion).queryByText(/\bseal\b/)).not.toBeInTheDocument();
    expect(within(fragmentRegion).queryByText(/##/)).not.toBeInTheDocument();
  });
});
