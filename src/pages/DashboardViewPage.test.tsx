import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { createBlankDashboard } from "@/services/dashboardGenerationService";
import { createDashboardRepository } from "@/services/dashboardRepositoryService";
import { DashboardViewPage } from "./DashboardViewPage";

vi.mock("@/features/dashboardStudio/DashboardRuntimeIsland", () => ({
  DashboardRuntimeIsland: ({ fullscreen }: { fullscreen?: boolean }) => (
    <div aria-label="全屏大屏画布" data-fullscreen={String(fullscreen)} />
  )
}));

function renderPage(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <DashboardViewPage />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DashboardViewPage", () => {
  beforeEach(() => localStorage.clear());

  it("shows the original control-free fullscreen runtime", () => {
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({
      title: "华东经营大屏",
      idFactory: (prefix) => `${prefix}-east`
    });
    const draft = repository.saveDraft(schema);
    repository.publish(schema.id, draft.revision);

    renderPage(`/dashboard-view?dashboard=${schema.id}`);

    expect(screen.getByLabelText("全屏大屏画布")).toHaveAttribute("data-fullscreen", "true");
    expect(screen.queryByRole("button", { name: "返回大屏列表" })).not.toBeInTheDocument();
    expect(screen.queryByText("草稿预览")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "星数主导航" })).not.toBeInTheDocument();
  });

  it("does not expose an unpublished draft in the formal runtime route", () => {
    const repository = createDashboardRepository(localStorage);
    const schema = createBlankDashboard({ title: "仅草稿大屏" });
    repository.saveDraft(schema);

    renderPage(`/dashboard-view?dashboard=${schema.id}`);

    expect(screen.getByRole("alert")).toHaveTextContent("运行态暂不可用未找到运行态大屏重试");
  });

  it("shows a recoverable error when the dashboard id is unavailable", () => {
    renderPage("/dashboard-view?dashboard=missing");

    expect(screen.getByRole("alert")).toHaveTextContent("运行态暂不可用未找到运行态大屏重试");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
