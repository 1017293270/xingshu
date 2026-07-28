export type XsRouteFallbackVariant =
  | "hero"
  | "rows"
  | "cards"
  | "metrics"
  | "form"
  | "workspace"
  | "fullscreen";

type XsRouteFallbackProps = {
  standalone?: boolean;
  variant?: XsRouteFallbackVariant;
};

const variantItems: Record<XsRouteFallbackVariant, number> = {
  hero: 4,
  rows: 7,
  cards: 3,
  metrics: 6,
  form: 5,
  workspace: 4,
  fullscreen: 6
};

export function XsRouteFallback({ standalone = false, variant = "cards" }: XsRouteFallbackProps) {
  return (
    <div
      className={`xs-route-fallback xs-route-fallback--${variant}${standalone ? " xs-route-fallback--standalone" : ""}`}
      role="status"
      aria-label="页面加载中"
      data-variant={variant}
    >
      <span className="sr-only">页面加载中</span>
      <div className="xs-route-fallback__skeleton" aria-hidden="true">
        <div className="xs-route-fallback__heading">
          <span className="xs-route-fallback__eyebrow" />
          <span className="xs-route-fallback__title" />
        </div>
        <div className="xs-route-fallback__body">
          {Array.from({ length: variantItems[variant] }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
