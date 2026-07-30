import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsSafeMarkdown } from "./XsSafeMarkdown";

describe("XsSafeMarkdown", () => {
  it("renders common Markdown while dropping raw HTML and unsafe media", () => {
    const { container } = render(
      <XsSafeMarkdown
        content={[
          "## 审批结论",
          "",
          "需要经过 **部门审核**。",
          "",
          "[安全链接](https://example.com/policy)",
          "",
          "[危险链接](javascript:alert(1))",
          "",
          '<img src=x onerror="alert(1)">',
          "<script>window.__xss = true</script>",
          "",
          "![外部图片](https://example.com/tracker.png)"
        ].join("\n")}
      />
    );

    expect(screen.getByRole("heading", { name: "审批结论" })).toBeInTheDocument();
    expect(screen.getByText("部门审核")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "安全链接" })).toHaveAttribute(
      "href",
      "https://example.com/policy"
    );
    expect(screen.getByRole("link", { name: "安全链接" })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
    expect(screen.getByText("危险链接").closest("a")?.getAttribute("href") || "").not.toMatch(
      /^javascript:/i
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
  });
});
