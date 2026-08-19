import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { TemplateDetailView } from "./TemplateDetailView";

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

function TemplateDetailRoute() {
  const { templateId = "" } = useParams();
  return <TemplateDetailView templateId={templateId} />;
}

describe("TemplateDetailView", () => {
  it("does not invent a demo template when the live workspace is empty", async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/writing/templates/template-missing"]}>
          <Routes>
            <Route path="/writing/templates/:templateId" element={<TemplateDetailRoute />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>
    );

    expect(await screen.findByText("未找到该公文模板")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回模板库" })).toHaveAttribute("href", "/writing/templates");
    expect(screen.queryByText(/功能示例|演示/)).not.toBeInTheDocument();
  });
});
