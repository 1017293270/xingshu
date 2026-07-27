import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_BACKGROUND_IMAGE_LIMIT,
  compressDashboardBackgroundImage,
  resolveBackgroundImageTargetSize,
  resolveCanvasBackgroundStyle
} from "./dashboardCanvasBackground";

function stubCompressionPipeline(dataUrls: string[]) {
  const drawImage = vi.fn();
  const toDataURL = vi.fn();
  for (const value of dataUrls) toDataURL.mockImplementationOnce(() => value);
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillRect: vi.fn(), drawImage, fillStyle: "" }),
    toDataURL
  };
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas" ? fakeCanvas : originalCreateElement(tag)) as typeof document.createElement);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 2000, close: vi.fn() })));
  return { drawImage, toDataURL, fakeCanvas };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resolveBackgroundImageTargetSize", () => {
  it("caps wide images at 2048 without upscaling small ones", () => {
    expect(resolveBackgroundImageTargetSize(4000, 2000, 1920)).toEqual({ width: 2048, height: 1024 });
    expect(resolveBackgroundImageTargetSize(800, 600, 1920)).toEqual({ width: 800, height: 600 });
    expect(resolveBackgroundImageTargetSize(3000, 1500, 1280)).toEqual({ width: 2048, height: 1024 });
  });
});

describe("resolveCanvasBackgroundStyle", () => {
  const base = { width: 1920, height: 1080, columns: 12 as const, rows: 10, background: "#0B1B33" };

  it("returns only the color when no image is set", () => {
    expect(resolveCanvasBackgroundStyle(base)).toEqual({ backgroundColor: "#0B1B33" });
  });

  it("maps fit modes to background-size", () => {
    const withImage = (fit: "cover" | "contain" | "fill") => ({
      ...base,
      backgroundImage: { dataUrl: "data:image/jpeg;base64,abc", fit }
    });
    expect(resolveCanvasBackgroundStyle(withImage("cover")).backgroundSize).toBe("cover");
    expect(resolveCanvasBackgroundStyle(withImage("contain")).backgroundSize).toBe("contain");
    expect(resolveCanvasBackgroundStyle(withImage("fill")).backgroundSize).toBe("100% 100%");
    expect(resolveCanvasBackgroundStyle(withImage("cover")).backgroundColor).toBe("#0B1B33");
  });
});

describe("compressDashboardBackgroundImage", () => {
  it("rejects non-image files before decoding", async () => {
    const file = new File(["text"], "notes.txt", { type: "text/plain" });
    await expect(compressDashboardBackgroundImage(file, 1920)).rejects.toThrow("请选择图片文件");
  });

  it("returns the first dataUrl within the size limit", async () => {
    const { toDataURL } = stubCompressionPipeline(["data:image/jpeg;base64,ok"]);
    const file = new File(["pixels"], "bg.png", { type: "image/png" });

    await expect(compressDashboardBackgroundImage(file, 1920)).resolves.toBe("data:image/jpeg;base64,ok");
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it("retries with lower quality and smaller size when over the limit", async () => {
    const oversized = `data:image/jpeg;base64,${"x".repeat(DASHBOARD_BACKGROUND_IMAGE_LIMIT)}`;
    const { toDataURL, fakeCanvas } = stubCompressionPipeline([oversized, "data:image/jpeg;base64,small"]);
    const file = new File(["pixels"], "bg.png", { type: "image/png" });

    await expect(compressDashboardBackgroundImage(file, 1920)).resolves.toBe("data:image/jpeg;base64,small");
    expect(toDataURL).toHaveBeenCalledTimes(2);
    expect(fakeCanvas.width).toBeLessThan(2048);
  });

  it("throws a friendly error when every round stays over the limit", async () => {
    const oversized = `data:image/jpeg;base64,${"x".repeat(DASHBOARD_BACKGROUND_IMAGE_LIMIT)}`;
    stubCompressionPipeline([oversized, oversized, oversized]);
    const file = new File(["pixels"], "bg.png", { type: "image/png" });

    await expect(compressDashboardBackgroundImage(file, 1920)).rejects.toThrow("图片过大");
  });
});
