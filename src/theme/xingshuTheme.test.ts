import { describe, expect, it } from "vitest";
import { xingshuTokens } from "./xingshuTokens";
import { antdTheme } from "./antdTheme";

describe("xingshu theme tokens", () => {
  it("keeps the required enterprise visual identity tokens", () => {
    expect(xingshuTokens.colorBg).toBe("#F3F8FF");
    expect(xingshuTokens.colorSurface).toBe("#FFFFFF");
    expect(xingshuTokens.colorPrimary).toBe("#1677FF");
    expect(xingshuTokens.colorText).toBe("#081A3A");
    expect(xingshuTokens.radiusControl).toBe(12);
    expect(xingshuTokens.radiusCard).toBe(14);
  });

  it("maps star math tokens into Ant Design theme config", () => {
    expect(antdTheme.token?.colorPrimary).toBe(xingshuTokens.colorPrimary);
    expect(antdTheme.token?.colorBgLayout).toBe(xingshuTokens.colorBg);
    expect(antdTheme.token?.colorBgContainer).toBe(xingshuTokens.colorSurface);
    expect(antdTheme.token?.borderRadius).toBe(xingshuTokens.radiusControl);
    expect(antdTheme.components?.Button?.borderRadius).toBe(xingshuTokens.radiusControl);
    expect(antdTheme.components?.Card?.borderRadiusLG).toBe(xingshuTokens.radiusCard);
  });
});
