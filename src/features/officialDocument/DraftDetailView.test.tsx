import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { DraftDetailView } from "./DraftDetailView";

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
  it("renders the demo draft with structured editor and demo-limited export actions", async () => {
    renderDraftDetail("draft-demo-1");

    expect(
      await screen.findByRole("heading", { name: "推进数据治理工作情况报告（草稿示例）", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText(/来源模板：工作情况报告（功能示例）/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "绑定问数数据" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 DOCX" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();
    expect(await screen.findByLabelText("结构化公文编辑器")).toBeInTheDocument();
    expect(screen.getByText("问数快照绑定")).toBeInTheDocument();
  });

  it("shows a not-found state with a way back for an unknown draft id", async () => {
    renderDraftDetail("draft-missing");

    expect(await screen.findByText("未找到该公文草稿")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回智能写作列表" })).toHaveAttribute("href", "/writing");
  });
});
