import type { PropsWithChildren, ReactNode } from "react";
import "./styles/page-shell.css";
import "./pages.css";

type PageFrameProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  hideHeader?: boolean;
}>;

export function PageFrame({ title, subtitle, actions, className = "", hideHeader = false, children }: PageFrameProps) {
  return (
    <div className={`xs-page ${className}`}>
      {hideHeader ? null : (
        <header className="xs-page__head">
          <div className="xs-page__title">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="xs-page__actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </div>
  );
}
