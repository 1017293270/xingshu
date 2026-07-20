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
    expect(css).toContain(`--xs-sidebar-expanded-width: ${xingshuTokens.sidebarWidth}px;`);
    expect(css).toContain(`--xs-sidebar-collapsed-width: ${xingshuTokens.sidebarCollapsedWidth}px;`);
    expect(css).toContain("--xs-sidebar-width: var(--xs-sidebar-expanded-width);");
  });

  it("uses accessible tertiary and interactive text colors", () => {
    expect(xingshuTokens.colorTextTertiary).toBe("#5F7391");
    expect(xingshuTokens.colorInteractiveText).toBe("#1D4ED8");
  });

  it("caps wide-screen content tracks at the visual specification widths", () => {
    expect(css).toContain("--xs-page-track: clamp(1170px, calc((100vw - var(--xs-sidebar-width)) * 0.82), 1440px);");
    expect(css).toContain("--xs-data-track: clamp(1220px, calc((100vw - var(--xs-sidebar-width)) * 0.84), 1480px);");
  });
});
