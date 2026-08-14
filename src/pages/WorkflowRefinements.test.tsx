import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablePage } from "./TablePage";

const serviceMocks = vi.hoisted(() => ({
  createTableFromPrompt: vi.fn(),
  listRecentTables: vi.fn()
}));

vi.mock("@/services/tableService", () => ({
  createTableFromPrompt: serviceMocks.createTableFromPrompt,
  listRecentTables: serviceMocks.listRecentTables
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
    expect(screen.queryByText("写清这 4 点，表结构更准")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "制表描述要点" })).not.toBeInTheDocument();

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

  it("keeps space between the table preview banner and the workbench", () => {
    const workflowsCss = readFileSync("src/pages/styles/workflows.css", "utf8");
    const workbenchRule = workflowsCss.match(/\.sheet-workbench\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(workbenchRule).toContain("margin: var(--xs-module-gap) 0 0");
    expect(workbenchRule).not.toContain("1.62fr");
  });

  it("keeps the welcome page on the document scrollport instead of creating a second vertical scroller", () => {
    const welcomeCss = readFileSync("src/pages/welcome.css", "utf8");
    const pageRule = welcomeCss.match(/\.welcome-page\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";

    expect(pageRule).toContain("min-height: 100dvh");
    expect(pageRule).toContain("overflow-x: clip");
    expect(pageRule).not.toContain("overflow-x: hidden");
  });

});
