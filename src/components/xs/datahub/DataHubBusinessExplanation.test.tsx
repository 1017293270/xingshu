import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataHubBusinessExplanation } from "./DataHubBusinessExplanation";

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

  it("groups repeated query-scope descriptions once and lists the concrete rules", async () => {
    const user = userEvent.setup();
    render(
      <DataHubBusinessExplanation
        kind="ASK_DATA"
        intent="查询永安镇合同"
        status="done"
        trace={{
          intent: "查询永安镇合同",
          tasks: [],
          steps: ["已获得结果"],
          dataSources: [],
          dataTables: [],
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
          synonymMappings: ["本次未返回可复核的同义词映射"],
          time: [],
          documents: []
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /查询过程/ }));
    const fields = screen.getByRole("region", { name: "业务字段" });
    const filters = screen.getByRole("region", { name: "筛选条件" });

    expect(within(fields).getByText("合同主数据清单，记录合同编号、名称、年度")).toBeInTheDocument();
    expect(within(fields).getByText("合同编号，合同的业务唯一标识")).toBeInTheDocument();
    expect(within(fields).getByText("合同名称")).toBeInTheDocument();
    expect(within(filters).getByText("合同乙方单位名称包含“永安镇”")).toBeInTheDocument();
    expect(within(fields).getByText("3 项")).toBeInTheDocument();
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
