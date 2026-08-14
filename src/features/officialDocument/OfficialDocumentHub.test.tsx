import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { OfficialDocumentHub } from "./OfficialDocumentHub";

vi.mock("@/services/officialDocumentService", () => ({
  officialDocumentServiceState: {
    configured: true,
    mode: "live",
    label: "测试公文服务",
    message: "测试环境未返回模板数据。"
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

describe("OfficialDocumentHub", () => {
  it("shows the live empty state without demo templates or drafts", async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/writing"]}>
          <OfficialDocumentHub />
        </MemoryRouter>
      </AppProviders>
    );

    expect(screen.getByLabelText("公文写作工作台")).toBeInTheDocument();
    expect(await screen.findByText("还没有可用的公文模板")).toBeInTheDocument();
    expect(screen.queryByText("结构化写作与 Word 引擎可用")).not.toBeInTheDocument();
    expect(screen.queryByText(/QueryAsset preview is configured/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开模板/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/功能示例|演示/)).not.toBeInTheDocument();
  });
});
