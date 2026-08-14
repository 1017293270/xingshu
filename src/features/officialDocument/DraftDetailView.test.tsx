import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { DraftDetailView } from "./DraftDetailView";

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试公文服务",
    message: "测试环境没有返回演示数据。"
  },
  loadOfficialDocumentWorkspace: vi.fn().mockResolvedValue({
    templates: [],
    drafts: [],
    capabilities: {
      wordEngine: { available: false },
      queryAssets: { available: false }
    },
    queryBindingCandidates: []
  })
}));

function DraftDetailRoute() {
  const { draftId = "" } = useParams();
  return <DraftDetailView draftId={draftId} />;
}

function renderDraftDetail(draftId: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[`/writing/drafts/${draftId}`]}>
        <Routes>
          <Route path="/writing/drafts/:draftId" element={<DraftDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DraftDetailView", () => {
  it("does not invent a demo draft when the live workspace is empty", async () => {
    renderDraftDetail("draft-missing");

    expect(await screen.findByText("未找到该公文草稿")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回公文写作" })).toHaveAttribute("href", "/writing");
    expect(screen.queryByText(/示例/)).not.toBeInTheDocument();
  });
});
