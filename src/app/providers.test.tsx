import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./providers";

describe("AppProviders", () => {
  it("renders children inside the configured application providers", () => {
    render(
      <AppProviders>
        <button type="button">星数测试按钮</button>
      </AppProviders>
    );

    expect(screen.getByRole("button", { name: "星数测试按钮" })).toBeInTheDocument();
  });
});
