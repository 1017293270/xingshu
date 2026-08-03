import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { DashboardOnboarding, dashboardOnboardingStorageKey } from "./DashboardOnboarding";

function renderOnboarding() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardOnboarding defaultOpen />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("DashboardOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ dashboardOnboardingOpen: false });
  });

  it("walks through three slides and stores the done flag on finish", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    expect(await screen.findByText("数据繁星，汇聚成屏")).toBeInTheDocument();
    expect(document.querySelector(".db-converge")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("拖拽编排，布局由你")).toBeInTheDocument();
    expect(document.querySelector(".db-arrange")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "上一步" }));
    expect(await screen.findByText("数据繁星，汇聚成屏")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(await screen.findByRole("button", { name: "下一步" }));
    expect(await screen.findByText("一键放映，经营尽览")).toBeInTheDocument();
    expect(document.querySelector(".db-present")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始体验" }));
    expect(window.localStorage.getItem(dashboardOnboardingStorageKey(null))).toBe("done");
    await waitFor(() => expect(screen.queryByText("一键放映，经营尽览")).not.toBeInTheDocument());
  });

  it("stores the done flag when skipping", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(await screen.findByRole("button", { name: "跳过" }));
    expect(window.localStorage.getItem(dashboardOnboardingStorageKey(null))).toBe("done");
    await waitFor(() => expect(screen.queryByText("数据繁星，汇聚成屏")).not.toBeInTheDocument());
  });

  it("reopens from the account-menu trigger and clears the store flag on close", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/table"]}>
          <DashboardOnboarding />
        </MemoryRouter>
      </AppProviders>
    );

    expect(screen.queryByText("数据繁星，汇聚成屏")).not.toBeInTheDocument();

    useUiStore.setState({ dashboardOnboardingOpen: true });
    expect(await screen.findByText("数据繁星，汇聚成屏")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "跳过" }));
    expect(useUiStore.getState().dashboardOnboardingOpen).toBe(false);
    expect(window.localStorage.getItem(dashboardOnboardingStorageKey(null))).toBe("done");
    await waitFor(() => expect(screen.queryByText("数据繁星，汇聚成屏")).not.toBeInTheDocument());
  });
});
