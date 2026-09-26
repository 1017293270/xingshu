import { afterEach, describe, expect, it, vi } from "vitest";
import { installBrowserUuidCompatibility } from "./browserCompatibility";

afterEach(() => vi.unstubAllGlobals());

describe("browser UUID compatibility", () => {
  it("preserves native randomUUID and does not replace it on repeated installation", () => {
    const native = globalThis.crypto.randomUUID;
    installBrowserUuidCompatibility();
    installBrowserUuidCompatibility();
    expect(globalThis.crypto.randomUUID).toBe(native);
  });

  it("sets UUID v4 bits and calls getRandomValues with its Crypto receiver", () => {
    const browserCrypto = {
      getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(0xff))
    };
    vi.stubGlobal("crypto", browserCrypto);
    installBrowserUuidCompatibility();
    expect(globalThis.crypto.randomUUID()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(browserCrypto.getRandomValues.mock.contexts[0]).toBe(browserCrypto);
    const fallback = globalThis.crypto.randomUUID;
    installBrowserUuidCompatibility();
    expect(globalThis.crypto.randomUUID).toBe(fallback);
  });
});
