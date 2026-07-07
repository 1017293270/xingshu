import { ArrowRight } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { XsIconTile } from "./XsIconTile";

export type XsAppCardData = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  routeTo?: string;
  icon?: ComponentType<{ size?: number; weight?: "regular" | "duotone"; className?: string }>;
  imageSrc?: string;
  imageSource?: string;
  tone?: "blue" | "cyan" | "green" | "orange" | "purple";
};

type XsAppCardProps = {
  app: XsAppCardData;
  selected?: boolean;
  onSelect: (app: XsAppCardData) => void;
  onOpen?: (app: XsAppCardData) => void;
};

export function XsAppCard({ app, selected = false, onSelect, onOpen }: XsAppCardProps) {
  return (
    <article className={`xs-app-card${selected ? " xs-app-card--selected" : ""}`}>
      <button
        type="button"
        className="xs-app-card__main"
        onClick={() => onSelect(app)}
        aria-label={`选择 ${app.title}：${app.description}`}
      >
        <XsIconTile
          icon={app.icon}
          imageSrc={app.imageSrc}
          imageSource={app.imageSource}
          label={app.title}
          tone={app.tone}
        />
        <span className="xs-app-card__body">
          <span className="xs-app-card__title">{app.title}</span>
          <span className="xs-app-card__desc">{app.description}</span>
        </span>
      </button>
      <button
        type="button"
        className="xs-app-card__arrow"
        onClick={() => (onOpen ?? onSelect)(app)}
        aria-label={`打开 ${app.title}`}
      >
        <ArrowRight size={18} weight="regular" />
      </button>
    </article>
  );
}
