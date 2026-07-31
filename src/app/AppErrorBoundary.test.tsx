import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenPage(): never {
  throw new Error("Unable to preload CSS");
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a reload action instead of leaving a failed lazy route blank", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppErrorBoundary onReload={reload}>
        <BrokenPage />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("页面加载失败");

    await user.click(screen.getByRole("button", { name: "刷新页面" }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
