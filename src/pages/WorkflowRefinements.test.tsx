import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablePage } from "./TablePage";
import { WritingPage } from "./WritingPage";

const serviceMocks = vi.hoisted(() => ({
  createTableFromPrompt: vi.fn(),
  listRecentTables: vi.fn(),
  createWritingDraft: vi.fn(),
  listWritingDocuments: vi.fn(),
  listWritingScenes: vi.fn()
}));

vi.mock("@/services/tableService", () => ({
  createTableFromPrompt: serviceMocks.createTableFromPrompt,
  listRecentTables: serviceMocks.listRecentTables
}));

vi.mock("@/services/writingService", () => ({
  createWritingDraft: serviceMocks.createWritingDraft,
  listWritingDocuments: serviceMocks.listWritingDocuments,
  listWritingScenes: serviceMocks.listWritingScenes
}));

function renderPage(page: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("workflow refinements", () => {
  beforeEach(() => {
    serviceMocks.createTableFromPrompt.mockReset();
    serviceMocks.listRecentTables.mockReset();
    serviceMocks.createWritingDraft.mockReset();
    serviceMocks.listWritingDocuments.mockReset();
    serviceMocks.listWritingScenes.mockReset();
  });

  it("keeps the full table title available and reports preview-only submission", async () => {
    const user = userEvent.setup();
    const request = deferred<{ id: string; status: "accepted"; prompt: string }>();
    const fullTitle = "华东区域重点客户季度销售排行榜及同比环比趋势分析表";
    serviceMocks.listRecentTables.mockResolvedValue([
      {
        id: "long-title",
        title: fullTitle,
        tag: "排行",
        description: "完整标题不得被业务逻辑截断",
        iconId: "ranking"
      }
    ]);
    serviceMocks.createTableFromPrompt.mockReturnValue(request.promise);

    const { container } = renderPage(<TablePage />);

    expect(container.querySelector(".workflow-status-slot.table-page__status-slot")).toBeInTheDocument();

    const title = await screen.findByRole("heading", { name: fullTitle });
    expect(title).toHaveAttribute("title", fullTitle);

    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成销售排行");
    await user.click(screen.getByRole("button", { name: "预览需求" }));

    fireEvent.keyDown(screen.getByRole("textbox", { name: "制表需求" }), { key: "Enter", code: "Enter" });

    expect(screen.getByRole("button", { name: /预览需求/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "复制制表要求" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "制表需求输入" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在创建制表预览");
    expect(serviceMocks.createTableFromPrompt).toHaveBeenCalledTimes(1);

    request.resolve({ id: "generated", status: "accepted", prompt: "生成销售排行" });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("预览需求已记录，不会创建真实报表");
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "预览需求" })).toBeEnabled());
  });

  it("shows an error state when table generation cannot be queued", async () => {
    const user = userEvent.setup();
    serviceMocks.listRecentTables.mockResolvedValue([]);
    serviceMocks.createTableFromPrompt.mockRejectedValue(new Error("offline"));

    renderPage(<TablePage />);

    await user.type(screen.getByRole("textbox", { name: "制表需求" }), "生成库存表");
    await user.click(screen.getByRole("button", { name: "预览需求" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("制表需求提交失败，请稍后重试");
    expect(screen.getByRole("button", { name: "预览需求" })).toBeEnabled();
  });

  it("uses a compact writing input and keeps validated attachments in a removable local queue", async () => {
    const user = userEvent.setup();
    serviceMocks.listWritingScenes.mockResolvedValue([]);
    serviceMocks.listWritingDocuments.mockResolvedValue([
      {
        id: "adapter-document",
        name: "服务端日期文稿",
        type: "报告总结",
        words: "680 字",
        updatedAt: "2026-07-10 07:25"
      }
    ]);

    const { container } = renderPage(<WritingPage />);
    await user.click(screen.getByRole("tab", { name: /通用写作/ }));

    expect(container.querySelector(".writing-panel--compact")).toBeInTheDocument();
    expect(container.querySelector(".workflow-status-slot.writing-panel__status-slot")).toBeInTheDocument();
    expect(await screen.findByText("2026-07-10 07:25")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("writing-attachment-input"), {
      target: {
        files: [
          new File(["销售额"], "销售数据.csv", { type: "text/csv" }),
          new File(["binary"], "installer.exe", { type: "application/x-msdownload" })
        ]
      }
    });

    expect(screen.getByRole("status")).toHaveTextContent("1 个附件可参与预览，1 个附件不可用于预览");
    const queue = screen.getByRole("list", { name: "写作附件队列" });
    expect(queue).toHaveTextContent("销售数据.csv");
    expect(queue).toHaveTextContent("installer.exe");
    expect(queue).toHaveTextContent("暂不支持此文件类型");

    await user.click(within(queue).getByRole("button", { name: "移除附件 installer.exe" }));
    expect(queue).not.toHaveTextContent("installer.exe");
  });

  it("submits ready attachment metadata once and reports that attachments joined the writing queue", async () => {
    const user = userEvent.setup();
    const request = deferred<{
      id: string;
      status: "accepted";
      prompt: string;
      attachmentCount: number;
    }>();
    serviceMocks.listWritingScenes.mockResolvedValue([
      {
        id: "pending-report-scene",
        title: "报告总结",
        description: "快速生成数据报告",
        iconId: "report-summary",
        tone: "purple"
      }
    ]);
    serviceMocks.listWritingDocuments.mockResolvedValue([]);
    serviceMocks.createWritingDraft.mockReturnValue(request.promise);

    renderPage(<WritingPage />);
    await user.click(screen.getByRole("tab", { name: /通用写作/ }));

    const readyFile = new File(["销售额"], "销售数据.csv", { type: "text/csv", lastModified: 42 });
    await user.upload(screen.getByTestId("writing-attachment-input"), [
      readyFile,
      new File(["binary"], "installer.exe", { type: "application/x-msdownload" })
    ]);

    await user.type(screen.getByRole("textbox", { name: "写作需求" }), "撰写一份经营月报");
    const sendButton = screen.getByRole("button", { name: "预览写作需求" });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(serviceMocks.createWritingDraft).toHaveBeenCalledTimes(1);
    expect(serviceMocks.createWritingDraft).toHaveBeenCalledWith({
      prompt: expect.any(String),
      attachments: [
        expect.objectContaining({
          id: expect.any(String),
          file: readyFile,
          name: "销售数据.csv",
          size: readyFile.size,
          type: "text/csv"
        })
      ]
    });
    expect(screen.getByRole("button", { name: "预览写作需求" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "写作内容输入" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox", { name: "写作需求" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "报告总结" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "报告总结：快速生成数据报告" })).toBeDisabled();
    expect(screen.getByTestId("writing-attachment-input")).toBeDisabled();
    expect(screen.getByRole("button", { name: "添加附件" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "移除附件 销售数据.csv" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在创建写作预览");

    request.resolve({
      id: "writing-draft",
      status: "accepted",
      prompt: "例如：撰写一份关于数据资产管理平台的产品介绍文档，包含产品概述、核心功能、应用场景和价值优势，字数约1500字",
      attachmentCount: 1
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "预览写作需求" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("预览已记录 1 个附件，不会上传或生成真实文档");
  });

  it("shows an error and unlocks writing submission when the adapter rejects", async () => {
    const user = userEvent.setup();
    serviceMocks.listWritingScenes.mockResolvedValue([]);
    serviceMocks.listWritingDocuments.mockResolvedValue([]);
    serviceMocks.createWritingDraft.mockRejectedValue(new Error("offline"));

    renderPage(<WritingPage />);
    await user.click(screen.getByRole("tab", { name: /通用写作/ }));
    await user.type(screen.getByRole("textbox", { name: "写作需求" }), "撰写一份经营月报");
    await user.click(screen.getByRole("button", { name: "预览写作需求" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("写作需求提交失败，请稍后重试");
    expect(screen.getByRole("button", { name: "预览写作需求" })).toBeEnabled();
  });

  it("keeps the welcome page on the document scrollport instead of creating a second vertical scroller", () => {
    const welcomeCss = readFileSync("src/pages/welcome.css", "utf8");
    const pageRule = welcomeCss.match(/\.welcome-page\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(pageRule).toContain("min-height: 100dvh");
    expect(pageRule).toContain("overflow-x: clip");
    expect(pageRule).not.toContain("overflow-x: hidden");
  });

  it("contains the writing document table inside its card on narrow screens", () => {
    const workflowCss = readFileSync("src/pages/styles/workflows.css", "utf8");
    const tableRule = workflowCss.match(/\.doc-table\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(tableRule).toContain("overflow-x: auto");
  });

});
