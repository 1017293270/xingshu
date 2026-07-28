import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsCountUpText } from "./XsCountUpText";

describe("XsCountUpText", () => {
  it("exposes only the final value as its accessible name", () => {
    render(<XsCountUpText value="12,345.6 万" previousValue="10,000.0 万" />);

    expect(screen.getByLabelText("12,345.6 万")).toHaveTextContent("12,345.6 万");
    expect(screen.getByLabelText("12,345.6 万").firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("shows non-numeric values without attempting to animate them", () => {
    render(<XsCountUpText value="暂无数据" />);

    expect(screen.getByLabelText("暂无数据")).toHaveTextContent("暂无数据");
  });
});
