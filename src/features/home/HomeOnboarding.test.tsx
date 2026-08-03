import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProviders } from "@/app/providers";
import { useUiStore } from "@/stores/uiStore";
import { HomeOnboarding } from "./HomeOnboarding";

function renderOnboarding() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={["/"]}>
        <HomeOnboarding defaultOpen />
      </MemoryRouter>
    </AppProviders>
  );
}

describe("HomeOnboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ onboardingOpen: false });
  });

  it("walks through three slides and stores the done flag on finish", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    expect(await screen.findByText("一句话，问到可追溯的答案")).toBeInTheDocument();
    expect(document.querySelector(".xs-ask-demo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("从要点到成稿，一步之遥")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "上一步" }));
    expect(await screen.findByText("一句话，问到可追溯的答案")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(await screen.findByRole("button", { name: "下一步" }));
    expect(await screen.findByText("经营全貌，一屏尽览")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始体验" }));
    expect(window.localStorage.getItem("xingshu_onboarding_v1")).toBe("done");
    await waitFor(() => expect(screen.queryByText("经营全貌，一屏尽览")).not.toBeInTheDocument());
  });

  it("stores the done flag when skipping", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(await screen.findByRole("button", { name: "跳过" }));
    expect(window.localStorage.getItem("xingshu_onboarding_v1")).toBe("done");
    await waitFor(() => expect(screen.queryByText("一句话，问到可追溯的答案")).not.toBeInTheDocument());
  });

  it("reopens from the account-menu trigger and clears the store flag on close", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <MemoryRouter initialEntries={["/table"]}>
          <HomeOnboarding />
        </MemoryRouter>
      </AppProviders>
    );

    expect(screen.queryByText("一句话，问到可追溯的答案")).not.toBeInTheDocument();

    useUiStore.setState({ onboardingOpen: true });
    expect(await screen.findByText("一句话，问到可追溯的答案")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "跳过" }));
    expect(useUiStore.getState().onboardingOpen).toBe(false);
    expect(window.localStorage.getItem("xingshu_onboarding_v1")).toBe("done");
    await waitFor(() => expect(screen.queryByText("一句话，问到可追溯的答案")).not.toBeInTheDocument());
  });
});
