import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataHubResultTable } from "./DataHubResultTable";
import { copyText } from "@/services/clipboard";
import { downloadCsv } from "@/services/dataHubTableExport";
import type { DataHubTableResult } from "@/types/dataHub";

vi.mock("@/services/clipboard", () => ({ copyText: vi.fn().mockResolvedValue(true) }));
vi.mock("@/services/dataHubTableExport", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/dataHubTableExport")>(),
  downloadCsv: vi.fn()
}));

const table: DataHubTableResult = {
  columns: [{ key: "name", title: "名称" }, { key: "value", title: "金额" }],
  rows: Array.from({ length: 45 }, (_, index) => ({ name: `记录${index + 1}`, value: index + 1 })),
  totalRows: 100,
  tableIndex: 0
};
const dataRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

beforeEach(() => vi.clearAllMocks());

describe("DataHubResultTable", () => {
  it("previews five rows then pages all returned rows without mounting the whole table", () => {
    render(<DataHubResultTable table={table} compact />);
    expect(dataRows()).toHaveLength(5);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("已返回 45 行，结果共 100 行")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看全部 45 行" }));
    expect(dataRows()).toHaveLength(20);
    fireEvent.click(within(screen.getByRole("list")).getByTitle("2"));
    expect(dataRows()).toHaveLength(20);
    expect(dataRows()[0]).toHaveTextContent("记录21");
    expect(dataRows()[0].firstElementChild).toHaveTextContent("21");
    expect(screen.queryByText("记录1", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("list")).getByTitle("3"));
    expect(dataRows()).toHaveLength(5);
    expect(dataRows()[0]).toHaveTextContent("记录41");
    fireEvent.click(screen.getByRole("button", { name: "收起结果表" }));
    expect(dataRows()).toHaveLength(5);
    expect(dataRows()[0]).toHaveTextContent("记录1");
  });

  it("copies and downloads all returned rows regardless of the visible page", async () => {
    const onStatus = vi.fn();
    render(<DataHubResultTable table={table} compact onStatus={onStatus} />);
    fireEvent.click(screen.getByRole("button", { name: "查看全部 45 行" }));
    fireEvent.click(within(screen.getByRole("list")).getByTitle("2"));
    fireEvent.click(screen.getByRole("button", { name: "复制表格" }));
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith("已复制 45 行表格"));
    fireEvent.click(screen.getByRole("button", { name: "下载表格" }));
    const csv = vi.mocked(copyText).mock.calls[0][0];
    expect(csv).toContain("记录1,");
    expect(csv).toContain("记录45,");
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toBe(csv);
    expect(screen.getByText(/不含尚未返回的数据/)).toBeInTheDocument();
    expect(screen.queryByText(/导出.*全部.*100/)).not.toBeInTheDocument();
  });

  it("preserves the legacy row limit and distinguishes unknown totals and empty returns", () => {
    const { rerender } = render(<DataHubResultTable table={table} />);
    expect(dataRows()).toHaveLength(20);
    rerender(<DataHubResultTable table={table} rowLimit={8} />);
    expect(dataRows()).toHaveLength(8);
    rerender(<DataHubResultTable table={{ ...table, totalRowsKnown: false }} compact />);
    expect(screen.queryByText(/结果共/)).not.toBeInTheDocument();
    rerender(<DataHubResultTable table={{ ...table, rows: [], totalRows: 0 }} compact />);
    expect(dataRows()).toHaveLength(0);
    expect(screen.getByText("本次返回 0 行数据。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /查看全部/ })).not.toBeInTheDocument();
  });
});
