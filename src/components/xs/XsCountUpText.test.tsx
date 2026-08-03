import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsCountUpText } from "./XsCountUpText";

describe("XsCountUpText", () => {
  it("exposes only the final value as its accessible name", () => {
    const { container } = render(<XsCountUpText value="12,345.6 万" previousValue="10,000.0 万" />);

    expect(screen.getByText("12,345.6 万", { selector: ".sr-only" })).toBeInTheDocument();
    expect(container.querySelector('.xs-count-up-text > [aria-hidden="true"]')).toBeInTheDocument();
  });

  it("shows non-numeric values without attempting to animate them", () => {
    render(<XsCountUpText value="暂无数据" />);

    expect(screen.getByText("暂无数据", { selector: ".sr-only" })).toBeInTheDocument();
  });
});
