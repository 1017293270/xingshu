import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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


it("makes only explicitly mapped inline evidence references actionable", () => {
  const open = vi.fn();
  const { container } = render(<XsSafeMarkdown content={"见证据 `e4`；变量 `e1`。\n\n```\ne4\n```"}
    references={{ e4: { label: "查看 e4 原文片段", onClick: open } }} />);
  fireEvent.click(screen.getByRole("button", { name: "查看 e4 原文片段" }));
  expect(open).toHaveBeenCalledOnce();
  expect(container.querySelector("pre code")).toHaveTextContent("e4");
  expect(container.querySelectorAll("code")).toHaveLength(2);
});


it("resolves protected images without loading the wrong root URL and revokes late artifacts", async () => {
  let finish!: (value: { url: string; revoke: () => void }) => void;
  let signal!: AbortSignal;
  const release = vi.fn();
  const resolveImage = vi.fn((_src: string, nextSignal: AbortSignal) => {
    signal = nextSignal;
    return new Promise<{ url: string; revoke: () => void }>(resolve => { finish = resolve; });
  });
  const { unmount } = render(<XsSafeMarkdown content="![合同图](images/scan.png)" resolveImage={resolveImage} />);
  expect(screen.getByRole("status")).toHaveTextContent("图片读取中");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ url: "blob:trusted", revoke: release }));
  expect(release).toHaveBeenCalledOnce();
});

it("retries protected image errors and cleans up the previous image when src changes", async () => {
  const release = vi.fn();
  const resolveImage = vi.fn()
    .mockRejectedValueOnce(new Error("temporary"))
    .mockResolvedValueOnce({ url: "blob:trusted-first", revoke: release })
    .mockResolvedValueOnce({ url: "blob:trusted-next" });
  const { rerender } = render(<XsSafeMarkdown content="![合同图](images/first.png)" resolveImage={resolveImage} />);
  fireEvent.click(await screen.findByRole("button", { name: "图片读取失败，点击重试" }));
  const first = await screen.findByRole("img", { name: "合同图" });
  expect(first).toHaveAttribute("src", "blob:trusted-first");
  fireEvent.error(first);
  expect(screen.getByRole("link", { name: "图片加载失败，点击打开原图" })).toBeInTheDocument();
  rerender(<XsSafeMarkdown content="![合同图](images/next.png)" resolveImage={resolveImage} />);
  expect(await screen.findByRole("img", { name: "合同图" })).toHaveAttribute("src", "blob:trusted-next");
  expect(release).toHaveBeenCalledOnce();
  expect(getSafeImageUrl("blob:untrusted")).toBeNull();
});


it("never displays a prior document blob when the same relative src gets a new resolver", async () => {
  const release = vi.fn();
  const first = vi.fn().mockResolvedValue({ url: "blob:first-document", revoke: release });
  let finish!: (value: { url: string }) => void;
  const second = vi.fn(() => new Promise<{ url: string }>(resolve => { finish = resolve; }));
  const { rerender } = render(<XsSafeMarkdown content="![图](images/page.png)" resolveImage={first} />);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:first-document");
  rerender(<XsSafeMarkdown content="![图](images/page.png)" resolveImage={second} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(release).toHaveBeenCalledOnce();
  await act(async () => finish({ url: "blob:second-document" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:second-document");
});


it("does not resolve an empty image src", () => {
  const resolveImage = vi.fn();
  render(<XsSafeMarkdown content="![空图]()" resolveImage={resolveImage} />);
  expect(resolveImage).not.toHaveBeenCalled();
  expect(screen.getByText("[图片链接不可用]")).toBeInTheDocument();
});
