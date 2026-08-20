import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { XsStatCard } from "./XsStatCard";
import { xsMetricGlyphById, type XsMetricGlyphId } from "./XsMetricGlyphs";

const source = readFileSync("src/components/xs/XsMetricGlyphs.tsx", "utf8");
const ids = Object.keys(xsMetricGlyphById) as XsMetricGlyphId[];

describe("XsMetricGlyphs", () => {
  it("keeps the whole set on one grid, one stroke and one color", () => {
    for (const id of ids) {
      const Glyph = xsMetricGlyphById[id];
      const { container } = render(<Glyph />);
      const svg = container.querySelector("svg");

      expect(svg, id).not.toBeNull();
      expect(svg!.getAttribute("viewBox"), id).toBe("0 0 32 32");
      expect(svg!.getAttribute("stroke-width"), id).toBe("2");
      expect(svg!.getAttribute("stroke"), id).toBe("currentColor");
      expect(svg!.getAttribute("stroke-linecap"), id).toBe("round");
      expect(svg!.getAttribute("stroke-linejoin"), id).toBe("round");
      expect(svg!.getAttribute("fill"), id).toBe("none");
      expect(svg!.getAttribute("width"), id).toBe("32");
    }
  });

  /**
   * 规范靠 `Glyph` 外壳强制：viewBox / strokeWidth / fill 全站只出现一次。
   * 单个图标一旦自带笔宽或填充，这条就红——这是"这套图标是不是还成一套"的守卫。
   */
  it("never lets an individual glyph override the shared spec", () => {
    expect(source.match(/viewBox/g)).toHaveLength(1);
    expect(source.match(/strokeWidth/g)).toHaveLength(2); // 常量定义 + 外壳引用
    expect(source.match(/fill=/g)).toHaveLength(1);
    expect(source.match(/strokeLinecap|strokeLinejoin/g)).toHaveLength(2);
    expect(source).not.toMatch(/linearGradient|radialGradient|<filter|drop-shadow|<image/);
    // 次要部件只允许走统一的降调常量，不允许各自写死透明度或第二种颜色
    expect(source).not.toMatch(/opacity=\{(?!ACCENT_OPACITY)/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("renders every glyph in a stat card without the decorative tile node", () => {
    const { container } = render(
      <XsStatCard label="数据资产总量" value="20" glyph={xsMetricGlyphById["data-assets"]} />
    );

    expect(container.querySelector(".xs-icon-tile svg")).not.toBeNull();
    expect(container.querySelector(".xs-icon-tile__node")).toBeNull();
    expect(container.querySelector(".xs-icon-tile img")).toBeNull();
  });

  it("keeps the tile node on ordinary Phosphor icons", () => {
    const Icon = () => <svg data-testid="phosphor" />;
    const { container } = render(<XsStatCard label="知识库" value="3" icon={Icon} />);

    expect(container.querySelector(".xs-icon-tile__node")).not.toBeNull();
  });
});
