import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataHubCitationChips, citationLocationText } from "./DataHubCitationChips";
import type { DataHubCitationDocument } from "@/types/dataHub";

function citation(overrides: Partial<DataHubCitationDocument> = {}): DataHubCitationDocument {
  return {
    docId: "doc-1",
    docKey: "key-1",
    kbId: "7",
    kbName: "制度库",
    docName: "报销管理办法",
    sourceAvailable: true,
    fragments: [],
    ...overrides
  };
}

describe("DataHubCitationChips", () => {
  it("默认收合为一行计数，点开后展示分组 chips", async () => {
    const user = userEvent.setup();
    render(
      <DataHubCitationChips
        citations={[citation(), citation({ docId: "doc-2", docName: "差旅制度" })]}
        onOpen={() => {}}
      />
    );

    const toggle = screen.getByRole("button", { name: /引用 2 篇文档/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("报销管理办法")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("制度库")).toBeInTheDocument();
    expect(screen.getByText("报销管理办法")).toBeInTheDocument();
    expect(screen.getByText("差旅制度")).toBeInTheDocument();
  });

  it("章节页码随 chip 展示，原文不可用的 chip 禁点", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <DataHubCitationChips
        defaultCollapsed={false}
        citations={[
          citation({ chapter: "第三章 报销流程", pageNumber: "12" }),
          citation({ docId: "doc-3", docName: "旧版制度", sourceAvailable: false })
        ]}
        onOpen={onOpen}
      />
    );

    expect(screen.getByText("第三章 报销流程 · 第12页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /原文不可用：旧版制度/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /打开原文：报销管理办法/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].docId).toBe("doc-1");
  });

  it("citationLocationText 单独缺章或缺页都能出徽标，全缺为空", () => {
    expect(citationLocationText(citation({ pageNumber: "3" }))).toBe("第3页");
    expect(citationLocationText(citation({ chapter: "采购管理" }))).toBe("采购管理");
    expect(citationLocationText(citation({ pageNumber: "第5页" }))).toBe("第5页");
    expect(citationLocationText(citation())).toBe("");
  });
});
