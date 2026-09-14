import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { describe, expect, it, vi } from "vitest";
import type { DataHubQueryProcess } from "@/services/dataHubQueryProcessPresenter";
import { normalizeDataHubTableResult } from "@/services/dataHubAskDataPresenter";
import { buildDataHubQueryProcess } from "@/services/dataHubQueryProcessPresenter";
import { projectDataHubExecutionEvents } from "@/services/dataHubExecutionProjector";
import type { DataHubStreamEvent } from "@/types/dataHub";
import { DataHubBusinessExplanation } from "./DataHubBusinessExplanation";
import { DataHubQueryResults } from "./DataHubQueryResults";

const table = normalizeDataHubTableResult({ columns: [{ key: "name", title: "供应商" }],
  rows: [{ name: "乙公司" }, { name: "甲公司" }], totalRows: 2,
  query: { measures: ["amount"] }, annotation: { measures: { amount: { shortTitle: "金额" } } } })!;

describe("compact query results", () => {
  it("keeps one stable user-facing progress message across repeated query steps until a result arrives", () => {
    const events: DataHubStreamEvent[] = [];
    const { rerender } = render(<DataHubQueryResults process={{ results: [] }} status="running" />);
    const messages: string[] = [];
    for (const [index, status] of ["running", "success", "running", "success"].entries()) {
      events.push({ type: "activity", sessionId: "child", parentSessionId: "root", content: {
        activityId: `load-${Math.floor(index / 2)}`, kind: "tool", action: "load_data",
        label: "执行数据查询", status, summary: status === "success" ? "查询成功，结果见下方" : undefined, startedAt: "2026-09-08T00:00:00Z"
      } });
      rerender(<DataHubQueryResults process={buildDataHubQueryProcess(projectDataHubExecutionEvents(events, { mainSessionId: "root" }), events)} status="running" />);
      messages.push(screen.getByRole("status").textContent || "");
    }
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toMatch(/已完成|尚未收到|结果见下方/);
    events.push({ type: "table", sessionId: "child", parentSessionId: "root", content: table });
    rerender(<DataHubQueryResults process={buildDataHubQueryProcess(projectDataHubExecutionEvents(events, { mainSessionId: "root" }), events)} status="running" />);
    expect(screen.getByRole("status")).toHaveTextContent("查到了 1 张结果表");
    expect(screen.getByRole("status")).toHaveTextContent("下面是查询结果");
    expect(screen.getByRole("cell", { name: "乙公司" })).toBeVisible();
  });
  it("shows three real results in source order and reveals the rest on request", () => {
    const process: DataHubQueryProcess = { results: [
      { kind: "table", key: "a", status: "done", table, dataSource: "合同库" },
      { kind: "table", key: "b", status: "done", table: { columns: [{ key: "n", title: "合同数量" }], rows: [{ n: 0 }], totalRows: 1 } },
      { kind: "table", key: "c", status: "done", table: { columns: [], rows: [], totalRows: 0 } },
      { kind: "table", key: "d", status: "done", table: { ...table, title: "第四次查询" } }
    ] };
    render(<DataHubQueryResults process={process} status="running" />);
    expect(screen.getByRole("status")).toHaveTextContent("查到了 2 张结果表、1 项数值结果，下面是查询结果。");
    expect(screen.getByRole("status")).toHaveTextContent("另有 1 项结果为空。");
    expect(screen.queryByText(/按企业语义模型定义计算/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText("本次返回 0 行数据。")).toBeVisible();
    expect(screen.getByText("合同数量").nextElementSibling).toHaveTextContent("0");
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["1", "乙公司", "2", "甲公司"]);
    expect(screen.queryByText("第四次查询")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看其余 1 项结果" }));
    expect(screen.getByRole("heading", { name: "第四次查询" })).toBeVisible();
  });

  it("previews confirmed fragments, keeps all original fragments accessible and opens the right document", async () => {
    const onOpen = vi.fn();
    const fragment = "这是已确认的引用原文。".repeat(30);
    const document = { kbId: "7", docId: "42", docName: "合同条款.pdf", kbName: "合同资料库",
      sourceAvailable: true, fragments: [fragment, "第二段完整依据。", "第三段依据。", "第四段依据。", "![附件说明](https://example.com/private.png)"] };
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <DataHubQueryResults process={{ results: [{ key: "doc", kind: "citation", status: "done", document }] }}
        status="done" onOpenDocument={onOpen} />
    </ConfigProvider>);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("找到了 1 份引用资料，下面是相关资料。");
    expect(screen.queryByText(fragment)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看来源片段：合同条款.pdf" }));
    const modal = screen.getByRole("dialog");
    await waitFor(() => expect(within(modal).getByText(fragment)).toBeVisible());
    expect(modal).toHaveTextContent("第四段依据。");
    expect(modal).toHaveTextContent("附件说明");
    expect(modal.querySelector("img")).toBeNull();
    expect(modal.querySelector('a[href="https://example.com/private.png"]')).toBeNull();
    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "查看原文：合同条款.pdf" }));
    expect(onOpen).toHaveBeenCalledWith(document, [document]);
  });

  it("does not describe an empty result as a found table", () => {
    render(<DataHubQueryResults process={{ results: [{ key: "empty", kind: "table", status: "done", table: { columns: [], rows: [], totalRows: 0 } }] }} status="done" />);
    expect(screen.getByRole("status")).toHaveTextContent("暂未查到符合条件的数据");
    expect(screen.getByRole("status")).not.toHaveTextContent("张结果表");
  });

  it.each([
    { dates: ["2026-08-08T00:00:00.000", "2026-09-08T23:59:59.999"], expected: "创建时间：2026-08-08 至 2026-09-08" },
    { dates: ["2026-08-08T00:00:00.000Z", "2026-09-08T23:59:59.999Z"], expected: "创建时间：2026-08-08 00:00:00.000Z 至 2026-09-08 23:59:59.999Z" }
  ])("makes query dates readable without changing explicit time zones: $expected", ({ dates, expected }) => {
    const result = normalizeDataHubTableResult({ columns: ["类别"], rows: [["设施维修"]],
      query: { timeDimensions: [{ dimension: "Events.createdAt", dateRange: dates }] },
      annotation: { timeDimensions: { "Events.createdAt": { shortTitle: "创建时间" } } } })!;
    const { container } = render(<DataHubQueryResults process={{ results: [{ key: "date", kind: "table", status: "done", table: result }] }} status="done" />);
    expect(container.querySelector(".datahub-query-result__conditions summary")).toHaveTextContent(expected);
    expect(result.business?.query?.time?.[0]).toContain(dates[0]);
  });

  it("updates an open quote as evidence arrives and keeps each fragment's page", () => {
    const first = { kbId: "7", docId: "42", docName: "合同.pdf", pageNumber: "1", sourceAvailable: true, fragments: ["首页证据"] };
    const second = { ...first, pageNumber: "8", fragments: ["后续证据"] };
    const result: DataHubQueryProcess["results"][number] = { key: "doc", kind: "citation", status: "done", document: first,
      documentSources: [{ sessionId: "a", document: first }] };
    const { rerender } = render(<DataHubQueryResults process={{ results: [result] }} status="running" />);
    fireEvent.click(screen.getByRole("button", { name: "查看来源片段：合同.pdf" }));
    rerender(<DataHubQueryResults process={{ results: [{ ...result, document: { ...first, fragments: ["首页证据", "后续证据"] },
      documentSources: [{ sessionId: "a", document: first }, { sessionId: "b", document: second }] }] }} status="running" />);
    const modal = screen.getByRole("dialog");
    expect(modal).toHaveTextContent("后续证据");
    expect(within(modal).getByText("首页证据").closest(".datahub-query-result__fragment")).toHaveTextContent("第1页");
    expect(within(modal).getByText("后续证据").closest(".datahub-query-result__fragment")).toHaveTextContent("第8页");
  });

  it("retains results through terminal states and respects the user's collapse", () => {
    const process: DataHubQueryProcess = { results: [{ kind: "table", key: "a", status: "done", table }] };
    const { rerender } = render(<DataHubBusinessExplanation kind="AGENT" intent="合同" status="running" queryProcess={process} />);
    const toggle = screen.getByRole("button", { name: /查询过程/ });
    for (const status of ["done", "error", "cancelled"] as const) {
      rerender(<DataHubBusinessExplanation kind="AGENT" intent="合同" status={status} queryProcess={process} />);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("cell", { name: "乙公司" })).toBeVisible();
    }
    fireEvent.click(toggle);
    rerender(<DataHubBusinessExplanation kind="AGENT" intent="合同" status="running" queryProcess={process} />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
