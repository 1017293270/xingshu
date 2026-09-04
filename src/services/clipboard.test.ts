import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

afterEach(() => {
  stubClipboard(undefined);
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("空白文本不写剪贴板", async () => {
    const writeText = vi.fn();
    stubClipboard({ writeText });

    await expect(copyText("   ")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("安全上下文下走异步剪贴板并去掉首尾空白", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(copyText("  有几个合同  ")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("有几个合同");
  });

  it("http 环境没有 navigator.clipboard 时回退到选区复制", async () => {
    stubClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    await expect(copyText("有几个合同")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("异步剪贴板被拒时仍尝试选区复制", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Document is not focused"));
    stubClipboard({ writeText });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    await expect(copyText("有几个合同")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("两条通道都失败才返回 false", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn().mockReturnValue(false) });

    await expect(copyText("有几个合同")).resolves.toBe(false);
  });
});
