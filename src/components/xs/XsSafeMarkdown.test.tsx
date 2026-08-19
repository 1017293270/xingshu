import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSafeImageUrl, XsSafeMarkdown } from "./XsSafeMarkdown";

const minioContractImage =
  "http://101.43.17.8:9000/data-source/rag-source/images/5/2077951424634101761/采购合同szsz-2023-cg0005/mineru_auto/images/c58e4a6b8137e0172c5c9aaa5085eb722d2892b07.jpg";

describe("getSafeImageUrl", () => {
  it("rewrites DataHub MinIO knowledge images onto the page origin", () => {
    const rewritten = getSafeImageUrl(minioContractImage, {
      pageOrigin: "http://127.0.0.1:5173"
    });

    expect(rewritten).toBe(
      "http://127.0.0.1:5173/data-source/rag-source/images/5/2077951424634101761/%E9%87%87%E8%B4%AD%E5%90%88%E5%90%8Cszsz-2023-cg0005/mineru_auto/images/c58e4a6b8137e0172c5c9aaa5085eb722d2892b07.jpg"
    );
  });

  it("uses a configured public origin when Xingshu is hosted separately", () => {
    expect(
      getSafeImageUrl(minioContractImage, {
        pageOrigin: "https://xingshu.example.local",
        publicOrigin: "https://datahub.example.local/"
      })
    ).toMatch(/^https:\/\/datahub\.example\.local\/data-source\/rag-source\/images\//);
  });

  it("ignores an unsafe public origin and keeps ordinary http images unchanged", () => {
    expect(
      getSafeImageUrl(minioContractImage, {
        pageOrigin: "http://localhost:3000",
        publicOrigin: "javascript:alert(1)"
      })
    ).toMatch(/^http:\/\/localhost:3000\/data-source\/rag-source\/images\//);
    expect(getSafeImageUrl("https://example.com/tracker.png")).toBe("https://example.com/tracker.png");
    expect(getSafeImageUrl("/fixtures/source/contract-preview.svg", { pageOrigin: "http://localhost:3000" })).toBe(
      "http://localhost:3000/fixtures/source/contract-preview.svg"
    );
    expect(getSafeImageUrl("javascript:alert(1)")).toBeNull();
  });
});

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

  it("rewrites DataHub knowledge images onto this origin and still offers a failure fallback", () => {
    render(<XsSafeMarkdown content={`![](${minioContractImage})`} />);

    const image = screen.getByRole("img", { name: "回答中的图片" });
    const rewritten = getSafeImageUrl(minioContractImage);
    expect(image).toHaveAttribute("src", rewritten);
    expect(image.getAttribute("src")).toContain("/data-source/rag-source/images/");
    expect(image.getAttribute("src")).not.toContain("101.43.17.8:9000");
    expect(image.getAttribute("src")).toContain("%E9%87%87%E8%B4%AD%E5%90%88%E5%90%8Cszsz-2023-cg0005");
    expect(image.closest("a")).toHaveAttribute("href", rewritten);
    expect(image.closest("a")).toHaveAttribute("aria-label", "查看图片：回答中的图片");

    fireEvent.error(image);

    const fallback = screen.getByRole("link", { name: "图片加载失败，点击打开原图" });
    expect(fallback).toHaveAttribute("href", rewritten);
    expect(fallback).toHaveAttribute("target", "_blank");
    expect(fallback).toHaveAttribute("rel", "noopener noreferrer");
  });
});
