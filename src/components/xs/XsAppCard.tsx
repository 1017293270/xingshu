import { ArrowRight } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { XsIconTile } from "./XsIconTile";

export type XsAppCardData = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: ComponentType<{ size?: number; weight?: "regular" | "duotone"; className?: string }>;
  tone?: "blue" | "cyan" | "green" | "orange" | "purple";
};

type XsAppCardProps = {
  app: XsAppCardData;
  selected?: boolean;
  onSelect: (app: XsAppCardData) => void;
};

export function XsAppCard({ app, selected = false, onSelect }: XsAppCardProps) {
  return (
    <button
      type="button"
      className={`xs-app-card${selected ? " xs-app-card--selected" : ""}`}
      onClick={() => onSelect(app)}
      aria-label={`${app.title}：${app.description}`}
    >
      <XsIconTile icon={app.icon} label={app.title} tone={app.tone} />
      <span className="xs-app-card__body">
        <span className="xs-app-card__title">{app.title}</span>
        <span className="xs-app-card__desc">{app.description}</span>
      </span>
      <span className="xs-app-card__arrow" aria-hidden="true">
        <ArrowRight size={18} weight="regular" />
      </span>
    </button>
  );
}
