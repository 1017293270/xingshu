import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.useRealTimers());

describe("DataHubBusinessExplanation", () => {
  it("uses the table dropdown without duplicating data cards or losing document sources", () => {
    render(<DataHubBusinessExplanation kind="AGENT" intent="合同数据与依据" status="done"
      resultTables={<section aria-label="查询结果表">结果表入口</section>}
      trace={{ ...emptyTrace,
        queries: [{ table: "合同统计表", dataSource: "合同系统", dimensions: ["供应商"],
          measures: [{ label: "合同数量", aggregation: "计数" }], filters: [], time: [], rows: 3,
          preview: [{ label: "供应商 A", value: "12 份" }] }],
        documents: [{ kbName: "合同库", docName: "采购合同.pdf", fragments: ["合同条款。"] }]
      }} />);
    fireEvent.click(screen.getByRole("button", { name: /查询过程/ }));
    const results = screen.getByRole("region", { name: "查询结果" });
    expect(within(results).getByRole("region", { name: "查询结果表" })).toHaveTextContent("结果表入口");
    expect(within(results).getByRole("button", { name: "查看来源片段：采购合同.pdf" })).toBeVisible();
    expect(results).not.toHaveTextContent("供应商 A");
    expect(results).not.toHaveTextContent("等待查询结果");
  });

  it("ticks query time and nests execution details inside the sticky collapse", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { rerender } = render(
      <DataHubBusinessExplanation kind="ASK_DATA" intent="合同数量" status="running" startedAt={10_000}>
        <details><summary>执行过程</summary>查询详情</details>
      </DataHubBusinessExplanation>
    );
    act(() => vi.advanceTimersByTime(3000));
    const toggle = screen.getByRole("button", { name: "查询过程 （3秒）" });
    expect(screen.getByText("执行过程").closest(".datahub-business-explanation__body")).not.toBeNull();
    rerender(<DataHubBusinessExplanation kind="ASK_DATA" intent="合同数量" status="done" durationMs={3000} />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("查询过程 （已完成，3秒）");
    expect(toggle).toHaveTextContent("已完成 · 3秒");
    fireEvent.click(toggle);
    rerender(<DataHubBusinessExplanation kind="ASK_DATA" intent="合同数量" status="running" startedAt={13_000} />);
    rerender(<DataHubBusinessExplanation kind="ASK_DATA" intent="合同数量" status="done" durationMs={1000} />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });


  it("separates knowledge sources and document results without repeating the question", async () => {
    const user = userEvent.setup();
    const name = "采购合同szsz-2024-cg0007丽江市古城区城市运行管理服务平台系统建设项目采购合同.pdf";
    const libraries = ["Alpha MinerU纯解析验收20260826b", "Alpha MinerU加权调度验收20260825"];
    render(<DataHubBusinessExplanation kind="ASK_KNOWLEDGE" intent="这个合同的付款条件是怎么样的" status="done"
      trace={{ ...emptyTrace, documents: libraries.map((kbName) => ({ kbName, docName: name,
        pageNumber: "15", chapter: "第五章", fragments: ["合同约定的付款条件。"] })) }} />);
    await user.click(screen.getByRole("button", { name: /查询过程/ }));
    const conditions = screen.getByRole("region", { name: "查询条件" });
    expect(within(conditions).getAllByRole("listitem").map((item) => item.textContent)).toEqual(libraries);
    expect(screen.queryByText(/怎么查|查到了什么|相关的文档|并核对来源|这个合同的付款条件/)).not.toBeInTheDocument();
    const result = screen.getByRole("region", { name: "查询结果" });
    expect(within(result).getByRole("heading", { name: "查询结果" })).toBeInTheDocument();
    const documents = within(result).getAllByRole("button", { name: `查看来源片段：${name}` });
    expect(documents).toHaveLength(2);
    expect(documents[0]).toHaveTextContent(libraries[0]);
    expect(documents[0]).not.toHaveTextContent(libraries[1]);
    expect(documents[1]).toHaveTextContent(libraries[1]);
    expect(within(documents[0]).getByTitle(name)).toHaveTextContent(name);
    expect(documents[0]).toHaveTextContent("第 15 页");
    expect(screen.queryByText("合同约定的付款条件。")).not.toBeInTheDocument();
    await user.click(documents[0]);
    expect(await screen.findByRole("dialog")).toHaveTextContent("合同约定的付款条件。");
  });

  it("renders query fields and result values at distinct visual levels", async () => {
    const user = userEvent.setup();
    render(<DataHubBusinessExplanation kind="ASK_DATA" intent="合同统计" status="done" trace={{ ...emptyTrace,
      queries: [{ dataSource: "合同系统", table: "合同表", filters: ["金额小于60"], dimensions: ["供应商"],
        measures: [{ label: "合同数量", aggregation: "计数" }], time: ["2026年上半年"], rows: 3,
        preview: [{ label: "供应商 A", value: "12 份" }, { label: "供应商 B", value: "8 份" }] }] }} />);
    await user.click(screen.getByRole("button", { name: /查询过程/ }));
    const conditions = screen.getByRole("region", { name: "查询条件" });
    const steps = within(conditions).getByRole("list", { name: "查询步骤" });
    expect(steps).toHaveTextContent("限定查询范围");
    expect(steps).toHaveTextContent("只保留金额小于60的记录");
    expect(steps).toHaveTextContent("将“供应商”相同的记录归为一组");
    const details = within(conditions).getByText("查看查询细节").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(within(conditions).getByText("合同数量：计数")).not.toBeVisible();
    await user.click(within(conditions).getByText("查看查询细节"));
    expect(details).toHaveAttribute("open");
    for (const text of ["合同系统", "合同表", "金额小于60", "供应商", "合同数量：计数", "2026年上半年"]) {
      expect(within(conditions).getByText(text)).toBeInTheDocument();
    }
    const result = screen.getByRole("region", { name: "查询结果" });
    expect(result).toHaveTextContent("3 行");
    expect(result).toHaveTextContent("供应商 A12 份");
    expect(result).toHaveTextContent("供应商 B8 份");
    expect(result).not.toHaveTextContent("金额小于60");
  });

  it("adds only real facts as a running query receives data", () => {
    const { rerender } = render(<DataHubBusinessExplanation kind="ASK_KNOWLEDGE" intent="付款条件" status="running" trace={emptyTrace} />);
    expect(screen.getByRole("button", { name: /查询过程/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("等待查询结果")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "查询条件" })).not.toBeInTheDocument();
    rerender(<DataHubBusinessExplanation kind="ASK_KNOWLEDGE" intent="付款条件" status="running" trace={{ ...emptyTrace,
      documents: [{ kbName: "合同库", docName: "采购合同.pdf", fragments: [] }] }} />);
    expect(screen.getByRole("region", { name: "查询条件" })).toHaveTextContent("合同库");
    expect(screen.getByRole("region", { name: "查询结果" })).toHaveTextContent("采购合同.pdf");
    expect(screen.queryByText(/已复核|全文检索|混合检索/)).not.toBeInTheDocument();
  });

  it("keeps unavailable information honest and real definitions collapsed", async () => {
    const user = userEvent.setup();
    render(<DataHubBusinessExplanation kind="AGENT" intent="合同信息" status="done" trace={{ ...emptyTrace,
      steps: ["已理解问题", "已汇总并复核最终结果"], filters: ["本次未返回可复核的筛选条件"],
      metricDefinitions: ["合同金额：已签署合同的含税总额，单位万元"],
      synonymMappings: ["本次未返回可复核的同义词映射"] }} />);
    await user.click(screen.getByRole("button", { name: /查询过程/ }));
    expect(screen.getByText("未返回查询结果")).toBeInTheDocument();
    expect(screen.queryByText(/已理解问题|已汇总并复核|未返回可复核/)).not.toBeInTheDocument();
    const detail = screen.getByText("口径细则").closest("details");
    expect(detail).not.toHaveAttribute("open");
    expect(detail).toHaveTextContent("合同金额：已签署合同的含税总额，单位万元");
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
