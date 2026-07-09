import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { xingshuTokens } from "./xingshuTokens";

describe("xingshuTokens", () => {
  const css = readFileSync("src/styles/tokens.css", "utf8");

  it("keeps CSS and TypeScript brand tokens aligned", () => {
    expect(css).toContain(`--xs-primary: ${xingshuTokens.colorPrimary};`);
    expect(css).toContain(`--xs-text-3: ${xingshuTokens.colorTextTertiary};`);
    expect(css).toContain(`--xs-motion-base: ${xingshuTokens.motionBase}ms;`);
    expect(css).toContain(`--xs-focus-ring: ${xingshuTokens.focusRing};`);
  });

  it("uses accessible tertiary and interactive text colors", () => {
    expect(xingshuTokens.colorTextTertiary).toBe("#5F7391");
    expect(xingshuTokens.colorInteractiveText).toBe("#1D4ED8");
  });
});
