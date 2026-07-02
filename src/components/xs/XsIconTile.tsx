import type { ComponentType } from "react";

type XsIconTileProps = {
  icon?: ComponentType<{ size?: number; weight?: "regular" | "duotone"; className?: string }>;
  imageSrc?: string;
  label: string;
  tone?: "blue" | "cyan" | "green" | "orange" | "purple";
  size?: "sm" | "md";
};

export function XsIconTile({ icon: Icon, imageSrc, label, tone = "blue", size = "md" }: XsIconTileProps) {
  return (
    <span
      className={`xs-icon-tile xs-icon-tile--${tone} xs-icon-tile--${size}`}
      data-label={label}
      aria-hidden="true"
    >
      {imageSrc ? (
        <img className="xs-icon-tile__image" src={imageSrc} alt="" />
      ) : Icon ? (
        <>
          <Icon size={size === "sm" ? 20 : 28} weight="regular" />
          <span className="xs-icon-tile__node" />
        </>
      ) : null}
    </span>
  );
}
