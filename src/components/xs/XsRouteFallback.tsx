type XsRouteFallbackProps = {
  standalone?: boolean;
};

export function XsRouteFallback({ standalone = false }: XsRouteFallbackProps) {
  return (
    <div
      className={`xs-route-fallback${standalone ? " xs-route-fallback--standalone" : ""}`}
      role="status"
      aria-label="页面加载中"
    >
      <span className="sr-only">页面加载中</span>
      <div className="xs-route-fallback__skeleton" aria-hidden="true">
        <span className="xs-route-fallback__eyebrow" />
        <span className="xs-route-fallback__title" />
        <div className="xs-route-fallback__cards">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
