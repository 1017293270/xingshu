import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftHistoryPanel } from "./DraftHistoryPanel";
const mocks = vi.hoisted(() => ({ versions: vi.fn(), exports: vi.fn(), download: vi.fn() }));
vi.mock("@/services/officialDocumentService", () => ({
  listOfficialDocumentDraftContentVersions: mocks.versions,
  listOfficialDocumentDraftExports: mocks.exports,
  downloadOfficialDocumentExport: mocks.download
}));
const content = { revision: 1, fixedValues: [{ slotId: "title", value: "旧标题" }], blocks: [
  { id: "body", order: 0, role: "BODY" as const, variantId: "", text: "历史正文" }
] };
const version = { revision: 1, savedAt: "2026-09-07T00:00:00Z", content };
function setup(onRestore = vi.fn().mockResolvedValue(undefined)) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DraftHistoryPanel draftId="draft-1" title="报告" open currentContent={{ ...content, revision: 2,
      blocks: [{ ...content.blocks[0], text: "当前修改" }] }} onClose={() => {}} onRestore={onRestore} />
  </QueryClientProvider>);
  return onRestore;
}
describe("DraftHistoryPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.versions.mockResolvedValue([version]); mocks.exports.mockResolvedValue([]); });
  it("compares full current and saved content and restores selected snapshot without another confirmation", async () => {
    const restore = setup();
    expect(await screen.findByText("历史正文", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("当前修改")).toBeInTheDocument();
    expect(screen.getByText(/1 个正文节点有变化/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "恢复此版为新版本" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(version));
    expect(await screen.findByText(/已恢复为新版本/)).toBeInTheDocument();
  });
  it("downloads the selected persisted export rather than generating a new file", async () => {
    mocks.exports.mockResolvedValue([{ id: "export-exact", format: "DOCX", status: "GENERATED", contentRevision: 1,
      createdAt: "2026-09-07T00:00:00Z" }]);
    mocks.download.mockResolvedValue(new Blob(["stored-file"]));
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:history-file");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    setup(); fireEvent.click(screen.getByRole("tab", { name: "导出记录" }));
    fireEvent.click(await screen.findByRole("button", { name: "下载 DOCX" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith("export-exact"));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(createUrl).toHaveBeenCalled(); click.mockRestore(); createUrl.mockRestore();
  });

  it("preserves history on restore conflict and does not offer a download for failed exports", async () => {
    mocks.exports.mockResolvedValue([{ id: "blocked", format: "PDF", status: "BLOCKED", contentRevision: 1,
      createdAt: "2026-09-07T00:00:00Z", message: "文件未生成" }]);
    setup(vi.fn().mockRejectedValue(new Error("草稿已在其他窗口更新")));
    fireEvent.click(await screen.findByRole("button", { name: "恢复此版为新版本" }));
    expect(await screen.findByText("草稿已在其他窗口更新")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "导出记录" }));
    expect(await screen.findByText(/文件未生成/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 PDF" })).not.toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
