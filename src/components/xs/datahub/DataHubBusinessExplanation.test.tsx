import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataHubBusinessExplanation } from "./DataHubBusinessExplanation";
import type { DataHubBusinessTrace } from "@/types/dataHub";

const emptyTrace: DataHubBusinessTrace = {
  intent: "查询合同付款情况",
  tasks: [],
  steps: ["已汇总并复核最终结果"],
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

/** 业务口径是 dt/dd 定义表，取某一行的内容用于断言。 */
function scopeValue(label: string) {
  const scope = screen.getByRole("region", { name: "业务口径" });
  return within(scope).getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? "";
}

describe("DataHubBusinessExplanation", () => {
  it("keeps a running query open while execution records arrive", () => {
    const trace = {
      intent: "查询合同付款情况",
      tasks: [],
      steps: ["正在理解问题"],
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
    const { rerender } = render(
      <DataHubBusinessExplanation kind="ASK_DATA" intent="查询合同付款情况" status="running" trace={trace} />
    );

    expect(screen.getByRole("button", { name: /查询过程/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("正在理解问题")).toBeInTheDocument();

    rerender(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询合同付款情况"
        status="running"
        trace={{ ...trace, steps: [...trace.steps, "已确认数据范围：经营分析库"] }}
      />
    );
    expect(screen.getByText("已确认数据范围：经营分析库")).toBeInTheDocument();
  });

  it("lists every business rule as one label row and folds the long definitions away", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询永安镇合同"
        status="done"
        trace={{
          ...emptyTrace,
          intent: "查询永安镇合同",
          steps: ["已获得结果"],
          dataSources: ["经营分析库"],
          fields: [
            "记录数",
            "合同主数据清单，记录合同编号、名称、年度。合同编号，合同的业务唯一标识",
            "合同主数据清单，记录合同编号、名称、年度。合同名称"
          ],
          filters: [
            "合同主数据清单，记录合同编号、名称、年度。合同乙方单位名称包含“永安镇”",
            "合同主数据清单，记录合同编号、名称、年度。合同甲方单位名称包含“善治”"
          ],
          calculations: ["记录数：计数"],
          relationships: ["单一业务主题，本次没有跨主题关联"],
          metricDefinitions: ["记录数：采用企业语义模型已发布的指标口径"],
          synonymMappings: ["合同金额：合同额、签约额"],
          time: ["签订日期：2026-01-01 至 2026-06-30（按月）"]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    // 字段与筛选里重复的表说明只出现在「数据口径」一行，正文不再逐条重复。
    expect(scopeValue("数据口径")).toBe("经营分析库 · 合同主数据清单，记录合同编号、名称、年度");
    expect(scopeValue("业务字段")).toBe("记录数、合同编号，合同的业务唯一标识、合同名称");
    expect(scopeValue("筛选条件")).toBe("合同乙方单位名称包含“永安镇”、合同甲方单位名称包含“善治”");
    expect(scopeValue("时间范围")).toBe("签订日期：2026-01-01 至 2026-06-30（按月）");
    expect(scopeValue("计算逻辑")).toBe("记录数：计数");

    // 偏长的定义类口径收进「口径细则」，默认不占版面。
    const detail = screen.getByText("口径细则").closest("details");
    expect(detail).not.toBeNull();
    expect(detail).not.toHaveAttribute("open");
    expect(within(detail as HTMLElement).getByText("指标定义", { selector: "dt" })).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("同义词映射", { selector: "dt" })).toBeInTheDocument();
    expect(within(detail as HTMLElement).getByText("关联关系", { selector: "dt" })).toBeInTheDocument();
    expect(screen.queryByText("知识库范围", { selector: "dt" })).not.toBeInTheDocument();
  });

  it("shows the retrieval scope only when the answer stands on documents", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_KNOWLEDGE"
        intent="差旅费超过多少需要复核"
        status="done"
        trace={{
          ...emptyTrace,
          intent: "查询差旅复核标准",
          steps: ["已从 2 个知识库复核 2 份文档"],
          documents: [
            { kbName: "制度库", docName: "财务报销制度.pdf", fragments: ["单笔超过 5000 元需复核。"] },
            { kbName: "合同库", docName: "采购合同.pdf", fragments: ["付款方式：签订后支付 40%。"] }
          ]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(scopeValue("知识库范围")).toBe("制度库 · 合同库");
    expect(scopeValue("文档命中")).toBe("2 份文档");
    expect(screen.queryByText("数据口径", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.queryByText("业务字段", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.queryByText("口径细则")).not.toBeInTheDocument();
  });

  it("keeps both the data and the retrieval scope for a mixed orchestration", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="AGENT"
        intent="分析合同并核对制度"
        status="done"
        trace={{
          ...emptyTrace,
          steps: ["已汇总并复核最终结果"],
          dataSources: ["经营分析库"],
          dataTables: ["合同主数据清单"],
          fields: ["合同金额"],
          documents: [
            { kbName: "制度库", docName: "财务报销制度.pdf", fragments: ["单笔超过 5000 元需复核。"] }
          ]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(scopeValue("数据口径")).toBe("经营分析库 · 合同主数据清单");
    expect(scopeValue("业务字段")).toBe("合同金额");
    expect(scopeValue("知识库范围")).toBe("制度库");
    expect(scopeValue("文档命中")).toBe("1 份文档");
  });

  it("hides the whole scope block when the trace carries no business rules", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation kind="AGENT" intent="今天怎么样" status="done" trace={emptyTrace} />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    expect(screen.queryByRole("region", { name: "业务口径" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /任务执行记录/ })).toBeInTheDocument();
  });

  it("folds the overflowing fields behind 等 N 项 and wraps long values inside the row", async () => {
    const user = userEvent.setup();
    const fields = Array.from({ length: 9 }, (_, index) => `业务字段${index + 1}`);
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询字段很多的结果"
        status="done"
        trace={{ ...emptyTrace, fields }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));

    const row = screen.getByText("业务字段", { selector: "dt" }).closest(".datahub-business-explanation__scope-row");
    expect(row).not.toBeNull();
    // 长内容靠 dd 的 min-width:0 / overflow-wrap 换行，行本身不做横向滚动。
    expect(row?.querySelector("dd")).toBeInTheDocument();
    expect(row?.querySelector("dd")?.firstChild?.textContent)
      .toBe("业务字段1、业务字段2、业务字段3、业务字段4、业务字段5、业务字段6");

    const more = within(row as HTMLElement).getByText("等 9 项");
    expect(more.closest("details")).not.toHaveAttribute("open");

    await user.click(more);

    expect(more.closest("details")).toHaveAttribute("open");
    expect(within(row as HTMLElement).getByText("业务字段7、业务字段8、业务字段9")).toBeInTheDocument();
  });

  it("shows only the source file name until its Markdown detail dialog is opened", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="AGENT"
        intent="合同货物有哪些"
        status="done"
        trace={{
          intent: "查找合同货物条款",
          tasks: [],
          steps: ["已从知识库复核 1 份文档"],
          dataSources: [],
          dataTables: [],
          fields: [],
          filters: [],
          calculations: [],
          relationships: [],
          metricDefinitions: [],
          synonymMappings: [],
          time: [],
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

    expect(screen.queryByRole("heading", { name: "任务拆解" })).not.toBeInTheDocument();
    expect(screen.getByText("采购合同.pdf")).toBeInTheDocument();
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
