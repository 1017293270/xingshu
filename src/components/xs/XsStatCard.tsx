import type { ReactNode } from "react";
import { XsIconTile, type XsIconComponent } from "./XsIconTile";
import { xsEnterStep } from "./motion";

type XsStatCardProps = {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon?: XsIconComponent;
  /** 指标图标，来自 `XsMetricGlyphs`。指标卡一律走这条，不再用位图。 */
  glyph?: XsIconComponent;
  imageSrc?: string;
  imageSource?: string;
  tone?: "blue" | "cyan" | "green" | "orange" | "purple";
  /** 数值是时间或状态文本时用 text：字号更小，但保持与数字卡同一行高，行内基线不会错位。 */
  valueType?: "number" | "text";
  /** 入场阶梯档位，同一行的卡片依次 +1。 */
  step?: number;
};

/**
 * 全站唯一的指标卡：标签在上、数值居中、说明在下，图标固定在右侧。
 * 数据资产看板、数据资产管理、我的云盘共用，不再各写一套。
 */
export function XsStatCard({
  label,
  value,
  caption,
  icon,
  glyph,
  imageSrc,
  imageSource,
  tone = "blue",
  valueType = "number",
  step = 0
}: XsStatCardProps) {
  return (
    <article className="xs-card xs-card-lift xs-stat-card xs-page-enter" style={xsEnterStep(step)}>
      <div className="xs-stat-card__body">
        <span className="xs-stat-card__label">{label}</span>
        <strong className="xs-stat-card__value" data-value-type={valueType}>
          {value}
        </strong>
        {caption ? <small className="xs-stat-card__caption">{caption}</small> : null}
      </div>
      {icon || glyph || imageSrc ? (
        <XsIconTile
          icon={icon}
          glyph={glyph}
          imageSrc={imageSrc}
          imageSource={imageSource}
          label={label}
          tone={tone}
        />
      ) : null}
    </article>
  );
}
