import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsRouteFallback } from "./XsRouteFallback";

describe("XsRouteFallback", () => {
  it("announces route loading while exposing a presentation-only skeleton", () => {
    const { container } = render(<XsRouteFallback />);

    expect(screen.getByRole("status", { name: "页面加载中" })).toBeInTheDocument();
    expect(container.querySelector(".xs-route-fallback__skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders route-specific skeleton geometry", () => {
    const { container } = render(<XsRouteFallback standalone variant="rows" />);

    expect(screen.getByRole("status", { name: "页面加载中" })).toHaveAttribute("data-variant", "rows");
    expect(container.querySelector(".xs-route-fallback--rows")).toBeInTheDocument();
    expect(container.querySelectorAll(".xs-route-fallback__body > span")).toHaveLength(7);
  });
});
