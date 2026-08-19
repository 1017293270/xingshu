import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDataHubTablesCsv,
  countDataHubTableRows,
  exportDataHubTablesCsv,
  formatDataHubTableCell,
  sanitizeCsvBasename
} from "./dataHubTableExport";
import type { DataHubTableResult } from "@/types/dataHub";

const sampleTable: DataHubTableResult = {
  columns: [
    { key: "WechatyProjectInfo.projectName", title: "微信机器人项目信息表 项目名称表" },
    { key: "WechatyConsulationRecord.count", title: "微信机器人咨询记录表 记录数", type: "number" }
  ],
  rows: [
    {
      "WechatyProjectInfo.projectName": "六角井社区",
      "WechatyConsulationRecord.count": 262
    }
  ],
  totalRows: 1,
  source: "cube",
  tableIndex: 0
};

describe("dataHubTableExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("formats empty cells and object values for table preview and csv", () => {
    expect(formatDataHubTableCell("")).toBe("-");
    expect(formatDataHubTableCell(null)).toBe("-");
    expect(formatDataHubTableCell({ city: "上海" })).toBe("{\"city\":\"上海\"}");
    expect(formatDataHubTableCell(262)).toBe("262");
  });

  it("builds csv with localized headers and counts exported rows", () => {
    const csv = buildDataHubTablesCsv([sampleTable]);

    expect(csv).toContain("项目名称,记录数");
    expect(csv).toContain("六角井社区,262");
    expect(countDataHubTableRows([sampleTable])).toBe(1);
    expect(sanitizeCsvBasename("华东区 Q1/销售排行?")).toBe("华东区 Q1销售排行");
  });

  it("downloads a utf-8 csv when rows exist and skips empty tables", () => {
    const createObjectURL = vi.fn<(object: Blob | MediaSource) => string>(() => "blob:xingshu-csv");
    const revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;

    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.setSystemTime(new Date("2026-08-17T08:00:00.000Z"));

    expect(exportDataHubTablesCsv([{ ...sampleTable, rows: [] }], "空表")).toBe(0);
    expect(createObjectURL).not.toHaveBeenCalled();

    expect(exportDataHubTablesCsv([sampleTable], "导出咨询统计")).toBe(1);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:xingshu-csv");

    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  });
});
