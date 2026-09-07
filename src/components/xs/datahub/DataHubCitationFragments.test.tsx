import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataHubCitationFragments } from "./DataHubCitationFragments";
import { loadDataHubKnowledgeDocumentChunks } from "@/services/dataHubKnowledgeService";
import type { DataHubCitationDocument } from "@/types/dataHub";

vi.mock("@/services/dataHubKnowledgeService", () => ({
  loadDataHubKnowledgeDocumentChunks: vi.fn()
}));

const loadChunks = vi.mocked(loadDataHubKnowledgeDocumentChunks);

function citation(overrides: Partial<DataHubCitationDocument> = {}): DataHubCitationDocument {
  return {
    docId: "9001",
    docKey: "采购合同.pdf",
    kbId: "7",
    kbName: "合同库",
    docName: "采购合同szsz-2024-cg0007.pdf",
    chapter: "第二章 结算方式",
    pageNumber: "12",
    sourceAvailable: true,
    fragments: ["合同价款按季度结算，乙方开具增值税专用发票后十五个工作日内付款。"],
    ...overrides
  };
}

function chunks() {
  return {
    docId: "9001",
    docName: "采购合同szsz-2024-cg0007.pdf",
    chunks: [
      { id: "c-0", order: 0, tokens: 128, content: "第一章 总则。本合同由甲乙双方签订。" },
      {
        id: "c-1",
        order: 1,
        tokens: 256,
        content: "第二章 结算方式。合同价款按季度结算，乙方开具增值税专用发票后十五个工作日内付款。"
      },
      { id: "c-2", order: 2, content: "第三章 违约责任。逾期交付按日万分之五计违约金。" }
    ]
  };
}

function renderModal(overrides: Partial<Parameters<typeof DataHubCitationFragments>[0]> = {}) {
  const onClose = vi.fn();
  const onOpen = vi.fn();
  render(
    <DataHubCitationFragments
      open
      citation={citation()}
      {...overrides}
      onClose={onClose}
      onOpen={onOpen}
    />
  );
  return { onClose, onOpen };
}

describe("DataHubCitationFragments", () => {
  beforeEach(() => {
    loadChunks.mockReset();
  });

  it("展示回答引用的片段，并按切块顺序列出全部片段", async () => {
    loadChunks.mockResolvedValue(chunks());
    renderModal();

    expect(screen.getByText("采购合同szsz-2024-cg0007.pdf")).toBeInTheDocument();
    expect(screen.getByText("合同库 · 第二章 结算方式 · 第12页")).toBeInTheDocument();
    expect(screen.getByText("读取切块中…")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());
    expect(loadChunks).toHaveBeenCalledTimes(1);
    expect(loadChunks.mock.calls[0][0].docId).toBe("9001");
    expect(screen.getByText("共 3 个片段")).toBeInTheDocument();
    expect(screen.getByText("128 tokens")).toBeInTheDocument();
    expect(screen.getByText(/第三章 违约责任/)).toBeInTheDocument();
  });

  it("被回答引用的切块打标并排到最前", async () => {
    loadChunks.mockResolvedValue(chunks());
    renderModal();

    await waitFor(() => expect(screen.getByText("回答引用")).toBeInTheDocument());
    const meta = Array.from(
      document.querySelectorAll(".knowledge-citation-fragments__chunk-meta")
    ).map((node) => node.textContent ?? "");
    expect(meta[0]).toContain("#2");
    expect(meta[0]).toContain("回答引用");
    expect(meta[1]).toContain("#1");
    expect(document.querySelectorAll(".ant-tag")).toHaveLength(1);
  });

  it("关键字过滤只留下命中的切块", async () => {
    const user = userEvent.setup();
    loadChunks.mockResolvedValue(chunks());
    renderModal();

    await waitFor(() => expect(screen.getByText("共 3 个片段")).toBeInTheDocument());
    await user.type(screen.getByLabelText("筛选片段"), "违约");

    await waitFor(() => expect(screen.getByText("1 / 3 个片段")).toBeInTheDocument());
    expect(screen.getByText(/第三章 违约责任/)).toBeInTheDocument();
    expect(screen.queryByText(/第一章 总则/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("筛选片段"));
    await waitFor(() => expect(screen.getByText("共 3 个片段")).toBeInTheDocument());
    expect(screen.getByText(/第一章 总则/)).toBeInTheDocument();
  });

  it("没有切块制品时给空态，读取失败时显示后端说法", async () => {
    loadChunks.mockResolvedValue({ docId: "9001", docName: "采购合同", chunks: [] });
    const { unmount } = render(
      <DataHubCitationFragments open citation={citation()} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText("暂无切块制品")).toBeInTheDocument());
    unmount();

    loadChunks.mockRejectedValue(new Error("文档不存在或已被删除"));
    render(<DataHubCitationFragments open citation={citation()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("文档不存在或已被删除")).toBeInTheDocument());
  });

  it("没有引用片段时给灰字提示，打开原文走 onOpen，原文不可用时禁用", async () => {
    loadChunks.mockResolvedValue(chunks());
    const { onOpen } = renderModal({ citation: citation({ fragments: [] }) });

    await waitFor(() => expect(screen.getByText("本次回答未附带原文片段")).toBeInTheDocument());
    expect(screen.queryByText("回答引用")).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /打开原文/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].docId).toBe("9001");
  });

  it("原文不可用时打开原文按钮禁用，关闭按钮回调 onClose", async () => {
    loadChunks.mockResolvedValue(chunks());
    const { onClose } = renderModal({ citation: citation({ sourceAvailable: false }) });

    expect(screen.getByRole("button", { name: /打开原文/ })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: /关\s*闭/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
