import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisCitationPreview, citationPreviewId } from "./AnalysisCitationPreview";
import { loadDataHubCitationDocument, loadDataHubKnowledgeMarkdown } from "@/services/dataHubKnowledgeService";
import type { DataHubCitationDocument } from "@/types/dataHub";

vi.mock("@/services/dataHubKnowledgeService", () => ({
  loadDataHubCitationDocument: vi.fn(),
  loadDataHubKnowledgeMarkdown: vi.fn()
}));
vi.mock("./CloudDocumentPreview", () => ({
  CloudDocumentPreview: (props: { markdown?: string; sourceUrl?: string; loading: boolean; error?: string }) => (
    <div>{props.loading ? "loading" : null}<p>{props.markdown}</p><p>{props.sourceUrl}</p><p>{props.error}</p></div>
  )
}));
const citation: DataHubCitationDocument = {
  docId: "9001", kbId: "7", docKey: "合同.pdf", sourceAvailable: true, fragments: []
};
const loadSource = vi.mocked(loadDataHubCitationDocument);
const loadMarkdown = vi.mocked(loadDataHubKnowledgeMarkdown);
const props = { open: true, citations: [citation], active: citation, onSelect: vi.fn(), onClose: vi.fn() };

describe("AnalysisCitationPreview", () => {
  beforeEach(() => vi.resetAllMocks());

  it("slow original downloads do not delay parsed content, and PDF upgrades the preview", async () => {
    let finish!: (value: Awaited<ReturnType<typeof loadDataHubCitationDocument>>) => void;
    loadSource.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    loadMarkdown.mockResolvedValue({ markdown: "已解析合同" });
    render(<AnalysisCitationPreview {...props} />);
    await screen.findByText("已解析合同");
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    await act(async () => finish({ url: "blob:pdf", contentType: "application/pdf" }));
    expect(screen.getByText("blob:pdf")).toBeInTheDocument();
  });

  it("switching same-name cross-library documents discards late results and revokes blobs", async () => {
    let finish!: (value: Awaited<ReturnType<typeof loadDataHubCitationDocument>>) => void;
    loadSource.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ url: "blob:second", contentType: "application/pdf" });
    loadMarkdown.mockResolvedValue({ markdown: "合同内容" });
    const next = { ...citation, kbId: "8" };
    expect(citationPreviewId(next)).not.toBe(citationPreviewId(citation));
    const { rerender } = render(<AnalysisCitationPreview {...props} />);
    rerender(<AnalysisCitationPreview {...props} citations={[citation, next]} active={next} />);
    await screen.findByText("blob:second");
    const revoke = vi.fn();
    await act(async () => finish({ url: "blob:first", contentType: "application/pdf", revoke }));
    expect(revoke).toHaveBeenCalledOnce();
    expect(screen.queryByText("blob:first")).not.toBeInTheDocument();
  });

  it("reopening repeats the same preview flow and shows failure when neither source is readable", async () => {
    loadSource.mockRejectedValue(new Error("原文不存在"));
    loadMarkdown.mockRejectedValue(new Error("解析内容不存在"));
    const { rerender } = render(<AnalysisCitationPreview {...props} />);
    await screen.findByText("解析内容不存在");
    rerender(<AnalysisCitationPreview {...props} open={false} />);
    loadMarkdown.mockResolvedValue({ markdown: "再次打开成功" });
    rerender(<AnalysisCitationPreview {...props} />);
    await screen.findByText("再次打开成功");
    await waitFor(() => expect(loadSource).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("解析内容不存在")).not.toBeInTheDocument();
  });
});
