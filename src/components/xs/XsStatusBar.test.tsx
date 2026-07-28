import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsStatusBar } from "./XsStatusBar";

describe("XsStatusBar", () => {
  it("reserves a stable slot without creating an empty live region", () => {
    const { container } = render(<XsStatusBar reserveSpace />);

    expect(container.querySelector(".xs-status-bar-slot--reserved")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces only the inner status content when the transition key changes", () => {
    const { container, rerender } = render(
      <XsStatusBar reserveSpace transitionKey="saving" tone="loading" message="正在保存" />
    );
    const firstContent = container.querySelector(".xs-status-bar-slot__content");

    rerender(
      <XsStatusBar reserveSpace transitionKey="saved" tone="success" message="已保存" />
    );

    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(container.querySelector(".xs-status-bar-slot__content")).not.toBe(firstContent);
  });
});
