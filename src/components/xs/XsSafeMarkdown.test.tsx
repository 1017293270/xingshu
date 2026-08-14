import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsSafeMarkdown } from "./XsSafeMarkdown";

describe("XsSafeMarkdown", () => {
  it("renders common Markdown and linked HTTP images while dropping unsafe content", () => {
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
          "![外部图片](https://example.com/tracker.png)",
          "",
          "![危险图片](javascript:alert(1))"
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
    const image = screen.getByRole("img", { name: "外部图片" });
    expect(image).toHaveAttribute("src", "https://example.com/tracker.png");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image.closest("a")).toHaveAttribute("href", "https://example.com/tracker.png");
    expect(image.closest("a")).toHaveAttribute("target", "_blank");
    expect(image.closest("a")).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector('img[src^="javascript:"]')).not.toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
  });

  it("renders the DataHub image URL as a clickable preview and provides a failure fallback", () => {
    const imageUrl =
      "http://101.43.17.8:9000/data-source/rag-source/images/5/2077951424634101761/采购合同szsz-2023-cg0005/mineru_auto/images/c58e4a6b8137e0172c5c9aaa5085eb722d2892b07.jpg";

    render(<XsSafeMarkdown content={`![](${imageUrl})`} />);

    const image = screen.getByRole("img", { name: "回答中的图片" });
    expect(image).toHaveAttribute("src", expect.stringContaining("101.43.17.8:9000"));
    expect(image.closest("a")).toHaveAttribute("aria-label", "查看图片：回答中的图片");

    fireEvent.error(image);

    const fallback = screen.getByRole("link", { name: "图片加载失败，点击打开原图" });
    expect(fallback).toHaveAttribute("target", "_blank");
    expect(fallback).toHaveAttribute("rel", "noopener noreferrer");
  });
});
