import type { ComponentType } from "react";

export type XsIconComponent = ComponentType<{
  size?: number;
  weight?: "regular" | "duotone";
  className?: string;
}>;

/** 图标底板三档：sm 行内、md 列表与指标卡、lg 应用卡。页面不再自定尺寸。 */
export type XsIconTileSize = "sm" | "md" | "lg";

type XsIconTileProps = {
  icon?: XsIconComponent;
  /**
   * 指标图标（`XsMetricGlyphs`）：固定 32px 渲染，且不加装饰节点。
   * 这套图标自带完整构图，右下角那颗青点会压在图形上，也和"不放无语义装饰"的规范冲突。
   */
  glyph?: XsIconComponent;
  imageSrc?: string;
  imageSource?: string;
  label: string;
  tone?: "blue" | "cyan" | "green" | "orange" | "purple";
  size?: XsIconTileSize;
};

const glyphSize: Record<XsIconTileSize, number> = { sm: 20, md: 24, lg: 28 };

/** 指标图标按 1:1 渲染，2× 屏正好落在 64 设备像素上，笔画不会糊。 */
const METRIC_GLYPH_SIZE = 32;

export function XsIconTile({
  icon: Icon,
  glyph: MetricGlyph,
  imageSrc,
  imageSource,
  label,
  tone = "blue",
  size = "md"
}: XsIconTileProps) {
  return (
    <span
      className={`xs-icon-tile xs-icon-tile--${tone} xs-icon-tile--${size}`}
      data-label={label}
      aria-hidden="true"
    >
      {imageSrc ? (
        <img className="xs-icon-tile__image" src={imageSrc} alt="" data-icon-source={imageSource} />
      ) : MetricGlyph ? (
        <MetricGlyph size={METRIC_GLYPH_SIZE} />
      ) : Icon ? (
        <>
          <Icon size={glyphSize[size]} weight="regular" />
          <span className="xs-icon-tile__node" />
        </>
      ) : null}
    </span>
  );
}
